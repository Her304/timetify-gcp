# Timetify

Timetify is a modern web application designed to help students manage their course schedules, extract course details from syllabi using AI, and share their timetables with friends.

## Features

- **Personal Timetable**: A clean, interactive weekly schedule view.
- **AI Course Extraction**: Upload your course outline (PDF or DOCX), and Timetify will automatically extract class times, locations, weekly topics, exams, and assignments using OpenAI's GPT-4o-mini.
- **Friend System**: Connect with classmates, view their schedules, and see shared classes in a combined view.
- **Notifications**: Stay updated with email alerts for password resets and error reports.
- **Error Reporting**: Integrated frontend and backend log collection for easy debugging and support.

## Project Structure

- `frontend/`: React + Vite application with a modern, responsive UI.
- `backend/`: Django REST Framework API handling data persistence, authentication, and AI processing.

## Getting Started

### Backend Setup

1. Navigate to the `backend/` directory.
2. Create and activate a virtual environment:
   ```bash
   python -m venv .venv
   source .venv/bin/activate  # On Mac/Linux
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Set up your `.env` file with necessary API keys (OPENAI_API_KEY, RESEND_API_KEY, SECRET_KEY from django).
5. Run migrations:
   ```bash
   python manage.py migrate
   ```
6. Start the development server:
   ```bash
   python manage.py runserver
   ```

### Frontend Setup

1. Navigate to the `frontend/` directory.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```

## Technology Stack

- **Frontend**: React, Vite, Vanilla CSS.
- **Backend**: Django, Django REST Framework, SQLite (Dev).
- **AI**: OpenAI API (Structured Outputs).
- **Email**: Anymail with Resend.
- **Parsing**: PyPDF2, python-docx.

## License

This project is for educational purposes.
