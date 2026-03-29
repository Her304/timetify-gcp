import os
import PyPDF2
from docx import Document
from openai import OpenAI
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

class ExtractedWeek(BaseModel):
    week_number: int
    week_date: str
    week_topic: str

class ExtractedExam(BaseModel):
    exam_date: str
    exam_topic: str
    exam_details: Optional[str]

class ExtractedAssignment(BaseModel):
    assignment_due: str
    assignment_topic: str
    assignment_detail: Optional[str]

class ExtractedCourse(BaseModel):
    course_id: str
    course_name: str
    classroom: str
    start_time: str
    end_time: str
    start_date: str
    end_date: str
    rep_date: str
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


def extract_text(file_path: str) -> str:
    ext = os.path.splitext(file_path)[1].lower()
    text = ""
    if ext == '.pdf':
        try:
            with open(file_path, 'rb') as f:
                reader = PyPDF2.PdfReader(f)
                for page in reader.pages:
                    page_text = page.extract_text()
                    if page_text:
                        text += page_text + "\n"
        except Exception as e:
            print(f"Error reading PDF: {e}")
    elif ext == '.docx':
        try:
            doc = Document(file_path)
            for paragraph in doc.paragraphs:
                text += paragraph.text + "\n"
        except Exception as e:
            print(f"Error reading DOCX: {e}")
    else:
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                text = f.read()
        except:
            pass
    return text

def process_course_outline(file_path: str) -> dict:
    text = extract_text(file_path)
    if not text.strip():
        raise ValueError("Could not extract any text from the file.")
    
    # Reload env just in case it was changed while the server was running
    _load_env()
    client = OpenAI()
    
    prompt = f"""
    Extract course information from this syllabus.

    ## EXTRACTION RULES:

    ### 1. MAIN COURSE (has all content):
    - course_id: Original course ID (e.g., "BU111")
    - course_name: Original course name
    - classroom: Main classroom
    - start_time: FIRST lecture time (e.g., Tuesday 1:30pm -> "13:30")
    - end_time: FIRST lecture end time (e.g., "15:30")
    - start_date: Course start date in YYYY-MM-DD
    - end_date: Course end date in YYYY-MM-DD
    - rep_date: Day of the FIRST lecture (e.g., "Tuesday")
    - is_main: true
    - is_lab: false
    - weeks: Extract ALL weeks with topics
    - exams: Extract ALL exams (Midterm, Final, etc.)
    - assignments: Extract ALL assignments (CIIP, Consulting Case, etc.)

    ### 2. SECONDARY LECTURE COURSE (schedule only)(IF THEY ARE IN THE SAME TIME SLOT, THEN IGNORE SECONDARY LECTURE COURSE):
    Create a separate course for the OTHER lecture day:
    - course_id: Original course ID + "-TH" (e.g., "BU111-TH")
    - course_name: Original course name + " (Thursday)"
    - classroom: Same classroom
    - start_time: The other lecture start time (e.g., "08:30")
    - end_time: The other lecture end time (e.g., "10:30")
    - start_date: Same start date
    - end_date: Same end date
    - rep_date: The other day (e.g., "Thursday")
    - is_main: false
    - is_lab: false
    - weeks: [] (empty array)
    - exams: [] (empty array)
    - assignments: [] (empty array)

    ### 3. LAB COURSE (schedule only) (IF INCLUDED IN SYLLABUS, ELSE DO NOT INCLUDE LAB COURSE): 
    - course_id: Original course ID + "L"
    - course_name: Original course name + " Lab"
    - classroom: Lab classroom
    - start_time: Lab start time
    - end_time: Lab end time
    - start_date: Same start date
    - end_date: Same end_date
    - rep_date: Lab day
    - is_main: false
    - is_lab: true
    - weeks: [] (empty array)
    - exams: [] (empty array)
    - assignments: [] (empty array)

    ## EXAMPLE OUTPUT:
    {{
    "courses": [
        {{
        "course_id": "BU111",
        "course_name": "Introduction to Business",
        "classroom": "SB212",
        "start_time": "13:30",
        "end_time": "15:30",
        "start_date": "2026-01-13",
        "end_date": "2026-04-09",
        "rep_date": "Tuesday",
        "is_main": true,
        "is_lab": false,
        "weeks": [...],
        "exams": [...],
        "assignments": [...]
        }},
        {{
        "course_id": "BU111-TH",
        "course_name": "Introduction to Business (Thursday)",
        "classroom": "SB212",
        "start_time": "08:30",
        "end_time": "10:30",
        "start_date": "2026-01-13",
        "end_date": "2026-04-09",
        "rep_date": "Thursday",
        "is_main": false,
        "is_lab": false,
        "weeks": [],
        "exams": [],
        "assignments": []
        }},
        {{
        "course_id": "BU111L",
        "course_name": "Introduction to Business Lab",
        "classroom": "P219",
        "start_time": "10:30",
        "end_time": "12:30",
        "start_date": "2026-01-13",
        "end_date": "2026-04-09",
        "rep_date": "Thursday",
        "is_main": false,
        "is_lab": true,
        "weeks": [],
        "exams": [],
        "assignments": []
        }}
    ]
    }}

    ## Now extract from this syllabus:
    {text[:15000]}
    """
    
    response = client.beta.chat.completions.parse(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": "You are a course extraction expert."},
            {"role": "user", "content": prompt}
        ],
        response_format=ExtractedCoursesResponse
    )
    
    result = response.choices[0].message.parsed
    return result.model_dump()