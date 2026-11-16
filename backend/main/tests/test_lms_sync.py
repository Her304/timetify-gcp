"""LMS sync (browser extension → staged import → review → apply).

Fixtures use real shapes read from Laurier's D2L (course names, item titles),
because the name/title heuristics are the part most likely to drift.
"""

import json
from datetime import timedelta
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase, TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from main import lms
from main.mcp import oauth
from main.mcp.auth import hash_token, mint_raw_token
from main.models import AgentAccessToken, Assignment, Course, Exam, LmsImport, OAuthClient

User = get_user_model()

HOST = 'mylearningspace.wlu.ca'


def payload(**over):
    body = {
        'source': 'd2l',
        'host': HOST,
        'courses': [
            {
                'id': '655275', 'code': '3006.202609', 'name': 'CP-363-B - Database I',
                'start_date': '2026-09-10', 'end_date': '2026-12-09',
                'items': [
                    {'kind': 'dropbox', 'id': '101', 'title': 'Assignment 1', 'date': '2026-09-27'},
                    {'kind': 'quiz', 'id': '201', 'title': 'Quiz 1- Requires Respondus LockDown Browser',
                     'date': '2026-09-18'},
                    {'kind': 'dropbox', 'id': '102', 'title': 'temp', 'date': None},
                ],
            },
            {
                'id': '656922', 'code': 'MA123LabsF26.202609',
                'name': 'MA-123-Labs - Intro Linear Algebra with App ',
                'start_date': '2026-09-08', 'end_date': '2026-12-24', 'items': [],
            },
        ],
    }
    body.update(over)
    return body


PARSED_CP363 = [{
    'course_id': 'CP363', 'course_name': 'Database I', 'classroom': 'BA201',
    'start_time': '10:00', 'end_time': '11:20', 'rep_date': 'Tuesday,Thursday',
    'start_date': '2026-09-10', 'end_date': '2026-12-09', 'is_main': True, 'is_lab': False,
    'weeks': [{'week_number': 1, 'week_topic': 'Intro'}],
    'exams': [{'exam_date': None, 'exam_topic': 'Final Exam', 'suggested_date': '2026-12-15'}],
    'assignments': [
        {'assignment_due': '2026-09-30', 'assignment_topic': 'Assignment 1',
         'assignment_detail': 'ER modelling'},
        {'assignment_due': None, 'assignment_topic': 'Participation'},
    ],
}]


class PureHelperTests(SimpleTestCase):
    def test_split_course_name_on_laurier_names(self):
        self.assertEqual(lms.split_course_name('ST-230-A - Probability & Stats for Sci.'),
                         ('ST230', 'Probability & Stats for Sci.', False))
        self.assertEqual(lms.split_course_name('MA-123-Labs - Intro Linear Algebra with App '),
                         ('MA123', 'Intro Linear Algebra with App', True))
        self.assertEqual(lms.split_course_name('CP-220-PC-220-A-B - Digital Electronics')[0], 'CP220')
        # Unrecognised names fall through whole rather than being mangled.
        self.assertEqual(lms.split_course_name('Consent is Golden 101'), ('', 'Consent is Golden 101', False))

    def test_item_key_matches_outline_and_lms_wording(self):
        self.assertEqual(lms._item_key('Quiz 1- Requires Respondus LockDown Browser'), lms._item_key('Quiz 1'))
        self.assertEqual(lms._item_key('Lab #6'), lms._item_key('Lab 6'))
        self.assertEqual(lms._item_key('Project Phase II'), lms._item_key('project ii'))
        self.assertNotEqual(lms._item_key('Assignment 1'), lms._item_key('Assignment 10'))

    def test_clean_payload_rejects_bad_input(self):
        for bad in (
            payload(source='moodle'),
            payload(host='evil host/'),
            payload(courses=[]),
            payload(courses=[{'id': '1', 'items': [{'kind': 'dropbox', 'id': '1', 'title': 'x',
                                                     'date': '2026-13-40'}]}]),
            payload(courses=[{'id': '1'}, {'id': '1'}]),
            payload(courses=[{'id': str(i)} for i in range(lms.MAX_COURSES + 1)]),
        ):
            with self.assertRaises(lms.BadPayload):
                lms.clean_payload(bad)

    def test_clean_payload_keeps_undated_items_as_tba(self):
        clean = lms.clean_payload(payload())
        temp = [i for i in clean['courses'][0]['items'] if i['title'] == 'temp'][0]
        self.assertIsNone(temp['date'])


class LmsTestCase(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='chin', email='chin@example.com', password='pw-123456789', grad_year=2028)
        self.other = User.objects.create_user(username='mallory', email='m@example.com', password='pw-123456789', grad_year=2028)
        self.client_row = OAuthClient.objects.create(
            client_id='ext', name='Timetify LMS sync', redirect_uris=['https://abc.chromiumapp.org/'])
        self.api = APIClient()

    def bearer(self, user=None, scopes=('courses:import',)):
        _, body = oauth._issue_tokens(user or self.user, self.client_row, list(scopes), '')
        return {'HTTP_AUTHORIZATION': f"Bearer {body['access_token']}"}

    def stage(self, body=None, **auth):
        auth = auth or self.bearer()
        return self.api.post('/api/lms/imports/', data=json.dumps(body or payload()),
                             content_type='application/json', **auth)

    def staged(self):
        r = self.stage()
        self.assertEqual(r.status_code, 201, r.content)
        return LmsImport.objects.get(pk=r.json()['id'])

    def upload_outline(self, imp, course='655275', parsed=PARSED_CP363, name='outline.docx',
                       content=b'PK\x03\x04rest', **auth):
        f = SimpleUploadedFile(name, content, content_type=(
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            if name.endswith('.docx') else 'application/pdf'))
        with mock.patch('main.lms.process_course_outline', return_value={'courses': parsed}) as m:
            r = self.api.post(f'/api/lms/imports/{imp.pk}/outline/', data={'course': course, 'file': f},
                              **(auth or self.bearer()))
        return r, m


class StagingAuthTests(LmsTestCase):
    def test_oauth_token_with_scope_stages_import(self):
        r = self.stage()
        self.assertEqual(r.status_code, 201)
        self.assertIn('/Add?lms_import=', r.json()['review_url'])
        imp = LmsImport.objects.get()
        self.assertEqual(imp.user, self.user)
        self.assertEqual(imp.client, self.client_row)

    def test_token_without_scope_is_rejected(self):
        r = self.stage(**self.bearer(scopes=('schedule:read', 'schedule:write')))
        self.assertEqual(r.status_code, 401)

    def test_pat_is_rejected_even_with_scope(self):
        raw = mint_raw_token()
        AgentAccessToken.objects.create(user=self.user, token_hash=hash_token(raw), scopes=['courses:import'])
        r = self.stage(HTTP_AUTHORIZATION=f'Bearer {raw}')
        self.assertEqual(r.status_code, 401)

    def test_session_jwt_is_rejected(self):
        self.api.force_authenticate(self.user)
        r = self.api.post('/api/lms/imports/', data=json.dumps(payload()), content_type='application/json')
        self.assertEqual(r.status_code, 401)

    def test_bad_payload_is_400(self):
        r = self.stage(payload(host='not a host'))
        self.assertEqual(r.status_code, 400)

    def test_staging_writes_nothing_to_the_timetable(self):
        self.stage()
        self.assertFalse(Course.objects.exists())


class OutlineUploadTests(LmsTestCase):
    def test_docx_outline_is_parsed_and_stored(self):
        imp = self.staged()
        r, parser = self.upload_outline(imp)
        self.assertEqual(r.status_code, 200, r.content)
        parser.assert_called_once()
        self.assertTrue(parser.call_args[0][0].endswith('.docx'))
        imp.refresh_from_db()
        self.assertEqual(imp.outlines['655275'][0]['course_id'], 'CP363')
        self.assertEqual(imp.outline_parses, 1)

    def test_pdf_with_wrong_magic_is_rejected_before_parsing(self):
        imp = self.staged()
        r, parser = self.upload_outline(imp, name='o.pdf', content=b'not a pdf')
        self.assertEqual(r.status_code, 400)
        parser.assert_not_called()

    def test_course_not_in_import_is_rejected(self):
        imp = self.staged()
        r, parser = self.upload_outline(imp, course='999')
        self.assertEqual(r.status_code, 400)
        parser.assert_not_called()

    def test_other_users_token_cannot_touch_import(self):
        imp = self.staged()
        r, parser = self.upload_outline(imp, **self.bearer(user=self.other))
        self.assertEqual(r.status_code, 404)
        parser.assert_not_called()

    def test_daily_parse_cap(self):
        imp = self.staged()
        imp.outline_parses = lms.OUTLINE_PARSES_PER_DAY
        imp.save()
        r, parser = self.upload_outline(self.staged())
        self.assertEqual(r.status_code, 429)
        parser.assert_not_called()


class ReviewTests(LmsTestCase):
    def review(self, imp, user=None):
        self.api.force_authenticate(user or self.user)
        return self.api.get(f'/api/lms/imports/{imp.pk}/')

    def test_lms_dates_win_and_outline_details_survive(self):
        imp = self.staged()
        self.upload_outline(imp)
        courses = self.review(imp).json()['courses']
        cp = [c for c in courses if c['lms_course'] == '655275'][0]
        a1 = [a for a in cp['assignments'] if a['assignment_topic'] == 'Assignment 1']
        self.assertEqual(len(a1), 1, 'outline + LMS "Assignment 1" must merge, not duplicate')
        self.assertEqual(a1[0]['assignment_due'], '2026-09-27')  # LMS, not the outline's 09-30
        self.assertEqual(a1[0]['assignment_detail'], 'ER modelling')
        self.assertEqual(a1[0]['lms_external_id'], f'd2l:{HOST}:dropbox:101')
        # Undated LMS item stays TBA, and the outline's own undated item too.
        temp = [a for a in cp['assignments'] if a['assignment_topic'] == 'temp'][0]
        self.assertNotIn('assignment_due', temp)
        self.assertEqual(cp['classroom'], 'BA201')
        self.assertTrue(cp['lms_has_outline'])

    def test_course_without_outline_gets_lms_skeleton(self):
        imp = self.staged()
        lab = [c for c in self.review(imp).json()['courses'] if c['lms_course'] == '656922'][0]
        self.assertEqual(lab['course_id'], 'MA123')
        self.assertTrue(lab['is_lab'])
        self.assertEqual(lab['start_date'], '2026-09-08')
        self.assertIsNone(lab['rep_date'])  # unknown; the student fills it in
        self.assertFalse(lab['lms_has_outline'])

    def test_other_user_gets_404(self):
        imp = self.staged()
        self.assertEqual(self.review(imp, user=self.other).status_code, 404)

    def test_expired_import_is_gone(self):
        imp = self.staged()
        LmsImport.objects.filter(pk=imp.pk).update(created_at=timezone.now() - timedelta(hours=25))
        self.assertEqual(self.review(imp).status_code, 410)


class ApplyTests(LmsTestCase):
    def reviewed(self, imp):
        self.api.force_authenticate(self.user)
        courses = self.api.get(f'/api/lms/imports/{imp.pk}/').json()['courses']
        for c in courses:  # what the student fills in on the review page
            c.setdefault('rep_date', None)
            if not c.get('rep_date'):
                c.update(rep_date='Friday', start_time='14:30', end_time='16:20', classroom='N1002')
        return courses

    def apply(self, imp, courses):
        self.api.force_authenticate(self.user)
        return self.api.post(f'/api/lms/imports/{imp.pk}/apply/', data={'courses': courses}, format='json')

    def test_each_lms_course_becomes_its_own_course(self):
        imp = self.staged()
        self.upload_outline(imp)
        r = self.apply(imp, self.reviewed(imp))
        self.assertEqual(r.status_code, 201, r.content)
        roots = Course.objects.filter(user=self.user, parent_course__isnull=True)
        self.assertEqual(roots.count(), 2, 'second LMS course must not become a section of the first')
        self.assertEqual(set(roots.values_list('lms_external_id', flat=True)),
                         {f'd2l:{HOST}:655275', f'd2l:{HOST}:656922'})
        a1 = Assignment.objects.get(assignment_topic='Assignment 1')
        self.assertEqual(a1.assignment_due.date().isoformat(), '2026-09-27')
        self.assertEqual(a1.lms_external_id, f'd2l:{HOST}:dropbox:101')
        self.assertIsNone(Exam.objects.get(exam_topic='Final Exam').exam_date)  # TBA, not a guess

    def test_resync_updates_dates_without_duplicating(self):
        imp = self.staged()
        self.upload_outline(imp)
        self.apply(imp, self.reviewed(imp))
        before = Assignment.objects.count()
        Assignment.objects.filter(assignment_topic='Assignment 1').update(is_completed=True)

        moved = payload()
        moved['courses'][0]['items'][0]['date'] = '2026-10-02'   # instructor extended A1
        moved['courses'][0]['items'].append(
            {'kind': 'dropbox', 'id': '103', 'title': 'Assignment 2', 'date': '2026-10-05'})
        imp2 = LmsImport.objects.get(pk=self.stage(moved).json()['id'])
        self.upload_outline(imp2)   # outline re-parsed: its own items must not duplicate
        r = self.apply(imp2, self.reviewed(imp2))
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.json()['synced_items'], {'created': 1, 'updated': 1})
        self.assertEqual(Course.objects.filter(parent_course__isnull=True).count(), 2)
        self.assertEqual(Assignment.objects.count(), before + 1)
        a1 = Assignment.objects.get(assignment_topic='Assignment 1')
        self.assertEqual(a1.assignment_due.date().isoformat(), '2026-10-02')
        self.assertTrue(a1.is_completed, 'resync must not reset completion')

    def test_course_not_in_import_is_rejected(self):
        imp = self.staged()
        courses = self.reviewed(imp)
        courses[0]['lms_course'] = '999'
        self.assertEqual(self.apply(imp, courses).status_code, 400)
        self.assertFalse(Course.objects.exists())

    def test_page_cannot_forge_lms_ids_onto_sections(self):
        imp = self.staged()
        self.upload_outline(imp, parsed=PARSED_CP363 + [dict(PARSED_CP363[0], is_main=False, is_lab=True,
                                                             course_id='CP363L', rep_date='Monday',
                                                             start_time='08:30', end_time='09:20')])
        courses = self.reviewed(imp)
        for c in courses:
            c['lms_external_id'] = 'd2l:evil:1'
        self.assertEqual(self.apply(imp, courses).status_code, 201)
        self.assertFalse(Course.objects.filter(lms_external_id='d2l:evil:1').exists())
        self.assertEqual(Course.objects.get(course_id='CP363L').lms_external_id, '')

    def test_overlap_with_existing_course_is_refused_with_add_page_shape(self):
        Course.objects.create(user=self.user, course_id='BU111', course_name='x', start_date='2026-09-01',
                              end_date='2026-12-01', start_time='10:30', end_time='11:30',
                              rep_date='Tuesday', classroom='a')
        imp = self.staged()
        self.upload_outline(imp)
        r = self.apply(imp, self.reviewed(imp))
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.json()['error'], 'overlap')
        self.assertEqual(Course.objects.count(), 1)

    def test_finalize_ignores_lms_ids(self):
        self.api.force_authenticate(self.user)
        r = self.api.post('/api/courses/finalize/', data={'courses': [dict(
            PARSED_CP363[0], lms_external_id='d2l:x:1',
            assignments=[{'assignment_topic': 'A', 'assignment_due': '2026-10-01', 'lms_external_id': 'd2l:x:2'}],
        )]}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(Course.objects.get().lms_external_id, '')
        self.assertEqual(Assignment.objects.get().lms_external_id, '')


class OutlineFailureTests(LmsTestCase):
    def test_failed_parse_is_reported_as_failed_not_missing(self):
        imp = self.staged()
        f = SimpleUploadedFile('o.pdf', b'%PDF-1.7 x', content_type='application/pdf')
        with mock.patch('main.lms.process_course_outline', side_effect=ValueError('parser ran out of room')):
            r = self.api.post(f'/api/lms/imports/{imp.pk}/outline/', data={'course': '655275', 'file': f},
                              **self.bearer())
        self.assertEqual(r.status_code, 502)
        self.api.force_authenticate(self.user)
        courses = self.api.get(f'/api/lms/imports/{imp.pk}/').json()['courses']
        status = {c['lms_course']: c['lms_outline'] for c in courses}
        self.assertEqual(status, {'655275': 'failed', '656922': 'none'})
        imp.refresh_from_db()
        self.assertEqual(imp.outline_parses, 1, 'a failed LLM call still counts against the cap')


EXT_ID = 'njecnhcjoddeoefjmbpmilgcakafagjg'
EXT_REDIRECT = f'https://{EXT_ID}.chromiumapp.org/'


class FirstPartyConsentTests(TestCase):
    def setUp(self):
        from django.test import Client
        self.user = User.objects.create_user(username='chin', email='c@example.com', password='pw-123456789',
                                             grad_year=2028)
        self.ext = OAuthClient.objects.create(client_id='ext', name='anything it likes',
                                              redirect_uris=[EXT_REDIRECT])
        self.other = OAuthClient.objects.create(client_id='evil', name='Timetify Official',
                                                redirect_uris=['https://evil.example/cb'])
        self.web = Client()
        self.web.force_login(self.user)

    def authorize(self, client, redirect):
        return self.web.get('/oauth/authorize', {
            'response_type': 'code', 'client_id': client.client_id, 'redirect_uri': redirect,
            'code_challenge': 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM', 'code_challenge_method': 'S256',
            'scope': 'courses:import', 'state': 's',
        })

    def test_listed_extension_gets_friendly_screen(self):
        with self.settings(LMS_EXTENSION_IDS=[EXT_ID]):
            r = self.authorize(self.ext, EXT_REDIRECT)
        self.assertEqual(r.status_code, 200)
        self.assertContains(r, 'connect ur lms to timetify?')
        self.assertNotContains(r, 'not verified by timetify')
        self.assertNotContains(r, 'anything it likes')  # self-chosen name isn't shown

    def test_unlisted_extension_and_other_clients_keep_the_warning(self):
        with self.settings(LMS_EXTENSION_IDS=[]):
            self.assertContains(self.authorize(self.ext, EXT_REDIRECT), 'not verified by timetify')
        with self.settings(LMS_EXTENSION_IDS=[EXT_ID]):
            self.assertContains(self.authorize(self.other, 'https://evil.example/cb'), 'not verified by timetify')

    def test_reconnect_with_live_grant_skips_consent(self):
        oauth._issue_tokens(self.user, self.ext, ['courses:import'], '')
        with self.settings(LMS_EXTENSION_IDS=[EXT_ID]):
            r = self.authorize(self.ext, EXT_REDIRECT)
        self.assertEqual(r.status_code, 302)
        self.assertTrue(r['Location'].startswith(EXT_REDIRECT + '?code='))

    def test_revoked_grant_asks_again(self):
        oauth._issue_tokens(self.user, self.ext, ['courses:import'], '')
        from main.models import OAuthAccessToken
        OAuthAccessToken.objects.update(revoked_at=timezone.now())
        with self.settings(LMS_EXTENSION_IDS=[EXT_ID]):
            self.assertEqual(self.authorize(self.ext, EXT_REDIRECT).status_code, 200)

    def test_third_party_with_grant_still_sees_consent(self):
        oauth._issue_tokens(self.user, self.other, ['courses:import'], '')
        with self.settings(LMS_EXTENSION_IDS=[EXT_ID]):
            self.assertEqual(self.authorize(self.other, 'https://evil.example/cb').status_code, 200)


class SpurEmptyAnswerTests(SimpleTestCase):
    """Spur's GLM ignores reasoning_effort="none" and can spend the whole
    budget thinking, returning empty content. That must surface as a clear
    error, and the request must ask for "low"."""

    def run_spur(self, body):
        import io
        from main import pdf
        captured = {}

        class Resp(io.BytesIO):
            def __enter__(self): return self
            def __exit__(self, *a): return False

        def fake_urlopen(req, timeout=None):
            captured['payload'] = json.loads(req.data)
            return Resp(json.dumps(body).encode())

        with mock.patch.dict('os.environ', {'SPUR_API_KEY': 'k'}, clear=False), \
                mock.patch('main.pdf.urlopen', fake_urlopen), \
                mock.patch('main.pdf.extract_text', return_value='CP363 syllabus'):
            try:
                return pdf._process_with_spur('prompt', '/tmp/x.pdf'), captured
            except ValueError as exc:
                return exc, captured

    def test_length_cutoff_with_empty_content_is_a_clear_error(self):
        out, captured = self.run_spur({'choices': [{'finish_reason': 'length', 'message': {'content': ''}}],
                                       'usage': {'completion_tokens': 6000}})
        self.assertIsInstance(out, ValueError)
        self.assertIn('ran out of room', str(out))
        self.assertEqual(captured['payload']['reasoning_effort'], 'low')
        self.assertGreaterEqual(captured['payload']['max_tokens'], 12000)


class LmsContextTests(LmsTestCase):
    def test_outline_parse_is_given_the_courses_lms_dates(self):
        imp = self.staged()
        r, parser = self.upload_outline(imp)
        self.assertEqual(r.status_code, 200)
        ctx = parser.call_args.kwargs['lms_context']
        self.assertEqual((ctx['term_start'], ctx['term_end']), ('2026-09-10', '2026-12-09'))
        self.assertIn('Assignment 1', [i['title'] for i in ctx['items']])

    def test_prompt_section_keeps_week_dates_out_of_real_fields(self):
        from main.pdf import _lms_section
        text = _lms_section({'term_start': '2026-09-10', 'term_end': '2026-12-09',
                             'items': [{'kind': 'quiz', 'title': 'Quiz 1', 'date': '2026-09-18'},
                                       {'kind': 'dropbox', 'title': 'temp', 'date': None}]})
        self.assertIn('2026-09-18 · quiz · Quiz 1', text)
        self.assertIn('no date · dropbox · temp', text)
        self.assertIn('suggested_date', text)
        self.assertIn('do NOT output the repeating item', text)

    def test_weekly_outline_item_dropped_when_lms_lists_instances(self):
        quizzes = [{'kind': 'quiz', 'id': str(i), 'title': f'Quiz {i}- Requires Respondus LockDown Browser',
                    'date': f'2026-10-0{i}'} for i in range(1, 4)]
        body = payload()
        body['courses'][0]['items'] = quizzes
        imp = LmsImport.objects.get(pk=self.stage(body).json()['id'])
        parsed = [dict(PARSED_CP363[0], assignments=[
            {'assignment_topic': 'Weekly quizzes', 'recurrence': 'weekly', 'recurrence_weekday': 'Friday'},
            {'assignment_topic': 'Weekly reflection', 'recurrence': 'weekly', 'recurrence_weekday': 'Sunday'},
        ])]
        self.upload_outline(imp, parsed=parsed)
        self.api.force_authenticate(self.user)
        cp = [c for c in self.api.get(f'/api/lms/imports/{imp.pk}/').json()['courses'] if c['lms_course'] == '655275'][0]
        by_topic = {a['assignment_topic']: a for a in cp['assignments']}
        weekly = by_topic['Weekly quizzes']
        self.assertTrue(weekly.get('lms_skip'), 'LMS lists the quizzes; the weekly expansion would double them')
        self.assertIn('MyLS lists each quiz', weekly['lms_note'])
        self.assertFalse(by_topic['Weekly reflection'].get('lms_skip'), 'nothing in the LMS covers this one')
        self.assertEqual(sum(t.startswith('Quiz') for t in by_topic), 3)

    def test_content_and_calendar_items_are_staged(self):
        body = payload()
        body['courses'][1]['items'] = [{'kind': 'content', 'id': '4638248', 'title': 'Labs 2, 5 and 7 (12:30pm)',
                                        'date': '2026-11-16'}]
        imp = LmsImport.objects.get(pk=self.stage(body).json()['id'])
        self.api.force_authenticate(self.user)
        lab = [c for c in self.api.get(f'/api/lms/imports/{imp.pk}/').json()['courses'] if c['lms_course'] == '656922'][0]
        item = lab['assignments'][0]
        self.assertEqual((item['assignment_topic'], item['assignment_due']), ('Labs 2, 5 and 7 (12:30pm)', '2026-11-16'))
        self.assertEqual(item['lms_external_id'], f'd2l:{HOST}:content:4638248')



def reconcile_answer(**body):
    return mock.patch('main.lms_reconcile._call_model', return_value=json.dumps(body))


class ReconcileTests(LmsTestCase):
    """The second AI pass: D2L wins, the agent decides only the leftovers, and
    its answer is checked before anything changes."""

    OUTLINE = [dict(PARSED_CP363[0], exams=[
        {'exam_topic': 'Midterm', 'exam_date': '2026-10-21'},
        {'exam_topic': 'Final Exam', 'exam_date': None},
    ], assignments=[
        {'assignment_topic': 'Assignment 1', 'assignment_due': '2026-09-30', 'assignment_detail': 'ER modelling'},
        {'assignment_topic': 'Chapter quizzes', 'assignment_due': None},
        {'assignment_topic': 'Participation', 'assignment_due': None},
    ])]

    def setUp(self):
        super().setUp()
        body = payload()
        body['courses'][0]['items'] = [
            {'kind': 'dropbox', 'id': '101', 'title': 'Assignment 1', 'date': '2026-09-27'},
            {'kind': 'quiz', 'id': '301', 'title': 'Midterm Test - LockDown Browser', 'date': '2026-10-22'},
            {'kind': 'quiz', 'id': '401', 'title': 'Chapter 1', 'date': '2026-10-01'},
            {'kind': 'quiz', 'id': '402', 'title': 'Chapter 2', 'date': '2026-10-08'},
            {'kind': 'dropbox', 'id': '999', 'title': 'temp', 'date': None},
        ]
        self.imp = LmsImport.objects.get(pk=self.stage(body).json()['id'])
        self.upload_outline(self.imp, parsed=self.OUTLINE)

    def check(self, **answer):
        with self.settings(), mock.patch.dict('os.environ', {'COURSE_PARSER_PROVIDER': 'spur'}), \
                reconcile_answer(**answer) as model:
            r = self.api.post(f'/api/lms/imports/{self.imp.pk}/reconcile/', data={'course': '655275'},
                              **self.bearer())
        return r, model

    def review(self):
        self.api.force_authenticate(self.user)
        courses = self.api.get(f'/api/lms/imports/{self.imp.pk}/').json()['courses']
        self.api.force_authenticate(None)
        return [c for c in courses if c['lms_course'] == '655275'][0]

    def refs(self):
        from main.lms import course_group
        lc = self.imp.payload['courses'][0]
        _, _, leftovers, _, _ = course_group(LmsImport.objects.get(pk=self.imp.pk), lc)
        return {x.get('exam_topic') or x.get('assignment_topic'): ref for ref, _, x in leftovers}

    def test_exact_matches_need_no_agent_and_d2l_date_wins_with_a_note(self):
        cp = self.review()
        a1 = [a for a in cp['assignments'] if a['assignment_topic'] == 'Assignment 1'][0]
        self.assertEqual(a1['lms_source'], 'both')
        self.assertEqual(a1['assignment_due'], '2026-09-27')
        self.assertIn('outline said 2026-09-30', a1['lms_note'])
        self.assertEqual(a1['lms_url'], f'https://{HOST}/d2l/lms/dropbox/user/folder_submit_files.d2l?db=101&ou=655275')
        self.assertEqual(cp['lms_check'], '')
        self.assertNotIn('Assignment 1', self.refs(), 'already matched, so not sent to the agent')

    def test_agent_merges_drops_keeps_and_flags_placeholders(self):
        refs = self.refs()
        r, model = self.check(outline=[
            {'ref': refs['Midterm'], 'action': 'merge', 'd2l_id': 'quiz:301', 'reason': 'same midterm'},
            {'ref': refs['Chapter quizzes'], 'action': 'drop', 'superseded_by': ['quiz:401', 'quiz:402'],
             'reason': 'myls lists each chapter quiz'},
            {'ref': refs['Final Exam'], 'action': 'keep', 'reason': 'final isn\'t on myls yet'},
            {'ref': refs['Participation'], 'action': 'keep'},
        ], placeholders=[{'d2l_id': 'dropbox:999', 'reason': 'test folder, no date'}])
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json(), {'status': 'ok', 'merged': 1, 'dropped': 1, 'kept': 2, 'placeholders': 1})
        prompt = model.call_args[0][0]
        self.assertIn('quiz:301', prompt)
        self.assertNotIn('ER modelling', prompt, 'matched items are not re-decided')

        cp = self.review()
        self.assertEqual(cp['lms_check'], 'ok')
        mids = [e for e in cp['exams'] if 'Midterm' in e['exam_topic']]
        self.assertEqual(len(mids), 1, 'merged, not duplicated')
        self.assertEqual((mids[0]['exam_date'], mids[0]['lms_source']), ('2026-10-22', 'both'))
        self.assertIn('outline said 2026-10-21', mids[0]['lms_note'])
        self.assertFalse([a for a in cp['assignments'] if 'Midterm' in a['assignment_topic']],
                         'the D2L quiz moved to exams, where the outline put it')
        topics = {a['assignment_topic']: a for a in cp['assignments']}
        self.assertTrue(topics['Chapter quizzes']['lms_skip'])
        self.assertTrue(topics['temp']['lms_skip'])
        self.assertFalse(topics['Chapter 1'].get('lms_skip'))
        final = [e for e in cp['exams'] if e['exam_topic'] == 'Final Exam'][0]
        self.assertFalse(final.get('lms_skip'))

    def test_guardrails(self):
        refs = self.refs()
        self.check(outline=[
            {'ref': refs['Final Exam'], 'action': 'drop', 'superseded_by': [], 'reason': 'no reason'},  # no basis
            {'ref': refs['Participation'], 'action': 'merge', 'd2l_id': 'quiz:nope'},                  # unknown target
            {'ref': 'o99', 'action': 'drop', 'superseded_by': ['quiz:401']},                           # unknown ref
        ], placeholders=[{'d2l_id': 'dropbox:101', 'reason': 'x'}])                                   # matched → not placeholder
        cp = self.review()
        topics = {x.get('exam_topic') or x.get('assignment_topic'): x for x in cp['exams'] + cp['assignments']}
        self.assertFalse(topics['Final Exam'].get('lms_skip'), 'a drop that names nothing is a guess')
        self.assertFalse(topics['Participation'].get('lms_skip'))
        self.assertFalse(topics['Assignment 1'].get('lms_skip'), 'an outline-matched D2L item is never a placeholder')

    def test_failed_agent_leaves_deterministic_merge(self):
        with mock.patch.dict('os.environ', {'COURSE_PARSER_PROVIDER': 'spur'}), \
                mock.patch('main.lms_reconcile._call_model', side_effect=ValueError('empty')):
            r = self.api.post(f'/api/lms/imports/{self.imp.pk}/reconcile/', data={'course': '655275'},
                              **self.bearer())
        self.assertEqual(r.json()['status'], 'failed')
        cp = self.review()
        self.assertEqual(cp['lms_check'], 'failed')
        self.assertEqual(len([e for e in cp['exams'] if 'Midterm' in e['exam_topic']]), 1)

    def test_reuploading_outline_clears_stale_decisions(self):
        self.check(outline=[], placeholders=[{'d2l_id': 'dropbox:999', 'reason': 'x'}])
        self.assertIn('655275', LmsImport.objects.get(pk=self.imp.pk).reconciled)
        self.upload_outline(self.imp, parsed=self.OUTLINE)
        self.assertNotIn('655275', LmsImport.objects.get(pk=self.imp.pk).reconciled)

    def test_apply_skips_unticked_and_rebuilds_links_server_side(self):
        refs = self.refs()
        self.check(outline=[{'ref': refs['Chapter quizzes'], 'action': 'drop', 'superseded_by': ['quiz:401']}],
                   placeholders=[{'d2l_id': 'dropbox:999', 'reason': 'test folder'}])
        cp = self.review()
        for c in [cp]:
            c.update(rep_date='Tuesday', start_time='10:00', end_time='11:20', classroom='BA201')
            for a in c['assignments']:
                a['lms_url'] = 'javascript:alert(1)'   # a tampered page
        self.api.force_authenticate(self.user)
        r = self.api.post(f'/api/lms/imports/{self.imp.pk}/apply/', data={'courses': [cp]}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        saved = set(Assignment.objects.values_list('assignment_topic', flat=True))
        self.assertNotIn('temp', saved)
        self.assertNotIn('Chapter quizzes', saved)
        self.assertIn('Chapter 1', saved)
        ch1 = Assignment.objects.get(assignment_topic='Chapter 1')
        self.assertEqual(ch1.lms_url, f'https://{HOST}/d2l/lms/quizzing/user/quiz_summary.d2l?qi=401&ou=655275')
        self.assertEqual(Assignment.objects.get(assignment_topic='Participation').lms_url, '')

    def test_lms_link_is_read_only_through_the_api(self):
        self.api.force_authenticate(self.user)
        course = Course.objects.create(user=self.user, course_id='X1', course_name='x', start_date='2026-09-01',
                                       end_date='2026-12-01', start_time='09:00', end_time='10:00',
                                       rep_date='Monday', classroom='a')
        a = Assignment.objects.create(user=self.user, course=course, assignment_topic='t',
                                      lms_url='https://ok.example/x')
        self.api.patch(f'/api/assignments/{a.pk}/', data={'lms_url': 'javascript:alert(1)'}, format='json')
        a.refresh_from_db()
        self.assertEqual(a.lms_url, 'https://ok.example/x')
