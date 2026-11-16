# Timetify LMS Sync (Chrome extension)

A Chrome extension that puts a **sync to timetify** button on MyLearningSpace (Laurier's D2L). It does two things:

- **Record my courses.** It reads your current courses, the course outline files, and the due dates for dropbox folders, quizzes and calendar items from D2L, then sends them to Timetify. There you review everything before it's saved.
- **Find my exam schedule.** It reads Laurier's official final-exam schedule for your campus and fills in each course's final exam (date, time, room).

Everything goes through Timetify's review page. Nothing lands on the timetable until the student clicks **confirm & save**.

> Design, the rules behind it and the reasons for them are in [`CLAUDE/lms-sync.md`](../CLAUDE/lms-sync.md). Read that before you change how the extension reads D2L or Laurier's site; most of those rules were learned the hard way.

---

## 1. Install it (2 minutes)

The extension isn't on the Chrome Web Store yet, so you load it from this folder.

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and pick this `extension/` folder.
4. On the new **Timetify LMS Sync** card, click **Details**, then:
   - **Site access → "On all sites"**. Or at least make sure `mylearningspace.wlu.ca` and `students.wlu.ca` are allowed. With **"On click"** the exam lookup gets stuck on Laurier's page; the panel now warns you about this.
   - **Extension options**: choose which Timetify to send to (see below).

**After you pull new code:** click **reload ↻** on the card, then **refresh any open D2L tab**. Old tabs keep running the previous copy, and the panel will tell you to refresh.

### Which Timetify it sends to

| Option | Sign-in and API | Review page | Use when |
|---|---|---|---|
| **local dev** (default for an unpacked install) | `http://127.0.0.1:8000` | `http://localhost:5173` | developing / testing |
| **production** | `https://timetify.net` | `https://timetify.net` | only once the backend changes are deployed (see the deploy checklist in `CLAUDE/lms-sync.md`) |

---

## 2. Run Timetify locally for testing

> ⚠️ The repo's normal `.env` points `manage.py runserver` at the **production database** (see `CLAUDE/agent-mcp.md`). For extension testing, use a throwaway local database.

1. **Make a local settings file** outside the repo (e.g. `~/timetify-dev/lms_dev_settings.py`), and add its folder to `PYTHONPATH`:

   ```python
   import os
   os.environ["BACK_SENTRY_DSN"] = ""        # before importing settings: an empty DSN disables Sentry
   os.environ["DEBUG"] = "True"
   os.environ["FRONTEND_URL"] = "http://localhost:5173"
   os.environ.pop("DATABASE_URL", None)
   os.environ["GS_BUCKET_NAME"] = ""
   from backend.settings import *  # noqa
   DATABASES = {"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": os.path.expanduser("~/timetify-dev/dev.sqlite3")}}
   STORAGES = {"default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
               "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"}}
   MEDIA_ROOT = os.path.expanduser("~/timetify-dev/media")
   EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"
   ALLOWED_HOSTS = ["127.0.0.1", "localhost"]
   LMS_EXTENSION_IDS = ["<your extension id>"]   # see step 3
   ```

2. **Start everything:**

   ```bash
   cd backend
   PYTHONPATH=~/timetify-dev python manage.py migrate --settings=lms_dev_settings
   PYTHONPATH=~/timetify-dev python manage.py createsuperuser --settings=lms_dev_settings   # your local test login
   PYTHONPATH=~/timetify-dev python manage.py runserver 127.0.0.1:8000 --settings=lms_dev_settings

   # second terminal
   cd frontend && VITE_API_URL=http://127.0.0.1:8000 npx vite --port 5173
   ```

   Outline reading uses the course parser, so `COURSE_PARSER_PROVIDER=spur` and `SPUR_API_KEY` must be set in your `.env`. Without them, courses still sync but outlines show "couldn't read".

3. **Optional: friendly sign-in screen.** Copy the extension's ID from its card on `chrome://extensions` (an unpacked install's ID depends on the folder path, so yours differs from your teammate's) into `LMS_EXTENSION_IDS`. With it, the first sign-in says "connect ur lms to timetify?". Without it you get the standard "this app is not verified" consent screen, which also works.

4. **Log in** at `http://localhost:5173/login` with your local test user.

---

## 3. Use it

Open **https://mylearningspace.wlu.ca/d2l/home** and click **sync to timetify** (bottom right).

### Record my courses

1. **Finding ur courses:** it reads this term's courses from D2L.
2. **Pick what to send:** courses with an outline or due dates are ticked. Each course has an outline picker: the file it found in **Content** or in an **announcement attachment** (`.pdf` / `.docx`), **pick a file from this computer…**, or none.
3. **Quick heads-up:** what will be sent. **The first time only**, a small Timetify window opens to connect your account; click **connect** and it closes by itself.
4. **Syncing:** about 20 s per outline (two at a time). It sends the courses and due dates, has the AI read each outline, then **double-checks with MyLS**: D2L wins on dates, and an AI pass merges near-duplicates and unticks placeholders like a "temp" dropbox.
5. **Ready for review / almost there**, then **review on timetify →**. On the review page every item shows where it came from (**myls**, **outline**, **myls + outline**), why, and an **open in myls ↗** link. Use **skip / add back** as needed, then **confirm & save**.

Running it again later updates existing courses (new or moved due dates) and doesn't duplicate them.

### Find my exam schedule

1. **School:** Laurier. **Campus:** Waterloo / Brantford / Milton (remembered).
2. **Which courses:** filled in from your D2L courses, with sections. Lab shells are left out. You can untick courses or **add a course** by code. The section matters: some courses write at different times per section.
3. **Find:** **the tab goes to Laurier's schedule page**, shows the same panel while it reads ("checking the schedule"), and comes back to MyLearningSpace with the panel open on your results. If Laurier asks you to sign in, do it; it brings you back.
4. **Results:** date, time and room ("room tba" until Laurier posts it). Courses not on your Timetify yet are **skipped**; record your courses first.
5. **Add N exams on timetify →**, then the review page, then **confirm & save**. It fills the outline's "final exam · date tba", or adds a final exam. Run it again closer to exams to pick up rooms and changes.

---

## 4. Troubleshooting

| You see | Cause / fix |
|---|---|
| No **sync to timetify** button | Wrong page (it's only on `/d2l/home`), the extension is off, or site access is restricted. Reload the extension and refresh the page. |
| "timetify sync was updated — refresh this page" | You reloaded the extension; refresh the D2L tab. |
| "couldn't reach … is that server running?" | The server selected in **options** isn't running. Check the footer: "sending to local dev / timetify.net". |
| "timetify sync can't open laurier's site" | Site access doesn't include `students.wlu.ca`. Set **Details → Site access → On all sites**. |
| Tab sits on Laurier's raw schedule text | Same as above. To see where it stopped, run `document.documentElement.dataset.timetify` in that tab's console: `no pending lookup`, `running`, `sent to timetify, waiting`, `finishing …`. |
| "laurier hasn't posted this term's exam schedule yet" | Laurier redirects to its 404 page until the schedule is up. |
| Outline shows "we couldn't read ur outline" | The parse failed (check the Spur key and model). The course still syncs; fill in class times on review or sync again. |
| Exams show **skipped** | That course isn't on your Timetify yet. Run **record my courses** first. |

Backend logs worth grepping: `lms.staged`, `lms.outline_failed`, `lms.reconciled`, `lms.applied`, `exams.lookup`, `spur.empty_completion`.

---

## 5. What it can and can't see

- It runs **inside your own logged-in browser session**. Timetify never sees your Laurier password.
- **D2L, read-only:** your enrollments, content tree, announcements, dropbox folders, quizzes and course calendar. It downloads only the outline files you tick. **No grades, classlists or messages.**
- **Laurier exam schedule:** the campus file, read once; Timetify keeps only the rows for your courses. Brantford's lecturer column is never stored.
- **Timetify side:** the extension's sign-in only has the `courses:import` permission, which can *stage* an import and nothing else. Disconnect it any time in Settings → connected apps.

## 6. Files

| File | What |
|---|---|
| `manifest.json` | permissions: `identity`, `storage`; hosts: MyLS, students.wlu.ca, Timetify |
| `d2l.js` | D2L reader (courses, outlines, deadlines, calendar). No extension APIs, so it can be pasted into a D2L tab's console to try it out. |
| `content.js` | the panel on D2L home (both flows) |
| `exams.js` | runs on Laurier's schedule file: copies it, sends it, returns to D2L |
| `background.js` | Timetify sign-in (OAuth + PKCE via `chrome.identity`) and API calls |
| `options.html/js` | server picker + sign out |

Backend pieces: `backend/main/lms.py`, `lms_reconcile.py`, `exam_schedule.py` (tests in `backend/main/tests/test_lms_sync.py`, `test_exam_schedule.py`).
