# AI course parse (`backend/main/pdf.py`)

- Model `gpt-5-mini`. PDFs via OpenAI Files API; `.docx` via pdfplumber/python-docx.
- Schema returns `None` for unstated fields — never fabricate. Dates are `datetime.date`.
- **Reparse cap** = 3 / 24 h / user. Set `is_reparse=true` on `/api/courses/analyze/`; first free. Response carries `reparse_remaining`.
- **Add page** (`components/add/add.jsx`): overlap finalize returns `{error:"overlap", a, b, day}` → dedicated conflict screen.

## Refine with dates

- `start_date`/`end_date` are **editable + required** on the review page (step 3) — a course won't save without them (`Course.{start,end}_date` are non-null `DateField`s; `convert_date(None)` → `None` → save fails).
- Week-relative deadlines ("week 3", "end of week 5") come back `null` on first parse — the model can't date them without knowing when week 1 is.
- **"refine with my dates"** button re-runs analyze with `is_reparse=true` + a `context` JSON field (`{start_date, end_date}`, normalized server-side via `convert_date`). `process_course_outline(user_context=…)` appends `_refine_section` to the prompt so the model resolves those deadlines. Counts against the reparse cap.
- Refine **merges** into current edits (not replace): `mergeRefinedCourses`/`mergeList`/`fillBlanks` in `add.jsx` keep manual edits, fill only blank fields (match courses by `course_id`/name, exams/assignments by topic, weeks by number), and append new items.

## Recurring assignments

- `ExtractedAssignment` has `recurrence` (`"weekly"`/null) + `recurrence_weekday` (full weekday). Prompt §4b: weekly-repeating assignments (e.g. "homework due each Sunday") set these and leave `assignment_due` null.
- Finalize expands them into one `Assignment` per week across the term via `_weekly_occurrences(start, end, weekday)` (capped 40). Non-recurring stay single (null due → `course_start_date` fallback). Review UI shows a "weekly · every {weekday}" badge with make-one-off / repeats-weekly toggles.

## Editing a saved course (`components/class/class.jsx`, `/class/:courseName`)

- "edit" button → `CourseEditor`: core fields (name/classroom/days/time/start/end) + add/edit/delete weeks, exams, assignments.
- Save: `PATCH /api/courses/<pk>/` for scalars, then diff each list → `DELETE`/`PATCH`/`POST` per item. Exam/assignment dates sent as `…T00:00:00Z` (DateTimeField). Week/Exam/Assignment detail views are `RetrieveUpdateDestroy` (delete added).
- Save `window.location.reload()`s to resync the schedule tiles (fed by a separate `totalClasses` prop). **Parent course only** — child sections (e.g. `MA103-TH`) not edited here.
- **Drop the whole course**: editor footer has a "drop this class" action with an inline two-step confirm → `dropCourse` sends `DELETE /api/courses/<pk>/` then `window.location.href = "/class"`. `CourseDetailView.get_object` resolves child→parent, and `Course.parent_course` is `on_delete=CASCADE`, so one DELETE removes the parent, its child sections, and all their weeks/exams/assignments + `CourseSkip`s. Scoped to `user=request.user` — never touches other users' copies.
- **Not-recorded empty state**: opening `/class/:courseName` for a course the user hasn't added (fetch resolves no match, `displayClasses` empty) shows a "{course} isn't on your timetify yet" card with an "add {course} →" button → `navigate("/Add")`, instead of a blank card. Only after loading resolves.

## Add-page layout

- Steps stack unboxed on the cream page: full-width `StepIndicator`, then content. Step 2 keeps the spinner/parsing block in a white card; step 3 uses white course cards (cream sub-boxes inside) — no outer white wrapper.
- Upload dropzone: whole coral area is the drop target; Material Symbol `arrow_upload_ready` icon (webfont in `index.html`).
