# Calendar Export Feature Plan

## Approach: ICS File Download

The `.ics` (iCalendar) format is the right choice — it's the universal standard natively supported by both Google Calendar and Outlook (and Apple Calendar, iOS, etc.) without needing OAuth or API keys. The user downloads the file, opens it, and their calendar app imports everything in one click.

---

## What gets exported

| Data | Calendar entry |
|------|---------------|
| `Course` (with `rep_date`, `start_date`→`end_date`) | Recurring weekly event with RRULE |
| `Exam` | Single timed event |
| `Assignment` | All-day reminder event on due date |

---

## Backend (2 tasks)

**1. Add `icalendar` to requirements**
```
icalendar>=6.0
```

**2. New endpoint: `GET /api/courses/export.ics/`**
- Auth-gated (JWT)
- Returns `Content-Type: text/calendar; charset=utf-8`
- `Content-Disposition: attachment; filename="timetify-schedule.ics"`
- Build a `Calendar` object containing:
  - One `VEVENT` per `Course` with:
    - `DTSTART`, `DTEND` = first occurrence date + `start_time`/`end_time`
    - `RRULE:FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=<end_date>` (map `rep_date` `"MON,WED"` → `"MO,WE"`)
    - `LOCATION` = `classroom`
    - `SUMMARY` = `"[CSCI101] Algorithms"`
  - One `VEVENT` per `Exam` (single, timed)
  - One `VEVENT` per `Assignment` (all-day on `assignment_due` date, with `VALARM` 1-day reminder)

**Day mapping:**
```python
DAY_MAP = {"MON":"MO","TUE":"TU","WED":"WE","THU":"TH","FRI":"FR","SAT":"SA","SUN":"SU"}
```

---

## Frontend (1 task)

**Export button placement:** Inside the existing course list / schedule page (or a settings section). A single `"Export to Calendar"` button triggers `authenticatedFetch('/api/courses/export.ics/')`, creates a Blob, and fires a programmatic `<a download>` click — no new page needed.

The button should show two options (small dropdown or two buttons):
- **"Download .ics"** — works for Outlook, Apple Calendar, manual Google import
- **"Add to Google Calendar"** — opens `https://calendar.google.com/calendar/r/settings/import` (just deep-links to their import page; user uploads the downloaded file)

---

## Scope / What we're NOT doing (yet)

- No OAuth to Google Calendar / Microsoft Graph (complex, requires app registration, token storage)
- No live-sync subscribe URL (would need per-user secret tokens + public endpoint)
- No export of Timetify `Event` (social events) — just courses/exams/assignments

---

## Implementation order

1. `pip install icalendar` → `requirements.txt`
2. `backend/main/views.py` — `CourseICalView` (15–40 lines)
3. `backend/main/urls.py` — wire `export.ics/`
4. Frontend — export button component + fetch-to-download helper

**Estimated effort:** ~2–3 hours total. The ICS generation is the bulk of it; frontend is straightforward.
