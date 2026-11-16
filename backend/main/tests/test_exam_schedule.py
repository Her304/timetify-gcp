"""Official exam schedule lookup (Laurier). Fixture rows are copied from the
real Fall 2026 files' shape: an HTML table fragment, sections like "A, B",
"Noon", empty room cells, and the same course on different dates at Milton."""

import json
from datetime import date

from django.contrib.auth import get_user_model
from django.test import SimpleTestCase, TestCase
from rest_framework.test import APIClient

from main import exam_schedule as xs
from main.mcp import oauth
from main.models import Course, Exam, LmsImport, OAuthClient

User = get_user_model()


def table(*rows):
    head = ('<table id="examSchedule" class="display print-only">\n    <thead>\n        <tr>\n'
            '            <th>Course</th>\n            <th>Section</th>\n            <th>Date</th>\n'
            '            <th>Time</th>\n            <th>Rooms</th>\n        </tr>\n    </thead>\n    <tbody>\n        ')
    body = ''.join(f'<tr><td>{c}</td><td>{s}</td><td>{d}</td><td>{t}</td><td>{r}</td></tr>' for c, s, d, t, r in rows)
    return head + body + '\n    </tbody>\n</table>'


WATERLOO = table(
    ('AB101', 'A', 'Saturday, Dec. 12', '3:30 p.m.', '   '),
    ('CP213', 'A, B', 'Sunday, Dec. 13', '8:30 a.m.', '   '),
    ('CP220', 'A, A, B', 'Wednesday, Dec. 16', '3:30 p.m.', ''),
    ('CP363', 'A, B, C', 'Friday, Dec. 18', '3:30 p.m.', 'BA201'),
    ('MA123', 'A, B, C', 'Monday, Dec. 21', 'Noon', ''),
    ('ST230', 'A, B', 'Monday, Dec. 14', '8:30 a.m.', ''),
    ('ST230', 'C', 'Tuesday, Dec. 15', '7 p.m.', ''),
)
MILTON = table(('CP363', 'MC1', 'Saturday, Dec. 12', 'Noon', ''))

# Brantford's real file: CRLFs, a sixth "Lecturer" column, rooms filled in.
BRANTFORD = ('\r\n\r\n\r\n<table id="examSchedule" class="display print-only">\r\n    <thead>\r\n        <tr>\r\n'
             '            <th>Course</th>\r\n            <th>Section</th>\r\n            <th>Date</th>\r\n'
             '            <th>Time</th>\r\n            <th>Rooms</th><th>Lecturer</th>        </tr>\r\n    </thead>\r\n'
             '    <tbody>\r\n        <tr><td>BI110</td><td>BR</td><td>Thursday, Dec. 17</td><td>Noon</td><td>RCW202</td>'
             '<td>Iqbal, Sobia </td></tr><tr><td>BU111</td><td>BR1, BR2</td><td>Monday, Dec. 21</td><td>7 p.m.</td>'
             '<td>RCW202</td><td>Froese, Jocelyn Sakal</td></tr>    </tbody>\r\n</table>\r\n<div class="clear"></div>\r\n')


class ParseTests(SimpleTestCase):
    def test_parses_real_shape(self):
        rows = xs.parse_schedule(WATERLOO, '202609')
        cp = [r for r in rows if r['code'] == 'CP213'][0]
        self.assertEqual(cp['sections'], ['A', 'B'])
        self.assertEqual(cp['date'], date(2026, 12, 13))
        self.assertEqual((cp['time'], cp['room']), ('08:30', ''))
        self.assertEqual([r['time'] for r in rows if r['code'] == 'MA123'], ['12:00'])

    def test_times(self):
        for raw, want in [('8:30 a.m.', '08:30'), ('Noon', '12:00'), ('7 p.m.', '19:00'), ('12:30 p.m.', '12:30'),
                          ('TBA', None)]:
            self.assertEqual(xs.parse_time(raw), want, raw)

    def test_year_comes_from_term(self):
        self.assertEqual(xs.parse_date('Saturday, Apr. 18', '202701'), date(2027, 4, 18))

    def test_unknown_layout_refuses_instead_of_guessing(self):
        for bad in ('', '<html>login</html>', table()[:-8].replace('Rooms', 'Instructor') + '</table>'):
            with self.assertRaises(xs.ScheduleFormatError):
                xs.parse_schedule(bad, '202609')

    def test_match_uses_section_and_flags_ambiguity(self):
        rows = xs.parse_schedule(WATERLOO, '202609')
        res = {r['code']: r for r in xs.match(rows, [
            {'code': 'ST-230', 'section': 'C'}, {'code': 'ST230', 'section': ''}, {'code': 'CP363', 'section': 'B'},
            {'code': 'CP220', 'section': 'A, B'}, {'code': 'CP104', 'section': 'A'},
        ])}
        self.assertEqual(xs.match(rows, [{'code': 'ST230', 'section': 'C'}])[0]['date'], '2026-12-15')
        self.assertEqual(xs.match(rows, [{'code': 'ST230', 'section': ''}])[0]['status'], 'pick_section')
        self.assertEqual((res['CP363']['status'], res['CP363']['room']), ('found', 'BA201'))
        self.assertEqual(res['CP220']['date'], '2026-12-16')
        self.assertEqual(res['CP104']['status'], 'not_listed')

    def test_brantford_extra_column_is_ignored(self):
        rows = xs.parse_schedule(BRANTFORD, '202609')
        self.assertEqual([(r['code'], r['room'], r['time']) for r in rows],
                         [('BI110', 'RCW202', '12:00'), ('BU111', 'RCW202', '19:00')])
        self.assertNotIn('Iqbal', json.dumps(rows, default=str), 'lecturer names are never kept')
        self.assertEqual(xs.match(rows, [{'code': 'BU111', 'section': 'BR2'}])[0]['date'], '2026-12-21')

    def test_saved_course_with_section_suffix_still_matches(self):
        for saved, code, want in [('CP213A', 'CP213', True), ('CP220-A', 'CP220', True), ('BU111 BR1', 'BU111', True),
                                  ('CP213', 'CP213', True), ('CP2130', 'CP213', False), ('CP214', 'CP213', False)]:
            self.assertEqual(xs.same_course(saved, code), want, saved)

    def test_campus_matters(self):
        rows = xs.parse_schedule(MILTON, '202609')
        self.assertEqual(xs.match(rows, [{'code': 'CP363', 'section': 'MC1'}])[0]['date'], '2026-12-12')


class LookupTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='chin', email='c@example.com', password='pw-123456789',
                                             grad_year=2028)
        self.client_row = OAuthClient.objects.create(client_id='ext', redirect_uris=['https://x.chromiumapp.org/'])
        _, tok = oauth._issue_tokens(self.user, self.client_row, ['courses:import'], '')
        self.auth = {'HTTP_AUTHORIZATION': f"Bearer {tok['access_token']}"}
        self.api = APIClient()

        def course(code, **kw):
            return Course.objects.create(user=self.user, course_id=code, course_name=code, start_date='2026-09-10',
                                         end_date='2026-12-09', start_time='10:00', end_time='11:20',
                                         rep_date='Tuesday', classroom='x', **kw)
        self.cp363 = course('CP363')
        self.st230 = course('ST230')
        self.tba_final = Exam.objects.create(user=self.user, course=self.cp363, exam_topic='Final Exam',
                                             exam_details='bring a calculator')

    def lookup(self, courses, text=WATERLOO, campus='waterloo'):
        return self.api.post('/api/exam-schedule/lookup/', data=json.dumps({
            'uni': 'laurier', 'campus': campus, 'term': '202609', 'schedule_text': text, 'courses': courses,
        }), content_type='application/json', **self.auth)

    def review(self, imp_id):
        self.api.force_authenticate(self.user)
        r = self.api.get(f'/api/lms/imports/{imp_id}/').json()
        self.api.force_authenticate(None)
        return r

    def apply(self, imp_id, courses):
        self.api.force_authenticate(self.user)
        r = self.api.post(f'/api/lms/imports/{imp_id}/apply/', data={'courses': courses}, format='json')
        self.api.force_authenticate(None)
        return r

    def test_lookup_stages_only_courses_on_timetify(self):
        r = self.lookup([{'code': 'CP363', 'section': 'B'}, {'code': 'ST230', 'section': 'A'},
                         {'code': 'MA123', 'section': 'C'}, {'code': 'CP104'}])
        self.assertEqual(r.status_code, 200, r.content)
        status = {x['code']: x['status'] for x in r.json()['results']}
        self.assertEqual(status, {'CP363': 'found', 'ST230': 'found', 'MA123': 'skipped', 'CP104': 'not_listed'})
        imp = LmsImport.objects.get(pk=r.json()['id'])
        self.assertEqual(imp.source, 'registrar')
        self.assertIn('fall-exam-schedule-waterloo.html', r.json()['page_url'])
        self.assertFalse(Exam.objects.filter(exam_date__isnull=False).exists(), 'staging saves nothing')

    def test_review_then_apply_fills_tba_final_without_clobbering_notes(self):
        imp_id = self.lookup([{'code': 'CP363', 'section': 'B'}, {'code': 'ST230', 'section': 'A'}]).json()['id']
        courses = self.review(imp_id)['courses']
        cp = [c for c in courses if c['course_id'] == 'CP363'][0]
        self.assertIn('fills in "Final Exam"', cp['exams'][0]['lms_note'])
        self.assertEqual(cp['exams'][0]['lms_source'], 'registrar')
        r = self.apply(imp_id, courses)
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.json()['synced_items'], {'created': 1, 'updated': 1})
        self.tba_final.refresh_from_db()
        self.assertEqual(self.tba_final.exam_date.date(), date(2026, 12, 18))
        self.assertIn('bring a calculator', self.tba_final.exam_details)
        self.assertIn('3:30 p.m. · BA201', self.tba_final.exam_details)
        self.assertIn('fall-exam-schedule-waterloo', self.tba_final.lms_url)
        st = Exam.objects.get(course=self.st230)
        self.assertEqual((st.exam_topic, st.exam_date.date()), ('Final exam', date(2026, 12, 14)))

    def test_rerun_updates_instead_of_duplicating(self):
        imp_id = self.lookup([{'code': 'CP363', 'section': 'B'}]).json()['id']
        self.apply(imp_id, self.review(imp_id)['courses'])
        moved = WATERLOO.replace('Friday, Dec. 18', 'Saturday, Dec. 19').replace('BA201', 'AC101')
        imp2 = self.lookup([{'code': 'CP363', 'section': 'B'}], text=moved).json()['id']
        courses = self.review(imp2)['courses']
        self.assertIn('already from the official schedule', courses[0]['exams'][0]['lms_note'])
        self.apply(imp2, courses)
        self.assertEqual(Exam.objects.filter(course=self.cp363).count(), 1)
        self.tba_final.refresh_from_db()
        self.assertEqual(self.tba_final.exam_date.date(), date(2026, 12, 19))
        self.assertEqual(self.tba_final.exam_details.count('official exam schedule'), 1)
        self.assertIn('AC101', self.tba_final.exam_details)

    def test_bad_input_and_format(self):
        self.assertEqual(self.lookup([{'code': 'CP363'}], campus='mars').status_code, 400)
        self.assertEqual(self.lookup([{'code': 'DROP TABLE'}]).status_code, 400)
        self.assertEqual(self.lookup([{'code': 'CP363'}], text='<html>sign in</html>').status_code, 422)

    def test_needs_the_import_scope(self):
        _, tok = oauth._issue_tokens(self.user, self.client_row, ['schedule:read'], '')
        r = self.api.post('/api/exam-schedule/lookup/', data=json.dumps({}), content_type='application/json',
                          HTTP_AUTHORIZATION=f"Bearer {tok['access_token']}")
        self.assertEqual(r.status_code, 401)

    def test_apply_rejects_courses_outside_the_import(self):
        imp_id = self.lookup([{'code': 'CP363', 'section': 'B'}]).json()['id']
        courses = self.review(imp_id)['courses']
        courses[0]['lms_course'] = str(self.st230.pk)
        self.assertEqual(self.apply(imp_id, courses).status_code, 400)
