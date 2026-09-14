# AI course parse (`backend/main/pdf.py`)

- Provider is configured by `COURSE_PARSER_PROVIDER`: production uses Spur `spur-glm-5-2` (table-aware text extraction, with reasoning disabled); set it to `openai` to use `gpt-5-mini` and native OpenAI PDF Files. `.docx` uses pdfplumber/python-docx extraction.
- Schema returns `None` for unstated fields — never fabricate. Dates are `datetime.date`.
- **Reparse cap** = 3 / 24 h / user. Set `is_reparse=true` on `/api/courses/analyze/`; first free. Response carries `reparse_remaining`.
- **Add page** (`components/add/add.jsx`): overlap finalize returns `{error:"overlap", a, b, day}` → dedicated conflict screen.

## Refine with dates

- `start_date`/`end_date` are **editable + required** on the review page (step 3) — a course won't save without them (`Course.{start,end}_date` are non-null `DateField`s; `convert_date(None)` → `None` → save fails).
- **Exam/assignment dates are NOT required** — see "Undated items" below. Only a weekly assignment's weekday is (`weekdayMissing` → `anyMissing`), picked from a `<select>` because `_weekly_occurrences` only accepts full weekday names.
- Week-relative deadlines ("week 3", "end of week 5") come back `null` on first parse — the model can't date them without knowing when week 1 is.
- **"refine with my dates"** button re-runs analyze with `is_reparse=true` + a `context` JSON field (`{start_date, end_date}`, normalized server-side via `convert_date`). `process_course_outline(user_context=…)` appends `_refine_section` to the prompt so the model resolves those deadlines. Counts against the reparse cap.
- Refine **merges** into current edits (not replace): `mergeRefinedCourses`/`mergeList`/`fillBlanks` in `add.jsx` keep manual edits, fill only blank fields (match courses by `course_id`/name, exams/assignments by topic, weeks by number), and append new items.

## Undated items (TBA / estimate)

- Three states per exam/assignment: **confirmed** (date set), **estimate** (date set + `date_is_estimate`), **TBA** (`exam_date`/`assignment_due` null). Null, never a stand-in date: finalize used to put a date-less item on `course_start_date`, so a TBA final showed on day 1 of term.
- Parse: `suggested_date` + `suggestion_basis` on `ExtractedExam`/`ExtractedAssignment` (prompt §2b) — only when the real date is null and the outline gives a basis (tied to a dated lab, a registrar window, classes ending). Kept out of the real date field so a guess can't pass as stated.
- Review page (`add.jsx`, `dateState`): edit view asks "do u have it?" → yes = date input; no = our guess (if any) → "use this date" saves an estimate, "no" = TBA. Unanswered = TBA on save; nothing blocks "confirm & save". `date_mode` is review-only state; finalize reads the date + `date_is_estimate` (`_is_estimate`: real JSON `true` and a date). Bulk bar: "use our N suggested dates" / "leave them all tba". Refine replaces an accepted estimate with a real date it finds (`preferRealDate`), never a typed one.
- Estimates show in the app with "est."; TBA shows "date tba" (class page lists TBA after dated items). The class editor treats a blank date as TBA and has "it's the real date" to clear the estimate flag; typing a date clears it too.
- **Export skips TBA + estimated** (`calendar_export._exportable`) — the file never updates, so a guess would outlive the real date. The export box says how many were left out.
- **Exam-date nudge** (`week_view.jsx` `ExamDateNudgeCard`): a TBA or future-estimated exam shows on the home rail from 28 days before its course's `end_date` to 21 days after, linking to `/class/<code>?edit=1` (auto-opens the editor). "remind me later" hides it until 14 days out; a second snooze stops it. Snoozes are per-browser (`localStorage`).

## Recurring assignments

- `ExtractedAssignment` has `recurrence` (`"weekly"`/null) + `recurrence_weekday` (full weekday). Prompt §4b: weekly-repeating assignments (e.g. "homework due each Sunday") set these and leave `assignment_due` null.
- Finalize expands them into one `Assignment` per week across the term via `_weekly_occurrences(start, end, weekday)` (capped 40). Non-recurring stay single (null due → TBA). Review UI shows a "weekly · every {weekday}" badge with make-one-off / repeats-weekly toggles.

## Editing a saved course (`components/class/class.jsx`, `/class/:courseName`)

- "edit" button → `CourseEditor`: core fields (name/classroom/days/time/start/end) + add/edit/delete weeks, exams, assignments.
- Save: `PATCH /api/courses/<pk>/` for scalars, then diff each list → `DELETE`/`PATCH`/`POST` per item. Exam/assignment dates sent as `…T00:00:00Z` (DateTimeField). Week/Exam/Assignment detail views are `RetrieveUpdateDestroy` (delete added).
- Save `window.location.reload()`s to resync the schedule tiles (fed by a separate `totalClasses` prop). **Parent course only** — child sections (e.g. `MA103-TH`) not edited here.
- **Drop the whole course**: editor footer has a "drop this class" action with an inline two-step confirm → `dropCourse` sends `DELETE /api/courses/<pk>/` then `window.location.href = "/class"`. `CourseDetailView.get_object` resolves child→parent, and `Course.parent_course` is `on_delete=CASCADE`, so one DELETE removes the parent, its child sections, and all their weeks/exams/assignments + `CourseSkip`s. Scoped to `user=request.user` — never touches other users' copies.
- **Not-recorded empty state**: opening `/class/:courseName` for a course the user hasn't added (fetch resolves no match, `displayClasses` empty) shows a "{course} isn't on your timetify yet" card with an "add {course} →" button → `navigate("/Add")`, instead of a blank card. Only after loading resolves.

## Add-page layout

- Steps stack unboxed on the cream page: full-width `StepIndicator`, then content. Step 2 keeps the spinner/parsing block in a white card; step 3 uses white course cards (cream sub-boxes inside) — no outer white wrapper.
- Upload dropzone: whole coral area is the drop target; Material Symbol `arrow_upload_ready` icon (webfont in `index.html`).

## Calendar export (`components/add/CalendarExport.jsx`, `main/calendar_export.py`)

- One-time `.ics` snapshot on the "ur all set" screen after an **upload** (not manual add), covering only what that finalize created — finalize returns `course_pks` (main + child sections). Later edits don't sync; a live subscription feed was ruled out because it needs a permanent secret URL exposing class times + rooms.
- `POST /api/courses/calendar-link/` `{course_pks, tz}` (JWT; 404 unless every pk is the caller's) → `{url: "/api/courses/calendar/<token>.ics"}`, a `django.core.signing` token `{u, c, tz}` (salt `calendar-export`, 10 min). The frontend `window.location.assign`s it rather than fetch+blob: iOS only offers "Add to Calendar" for a real response, and a navigation can't carry the JWT — so the token is the credential (plain Django view; text errors, 404 bad / 410 expired).
- **Google** can't import from a link without OAuth: the button opens `calendar.google.com/calendar/r/settings/import` in a new tab (synchronously, before any `await`, or popup blockers eat it) and downloads the file. Touch devices get a "use a computer" note instead — Google's app can't import files.
- Builder is pure (like `availability.py`, `icalendar` lib). Class = one weekly `RRULE` from the first real meeting ≥ `start_date`, `UNTIL` end of `end_date` (UTC when zoned); `CourseSkip` → `EXDATE`; classroom `TBD` dropped; description links `/class/<parent code>`. Exams/assignments = all-day, `TRANSPARENT`, on the stored **UTC** date (localizing would shift them a day earlier in the Americas). UIDs `course|exam|assignment-<pk>@CANONICAL_DOMAIN` so re-imports update. No `VALARM`s.
- Timezone: browser `Intl…timeZone` → `resolve_tz` (regex + `ZoneInfo`) → `TZID` + a `VTIMEZONE` limited to term ±1 year (the `add_missing_timezones` default, 1970–2038, is ~70 lines). Missing/bogus zone → floating local times.
