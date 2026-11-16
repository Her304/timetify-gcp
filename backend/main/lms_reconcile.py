"""The reconciler: a second AI pass over one LMS course, after the outline is
parsed and the deterministic merge (lms._prepare) has matched what it can.

The LMS is the source of truth. This pass only decides what the fixed rules
couldn't:

  - each outline item the rules didn't match: is it the same thing as an LMS
    item under another name (merge), a real deadline the LMS doesn't carry
    (keep — an in-class midterm, the final exam), or something the LMS's own
    items replace (drop — "Chapter quizzes" when D2L lists Chapter 1…11)?
  - each LMS item no outline item matched: is it an obvious placeholder
    ("temp", no date) that shouldn't be on a timetable?

It can't touch the LMS's data: no LMS item is ever deleted (a placeholder is
only unticked on the review page), and LMS dates always win. Its answer is
validated before it's stored — a merge must name a real LMS item, a drop must
name the LMS items that replace it, a placeholder must be an unmatched LMS
item — and anything that fails validation becomes "keep".
"""

import json
import logging
import os
from typing import List, Literal, Optional
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from pydantic import BaseModel, ValidationError

from . import pdf

logger = logging.getLogger(__name__)

MAX_ITEMS = 80


class OutlineDecision(BaseModel):
    ref: str
    action: Literal['merge', 'keep', 'drop']
    d2l_id: Optional[str] = None
    superseded_by: List[str] = []
    reason: str = ''


class PlaceholderFlag(BaseModel):
    d2l_id: str
    reason: str = ''


class Reconciliation(BaseModel):
    outline: List[OutlineDecision] = []
    placeholders: List[PlaceholderFlag] = []


SYSTEM = "You reconcile a university course outline against the course's LMS records."

PROMPT = """
A student is importing one course into their timetable. The school's LMS
(MyLearningSpace / D2L) is the source of truth for deadlines. Some outline
items were already matched to LMS items by exact name; you decide the rest.

## LMS items (source of truth)
{lms}

## Outline items not matched to any LMS item
{outline}

Decide for EVERY outline item above, by its ref:
- "merge" + d2l_id: it is the same deliverable as that LMS item under a
  different name (e.g. outline "A1" = LMS "Assignment 1", outline "Midterm" =
  LMS "Midterm Test - LockDown Browser"). Only when you are confident.
- "drop" + superseded_by: the LMS items already cover it (e.g. outline
  "Chapter quizzes" when the LMS lists "Chapter 1"… "Chapter 11"). List every
  LMS id that covers it. Never drop without listing them.
- "keep": a real deadline or exam the LMS doesn't carry (in-class tests, the
  final exam, participation with a date). When unsure, keep.

Then, among LMS items marked [unmatched] ONLY, list obvious placeholders in
"placeholders": test or junk entries ("temp", "test folder"), or items that are
plainly not a deadline for this course. A real assignment with no date is NOT
a placeholder. When unsure, leave it out.

Each reason: under 80 characters, lowercase, plain words for a student.
Return one JSON object:
{{"outline": [{{"ref": "o1", "action": "keep", "d2l_id": null, "superseded_by": [], "reason": "..."}}],
 "placeholders": [{{"d2l_id": "dropbox:123", "reason": "..."}}]}}
""".strip()


def _lines(rows, leftovers):
    lms = []
    for ref, (name, row) in list(rows.items())[:MAX_ITEMS]:
        date_k, topic_k, _ = _fields(name)
        tag = '[unmatched]' if row.get('lms_source') == 'myls' else '[matched to outline]'
        lms.append(f"- {ref} · {row.get(date_k) or 'no date'} · {str(row.get(topic_k) or '')[:120]} {tag}")
    outline = []
    for ref, name, x in leftovers[:MAX_ITEMS]:
        date_k, topic_k, detail_k = _fields(name)
        rec = ' · repeats weekly' if str(x.get('recurrence') or '').lower() == 'weekly' else ''
        detail = f" · {str(x.get(detail_k))[:100]}" if x.get(detail_k) else ''
        outline.append(f"- {ref} · {name[:-1]} · {x.get(date_k) or 'no date'} · {str(x.get(topic_k) or '')[:120]}{rec}{detail}")
    return '\n'.join(lms) or '- (none)', '\n'.join(outline) or '- (none)'


def _fields(name):
    from .lms import _FIELDS
    return _FIELDS[name]


def _call_model(user_prompt):
    api_key = os.getenv('SPUR_API_KEY')
    if not api_key:
        raise ValueError('SPUR_API_KEY is not set.')
    payload = {
        'model': os.getenv('SPUR_COURSE_PARSER_MODEL', 'spur-glm-5-3'),
        'max_tokens': 4000,
        # "low", not "none": see pdf._process_with_spur.
        'reasoning_effort': os.getenv('SPUR_COURSE_PARSER_REASONING_EFFORT', 'low'),
        'messages': [{'role': 'system', 'content': SYSTEM}, {'role': 'user', 'content': user_prompt}],
        'response_format': {'type': 'json_object'},
    }
    req = Request(pdf.SPUR_CHAT_COMPLETIONS_URL, data=json.dumps(payload).encode('utf-8'), method='POST',
                  headers={'Authorization': f'Bearer {api_key}', 'Content-Type': 'application/json'})
    try:
        with urlopen(req, timeout=90) as resp:
            body = json.loads(resp.read().decode('utf-8'))
    except HTTPError as exc:
        raise ValueError(f'reconciler call failed ({exc.code})') from exc
    except URLError as exc:
        raise ValueError('could not reach the reconciler model') from exc
    content = ((body.get('choices') or [{}])[0].get('message') or {}).get('content') or ''
    if not content.strip():
        raise ValueError('the reconciler returned an empty answer')
    return content


def _strip_fences(content):
    # Same tolerance as pdf._parse_spur_json: models sometimes wrap JSON in ```.
    content = (content or '').strip()
    if content.startswith('```'):
        content = content.split('\n', 1)[-1]
        if content.endswith('```'):
            content = content[:-3]
    return content


def validate(raw, leftovers, rows):
    """Keep only decisions that refer to real items and follow the rules."""
    refs = {ref for ref, _, _ in leftovers}
    out = {'outline': [], 'placeholders': []}
    seen = set()
    for d in raw.outline:
        if d.ref not in refs or d.ref in seen:
            continue
        seen.add(d.ref)
        reason = d.reason.strip()[:120]
        if d.action == 'merge' and d.d2l_id in rows:
            out['outline'].append({'ref': d.ref, 'action': 'merge', 'd2l_id': d.d2l_id, 'reason': reason})
        elif d.action == 'drop':
            covering = [x for x in d.superseded_by if x in rows]
            if covering:
                out['outline'].append({'ref': d.ref, 'action': 'drop', 'superseded_by': covering, 'reason': reason})
            else:
                # A drop that can't name what replaces it is a guess.
                out['outline'].append({'ref': d.ref, 'action': 'keep', 'reason': ''})
        else:
            out['outline'].append({'ref': d.ref, 'action': 'keep', 'reason': reason if d.action == 'keep' else ''})
    for p in raw.placeholders:
        hit = rows.get(p.d2l_id)
        if hit and hit[1].get('lms_source') == 'myls':
            out['placeholders'].append({'d2l_id': p.d2l_id, 'reason': p.reason.strip()[:120]})
    return out


def reconcile(leftovers, rows):
    """→ {"status": "ok", "outline": [...], "placeholders": [...]} or
    {"status": "failed"}. Skips the model when there's nothing to decide."""
    unmatched = [r for r in rows.values() if r[1].get('lms_source') == 'myls']
    if not leftovers and not unmatched:
        return {'status': 'ok', 'outline': [], 'placeholders': []}
    if os.getenv('COURSE_PARSER_PROVIDER', 'openai').lower() != 'spur':
        # The reconciler is written against Spur; without it the review still
        # works on the deterministic merge alone.
        return {'status': 'failed', 'why': 'provider'}
    lms, outline = _lines(rows, leftovers)
    try:
        content = _call_model(PROMPT.format(lms=lms, outline=outline))
        raw = Reconciliation.model_validate_json(_strip_fences(content))
    except (ValueError, ValidationError) as exc:
        logger.warning('lms.reconcile_failed why=%s', str(exc)[:200])
        return {'status': 'failed'}
    return {'status': 'ok', **validate(raw, leftovers, rows)}
