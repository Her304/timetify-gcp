# Timetify 📅

**Your schedule, simplified.** Stop juggling syllabi. Snap a syllabus photo or upload a PDF, let AI extract the details, and instantly see everyone's schedules side-by-side.

## What You Get

- 📱 **Your Week at a Glance** — Clean, color-coded schedule view that actually makes sense
- 🤖 **One-Click Syllabus Parsing** — Upload a PDF/DOCX and our AI extracts all the dates, times, rooms, and deadlines automatically
- 👥 **See Your Friends' Schedules** — Find shared classes, spot who's free, coordinate study sessions
- 📸 **Snap & Share** — Quick photo sharing that disappears in 24 hours
- 💬 **DM Your Classmates** — Chat directly with friends in your classes
- 🚨 **Smart Notifications** — Stay on top of exams, assignments, and who's in your lectures

## Getting Started (30 seconds)

**Backend:**
```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
# Add OPENAI_API_KEY, RESEND_API_KEY, SECRET_KEY to .env
python manage.py migrate
python manage.py runserver
```

**Frontend:**
```bash
cd frontend
npm install && npm run dev
```

Open `http://localhost:5173` and start adding classes.

## How It's Built

| Layer | Stack |
|-------|-------|
| **Frontend** | React + Vite + Tailwind (gorgeous UX, mobile-first) |
| **Backend** | Django + DRF (fast, battle-tested, scalable) |
| **AI** | OpenAI GPT-4o-mini (extracts syllabus chaos into structured data) |
| **Email** | Resend (clean, reliable notifications) |
| **DB** | PostgreSQL (Prod), SQLite (Dev) |

## Roadmap

- Group chats & study spaces
- Calendar sync (Google, Apple)
- TA/prof integrations

## License

Educational use. Built by students, for students.
