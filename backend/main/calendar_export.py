"""One-time .ics export of a user's courses (RFC 5545 iCalendar).

Pure — no ORM calls, same as availability.py: the view fetches the rows (with
`course` / `parent_course` select_related) and hands them in, so tests can pass
SimpleNamespace stand-ins.

Shape of the export, and why:
- A class is ONE weekly repeating event from its first real meeting to its end
  date, not an event per meeting, so the student can move or delete the whole
  series in their calendar in one go.
- Exams and assignments only carry a date (stored at midnight UTC), so they are
  all-day events, marked TRANSPARENT — a due date shouldn't make the whole day
  read as busy. TBA (null) and estimated dates are left out entirely.
- UIDs are stable per row, so importing again updates events instead of
  duplicating them (Google matches on UID).
- No default VALARMs: the student's own calendar defaults apply. Students can
  opt into per-kind reminders in the export dialog.
"""

import re
from datetime import datetime, time, timedelta, timezone as dt_timezone
from urllib.parse import quote
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from icalendar import Alarm, Calendar, Event

from .availability import parse_rep_days

# Canonical rep_date abbrevs (availability.norm_day) in date.weekday() order,
# paired with their iCalendar BYDAY codes.
_WEEK = [("MON", "MO"), ("TUE", "TU"), ("WED", "WE"), ("THU", "TH"),
         ("FRI", "FR"), ("SAT", "SA"), ("SUN", "SU")]

# Shape of an IANA key ("America/Toronto", "Etc/GMT+5"). The name comes from
# the browser, so it is checked before ZoneInfo goes looking for a file.
_TZ_KEY = re.compile(r"[A-Za-z0-9_+\-]+(?:/[A-Za-z0-9_+\-]+)*")


def resolve_tz(name):
    """The browser's IANA zone name → ZoneInfo, or None for floating times.

    Class times are naive wall-clock times (see availability.py). Without a
    zone they are exported "floating", which calendar apps show at the same
    clock time in whatever zone the calendar is in — right for a student who is
    where their classes are, and the fallback when the name is missing or bogus.
    """
    if not isinstance(name, str) or len(name) > 64 or not _TZ_KEY.fullmatch(name):
        return None
    try:
        return ZoneInfo(name)
    except (ZoneInfoNotFoundError, ValueError, OSError):
        return None


def export_filename(code):
    """Download name for a course code: "CS 188" → "timetify-CS-188.ics"."""
    slug = re.sub(r"[^A-Za-z0-9_]+", "-", code or "").strip("-")
    return f"timetify-{slug or 'classes'}.ics"


def _at(day, clock, tz):
    """`day` at wall-clock `clock` in `tz`; naive (floating) when tz is None."""
    return datetime.combine(day, clock, tzinfo=tz)


def _first_meeting(start, end, weekdays):
    """Earliest date in [start, end] on one of `weekdays` (0 = Monday)."""
    for offset in range(7):
        day = start + timedelta(days=offset)
        if day > end:
            break
        if day.weekday() in weekdays:
            return day
    return None


def _add_reminder(event, minutes_before, title):
    """Attach a calendar-native display reminder when the user chose one."""
    if not minutes_before:
        return
    alarm = Alarm()
    alarm.add("action", "DISPLAY")
    alarm.add("trigger", timedelta(minutes=-minutes_before))
    alarm.add("description", f"Reminder: {title}")
    event.add_component(alarm)


def _class_event(course, skip_dates, tz, site_url, uid_domain, stamp,
                 reminder_minutes=0):
    days = parse_rep_days(course.rep_date)
    byday = [code for abbr, code in _WEEK if abbr in days]
    weekdays = {i for i, (abbr, _) in enumerate(_WEEK) if abbr in days}
    if not weekdays or course.end_date < course.start_date or course.end_time <= course.start_time:
        return None
    first = _first_meeting(course.start_date, course.end_date, weekdays)
    if first is None:
        return None

    until = _at(course.end_date, time(23, 59, 59), tz)
    if tz is not None:
        # RFC 5545 §3.3.10: when DTSTART carries a TZID, UNTIL must be UTC.
        until = until.astimezone(dt_timezone.utc)

    title = f"{course.course_id}: {course.course_name}" if course.course_name else course.course_id
    if course.is_lab and "lab" not in title.lower():
        title += " (lab)"

    ev = Event()
    ev.add("uid", f"course-{course.pk}@{uid_domain}")
    ev.add("dtstamp", stamp)
    ev.add("summary", title)
    ev.add("dtstart", _at(first, course.start_time, tz))
    ev.add("dtend", _at(first, course.end_time, tz))
    ev.add("rrule", {"freq": "weekly", "byday": byday, "until": until})
    # Meetings the student is skipping for an event (CourseSkip) are hidden on
    # their schedule, so they are cut from the series too.
    skipped = sorted(d for d in skip_dates
                     if first <= d <= course.end_date and d.weekday() in weekdays)
    if skipped:
        ev.add("exdate", [_at(d, course.start_time, tz) for d in skipped])
    room = (course.classroom or "").strip()
    if room and room.upper() != "TBD":  # finalize's stand-in for "not stated"
        ev.add("location", room)
    # /class/:courseName is keyed by the parent's code (class.jsx), so a lab or
    # second section links to the course it belongs to.
    parent = getattr(course, "parent_course", None)
    base = parent.course_id if parent is not None else course.course_id
    ev.add("description", f"view in timetify: {site_url}/class/{quote(base or '', safe='')}")
    _add_reminder(ev, reminder_minutes, title)
    return ev


def _item_date(value):
    """Calendar date of an exam/assignment timestamp.

    These are stored at midnight UTC (…T00:00:00Z), so the UTC date IS the
    date — converting to the student's zone first would pull every item a day
    earlier across the Americas.
    """
    if isinstance(value, datetime):
        if value.tzinfo is not None:
            value = value.astimezone(dt_timezone.utc)
        return value.date()
    return value


def _exportable(item, value):
    """TBA (no date) and estimated items stay in timetify only.

    The export is a one-time snapshot that never updates, so a guessed date
    would sit in the student's calendar after the real one is posted.
    """
    return value is not None and not getattr(item, "date_is_estimate", False)


def _item_title(course, kind, topic):
    topic = (topic or "").strip()
    return f"{course.course_id} {kind}: {topic}" if topic else f"{course.course_id} {kind}"


def _all_day_event(uid, stamp, day, title, description, reminder_minutes=0):
    ev = Event()
    ev.add("uid", uid)
    ev.add("dtstamp", stamp)
    ev.add("summary", title)
    ev.add("dtstart", day)
    ev.add("dtend", day + timedelta(days=1))  # DTEND is exclusive
    ev.add("transp", "TRANSPARENT")
    if description and description.strip():
        ev.add("description", description.strip())
    _add_reminder(ev, reminder_minutes, title)
    return ev


def build_ics(courses, exams, assignments, *, site_url, uid_domain,
              skip_dates=None, tz=None, stamp=None, reminders=None):
    """The .ics bytes for `courses` plus the given exams and assignments.

    `skip_dates` maps a course pk to the dates the student skips that class;
    `tz` is a ZoneInfo from resolve_tz (None → floating times).
    """
    stamp = stamp or datetime.now(dt_timezone.utc)
    skip_dates = skip_dates or {}
    reminders = reminders or {}

    cal = Calendar()
    cal.add("prodid", "-//timetify//course export//EN")
    cal.add("version", "2.0")
    cal.add("calscale", "GREGORIAN")
    cal.add("method", "PUBLISH")
    # Suggested calendar name on import — the same for every export, so a
    # second outline lands next to the first.
    cal.add("x-wr-calname", "timetify")
    if tz is not None:
        cal.add("x-wr-timezone", tz.key)

    for course in courses:
        ev = _class_event(
            course, skip_dates.get(course.pk, ()), tz, site_url, uid_domain, stamp,
            reminders.get("classes", 0),
        )
        if ev is not None:
            cal.add_component(ev)
    for exam in exams:
        if not _exportable(exam, exam.exam_date):
            continue
        cal.add_component(_all_day_event(
            f"exam-{exam.pk}@{uid_domain}", stamp, _item_date(exam.exam_date),
            _item_title(exam.course, "exam", exam.exam_topic), exam.exam_details,
            reminders.get("exams", 0)))
    for item in assignments:
        if not _exportable(item, item.assignment_due):
            continue
        cal.add_component(_all_day_event(
            f"assignment-{item.pk}@{uid_domain}", stamp, _item_date(item.assignment_due),
            _item_title(item.course, "due", item.assignment_topic), item.assignment_detail,
            reminders.get("assignments", 0)))

    if tz is not None and courses:
        # Only around the term: the library default (1970–2038) writes ~70
        # lines of daylight-saving dates into every file.
        cal.add_missing_timezones(
            first_date=min(c.start_date for c in courses) - timedelta(days=366),
            last_date=max(c.end_date for c in courses) + timedelta(days=366),
        )
    return cal.to_ical()
