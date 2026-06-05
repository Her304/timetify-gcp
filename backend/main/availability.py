"""
Availability computation utilities.

All functions are pure Python — no ORM calls inside. Pass in pre-fetched
querysets or lists so the caller controls DB access and these stay fast
and trivially testable.

Timezone: all datetime inputs/outputs are UTC-aware. Course start_time /
end_time are naive Time fields stored as local "wall clock" times; we
combine them with the target date at UTC for simplicity. A per-user tz
upgrade can be wired in later without changing these function signatures.
"""

from datetime import datetime, date, timedelta
from datetime import timezone as utc_tz
from typing import List, Tuple, Optional

# Python weekday() → Course.rep_date abbreviation mapping.
# weekday(): 0=Monday … 6=Sunday
_DAY_ABBR = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]


def _day_abbr(d: date) -> str:
    return _DAY_ABBR[d.weekday()]


def _to_utc(d: date, t) -> datetime:
    """Combine a date + time into a UTC-aware datetime."""
    return datetime(d.year, d.month, d.day, t.hour, t.minute, t.second,
                    tzinfo=utc_tz.utc)


def _merge_blocks(blocks: List[Tuple[datetime, datetime]]) -> List[Tuple[datetime, datetime]]:
    """Merge overlapping or adjacent intervals. Input must be sorted."""
    if not blocks:
        return []
    merged = [blocks[0]]
    for start, end in blocks[1:]:
        last_start, last_end = merged[-1]
        if start <= last_end:
            merged[-1] = (last_start, max(last_end, end))
        else:
            merged.append((start, end))
    return merged


def get_busy_blocks(courses, events, day: date) -> List[Tuple[datetime, datetime]]:
    """Return sorted, merged (start, end) UTC-aware busy blocks for a given date.

    Args:
        courses: iterable of Course model instances (pre-fetched for this user).
        events:  iterable of ExternalCalendarEvent instances (pre-fetched, is_blocking=True).
        day:     the calendar date to compute busy blocks for.
    """
    blocks = []
    day_abbr = _day_abbr(day)
    day_start_dt = datetime(day.year, day.month, day.day, tzinfo=utc_tz.utc)
    day_end_dt   = datetime(day.year, day.month, day.day, 23, 59, 59, tzinfo=utc_tz.utc)

    for c in courses:
        rep_days = [x.strip().upper() for x in (c.rep_date or '').split(',')]
        if day_abbr not in rep_days:
            continue
        if c.start_date > day or c.end_date < day:
            continue
        start_dt = _to_utc(day, c.start_time)
        end_dt   = _to_utc(day, c.end_time)
        if start_dt < end_dt:
            blocks.append((start_dt, end_dt))

    for ev in events:
        if not ev.is_blocking:
            continue
        s = ev.starts_at if ev.starts_at.tzinfo else ev.starts_at.replace(tzinfo=utc_tz.utc)
        e = ev.ends_at   if ev.ends_at.tzinfo   else ev.ends_at.replace(tzinfo=utc_tz.utc)
        if e <= day_start_dt or s >= day_end_dt:
            continue
        blocks.append((max(s, day_start_dt), min(e, day_end_dt)))

    return _merge_blocks(sorted(blocks))


def get_free_slots(
    busy_blocks: List[Tuple[datetime, datetime]],
    from_dt: datetime,
    to_dt: datetime,
    min_duration_minutes: int = 30,
) -> List[Tuple[datetime, datetime]]:
    """Return free slots of at least min_duration_minutes within [from_dt, to_dt]."""
    min_secs = min_duration_minutes * 60
    slots = []
    cursor = from_dt

    for start, end in busy_blocks:
        if start > cursor:
            gap_end = min(start, to_dt)
            if (gap_end - cursor).total_seconds() >= min_secs:
                slots.append((cursor, gap_end))
        cursor = max(cursor, end)

    if cursor < to_dt and (to_dt - cursor).total_seconds() >= min_secs:
        slots.append((cursor, to_dt))

    return slots


def get_shared_free_slots(
    all_busy: List[List[Tuple[datetime, datetime]]],
    from_dt: datetime,
    to_dt: datetime,
    min_duration_minutes: int = 30,
) -> List[Tuple[datetime, datetime]]:
    """Return free slots shared by ALL users (intersection of free times).

    Strategy: union all users' busy blocks, then invert to find shared free time.
    A slot is shared-free only when nobody is busy during it.
    """
    if not all_busy:
        return []

    combined: List[Tuple[datetime, datetime]] = []
    for user_busy in all_busy:
        combined.extend(user_busy)

    merged = _merge_blocks(sorted(combined))
    return get_free_slots(merged, from_dt, to_dt, min_duration_minutes)


def get_current_status(
    busy_blocks: List[Tuple[datetime, datetime]],
    now: datetime,
    has_courses: bool = True,
) -> dict:
    """Return current free/busy status dict.

    status values:
      'free'       – no class in current 60-min window
      'in_class'   – active course block (> 30 min remaining)
      'free_soon'  – active block ends within 30 min
      'unknown'    – user has no courses at all
    """
    if not has_courses:
        return {"status": "unknown", "current_block_ends": None, "next_busy_starts": None}

    for start, end in busy_blocks:
        if start <= now <= end:
            mins_left = (end - now).total_seconds() / 60
            status = "free_soon" if mins_left <= 30 else "in_class"
            return {
                "status": status,
                "current_block_ends": end.isoformat(),
                "next_busy_starts": None,
            }

    upcoming = [(s, e) for s, e in busy_blocks if s > now]
    next_busy = upcoming[0][0].isoformat() if upcoming else None
    return {"status": "free", "current_block_ends": None, "next_busy_starts": next_busy}
