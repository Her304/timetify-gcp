import os
import logging
import pdfplumber
from docx import Document
from openai import OpenAI
from pydantic import BaseModel
from typing import List, Optional
from datetime import date as _Date

logger = logging.getLogger(__name__)


# Schema notes:
# - Every "could be missing in the syllabus" field is Optional so the model can
#   return null instead of inventing. Items #2 and #3 of the simplify goal.
# - All date fields are typed `date`, so the OpenAI structured-output validator
#   rejects range strings like "2026-07-31 to 2026-08-14" before they leak
#   downstream. Item #6 of the simplify goal.

class ExtractedWeek(BaseModel):
    week_number: int
    week_date: Optional[_Date] = None
    week_topic: str


class ExtractedExam(BaseModel):
    exam_date: Optional[_Date] = None
    exam_topic: str
    exam_details: Optional[str] = None


class ExtractedAssignment(BaseModel):
    assignment_due: Optional[_Date] = None
    assignment_topic: str
    assignment_detail: Optional[str] = None


class ExtractedCourse(BaseModel):
    course_id: str
    course_name: str
    term: Optional[str] = None  # e.g. "Spring 2026" — anchors bare month-day strings
    classroom: Optional[str] = None
    start_time: Optional[str] = None  # "HH:MM" 24-hour, e.g. "13:30"
    end_time: Optional[str] = None
    start_date: Optional[_Date] = None
    end_date: Optional[_Date] = None
    rep_date: Optional[str] = None  # e.g. "Tuesday"
    is_main: bool = False
    is_lab: bool = False
    weeks: List[ExtractedWeek]
    exams: List[ExtractedExam]
    assignments: List[ExtractedAssignment]


class ExtractedCoursesResponse(BaseModel):
    courses: List[ExtractedCourse]

def _load_env():
    env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), '.env')
    
    if os.path.exists(env_path):
        with open(env_path, 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    k, v = line.split('=', 1)
                    k = k.strip()
                    v = v.strip()
                    if v.startswith('"') and v.endswith('"'): v = v[1:-1]
                    elif v.startswith("'") and v.endswith("'"): v = v[1:-1]
                    os.environ[k] = v

_load_env()


def _format_table(rows: list) -> str:
    # Render a pdfplumber table as a pipe-delimited grid so the LLM sees the
    # columns instead of trying to reconstruct them from collided line text.
    cleaned = []
    for row in rows:
        if row is None:
            continue
        cells = [(c or "").strip().replace("\n", " ") for c in row]
        if not any(cells):
            continue
        cleaned.append(cells)
    if not cleaned:
        return ""
    width = max(len(r) for r in cleaned)
    cleaned = [r + [""] * (width - len(r)) for r in cleaned]
    lines = ["| " + " | ".join(r) + " |" for r in cleaned]
    return "\n".join(lines)


def _extract_pdf_with_tables(file_path: str) -> str:
    # Walk each page, slice out the regions occupied by tables, then interleave
    # surrounding prose with markdown-rendered tables. This preserves reading
    # order while keeping tables structurally intact.
    out = []
    with pdfplumber.open(file_path) as pdf:
        for page in pdf.pages:
            tables = page.find_tables() or []
            table_bboxes = [t.bbox for t in tables]

            def _outside_tables(obj):
                obj_top = obj.get("top")
                obj_bottom = obj.get("bottom")
                for (x0, top, x1, bottom) in table_bboxes:
                    if obj_top is not None and obj_bottom is not None and obj_top >= top and obj_bottom <= bottom:
                        return False
                return True

            prose = page.filter(_outside_tables).extract_text() or ""
            out.append(prose)
            for t in tables:
                rendered = _format_table(t.extract())
                if rendered:
                    out.append("\n[TABLE]\n" + rendered + "\n[/TABLE]\n")
    return "\n".join(out)


def extract_text(file_path: str) -> str:
    ext = os.path.splitext(file_path)[1].lower()
    if ext == '.pdf':
        return _extract_pdf_with_tables(file_path)
    if ext == '.docx':
        doc = Document(file_path)
        return "\n".join(p.text for p in doc.paragraphs)
    raise ValueError(f"Unsupported file extension: {ext}")

SYSTEM_PROMPT = "You extract structured course information from a university syllabus."

EXTRACTION_PROMPT = """
## 1. TERM ANCHOR — DO THIS FIRST

Find the term label on the syllabus header (e.g., "Spring 2026", "Fall 2025",
"Winter 2024", "Summer 2026"). Set `term` to that literal string.

Use the term to anchor any bare month-day strings you find later:
  - "Spring/Summer YYYY" → bare dates are May–August of YYYY
  - "Fall YYYY"          → bare dates are September–December of YYYY
  - "Winter YYYY"        → bare dates are January–April of YYYY

Example: a "Spring 2026" syllabus showing "May 4" in the schedule means 2026-05-04.
NEVER default to Winter. Read the term label literally. If no term label is
visible anywhere in the document, set term to null.

## 2. EXTRACTION GUIDANCE — TRY HARD, BUT DO NOT FABRICATE

This output drives a real student schedule. Try hard to fill in every field —
class times can be tucked into the instructor block, classrooms can appear on
a later page, lecture days are sometimes only in the schedule table. Search
the whole document before giving up on a field.

BUT: if a field is genuinely not stated anywhere in the PDF, return null.
Examples:
  - Syllabus only lists chapter topics, no lecture day/time? → start_time, end_time, rep_date = null
  - No classroom listed?                                    → classroom = null
  - "Midterm 1 covers Ch 1-4" with no date given?           → exam_date = null
  - "Final exam scheduled by registrar between Jul 31 - Aug 14"? → exam_date = null (window, not a date)

DO NOT invent classrooms (the instructor's office number is NOT the classroom),
class times, lecture days, or dates. An honest null is far better than a
confident wrong answer.

## 3. DATES — ISO ONLY

All date fields must be ISO format YYYY-MM-DD. Never return ranges, "TBD",
"Weekly", "Not specified", or any non-date string. If the source isn't a
single concrete date, return null.

Times use "HH:MM" 24-hour. If unsure, return null.

## 4. TABLES → ONE ITEM PER ROW

When the syllabus contains a schedule or assignment table:
  - Each weekly-schedule row = ONE ExtractedWeek (week_number, week_date, week_topic).
  - Each assignment-table row = ONE ExtractedAssignment with its own due date.
  - Do NOT collapse a 13-row assignment table into 3 generic items.
  - Use the row's literal text for the topic field (don't paraphrase).

## 5. REP_DATE — WEEKLY MEETING DAYS

`rep_date` is the day(s) the class meets every week. This field is CRITICAL —
the student's weekly schedule is built from it. Always try to find it.

- Single-day course: use the full English weekday name, e.g. "Tuesday".
- Multi-day course at the SAME time slot (e.g. "Tues/Thurs 1:30-3:30"):
  return a comma-separated list, e.g. "Tuesday,Thursday". This is one course
  meeting twice a week, not two courses.
- Multi-day course with DIFFERENT time slots on different days: see
  "Secondary lecture course" below — create a separate ExtractedCourse for
  each time slot, each with its own rep_date.
- Look for rep_date in the header ("Tues/Thurs 1:30 pm"), the schedule table
  (if rows are labelled Tues/Thurs), or anywhere the meeting day is named.
- If you genuinely cannot find any meeting-day information anywhere in the
  document, set rep_date to null. (Don't guess.)

## 6. COURSE STRUCTURE

### MAIN COURSE (always one)
Primary lecture course. is_main = true, is_lab = false. Populate weeks, exams,
assignments from the schedule + assignment tables.

### SECONDARY LECTURE COURSE (only if EXPLICITLY stated with a DIFFERENT time slot)
Create only if the syllabus says the class meets on a second weekday with a
DIFFERENT time slot from the main one. If both days share one time slot, do
NOT create a secondary course — use a comma-separated rep_date on the main
course instead (see Section 5).
  - course_id:  original + short day suffix (e.g. "-TH")
  - rep_date:   the other day
  - weeks/exams/assignments: empty arrays

### LAB COURSE (only if EXPLICITLY stated)
Create only if the syllabus has a separate lab section with its own meeting
time. Otherwise omit.
  - course_id:  original + "L"
  - is_lab:     true
  - weeks/exams/assignments: empty arrays

If unsure whether a secondary or lab section exists, OMIT it.
""".strip()


def process_course_outline(file_path: str, model: str = "gpt-5-mini") -> dict:
    # Reload env so the API key survives `manage.py runserver` autoreloads.
    _load_env()
    client = OpenAI()

    ext = os.path.splitext(file_path)[1].lower()
    if ext == ".pdf":
        # Native PDF understanding via the Files API. The 3-model bake-off
        # (compare_raw_pdf.py vs compare_models.py) showed this beats every
        # text-extraction path we tried: 12/13 vs 6/13 on gpt-5-mini, 12/13
        # vs 0/13 on o4-mini.
        with open(file_path, "rb") as f:
            uploaded = client.files.create(file=f, purpose="user_data")
        try:
            response = client.beta.chat.completions.parse(
                model=model,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {
                        "role": "user",
                        "content": [
                            {"type": "file", "file": {"file_id": uploaded.id}},
                            {"type": "text", "text": EXTRACTION_PROMPT},
                        ],
                    },
                ],
                response_format=ExtractedCoursesResponse,
            )
        finally:
            try:
                client.files.delete(uploaded.id)
            except Exception as exc:
                logger.warning("Failed to delete uploaded file %s: %s", uploaded.id, exc)
    elif ext == ".docx":
        text = extract_text(file_path)
        if not text.strip():
            raise ValueError("Could not extract any text from the file.")
        response = client.beta.chat.completions.parse(
            model=model,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": EXTRACTION_PROMPT + "\n\n## Syllabus content:\n" + text[:15000]},
            ],
            response_format=ExtractedCoursesResponse,
        )
    else:
        raise ValueError(f"Unsupported file extension: {ext}")

    parsed = response.choices[0].message.parsed
    if parsed is None:
        refusal = getattr(response.choices[0].message, "refusal", None)
        raise ValueError(f"Model returned no parseable output (refusal={refusal!r})")
    # mode='json' converts datetime.date instances back to ISO strings so the
    # rest of the backend (which strptime's these values) keeps working.
    return parsed.model_dump(mode="json")