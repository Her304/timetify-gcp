"""Official final-exam schedules (Laurier first), read by the LMS extension.

Laurier publishes one schedule per campus and term at
students.wlu.ca/academics/exams/assets/resources/{campus}{term}E.txt — an HTML
<table id="examSchedule"> fragment (Course · Section · Date · Time · Rooms) that
the public-looking schedule page loads with JavaScript. **Both sit behind
Laurier's student login** (a server gets a 302 to idp.wlu.ca), so the server
can't fetch them: the extension reads the file in the student's signed-in
browser and posts the text here. Parsing and matching live server-side so
there's one tested implementation.

The term code is the same one D2L course codes end in ("3006.202609"):
YYYY + 01 (winter) / 05 (spring) / 09 (fall). Rows give "Monday, Dec. 14"
with no year; the year is the term's.
"""

import re
from datetime import date
from html.parser import HTMLParser

UNIS = {
    'laurier': {
        'name': 'Wilfrid Laurier University',
        'host': 'students.wlu.ca',
        'campuses': {'waterloo': 'Waterloo', 'brantford': 'Brantford', 'milton': 'Milton'},
        'page': 'https://students.wlu.ca/academics/exams/assets/resources/{season}-exam-schedule-{campus}.html',
    },
}
SEASONS = {'01': 'winter', '05': 'spring', '09': 'fall'}
TERM_RE = re.compile(r'^(20\d{2})(01|05|09)$')
CODE_RE = re.compile(r'^[A-Z]{2,5}\d{3,4}[A-Z]?$')
MAX_TEXT = 2 * 1024 * 1024
EXPECTED_HEADER = ['course', 'section', 'date', 'time', 'rooms']

MONTHS = {m: i for i, m in enumerate(
    ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'], start=1)}


class ScheduleFormatError(ValueError):
    """The file isn't the table we know. Better to say so than to guess."""


class _Table(HTMLParser):
    def __init__(self):
        super().__init__()
        self.rows, self._row, self._cell, self.header = [], None, None, []
        self._in_head = False

    def handle_starttag(self, tag, attrs):
        if tag == 'thead':
            self._in_head = True
        elif tag == 'tr':
            self._row = []
        elif tag in ('td', 'th') and self._row is not None:
            self._cell = []

    def handle_endtag(self, tag):
        if tag == 'thead':
            self._in_head = False
        elif tag in ('td', 'th') and self._row is not None and self._cell is not None:
            self._row.append(' '.join(''.join(self._cell).split()))
            self._cell = None
        elif tag == 'tr' and self._row is not None:
            if self._row:
                if self._in_head and not self.header:
                    self.header = self._row
                else:
                    self.rows.append(self._row)
            self._row = None

    def handle_data(self, data):
        if self._cell is not None:
            self._cell.append(data)


def normalize_code(raw):
    return re.sub(r'[^A-Z0-9]', '', str(raw or '').upper())


def same_course(timetify_course_id, code):
    """Whether a saved Timetify course is this schedule code.

    Outlines often name the course with its section glued on ("CP213A",
    "CP220A") — saved that way, an exact match skipped the student's own
    course. A trailing section suffix (letters, optionally a digit or two:
    A, BR, MC1) is allowed; a different course number is not ("CP2130").
    """
    mine = normalize_code(timetify_course_id)
    if mine == code:
        return True
    return mine.startswith(code) and bool(re.fullmatch(r'[A-Z]{1,3}\d{0,2}', mine[len(code):]))


def parse_time(text):
    """"8:30 a.m." → "08:30", "Noon" → "12:00", "7 p.m." → "19:00"; None if unknown."""
    t = str(text or '').strip().lower().replace('.', '')
    if t in ('noon', '12 noon'):
        return '12:00'
    m = re.match(r'^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$', t)
    if not m:
        return None
    h, mi = int(m.group(1)), int(m.group(2) or 0)
    if m.group(3) == 'pm' and h != 12:
        h += 12
    if m.group(3) == 'am' and h == 12:
        h = 0
    return f'{h:02d}:{mi:02d}' if h < 24 and mi < 60 else None


def parse_date(text, term):
    """"Monday, Dec. 14" in term 202609 → date(2026, 12, 14); None if unknown."""
    m = re.search(r'([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2})', str(text or ''))
    if not m or m.group(1).lower() not in MONTHS:
        return None
    try:
        return date(int(term[:4]), MONTHS[m.group(1).lower()], int(m.group(2)))
    except ValueError:
        return None


def parse_schedule(text, term):
    """→ [{code, sections, date, time, time_text, room}]. Raises
    ScheduleFormatError when the table isn't the one we know."""
    if not isinstance(text, str) or not text.strip():
        raise ScheduleFormatError('empty schedule')
    if len(text) > MAX_TEXT:
        raise ScheduleFormatError('schedule too large')
    p = _Table()
    p.feed(text)
    header = [h.strip().lower() for h in p.header]
    if header[:5] != EXPECTED_HEADER:
        raise ScheduleFormatError(f'unexpected columns: {header[:5]}')
    out = []
    for r in p.rows:
        if len(r) < 4 or not CODE_RE.match(normalize_code(r[0])):
            continue
        out.append({
            'code': normalize_code(r[0]),
            'sections': [s.strip().upper() for s in r[1].split(',') if s.strip()],
            'date': parse_date(r[2], term),
            'date_text': r[2],
            'time': parse_time(r[3]),
            'time_text': r[3],
            'room': (r[4] if len(r) > 4 else '').strip(),
        })
    if not out:
        raise ScheduleFormatError('no exam rows')
    return out


def match(rows, wants):
    """For each wanted {code, section}: the row(s) that apply.

    status: "found" (one slot), "not_listed" (no final on this campus's
    schedule — labs, courses with no exam), "pick_section" (the student's
    section is unknown and sections sit the exam at different times).
    """
    by_code = {}
    for r in rows:
        by_code.setdefault(r['code'], []).append(r)
    out = []
    for w in wants:
        code = normalize_code(w.get('code'))
        sections = [s.strip().upper() for s in re.split(r'[,/]', str(w.get('section') or '')) if s.strip()]
        cands = by_code.get(code, [])
        base = {'code': code, 'section': ', '.join(sections)}
        if not cands:
            out.append({**base, 'status': 'not_listed'})
            continue
        if sections:
            hit = [r for r in cands if set(sections) & set(r['sections'])]
            if hit:
                cands = hit
        slots = {(r['date'], r['time'], r['room']) for r in cands}
        if len(slots) == 1:
            r = cands[0]
            out.append({**base, 'status': 'found', 'date': r['date'].isoformat() if r['date'] else None,
                        'time': r['time'], 'time_text': r['time_text'], 'room': r['room'],
                        'sections_on_schedule': sorted({s for c in cands for s in c['sections']})})
        else:
            out.append({**base, 'status': 'pick_section', 'options': [
                {'sections': r['sections'], 'date': r['date'].isoformat() if r['date'] else None,
                 'time_text': r['time_text'], 'room': r['room']} for r in cands]})
    return out


def exam_details(hit, campus_name):
    room = hit.get('room') or 'room tba'
    return f"official exam schedule ({campus_name}): {hit.get('time_text') or 'time tba'} · {room}"


def page_url(uni, campus, term):
    return UNIS[uni]['page'].format(season=SEASONS[term[4:]], campus=campus)
