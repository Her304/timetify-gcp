"""LMS sync: stage courses + deadlines read by the browser extension, let the
student review them on the Add page, then save (or re-sync) them.

Flow (see CLAUDE/lms-sync.md):

  extension (OAuth bearer, scope courses:import)
    POST /api/lms/imports/                    stage what it read from the LMS
    POST /api/lms/imports/<id>/outline/       one outline file per call; parsed
                                              by the same parser as the Add page
  SPA (JWT, the student's own session)
    GET  /api/lms/imports/<id>/               review payload, Add-page shape
    POST /api/lms/imports/<id>/apply/         save what they confirmed

The extension can only *stage*. Nothing reaches the timetable until the
student confirms on the review page, the same contract as a PDF upload, so a
stolen extension token can at worst queue an import nobody approves.

Why the extension reads the LMS and we don't: it runs inside the student's own
logged-in browser session, so Timetify never sees or stores their school
password.
"""

import json
import logging
import os
import re
from datetime import date, timedelta

from django.conf import settings
from django.db import transaction
from django.db.models import Sum
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .mcp import auth as agent_auth
from .mcp import scopes as scope_defs
from .models import Assignment, Course, Exam, LmsImport, OAuthAccessToken
from .pdf import process_course_outline

logger = logging.getLogger(__name__)

SOURCES = frozenset({'d2l'})

# An import is a hand-off between two clicks, not storage.
IMPORT_TTL = timedelta(hours=24)

MAX_COURSES = 20
MAX_ITEMS_PER_COURSE = 150
# Outline parses spend LLM budget. A term is ~5-8 courses; this leaves room to
# retry a few without letting a looping client run up a bill.
OUTLINE_PARSES_PER_DAY = 15

_DATE_RE = re.compile(r'^\d{4}-\d{2}-\d{2}$')
_HOST_RE = re.compile(r'^[a-z0-9.-]{1,253}$')
_ID_RE = re.compile(r'^[A-Za-z0-9_.:-]{1,40}$')
ITEM_KINDS = frozenset({'dropbox', 'quiz', 'content', 'event'})


# ---------------------------------------------------------------------------
# Payload hygiene
# ---------------------------------------------------------------------------

class BadPayload(ValueError):
    pass


def _clean_date(v):
    """YYYY-MM-DD or None. The extension converts LMS timestamps to the
    student's local date before sending: D2L stores an 11:59pm Toronto
    deadline as 03:59Z the next day, so taking the UTC date would move every
    deadline a day late."""
    if v in (None, ''):
        return None
    if not isinstance(v, str) or not _DATE_RE.match(v):
        raise BadPayload(f'bad date: {v!r}')
    try:
        date.fromisoformat(v)
    except ValueError:
        raise BadPayload(f'bad date: {v!r}')
    return v


def _text(v, n):
    return str(v or '').strip()[:n]


def clean_payload(body):
    """Validate the extension's POST body into the stored shape. Raises
    BadPayload with a short reason."""
    if not isinstance(body, dict):
        raise BadPayload('body must be an object')
    source = body.get('source')
    if source not in SOURCES:
        raise BadPayload('unsupported source')
    host = str(body.get('host') or '').lower()
    if not _HOST_RE.match(host):
        raise BadPayload('bad host')
    raw_courses = body.get('courses')
    if not isinstance(raw_courses, list) or not raw_courses:
        raise BadPayload('courses is required')
    if len(raw_courses) > MAX_COURSES:
        raise BadPayload(f'at most {MAX_COURSES} courses')

    courses, seen = [], set()
    for c in raw_courses:
        if not isinstance(c, dict):
            raise BadPayload('course must be an object')
        cid = str(c.get('id') or '')
        if not _ID_RE.match(cid) or cid in seen:
            raise BadPayload('bad or duplicate course id')
        seen.add(cid)
        raw_items = c.get('items') or []
        if not isinstance(raw_items, list) or len(raw_items) > MAX_ITEMS_PER_COURSE:
            raise BadPayload('bad items')
        items, seen_items = [], set()
        for it in raw_items:
            if not isinstance(it, dict):
                raise BadPayload('item must be an object')
            kind = it.get('kind')
            iid = str(it.get('id') or '')
            if kind not in ITEM_KINDS or not _ID_RE.match(iid):
                raise BadPayload('bad item')
            if (kind, iid) in seen_items:
                continue
            seen_items.add((kind, iid))
            title = _text(it.get('title'), 200)
            if not title:
                continue
            items.append({
                'kind': kind, 'id': iid, 'title': title,
                'date': _clean_date(it.get('date')),
            })
        courses.append({
            'id': cid,
            'code': _text(c.get('code'), 100),
            'name': _text(c.get('name'), 200),
            'start_date': _clean_date(c.get('start_date')),
            'end_date': _clean_date(c.get('end_date')),
            'items': items,
        })
    return {'source': source, 'host': host, 'courses': courses}


def course_external_id(imp, lms_course_id):
    return f'{imp.source}:{imp.host}:{lms_course_id}'[:100]


def item_external_id(imp, item):
    return f"{imp.source}:{imp.host}:{item['kind']}:{item['id']}"[:100]


# ---------------------------------------------------------------------------
# Building the review payload
# ---------------------------------------------------------------------------

# "ST-230-A - Probability & Stats for Sci." → ("ST230", "Probability & Stats
# for Sci.", section "A"). Laurier's D2L names are "<SUBJ>-<NUM>-<SECTION> -
# <title>"; other schools vary, so anything that doesn't match falls back to
# the whole name and the student fixes it on the review page.
_NAME_RE = re.compile(r'^\s*([A-Za-z]{2,5})[-\s]?(\d{3,4}[A-Za-z]?)\b(.*?)(?:\s+-\s+(.*))?$')


def split_course_name(name):
    """→ (course_id, title, is_lab)."""
    m = _NAME_RE.match(name or '')
    if not m:
        return '', (name or '').strip(), False
    code = f'{m.group(1).upper()}{m.group(2).upper()}'
    section = m.group(3) or ''
    title = (m.group(4) or '').strip() or (name or '').strip()
    is_lab = bool(re.search(r'\blabs?\b', section, re.I))
    return code[:20], title[:200], is_lab


_EXAM_RE = re.compile(r'\b(mid-?terms?|finals?|exams?|tests?)\b', re.I)
# "Assignment 1", "Quiz 3 (Week 3)", "Lab #6", "Project Phase II" → a key that
# survives the differences between how an outline and the LMS name the same
# thing ("A1" vs "Assignment 1" is left alone — guessing there causes worse
# merges than a visible duplicate the student deletes).
_KEY_RE = re.compile(
    r'\b(assignment|quiz|lab|test|midterm|mid-term|final|exam|project|homework|hw)\s*'
    r'(?:#|no\.?|phase)?\s*([0-9]+|[ivx]+)\b', re.I)


def _item_key(title):
    t = (title or '').lower()
    m = _KEY_RE.search(t)
    if m:
        kind = m.group(1).replace('-', '')
        kind = {'hw': 'homework', 'midterm': 'test'}.get(kind, kind)
        return f'{kind}:{m.group(2)}'
    return re.sub(r'[^a-z0-9]+', ' ', t).strip()


# The noun a repeating item is counted in: "Weekly quizzes", "Chapter quizzes",
# "Quiz 3 (Week 3)", "Lab #6". Plural and singular collapse to one word.
_KIND_RE = re.compile(r'\b(quiz(?:zes)?|labs?|assignments?|homeworks?|hw|chapters?|problem\s+sets?|readings?)\b', re.I)


def _kind_words(title):
    out = set()
    for m in _KIND_RE.finditer(title or ''):
        w = re.sub(r'\s+', ' ', m.group(1).lower())
        w = {'quizzes': 'quiz', 'hw': 'homework'}.get(w, w)
        out.add(w[:-1] if w.endswith('s') and w not in ('quiz',) else w)
    return out


def _is_exam(item):
    return item['kind'] != 'quiz' and bool(_EXAM_RE.search(item['title']))


def _skeleton(lms_course):
    code, title, is_lab = split_course_name(lms_course['name'])
    return {
        'course_id': code or lms_course['code'][:20],
        'course_name': title,
        'classroom': None, 'start_time': None, 'end_time': None, 'rep_date': None,
        'start_date': lms_course['start_date'], 'end_date': lms_course['end_date'],
        'is_main': True, 'is_lab': is_lab,
        'weeks': [], 'exams': [], 'assignments': [],
    }


def item_url(imp, lms_course_id, item):
    """The item's own page in D2L ("open in MyLS"). Built only from the
    import's validated host and ids (both regex-checked in clean_payload), so a
    page can never smuggle another address onto a saved deadline."""
    if imp.source != 'd2l':
        return ''
    base, ou, i = f'https://{imp.host}', lms_course_id, item['id']
    return {
        'dropbox': f'{base}/d2l/lms/dropbox/user/folder_submit_files.d2l?db={i}&ou={ou}',
        'quiz': f'{base}/d2l/lms/quizzing/user/quiz_summary.d2l?qi={i}&ou={ou}',
        'content': f'{base}/d2l/le/content/{ou}/viewContent/{i}/View',
        'event': f'{base}/d2l/le/calendar/{ou}/event/{i}/detailsview',
    }.get(item['kind'], '')[:500]


def lms_ref(item):
    """How the reconciler and the review page name an LMS item: "quiz:244105"."""
    return f"{item['kind']}:{item['id']}"


# Field names per list, so an item can move between exams and assignments.
_FIELDS = {
    'exams': ('exam_date', 'exam_topic', 'exam_details'),
    'assignments': ('assignment_due', 'assignment_topic', 'assignment_detail'),
}


def _move(item, src, dst):
    """Re-key an item from one list's field names to the other's."""
    if src == dst:
        return item
    out = {k: v for k, v in item.items() if k not in _FIELDS[src]}
    for a, b in zip(_FIELDS[src], _FIELDS[dst]):
        if a in item:
            out[b] = item[a]
    if dst == 'exams':
        out.pop('recurrence', None)
        out.pop('recurrence_weekday', None)
    return out


def _note(item, text):
    item['lms_note'] = '; '.join(x for x in (item.get('lms_note'), text) if x)


def _take_lms_date(target, it, date_k):
    """The LMS wins on dates. When the outline said something else, say so on
    the review page rather than overwriting it silently."""
    if not it['date']:
        return
    old = target.get(date_k)
    if old and old != it['date']:
        _note(target, f'outline said {old}, using the MyLS date')
    target[date_k] = it['date']
    target['date_is_estimate'] = False
    target.pop('suggested_date', None)
    target.pop('suggestion_basis', None)


def _prepare(imp, lc, course):
    """The deterministic half of the merge. Mutates `course` and returns
    (leftovers, rows):

      leftovers  [(ref, list_name, item)] outline items with no LMS match, in
                 a stable order — the reconciler decides these, and its
                 decisions are keyed by ref, so this must give the same refs
                 every time it runs on the same data.
      rows       {lms_ref: (list_name, item)} the review row for every LMS item.

    Every item gets `lms_source`: "myls", "outline" or "both".
    """
    lists = {name: course.setdefault(name, []) for name in _FIELDS}
    for lst in lists.values():
        for x in lst:
            x['lms_source'] = 'outline'

    # A repeating outline item ("weekly quizzes") that the LMS lists instance
    # by instance would put every quiz on the timetable twice. Shown unticked
    # with the reason, not deleted, so the student can bring it back.
    counts = {}
    for it in lc['items']:
        for w in _kind_words(it['title']):
            counts[w] = counts.get(w, 0) + 1
    for a in lists['assignments']:
        if str(a.get('recurrence') or '').lower() == 'weekly':
            covered = [w for w in _kind_words(a.get('assignment_topic')) if counts.get(w, 0) >= 2]
            if covered:
                a['lms_skip'] = True
                _note(a, f'MyLS lists each {covered[0]} with its own date')

    rows = {}
    for it in lc['items']:
        key = _item_key(it['title'])
        match = None
        # Look in both lists: the outline may file "Test 1" under exams while
        # D2L delivers it as a quiz. Whichever list the outline chose wins.
        for name, lst in lists.items():
            match = next((x for x in lst
                          if x['lms_source'] == 'outline' and not x.get('lms_skip')
                          and not x.get('recurrence') and _item_key(x.get(_FIELDS[name][1])) == key), None)
            if match is not None:
                break
        if match is None:
            name = 'exams' if _is_exam(it) else 'assignments'
            match = {_FIELDS[name][1]: it['title'], 'lms_source': 'myls'}
            lists[name].append(match)
        else:
            match['lms_source'] = 'both'
        match['lms_external_id'] = item_external_id(imp, it)
        match['lms_url'] = item_url(imp, lc['id'], it)
        match['lms_ref'] = lms_ref(it)
        _take_lms_date(match, it, _FIELDS[name][0])
        rows[lms_ref(it)] = (name, match)

    leftovers, n = [], 0
    for name, lst in lists.items():
        for x in lst:
            if x['lms_source'] == 'outline' and not x.get('lms_skip'):
                n += 1
                leftovers.append((f'o{n}', name, x))
    return leftovers, rows


def _apply_decisions(lc, course, leftovers, rows, decided):
    """Apply the reconciler's (already validated) decisions to one course."""
    lists = {name: course[name] for name in _FIELDS}
    by_ref = {d['ref']: d for d in decided.get('outline') or []}
    for ref, name, x in leftovers:
        d = by_ref.get(ref)
        if not d:
            continue
        if d['action'] == 'merge' and d.get('d2l_id') in rows:
            row_list, row = rows[d['d2l_id']]
            # The outline knows what kind of thing it is ("Midterm" is an
            # exam even when D2L runs it as a quiz); the LMS knows the date.
            if row_list != name:
                lists[row_list].remove(row)
                moved = _move(row, row_list, name)
                lists[name].append(moved)
                rows[d['d2l_id']] = (name, moved)
                row = moved
            date_k, topic_k, detail_k = _FIELDS[name]
            if x.get(detail_k) and not row.get(detail_k):
                row[detail_k] = x[detail_k]
            old = x.get(date_k)
            if old and row.get(date_k) and old != row[date_k]:
                _note(row, f'outline said {old}, using the MyLS date')
            row['lms_source'] = 'both'
            _note(row, f'matched to "{x.get(topic_k)}" in ur outline')
            lists[name].remove(x)
        elif d['action'] == 'drop':
            x['lms_skip'] = True
            _note(x, d.get('reason') or 'covered by MyLS')
        elif d.get('reason'):
            _note(x, d['reason'])
    for p in decided.get('placeholders') or []:
        hit = rows.get(p.get('d2l_id'))
        if hit and hit[1].get('lms_source') == 'myls':
            hit[1]['lms_skip'] = True
            _note(hit[1], p.get('reason') or "looks like a placeholder, not a real deadline")


def course_group(imp, lc):
    """One LMS course as review rows, before the reconciler's decisions:
    (main, others, leftovers, rows, outline_state)."""
    stored = (imp.outlines or {}).get(lc['id'])
    # A failed parse is stored as {"error": ...} so the review can say "we
    # couldn't read it" rather than "no outline found" — the student did
    # have one, and knowing that tells them a retry might work.
    failed = isinstance(stored, dict) and 'error' in stored
    parsed = [c for c in stored if isinstance(c, dict)] if isinstance(stored, list) else []
    skel = _skeleton(lc)
    if parsed:
        src = next((c for c in parsed if c.get('is_main')), parsed[0])
        main = json.loads(json.dumps(src))
        # The parser is told to return null rather than guess; the LMS's own
        # names and term window are a better fallback than a blank.
        for k in ('course_id', 'course_name', 'start_date', 'end_date'):
            if not main.get(k):
                main[k] = skel[k]
        main['is_lab'] = bool(main.get('is_lab')) or skel['is_lab']
        others = [dict(json.loads(json.dumps(c)), is_main=False) for c in parsed if c is not src]
    else:
        main, others = skel, []
    main['is_main'] = True
    leftovers, rows = _prepare(imp, lc, main)
    state = 'read' if parsed else ('failed' if failed else 'none')
    return main, others, leftovers, rows, state


# ---------------------------------------------------------------------------
# Official exam schedule (source "registrar"). See main/exam_schedule.py.
# ---------------------------------------------------------------------------

def registrar_external_id(imp, code):
    p = imp.payload
    return f"registrar:{p['uni']}:{p['campus']}:{p['term']}:{code}"[:100]


def _registrar_target(user, course, ext):
    """The exam row a schedule entry lands on: the one it filled last time,
    else the outline's undated (or estimated) final, else None (add one)."""
    from django.db.models import Q
    tree = [course.pk] + list(course.child_courses.values_list('pk', flat=True))
    rows = Exam.objects.filter(user=user, course_id__in=tree)
    return (rows.filter(lms_external_id=ext).first()
            or rows.filter(lms_external_id='', exam_topic__icontains='final')
                   .filter(Q(exam_date__isnull=True) | Q(date_is_estimate=True)).first())


def _registrar_review(imp):
    from . import exam_schedule as xs
    p = imp.payload
    campus_name = xs.UNIS[p['uni']]['campuses'][p['campus']]
    owned = {c.pk: c for c in Course.objects.filter(user=imp.user, pk__in=[int(c['id']) for c in p['courses']])}
    out = []
    for sc in p['courses']:
        c = owned.get(int(sc['id']))
        if c is None:
            continue
        ext = registrar_external_id(imp, sc['code'])
        target = _registrar_target(imp.user, c, ext)
        if target is not None and target.lms_external_id == ext:
            note = 'already from the official schedule — updates date + room'
        elif target is not None:
            note = f'fills in "{target.exam_topic}" (was date tba)'
        else:
            note = 'adds ur final exam'
        out.append({
            'course_id': c.course_id, 'course_name': c.course_name, 'classroom': c.classroom,
            'start_time': c.start_time.strftime('%H:%M') if c.start_time else None,
            'end_time': c.end_time.strftime('%H:%M') if c.end_time else None,
            'rep_date': c.rep_date, 'start_date': c.start_date.isoformat(), 'end_date': c.end_date.isoformat(),
            'is_main': True, 'is_lab': c.is_lab, 'weeks': [], 'assignments': [],
            'exams': [{
                'exam_topic': target.exam_topic if target is not None else 'Final exam',
                'exam_date': sc['exam']['date'], 'date_is_estimate': False,
                'exam_details': xs.exam_details(sc['exam'], campus_name),
                'lms_source': 'registrar', 'lms_url': p['page_url'], 'lms_external_id': ext, 'lms_note': note,
            }],
            'lms_kind': 'registrar', 'lms_course': str(c.pk), 'lms_external_id': '',
            'lms_existing': True, 'lms_outline': 'none', 'lms_has_outline': False, 'lms_check': '',
            'lms_item_count': 1,
        })
    return out


def apply_registrar(imp, user, courses):
    from . import exam_schedule as xs
    from .views import convert_date
    p = imp.payload
    campus_name = xs.UNIS[p['uni']]['campuses'][p['campus']]
    staged = {c['id']: c for c in p['courses']}
    touched, created, updated = [], 0, 0
    with transaction.atomic():
        for c in courses:
            sc = staged.get(str((c or {}).get('lms_course') or ''))
            course = Course.objects.filter(user=user, pk=int(sc['id'])).first() if sc else None
            if course is None:
                return 400, {'error': 'course not in this import'}
            ext = registrar_external_id(imp, sc['code'])
            for e in c.get('exams') or []:
                if not isinstance(e, dict) or e.get('lms_skip'):
                    continue
                # The student may correct the date on the review page; the id,
                # link and schedule details always come from the import.
                d = convert_date(e.get('exam_date')) or sc['exam']['date']
                details = xs.exam_details(sc['exam'], campus_name)
                target = _registrar_target(user, course, ext)
                if target is None:
                    Exam.objects.create(
                        user=user, course=course, exam_topic=str(e.get('exam_topic') or 'Final exam')[:200],
                        exam_date=f'{d}T00:00:00Z' if d else None, date_is_estimate=False,
                        exam_details=details, lms_external_id=ext, lms_url=p['page_url'],
                    )
                    created += 1
                else:
                    target.exam_date = f'{d}T00:00:00Z' if d else None
                    target.date_is_estimate = False
                    target.lms_external_id, target.lms_url = ext, p['page_url']
                    # Never overwrite notes the student wrote: replace only our
                    # own earlier line, otherwise add ours underneath.
                    old = (target.exam_details or '').strip()
                    lines = [ln for ln in old.splitlines() if not ln.startswith('official exam schedule')]
                    target.exam_details = '\n'.join(lines + [details]).strip()
                    target.save(update_fields=['exam_date', 'date_is_estimate', 'lms_external_id',
                                               'lms_url', 'exam_details'])
                    updated += 1
            touched.append(course.pk)
        imp.applied_at = timezone.now()
        imp.save(update_fields=['applied_at'])
    logger.info('lms.registrar_applied user_id=%s import=%s created=%s updated=%s',
                user.id, imp.pk, created, updated)
    return 201, {'success': True, 'course_pks': touched, 'synced_courses': len(touched),
                 'synced_items': {'created': created, 'updated': updated}}


def _pick_course(candidates, exam_date):
    """Same code twice (retaking, or last year's copy): the one whose term
    the exam falls in, else the most recent."""
    from datetime import date as _d, timedelta as _td
    if exam_date:
        ed = _d.fromisoformat(exam_date)
        inside = [c for c in candidates if c.start_date <= ed <= c.end_date + _td(days=30)]
        if inside:
            return inside[0]
    return max(candidates, key=lambda c: c.end_date) if candidates else None


def build_review(imp):
    """The import as the Add page's review screen expects it: a flat list of
    course dicts (the parser's shape) plus `lms_*` keys grouping them."""
    if imp.source == 'registrar':
        return _registrar_review(imp)
    existing = set(
        Course.objects.filter(
            user=imp.user, parent_course__isnull=True,
            lms_external_id__in=[course_external_id(imp, c['id']) for c in imp.payload['courses']],
        ).values_list('lms_external_id', flat=True)
    )
    out = []
    for lc in imp.payload['courses']:
        ext = course_external_id(imp, lc['id'])
        main, others, leftovers, rows, state = course_group(imp, lc)
        decided = (imp.reconciled or {}).get(lc['id']) or {}
        if decided.get('status') == 'ok':
            _apply_decisions(lc, main, leftovers, rows, decided)
        group = [main] + others
        for i, c in enumerate(group):
            c['lms_course'] = lc['id']
            c['lms_external_id'] = ext if i == 0 else ''
            c['lms_has_outline'] = state == 'read'
            c['lms_outline'] = state
            # "ok" double-checked · "failed" couldn't be · "" never ran
            c['lms_check'] = decided.get('status') or ''
            c['lms_existing'] = ext in existing
            c['lms_item_count'] = len(lc['items'])
            out.append(c)
    return out


# ---------------------------------------------------------------------------
# Applying a reviewed import
# ---------------------------------------------------------------------------

def _sync_items(user, root, items, date_k, topic_k, model, details_k, urls):
    """Upsert LMS-sourced deadlines onto an already-imported course tree.

    Matches on lms_external_id only. Items without one came from re-parsing
    the outline, and were created on the first sync, so they're skipped
    rather than duplicated. Completion state and any notes the student wrote
    are left alone; the date and title follow the LMS.
    """
    from .views import convert_date, _is_estimate  # views imports nothing from here
    tree = [root.pk] + list(root.child_courses.values_list('pk', flat=True))
    created = updated = 0
    for it in items or []:
        ext = str(it.get('lms_external_id') or '')[:100]
        if not ext:
            continue
        d = convert_date(it.get(date_k))
        value = f'{d}T00:00:00Z' if d else None
        row = model.objects.filter(user=user, course_id__in=tree, lms_external_id=ext).first()
        topic = str(it.get(topic_k) or '')[:200]
        if row is None:
            model.objects.create(**{
                'user': user, 'course': root, date_k: value, topic_k: topic,
                details_k: it.get(details_k, '') or '',
                'date_is_estimate': _is_estimate(it, d), 'lms_external_id': ext,
                'lms_url': urls.get(ext, ''),
            })
            created += 1
            continue
        changed = []
        if d and (getattr(row, date_k) is None or getattr(row, date_k).date().isoformat() != d):
            setattr(row, date_k, value)
            row.date_is_estimate = False
            changed += [date_k, 'date_is_estimate']
        if topic and getattr(row, topic_k) != topic:
            setattr(row, topic_k, topic)
            changed.append(topic_k)
        if urls.get(ext) and row.lms_url != urls[ext]:
            row.lms_url = urls[ext]
            changed.append('lms_url')
        if changed:
            row.save(update_fields=changed)
            updated += 1
    return created, updated


def apply_review(imp, user, courses):
    """Save what the student confirmed. Returns (http_status, body)."""
    from .views import _course_overlap, _create_course_tree

    if imp.source == 'registrar':
        return apply_registrar(imp, user, courses)

    known = {c['id'] for c in imp.payload['courses']}
    groups = {}
    for c in courses:
        if not isinstance(c, dict):
            return 400, {'error': 'bad course'}
        lid = str(c.get('lms_course') or '')
        if lid not in known:
            # The review page only edits what we sent; a course naming an LMS
            # id that isn't in this import came from somewhere else.
            return 400, {'error': 'course not in this import'}
        groups.setdefault(lid, []).append(c)

    # The link on each saved deadline comes from the import's own records, not
    # from the page: {external id → url} for every LMS item in this import.
    urls = {
        item_external_id(imp, it): item_url(imp, lc['id'], it)
        for lc in imp.payload['courses'] for it in lc['items']
    }
    for c in courses:
        for key in ('exams', 'assignments'):
            # Unticked on the review page (a placeholder, or an outline item
            # the LMS already covers): not saved.
            kept = [x for x in (c.get(key) or []) if isinstance(x, dict) and not x.get('lms_skip')]
            for x in kept:
                ext = str(x.get('lms_external_id') or '')
                x['lms_external_id'] = ext if ext in urls else ''
                x['lms_url'] = urls.get(ext, '')
            c[key] = kept

    roots = {
        c.lms_external_id: c for c in Course.objects.filter(
            user=user, parent_course__isnull=True,
            lms_external_id__in=[course_external_id(imp, lid) for lid in groups],
        )
    }
    new_groups, sync_groups = [], []
    for lid, group in groups.items():
        ext = course_external_id(imp, lid)
        if not any(c.get('is_main') for c in group):
            # The student removed the main row and kept a section; promote it.
            group[0]['is_main'] = True
        for c in group:
            # Only the group's main carries the course id; children are
            # sections created under it. Never trust what the page sent.
            c['lms_external_id'] = ext if c.get('is_main') else ''
        (sync_groups if ext in roots else new_groups).append((ext, group))

    incoming = [c for _, g in new_groups for c in g]
    clash = _course_overlap(user, incoming) if incoming else None
    if clash:
        return 400, clash

    created_pks, synced = [], {'created': 0, 'updated': 0}
    with transaction.atomic():
        for _, group in new_groups:
            # Each LMS course is its own main course. Passing them all to one
            # _create_course_tree would make every course a section of the first.
            rows = _create_course_tree(user, group, keep_lms_ids=True)
            created_pks += [r.pk for r in rows]
        for ext, group in sync_groups:
            root = roots[ext]
            for c in group:
                for args in ((c.get('exams'), 'exam_date', 'exam_topic', Exam, 'exam_details'),
                             (c.get('assignments'), 'assignment_due', 'assignment_topic',
                              Assignment, 'assignment_detail')):
                    n_new, n_upd = _sync_items(user, root, *args, urls)
                    synced['created'] += n_new
                    synced['updated'] += n_upd
        imp.applied_at = timezone.now()
        imp.save(update_fields=['applied_at'])

    logger.info('lms.applied user_id=%s import=%s new_courses=%s synced=%s',
                user.id, imp.pk, len(new_groups), synced)
    return 201, {
        'success': True,
        'course_pks': created_pks,
        'synced_courses': len(sync_groups),
        'synced_items': synced,
    }


# ---------------------------------------------------------------------------
# Views
# ---------------------------------------------------------------------------

def _bearer(request):
    """(OAuthAccessToken row, Principal) for a token holding courses:import,
    else (None, None).

    OAuth only. The extension signs in through the consent screen, which names
    exactly this scope; a PAT is pasted into agent configs and has no business
    here.
    """
    header = request.META.get('HTTP_AUTHORIZATION', '')
    if not header.startswith('Bearer '):
        return None, None
    row, principal = agent_auth.resolve_credential(header[len('Bearer '):].strip())
    if principal is None or principal.credential_kind != 'oauth':
        return None, None
    if not principal.has(scope_defs.COURSES_IMPORT):
        return None, None
    return row, principal


def _unauthorized():
    return Response({'error': 'invalid_token'}, status=status.HTTP_401_UNAUTHORIZED)


def _rate_limited(principal, row):
    try:
        agent_auth.check_and_record(principal, row, is_write=True)
    except agent_auth.RateLimited as exc:
        logger.warning('lms.rate_limited credential=%s kind=%s', principal.credential_id, exc.kind)
        return Response({'error': 'rate_limited'}, status=status.HTTP_429_TOO_MANY_REQUESTS)
    return None


def _live_import(qs, pk):
    imp = qs.filter(pk=pk).first()
    if imp is None:
        return None, Response({'error': 'not_found'}, status=status.HTTP_404_NOT_FOUND)
    if imp.created_at < timezone.now() - IMPORT_TTL:
        return None, Response({'error': 'expired'}, status=status.HTTP_410_GONE)
    return imp, None


class LmsImportCreateView(APIView):
    """POST /api/lms/imports/ — the extension stages what it read."""
    authentication_classes = []  # bearer handled below; a session JWT is not valid here
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        row, principal = _bearer(request)
        if principal is None:
            return _unauthorized()
        limited = _rate_limited(principal, row)
        if limited:
            return limited
        try:
            body = json.loads(request.body or b'{}')
            clean = clean_payload(body)
        except (ValueError, UnicodeDecodeError) as exc:
            return Response({'error': 'bad_payload', 'detail': str(exc)[:200]},
                            status=status.HTTP_400_BAD_REQUEST)

        imp = LmsImport.objects.create(
            user=principal.user,
            client=row.client if isinstance(row, OAuthAccessToken) else None,
            source=clean['source'], host=clean['host'],
            payload={'courses': clean['courses']},
        )
        logger.info('lms.staged user_id=%s import=%s source=%s courses=%s',
                    principal.user.id, imp.pk, imp.source, len(clean['courses']))
        frontend = getattr(settings, 'FRONTEND_URL', '').rstrip('/')
        return Response({
            'id': str(imp.pk),
            'review_url': f'{frontend}/Add?lms_import={imp.pk}',
        }, status=status.HTTP_201_CREATED)


class LmsImportOutlineView(APIView):
    """POST /api/lms/imports/<id>/outline/ — one course's outline file.

    One file per request so each parse gets its own request budget; the
    extension shows progress per course.
    """
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def post(self, request, pk):
        from .views import outline_upload_error, save_outline_to_tmp

        row, principal = _bearer(request)
        if principal is None:
            return _unauthorized()
        imp, err = _live_import(LmsImport.objects.filter(user=principal.user, applied_at__isnull=True), pk)
        if err:
            return err
        lms_course = str(request.data.get('course') or '')
        if lms_course not in {c['id'] for c in imp.payload['courses']}:
            return Response({'error': 'course not in this import'}, status=status.HTTP_400_BAD_REQUEST)
        file_obj = request.FILES.get('file')
        if file_obj is None:
            return Response({'error': 'No file uploaded'}, status=status.HTTP_400_BAD_REQUEST)

        if self._parses_today(principal.user) >= OUTLINE_PARSES_PER_DAY:
            return Response({'error': 'outline_limit_reached',
                             'detail': f'{OUTLINE_PARSES_PER_DAY} outlines a day; try again tomorrow.'},
                            status=status.HTTP_429_TOO_MANY_REQUESTS)
        limited = _rate_limited(principal, row)
        if limited:
            return limited
        rejected = outline_upload_error(file_obj)
        if rejected:
            return rejected

        ext = os.path.splitext(file_obj.name)[1].lower()
        path = save_outline_to_tmp(file_obj, ext)
        try:
            lc = next(c for c in imp.payload['courses'] if c['id'] == lms_course)
            result = process_course_outline(path, lms_context={
                'term_start': lc.get('start_date'), 'term_end': lc.get('end_date'), 'items': lc.get('items') or [],
            })
        except Exception:
            logger.exception('lms.outline_failed import=%s', imp.pk)
            self._store(imp, lms_course, {'error': 'parse_failed'})
            # 502: the parser upstream failed, not the request. The extension
            # shows it as "couldn't read this one" and carries on.
            return Response({'error': "couldn't read this outline"}, status=status.HTTP_502_BAD_GATEWAY)
        finally:
            try:
                os.remove(path)
            except OSError:
                pass

        # JSON round-trip: the parser hands back datetime.date objects.
        parsed = json.loads(json.dumps(result.get('courses') or [], default=str))
        self._store(imp, lms_course, parsed)
        return Response({'ok': True, 'courses': len(parsed)})

    @staticmethod
    def _store(imp, lms_course, value):
        # Failures count against the daily cap too: the LLM call was made.
        with transaction.atomic():
            imp = LmsImport.objects.select_for_update().get(pk=imp.pk)
            outlines = dict(imp.outlines or {})
            outlines[lms_course] = value
            imp.outlines = outlines
            imp.outline_parses += 1
            # Decisions were made against the previous parse; their refs no
            # longer line up, so the course gets checked again.
            reconciled = dict(imp.reconciled or {})
            reconciled.pop(lms_course, None)
            imp.reconciled = reconciled
            imp.save(update_fields=['outlines', 'outline_parses', 'reconciled'])

    @staticmethod
    def _parses_today(user):
        # Counted per import created in the last day — an import lives 24h, so
        # this is the same window, give or take one import's lifetime.
        cutoff = timezone.now() - timedelta(hours=24)
        return LmsImport.objects.filter(user=user, created_at__gte=cutoff) \
                                .aggregate(n=Sum('outline_parses'))['n'] or 0


class LmsImportReconcileView(APIView):
    """POST /api/lms/imports/<id>/reconcile/ — double-check one course.

    Runs after that course's outline (if any) is read. Counts against the read
    budget, not the write budget: it doesn't touch the timetable, and a term's
    worth of courses checked back to back would otherwise trip the 10-writes-a-
    minute limit meant for agents creating things.
    """
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def post(self, request, pk):
        from .lms_reconcile import reconcile

        row, principal = _bearer(request)
        if principal is None:
            return _unauthorized()
        imp, err = _live_import(LmsImport.objects.filter(user=principal.user, applied_at__isnull=True), pk)
        if err:
            return err
        lms_course = str(request.data.get('course') or '')
        lc = next((c for c in imp.payload['courses'] if c['id'] == lms_course), None)
        if lc is None:
            return Response({'error': 'course not in this import'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            agent_auth.check_and_record(principal, row, is_write=False)
        except agent_auth.RateLimited:
            return Response({'error': 'rate_limited'}, status=status.HTTP_429_TOO_MANY_REQUESTS)

        _, _, leftovers, rows, _ = course_group(imp, lc)
        decided = reconcile(leftovers, rows)
        with transaction.atomic():
            fresh = LmsImport.objects.select_for_update().get(pk=imp.pk)
            reconciled = dict(fresh.reconciled or {})
            reconciled[lms_course] = decided
            fresh.reconciled = reconciled
            fresh.save(update_fields=['reconciled'])
        outline = decided.get('outline') or []
        summary = {
            'status': decided['status'],
            'merged': sum(d['action'] == 'merge' for d in outline),
            'dropped': sum(d['action'] == 'drop' for d in outline),
            'kept': sum(d['action'] == 'keep' for d in outline),
            'placeholders': len(decided.get('placeholders') or []),
        }
        logger.info('lms.reconciled import=%s course=%s %s', imp.pk, lms_course, summary)
        return Response(summary)


class ExamScheduleLookupView(APIView):
    """POST /api/exam-schedule/lookup/ — match an official exam schedule.

    The extension sends the schedule file it read in the student's signed-in
    browser (Laurier's is behind its SSO; a server can't fetch it) plus the
    campus, term and course codes. Found exams for courses already on the
    student's Timetify are staged as a "registrar" import for review; the
    rest come back as not_listed / pick_section / skipped.
    """
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        from . import exam_schedule as xs

        row, principal = _bearer(request)
        if principal is None:
            return _unauthorized()
        limited = _rate_limited(principal, row)
        if limited:
            return limited
        body = request.data if isinstance(request.data, dict) else {}
        uni, campus, term = body.get('uni'), body.get('campus'), str(body.get('term') or '')
        if uni not in xs.UNIS or campus not in xs.UNIS[uni]['campuses'] or not xs.TERM_RE.match(term):
            return Response({'error': 'bad uni, campus or term'}, status=status.HTTP_400_BAD_REQUEST)
        wants = body.get('courses')
        if not isinstance(wants, list) or not wants or len(wants) > 30:
            return Response({'error': 'courses is required (at most 30)'}, status=status.HTTP_400_BAD_REQUEST)
        wants = [{'code': xs.normalize_code(w.get('code')), 'section': str(w.get('section') or '')[:20]}
                 for w in wants if isinstance(w, dict)]
        if any(not xs.CODE_RE.match(w['code']) for w in wants):
            return Response({'error': 'bad course code'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            rows = xs.parse_schedule(body.get('schedule_text'), term)
        except xs.ScheduleFormatError as exc:
            logger.warning('exams.schedule_format campus=%s term=%s why=%s', campus, term, exc)
            return Response({'error': 'schedule_format', 'detail': str(exc)},
                            status=status.HTTP_422_UNPROCESSABLE_ENTITY)

        results = xs.match(rows, wants)
        roots = list(Course.objects.filter(user=principal.user, parent_course__isnull=True))
        staged = []
        for r in results:
            if r['status'] != 'found':
                continue
            course = _pick_course([c for c in roots if xs.same_course(c.course_id, r['code'])], r.get('date'))
            if course is None:
                r['status'] = 'skipped'   # not on their Timetify; record the course first
                continue
            r['timetify_course'] = course.course_id
            if any(s['id'] == str(course.pk) for s in staged):
                continue
            staged.append({'id': str(course.pk), 'code': r['code'], 'exam': {
                'date': r['date'], 'time_text': r.get('time_text'), 'room': r.get('room'),
                'section': r.get('section')}})

        page = xs.page_url(uni, campus, term)
        out = {'results': results, 'page_url': page, 'id': None, 'review_url': None}
        if staged:
            imp = LmsImport.objects.create(
                user=principal.user, client=row.client if isinstance(row, OAuthAccessToken) else None,
                source='registrar', host=xs.UNIS[uni]['host'],
                payload={'uni': uni, 'campus': campus, 'term': term, 'page_url': page, 'courses': staged},
            )
            frontend = getattr(settings, 'FRONTEND_URL', '').rstrip('/')
            out.update(id=str(imp.pk), review_url=f'{frontend}/Add?lms_import={imp.pk}')
        logger.info('exams.lookup user_id=%s campus=%s term=%s found=%s staged=%s', principal.user.id,
                    campus, term, sum(r['status'] == 'found' for r in results), len(staged))
        return Response(out)


class LmsImportDetailView(APIView):
    """GET /api/lms/imports/<id>/ — the review payload for the Add page."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        imp, err = _live_import(LmsImport.objects.filter(user=request.user), pk)
        if err:
            return err
        return Response({
            'id': str(imp.pk),
            'source': imp.source,
            'host': imp.host,
            'applied': imp.applied_at is not None,
            'courses': build_review(imp),
        })


class LmsImportApplyView(APIView):
    """POST /api/lms/imports/<id>/apply/ — save what the student confirmed."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        imp, err = _live_import(LmsImport.objects.filter(user=request.user), pk)
        if err:
            return err
        courses = request.data.get('courses')
        if not isinstance(courses, list) or not courses:
            return Response({'error': 'No course data provided'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            code, body = apply_review(imp, request.user, courses)
        except Exception:
            logger.exception('lms.apply_failed import=%s', imp.pk)
            return Response({'error': 'Failed to save import'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        return Response(body, status=code)
