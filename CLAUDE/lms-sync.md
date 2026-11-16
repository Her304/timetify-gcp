# LMS sync (D2L browser extension)

`extension/` (MV3) + `backend/main/lms.py`, `lms_reconcile.py`. A student on MyLearningSpace (Laurier's D2L) sends their current courses, outlines and deadlines to Timetify, reviews them on `/Add?lms_import=<id>`, and saves. **Nothing reaches the timetable before that review.**

## Shape

- The extension reads D2L **inside the student's own session** (same-origin fetches from a content script), so Timetify never sees the school password. Read-only: enrollments, content tree, announcements, dropbox, quizzes, course calendar. No grades/classlist/messages.
- Timetify side is OAuth 2.1 (the MCP server's, `mcp/oauth.py`) with scope **`courses:import`**, which can only *stage* an import. Review + apply use the student's normal JWT.
- Flow: `POST /api/lms/imports/` (stage) → `…/<id>/outline/` per outline (parsed by `pdf.process_course_outline`, given the course's LMS dates as `lms_context`) → `…/<id>/reconcile/` per course → `GET …/<id>/` (review, JWT) → `POST …/<id>/apply/` (JWT).
- Each LMS course is its **own** main course. Don't route it through finalize: finalize makes every course after the first a section of it. `apply_review` calls the shared `views._create_course_tree` once per LMS course.

## D2L specifics (verified on mylearningspace.wlu.ca, 2026-11)

- API versions from `/d2l/api/versions/` (lp 1.64, le 1.100 at the time). Session cookies work for GETs.
- "Current" = `Access.StartDate/EndDate` covers today (orientation/advising shells have no window).
- Times are UTC: an 11:59 pm Toronto deadline is `03:59Z` next day. **The extension converts to the local date** before sending; the server only accepts `YYYY-MM-DD`.
- Outlines live in Content *or* as **announcement attachments** (CP220's `.docx`); both are searched and scored. `.doc` is listed but unreadable.
- The iCal feed holds the same calendar the API returns (114/114 entries checked). Feeds are off by default per student.

## Merge rules (LMS is the source of truth)

1. **Fixed rules first** (`lms._prepare`): match by `_item_key` ("Quiz 3", "Lab #6"); LMS date wins, noting "outline said …"; a weekly outline item the LMS lists instance-by-instance is unticked.
2. **Reconciler** (`lms_reconcile.py`, GLM-5.3) decides only the leftovers: merge (must name a real LMS item), drop (must name the LMS items that replace it, else it becomes keep), keep. It may flag **unmatched** LMS items as placeholders (unticked, never deleted). Failure → the fixed-rule result stands, review shows `lms_check: failed`.
3. Decisions are keyed by leftover ref (`o1`, `o2`…), so `_prepare` must stay deterministic; re-uploading an outline clears that course's decisions.
4. Review items carry `lms_source` (myls / outline / both), `lms_note`, `lms_url`, `lms_skip`. Skipped items are not saved.

## Links + safety

- `Exam/Assignment.lms_url` is built server-side by `lms.item_url` from the import's validated host + ids; apply **rebuilds** it and ignores what the page sent. It's read-only in the serializers because `class.jsx` renders it as an href.
- First-party consent: a client whose redirect is exactly `https://<id>.chromiumapp.org/` for an id in `LMS_EXTENSION_IDS` gets the friendly consent screen and silent reconnect when a live grant exists. Anyone else (including other unpacked builds) gets the standard "not verified" screen.
- Reconcile counts against the read rate-limit budget (a term's courses back to back would trip the 10 writes/min agent limit); the extension also backs off on 429.

## Deploy checklist

- Apply migration `0037_lms_sync` before the backend deploy.
- Set `LMS_EXTENSION_IDS` (Web Store id) and confirm `FRONTEND_URL=https://timetify.net` (the extension only opens review pages on its configured frontend origin).
- Spur reasoning must be `low` (see [AI course parse](ai-course-parse.md)).

## Official exam schedule (`main/exam_schedule.py`, "find my exam schedule")

- The panel's start screen offers **record my courses** or **find my exam schedule** (school → campus → courses → results → review).
- Laurier publishes `students.wlu.ca/academics/exams/assets/resources/{campus}{term}E.txt` (campus `waterloo|brantford|milton`, term = the D2L code suffix `YYYY01|05|09`), an HTML `<table id="examSchedule">` fragment the schedule page loads with JS. **Both the page and the file are behind Laurier SSO**: a server gets a 302 to `idp.wlu.ca`. So the extension reads it in the student's browser and posts the text to `POST /api/exam-schedule/lookup/`; the server parses and matches, it never fetches.
- **How the extension reads it:** the panel saves the request (`pendingExamLookup`) and sends **the student's own D2L tab** to the `.txt` file. `exams.js` (content script on `/academics/exams/assets/resources/*` and `/404/*`) copies `document.body.innerText`, sends it to the worker → `/api/exam-schedule/lookup/`, stores `examResults`, and `location.replace`s back to MyLearningSpace, where the panel reopens on the results. A visible top-level visit is the only reliable read we found:
  - a script `fetch` can't follow the SSO redirect once the session lapses (cross-origin → "Failed to fetch"; the schedule page's own table fails the same way);
  - hidden/background tabs get frozen or throttled by Chrome (Energy/Memory Saver): injected reads hung, and the worker was killed mid-request ("message channel closed before a response");
  - in the visible tab, if Laurier wants a real login the student just signs in and lands back on the file, and `exams.js` carries on. A missing term redirects to `/404/404.html` (status 200).
  - **Site access matters:** if Chrome withholds the extension's access to students.wlu.ca (site access "On click" / restricted), `exams.js` silently never runs and the tab sits on the raw file. The panel checks `chrome.permissions.contains` first (`examAccess`) and explains how to allow it.
  - Debug breadcrumbs: `exams.js` writes its progress to `document.documentElement.dataset.timetify` on the schedule page ("no pending lookup", "running", "sent to timetify, waiting", "finishing …"); the D2L side writes "pending saved, leaving for laurier". Readable from the page without extension access.
- Saved Timetify courses are often named with the section glued on ("CP213A"); `exam_schedule.same_course` matches a trailing section suffix but not a different number.
- Format quirks: CRLFs; Brantford adds a **Lecturer** column (ignored, never stored) and fills rooms; sections differ by campus (`A, B`, `BR1, BR2`, `MC1`, `P1`); same code can sit on different dates per campus and per section. Unknown header → 422, never a guess.
- Matching: code + section; one slot → found; sections at different times and no section → `pick_section`; course not on the student's Timetify → `skipped` (by design: exams attach to a real course).
- Save (`source="registrar"` import): fills the outline's undated/estimated "final" exam, else adds "Final exam"; keyed `registrar:{uni}:{campus}:{term}:{code}` so a re-run updates date/room instead of duplicating. Time + room go in `exam_details` on a line starting `official exam schedule` — only that line is ever replaced; student notes stay. `lms_url` = the campus schedule page.

## Not built yet

Background re-sync from the D2L iCal feed (needs a real feed to learn its UIDs); automatic exam-room re-checks (server can't reach the SSO-gated file — students re-run the lookup); other LMSes/schools; privacy-page wording.
