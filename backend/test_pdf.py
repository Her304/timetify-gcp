"""
Diagnostic harness for backend/main/pdf.py.

Runs the full PDF -> text -> LLM pipeline against a single course outline and
dumps each stage to disk so we can see exactly where parsing diverges from the
ground truth. Two artifacts written next to the PDF:

  <stem>.raw.txt   -- what PyPDF2 actually extracted from the PDF
  <stem>.parsed.json -- the structured output process_course_outline() returns

Usage:
    python test_pdf.py "/path/to/Course Outline.pdf"
    python test_pdf.py                 # falls back to BU 127 in ~/Downloads
"""

import json
import os
import sys
from pathlib import Path

# Make `main` importable when running from the backend/ directory.
sys.path.insert(0, str(Path(__file__).parent))

from main.pdf import extract_text, process_course_outline  # noqa: E402

DEFAULT_PDF = Path.home() / "Downloads" / "BU 127 Course Outline - Spring 2026 - WLIC.pdf"


def _trim(text: str, head: int = 60, tail: int = 60) -> str:
    lines = text.splitlines()
    if len(lines) <= head + tail:
        return text
    return "\n".join(lines[:head] + [f"... <{len(lines) - head - tail} lines elided> ..."] + lines[-tail:])


def main(argv):
    pdf_path = Path(argv[1]) if len(argv) > 1 else DEFAULT_PDF
    if not pdf_path.exists():
        print(f"PDF not found: {pdf_path}", file=sys.stderr)
        return 1

    out_dir = pdf_path.parent
    stem = pdf_path.stem
    raw_path = out_dir / f"{stem}.raw.txt"
    json_path = out_dir / f"{stem}.parsed.json"

    print(f"[1/2] Extracting text from {pdf_path.name}")
    raw = extract_text(str(pdf_path))
    raw_path.write_text(raw)
    print(f"      wrote {raw_path}  ({len(raw):,} chars, {raw.count(chr(10))} lines)")
    print("      preview (first/last 60 lines):")
    print("      ----")
    for line in _trim(raw).splitlines():
        print(f"      {line}")
    print("      ----")

    print(f"\n[2/2] Calling process_course_outline() (default model)")
    if not os.environ.get("OPENAI_API_KEY"):
        print("      WARNING: OPENAI_API_KEY not set; pdf.py loads it from project .env at import time", file=sys.stderr)
    parsed = process_course_outline(str(pdf_path))
    json_path.write_text(json.dumps(parsed, indent=2, ensure_ascii=False))
    print(f"      wrote {json_path}")

    courses = parsed.get("courses", [])
    print(f"\nParsed {len(courses)} course(s):")
    for c in courses:
        # Optional fields may be None — show "—" so the format string still aligns.
        rep = (c.get("rep_date") or "—")
        st = (c.get("start_time") or "—")
        et = (c.get("end_time") or "—")
        term = (c.get("term") or "—")
        print(f"  - {c['course_id']:12s}  term={term:14s}  {rep:10s}  {st}-{et}  "
              f"weeks={len(c['weeks'])}  exams={len(c['exams'])}  assigns={len(c['assignments'])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
