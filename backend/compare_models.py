"""
Score the BU 127 course outline extraction across multiple OpenAI models.

Ground truth comes from the actual PDF — Spring 2026 term, 12-week schedule
running May 4 -> July 20, two midterms with NO date given, final exam in the
July 31 -> Aug 14 registrar window, and 17 explicitly dated assignments
(12 Connect + 1 Accounting Cycle + 4 Excel).

For each model we dump the raw parsed JSON to <stem>.<model>.parsed.json and
print a side-by-side scorecard. A "honest blank" (None / empty) for a field
the PDF doesn't mention scores better than a confident hallucination — the
goal is faithful extraction, not filled boxes.
"""

import json
import sys
import time
import traceback
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from main.pdf import process_course_outline  # noqa: E402

PDF = Path.home() / "Downloads" / "BU 127 Course Outline - Spring 2026 - WLIC.pdf"

MODELS = ["gpt-4o-mini", "o4-mini", "gpt-5-mini"]

# What the PDF actually says (or doesn't).
GROUND_TRUTH_CONNECT_ASSIGN_1_DUE = "2026-05-10"
GROUND_TRUTH_EXCEL_ASSIGN_1_DUE = "2026-05-29"
GROUND_TRUTH_WEEK_1_DATE = "2026-05-04"
GROUND_TRUTH_WEEK_COUNT = 12
GROUND_TRUTH_START_DATE_MIN = "2026-05-01"
GROUND_TRUTH_START_DATE_MAX = "2026-05-10"
GROUND_TRUTH_END_DATE_MIN = "2026-07-15"
GROUND_TRUTH_END_DATE_MAX = "2026-08-15"

# The PDF does NOT contain these — any non-empty value is a hallucination.
PDF_OMITS = ["classroom", "start_time", "end_time", "rep_date"]


def _blank(v):
    if v is None:
        return True
    if isinstance(v, str):
        s = v.strip().lower()
        return s == "" or s == "none" or s == "null" or s == "not specified" or s == "tbd" or s == "n/a"
    return False


def score(parsed: dict) -> dict:
    courses = parsed.get("courses", [])
    if not courses:
        return {"checks": [("any course extracted", False, "no courses")], "score": 0, "max": 1}

    c = courses[0]
    checks = []

    # 1. Course term anchor — start_date should fall in the Spring 2026 window
    sd = c.get("start_date", "")
    ed = c.get("end_date", "")
    checks.append((
        "start_date in Spring 2026 window (~May)",
        GROUND_TRUTH_START_DATE_MIN <= sd <= GROUND_TRUTH_START_DATE_MAX,
        sd,
    ))
    checks.append((
        "end_date in late-July / early-Aug window",
        GROUND_TRUTH_END_DATE_MIN <= ed <= GROUND_TRUTH_END_DATE_MAX,
        ed,
    ))

    # 2. Fields the PDF doesn't contain — honest blank > hallucination
    for f in PDF_OMITS:
        v = c.get(f)
        checks.append((f"{f} blank (PDF omits it)", _blank(v), repr(v)))

    # 3. Week count + first week
    weeks = c.get("weeks", []) or []
    checks.append((
        f"week count = {GROUND_TRUTH_WEEK_COUNT}",
        len(weeks) == GROUND_TRUTH_WEEK_COUNT,
        len(weeks),
    ))
    if weeks:
        wd = weeks[0].get("week_date", "")
        wt = (weeks[0].get("week_topic") or "").lower()
        checks.append((
            f"week 1 date = {GROUND_TRUTH_WEEK_1_DATE}",
            wd == GROUND_TRUTH_WEEK_1_DATE,
            wd,
        ))
        checks.append((
            "week 1 topic mentions Ch 1 / Financial Statements",
            ("financial statements" in wt) or ("ch 1" in wt) or ("chapter 1" in wt),
            weeks[0].get("week_topic"),
        ))
    else:
        checks.append((f"week 1 date = {GROUND_TRUTH_WEEK_1_DATE}", False, "no weeks"))
        checks.append(("week 1 topic mentions Ch 1 / Financial Statements", False, "no weeks"))

    # 4. Exams — PDF lists 2 midterms (no date) + 1 final. Date hallucinations bad.
    exams = c.get("exams", []) or []
    checks.append((
        "at least 2 exams listed (PDF has 2 midterms + final)",
        len(exams) >= 2,
        len(exams),
    ))
    midterm_1 = next(
        (e for e in exams if "midterm" in (e.get("exam_topic") or "").lower() and "1" in (e.get("exam_topic") or "")),
        None,
    )
    if midterm_1:
        checks.append((
            "midterm 1 has NO date (PDF doesn't give one)",
            _blank(midterm_1.get("exam_date")),
            midterm_1.get("exam_date"),
        ))
    else:
        checks.append(("midterm 1 has NO date (PDF doesn't give one)", False, "not listed"))

    # 5. Assignments — Connect 1 due May 10, Excel 1 due May 29.
    assigns = c.get("assignments", []) or []
    checks.append((
        "at least 12 assignments (PDF lists 17)",
        len(assigns) >= 12,
        len(assigns),
    ))
    connect_1 = next(
        (a for a in assigns
         if "connect" in (a.get("assignment_topic") or "").lower()
         and ("1" in (a.get("assignment_topic") or "") or "ch 1" in (a.get("assignment_topic") or "").lower())),
        None,
    )
    if connect_1:
        d = connect_1.get("assignment_due")
        checks.append((
            f"Connect assign #1 due = {GROUND_TRUTH_CONNECT_ASSIGN_1_DUE}",
            d == GROUND_TRUTH_CONNECT_ASSIGN_1_DUE,
            d,
        ))
    else:
        checks.append((
            f"Connect assign #1 due = {GROUND_TRUTH_CONNECT_ASSIGN_1_DUE}",
            False,
            "not listed individually",
        ))

    passed = sum(1 for _, ok, _ in checks if ok)
    return {"checks": checks, "score": passed, "max": len(checks)}


def main():
    if not PDF.exists():
        print(f"PDF not found: {PDF}", file=sys.stderr)
        return 1

    results = {}
    for model in MODELS:
        print(f"\n=== {model} ===")
        t0 = time.time()
        try:
            parsed = process_course_outline(str(PDF), model=model)
        except Exception as exc:
            elapsed = time.time() - t0
            print(f"  FAILED after {elapsed:.1f}s: {type(exc).__name__}: {exc}")
            traceback.print_exc()
            results[model] = {"error": str(exc), "elapsed": elapsed}
            continue
        elapsed = time.time() - t0

        out_path = PDF.parent / f"{PDF.stem}.{model}.parsed.json"
        out_path.write_text(json.dumps(parsed, indent=2, ensure_ascii=False))

        s = score(parsed)
        results[model] = {"score": s["score"], "max": s["max"], "elapsed": elapsed, "json": str(out_path)}
        print(f"  elapsed: {elapsed:.1f}s   score: {s['score']}/{s['max']}   -> {out_path.name}")
        for label, ok, observed in s["checks"]:
            mark = "OK " if ok else "X  "
            print(f"   {mark} {label:55s}  observed: {observed}")

    print("\n=== SUMMARY ===")
    for model in MODELS:
        r = results.get(model, {})
        if "error" in r:
            print(f"  {model:14s}  ERROR ({r['elapsed']:.1f}s): {r['error']}")
        else:
            print(f"  {model:14s}  {r['score']}/{r['max']}   ({r['elapsed']:.1f}s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
