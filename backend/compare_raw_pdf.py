"""
Same scorecard as compare_models.py, but the PDF is uploaded to OpenAI
directly (Files API) instead of being pre-extracted to text. The LLM sees
the actual PDF pages.

Hypothesis: native PDF understanding sidesteps the pdfplumber/PyPDF2 layout
losses entirely. If true, we can drop the text-extraction pipeline.
"""

import json
import sys
import time
import traceback
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from openai import OpenAI  # noqa: E402
from main.pdf import ExtractedCoursesResponse, _load_env  # noqa: E402
from compare_models import MODELS, PDF, score  # noqa: E402

_load_env()

PROMPT = """
Extract course information from the attached syllabus PDF.

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

### 2. SECONDARY LECTURE COURSE (schedule only):
Only if the syllabus explicitly lists a second weekly meeting day:
- course_id: Original + "-TH"
- rep_date: The other day
- weeks/exams/assignments: empty arrays

### 3. LAB COURSE (schedule only):
Only if the syllabus explicitly lists a lab section:
- course_id: Original + "L"
- is_lab: true
- weeks/exams/assignments: empty arrays
""".strip()


def upload_pdf(client: OpenAI, pdf_path: Path) -> str:
    with pdf_path.open("rb") as f:
        f_obj = client.files.create(file=f, purpose="user_data")
    return f_obj.id


def run_model(client: OpenAI, model: str, file_id: str) -> dict:
    response = client.beta.chat.completions.parse(
        model=model,
        messages=[
            {"role": "system", "content": "You are a course extraction expert."},
            {
                "role": "user",
                "content": [
                    {"type": "file", "file": {"file_id": file_id}},
                    {"type": "text", "text": PROMPT},
                ],
            },
        ],
        response_format=ExtractedCoursesResponse,
    )
    parsed = response.choices[0].message.parsed
    if parsed is None:
        return {"courses": []}
    return parsed.model_dump()


def main():
    if not PDF.exists():
        print(f"PDF not found: {PDF}", file=sys.stderr)
        return 1

    client = OpenAI()

    print(f"Uploading {PDF.name} to OpenAI Files...")
    file_id = upload_pdf(client, PDF)
    print(f"  file_id: {file_id}\n")

    results = {}
    try:
        for model in MODELS:
            print(f"=== {model} (raw PDF) ===")
            t0 = time.time()
            try:
                parsed = run_model(client, model, file_id)
            except Exception as exc:
                elapsed = time.time() - t0
                print(f"  FAILED after {elapsed:.1f}s: {type(exc).__name__}: {exc}")
                traceback.print_exc(limit=2)
                results[model] = {"error": str(exc), "elapsed": elapsed}
                print()
                continue
            elapsed = time.time() - t0

            out_path = PDF.parent / f"{PDF.stem}.{model}.raw-pdf.parsed.json"
            out_path.write_text(json.dumps(parsed, indent=2, ensure_ascii=False))

            s = score(parsed)
            results[model] = {"score": s["score"], "max": s["max"], "elapsed": elapsed}
            print(f"  elapsed: {elapsed:.1f}s   score: {s['score']}/{s['max']}   -> {out_path.name}")
            for label, ok, observed in s["checks"]:
                mark = "OK " if ok else "X  "
                print(f"   {mark} {label:55s}  observed: {observed}")
            print()
    finally:
        try:
            client.files.delete(file_id)
            print(f"Deleted uploaded file {file_id}")
        except Exception as exc:
            print(f"WARNING: could not delete uploaded file {file_id}: {exc}")

    print("\n=== SUMMARY (raw PDF input) ===")
    for model in MODELS:
        r = results.get(model, {})
        if "error" in r:
            print(f"  {model:14s}  ERROR ({r['elapsed']:.1f}s): {r['error']}")
        else:
            print(f"  {model:14s}  {r['score']}/{r['max']}   ({r['elapsed']:.1f}s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
