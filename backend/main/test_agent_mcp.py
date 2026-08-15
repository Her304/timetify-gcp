"""Tests for the AI-agent bridge (MCP server).

Weighted towards the security invariants rather than happy paths: scope
enforcement, cross-user isolation, credential separation from the session API,
and the two-step confirmation on writes. Those are the properties a refactor
could quietly break.

Run: python manage.py test main.test_agent_mcp
"""

import json
from datetime import date, time, timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone

from .models import (AgentAccessToken, AgentPendingWrite, Course, CourseSkip, Event,
                     Friend, UserBlock)
from .mcp import auth as agent_auth
from .mcp import scopes as scope_defs

User = get_user_model()

MCP_URL = '/mcp/v1/'
ALL_READ = [scope_defs.SCHEDULE_READ, scope_defs.AVAILABILITY_READ,
            scope_defs.UNREAD_READ, scope_defs.FRIENDS_READ]


def make_user(username, **kwargs):
    return User.objects.create_user(
        username=username,
        email=f'{username}@example.com',
        password='pw-for-tests-only',
        university=kwargs.pop('university', 'Test U'),
        major=kwargs.pop('major', 'CS'),
        grad_year=kwargs.pop('grad_year', 2027),
        **kwargs,
    )


def make_token(user, scopes):
    raw = agent_auth.mint_raw_token()
    row = AgentAccessToken.objects.create(
        user=user, name='test', token_hash=agent_auth.hash_token(raw), scopes=scopes,
    )
    return raw, row


# Every weekday, so "does this course run today?" is true whichever day the
# suite happens to run — a Mon-Fri fixture silently passes all week and fails
# every Saturday.
ALL_DAYS = 'MON,TUE,WED,THU,FRI,SAT,SUN'


def make_course(user, course_id='CHEM101', rep=ALL_DAYS,
                start=time(10, 0), end=time(11, 0)):
    return Course.objects.create(
        user=user, course_id=course_id, course_name=f'{course_id} Lecture',
        start_date=date.today() - timedelta(days=30),
        end_date=date.today() + timedelta(days=30),
        start_time=start, end_time=end, rep_date=rep, classroom='Room 1',
    )


class McpTestCase(TestCase):
    def rpc(self, raw_token, method, params=None, req_id=1):
        body = {'jsonrpc': '2.0', 'id': req_id, 'method': method}
        if params is not None:
            body['params'] = params
        return self.client.post(
            MCP_URL, data=json.dumps(body), content_type='application/json',
            HTTP_AUTHORIZATION=f'Bearer {raw_token}',
        )

    def call_tool(self, raw_token, name, arguments=None):
        resp = self.rpc(raw_token, 'tools/call',
                        {'name': name, 'arguments': arguments or {}})
        self.assertEqual(resp.status_code, 200, resp.content)
        return resp.json()['result']

    def call_tool_rpc(self, raw_token, name, arguments=None):
        """Full JSON-RPC envelope. A tool that doesn't exist (or isn't in scope)
        is a protocol error and comes back as `error`; a tool that ran and
        failed comes back as a `result` with isError set."""
        resp = self.rpc(raw_token, 'tools/call',
                        {'name': name, 'arguments': arguments or {}})
        self.assertEqual(resp.status_code, 200, resp.content)
        return resp.json()


class AuthTests(McpTestCase):
    def setUp(self):
        self.user = make_user('alice')
        self.raw, self.row = make_token(self.user, ALL_READ)

    def test_valid_token_can_list_tools(self):
        resp = self.rpc(self.raw, 'tools/list')
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.json()['result']['tools'])

    def test_missing_and_malformed_auth_rejected(self):
        self.assertEqual(self.client.post(MCP_URL, data='{}', content_type='application/json').status_code, 401)
        self.assertEqual(self.rpc('not-a-real-token', 'tools/list').status_code, 401)

    def test_revocation_takes_effect_immediately(self):
        self.assertEqual(self.rpc(self.raw, 'ping').status_code, 200)
        self.row.revoked_at = timezone.now()
        self.row.save(update_fields=['revoked_at'])
        # No cache layer to go stale — the next request must already fail.
        self.assertEqual(self.rpc(self.raw, 'ping').status_code, 401)

    def test_inactive_user_token_rejected(self):
        self.user.is_active = False
        self.user.save(update_fields=['is_active'])
        self.assertEqual(self.rpc(self.raw, 'ping').status_code, 401)

    def test_raw_token_is_not_stored(self):
        self.assertNotIn(self.raw, self.row.token_hash)
        self.assertEqual(self.row.token_hash, agent_auth.hash_token(self.raw))

    def test_get_returns_405_no_event_stream(self):
        resp = self.client.get(MCP_URL, HTTP_AUTHORIZATION=f'Bearer {self.raw}')
        self.assertEqual(resp.status_code, 405)

    def test_slashless_url_also_routes(self):
        resp = self.client.post(
            '/mcp/v1', data=json.dumps({'jsonrpc': '2.0', 'id': 1, 'method': 'ping'}),
            content_type='application/json', HTTP_AUTHORIZATION=f'Bearer {self.raw}')
        self.assertEqual(resp.status_code, 200)


class CredentialIsolationTests(McpTestCase):
    """The whole design rests on agent tokens and session JWTs being separate
    credential systems. Both directions are asserted."""

    def setUp(self):
        self.user = make_user('alice')
        self.raw, _ = make_token(self.user, ALL_READ)

    def test_agent_token_cannot_reach_the_session_api(self):
        resp = self.client.get('/api/user/', HTTP_AUTHORIZATION=f'Bearer {self.raw}')
        self.assertEqual(resp.status_code, 401)

    def test_session_jwt_cannot_reach_the_mcp_endpoint(self):
        from rest_framework_simplejwt.tokens import RefreshToken
        jwt = str(RefreshToken.for_user(self.user).access_token)
        self.assertEqual(self.rpc(jwt, 'ping').status_code, 401)


class ScopeTests(McpTestCase):
    def setUp(self):
        self.user = make_user('alice')
        make_course(self.user)

    def test_tools_list_is_filtered_to_granted_scopes(self):
        raw, _ = make_token(self.user, [scope_defs.SCHEDULE_READ])
        names = {t['name'] for t in self.rpc(raw, 'tools/list').json()['result']['tools']}
        self.assertEqual(names, {'get_today_schedule'})

    def test_out_of_scope_tool_call_is_refused(self):
        raw, _ = make_token(self.user, [scope_defs.SCHEDULE_READ])
        self.assertIn('error', self.call_tool_rpc(raw, 'get_unread_count'))

    def test_out_of_scope_tool_is_indistinguishable_from_a_missing_one(self):
        """Knowing which tools exist beyond a token's grant isn't useful to a
        caller, so both cases answer identically."""
        raw, _ = make_token(self.user, [scope_defs.SCHEDULE_READ])
        out_of_scope = self.call_tool_rpc(raw, 'get_unread_count')['error']
        nonexistent = self.call_tool_rpc(raw, 'no_such_tool_at_all')['error']
        self.assertEqual(out_of_scope['code'], nonexistent['code'])

    def test_unknown_scope_grants_nothing(self):
        # A tampered or migrated-wrong scopes list must fail closed, never open.
        raw, _ = make_token(self.user, ['*', 'messages:read', 'admin'])
        self.assertEqual(self.rpc(raw, 'tools/list').json()['result']['tools'], [])
        self.assertIn('error', self.call_tool_rpc(raw, 'get_today_schedule'))

    def test_write_scope_does_not_come_with_read_scope(self):
        raw, _ = make_token(self.user, [scope_defs.SCHEDULE_WRITE])
        names = {t['name'] for t in self.rpc(raw, 'tools/list').json()['result']['tools']}
        self.assertEqual(names, {'create_class'})


class ReadToolTests(McpTestCase):
    def setUp(self):
        self.user = make_user('alice')
        self.other = make_user('mallory')
        self.raw, _ = make_token(self.user, ALL_READ)

    def test_schedule_returns_only_my_courses(self):
        make_course(self.user, 'MINE')
        make_course(self.other, 'THEIRS')
        payload = self.call_tool(self.raw, 'get_today_schedule')['structuredContent']
        self.assertEqual([c['course_id'] for c in payload['classes']], ['MINE'])

    def test_schedule_excludes_skipped_occurrences(self):
        course = make_course(self.user, 'SKIPME')
        event = Event.objects.create(
            creator=self.user, name='clash', date=date.today(),
            start_time=time(10, 0), end_time=time(11, 0),
        )
        CourseSkip.objects.create(user=self.user, course=course, date=date.today(), event=event)
        payload = self.call_tool(self.raw, 'get_today_schedule')['structuredContent']
        self.assertEqual(payload['classes'], [])

    def test_free_busy_never_returns_event_titles(self):
        make_course(self.user)
        payload = self.call_tool(self.raw, 'get_free_busy')['structuredContent']
        self.assertIn('free_slots', payload)
        self.assertNotIn('title', json.dumps(payload))

    def test_bad_timezone_is_a_tool_error_not_a_crash(self):
        result = self.call_tool(self.raw, 'get_today_schedule', {'timezone': 'Mars/Olympus'})
        self.assertTrue(result.get('isError'))


class FriendToolTests(McpTestCase):
    def setUp(self):
        self.me = make_user('alice')
        self.friend = make_user('bob')
        self.stranger = make_user('carol')
        Friend.objects.create(user=self.me, friend=self.friend, status=Friend.ACCEPTED)
        self.raw, _ = make_token(self.me, ALL_READ)

    def test_matches_accepted_friends(self):
        payload = self.call_tool(self.raw, 'get_shared_free_slots',
                                 {'usernames': ['bob'], 'days_ahead': 1})['structuredContent']
        self.assertEqual(payload['matched_usernames'], ['bob'])

    def test_non_friend_and_unknown_username_are_indistinguishable(self):
        """Otherwise the tool is a username-existence oracle and a
        friendship-status probe for anyone holding a token."""
        real = self.call_tool(self.raw, 'get_shared_free_slots',
                              {'usernames': ['carol'], 'days_ahead': 1})['structuredContent']
        fake = self.call_tool(self.raw, 'get_shared_free_slots',
                              {'usernames': ['nobody-by-this-name'], 'days_ahead': 1})['structuredContent']
        self.assertEqual(real['matched_usernames'], [])
        self.assertEqual(real, fake)

    def test_blocked_friend_is_excluded(self):
        UserBlock.objects.create(blocker=self.me, blocked=self.friend)
        payload = self.call_tool(self.raw, 'get_shared_free_slots',
                                 {'usernames': ['bob'], 'days_ahead': 1})['structuredContent']
        self.assertEqual(payload['matched_usernames'], [])

    def test_days_ahead_is_capped(self):
        payload = self.call_tool(self.raw, 'get_shared_free_slots',
                                 {'usernames': [], 'days_ahead': 999})['structuredContent']
        days = {s['date'] for s in payload['shared_free_slots']}
        self.assertLessEqual(len(days), 14)


class RateLimitTests(McpTestCase):
    def setUp(self):
        self.user = make_user('alice')
        self.raw, self.row = make_token(self.user, ALL_READ)

    def test_read_limit_trips(self):
        self.row.window_started_at = timezone.now()
        self.row.window_count = agent_auth.READ_LIMIT_PER_MINUTE
        self.row.save(update_fields=['window_started_at', 'window_count'])
        result = self.call_tool(self.raw, 'get_today_schedule')
        self.assertTrue(result.get('isError'))
        self.assertIn('Rate limit', result['content'][0]['text'])

    def test_window_resets_after_a_minute(self):
        self.row.window_started_at = timezone.now() - timedelta(seconds=61)
        self.row.window_count = agent_auth.READ_LIMIT_PER_MINUTE
        self.row.save(update_fields=['window_started_at', 'window_count'])
        self.assertFalse(self.call_tool(self.raw, 'get_today_schedule').get('isError'))

    def test_last_used_at_is_recorded(self):
        self.call_tool(self.raw, 'get_today_schedule')
        self.row.refresh_from_db()
        self.assertIsNotNone(self.row.last_used_at)


class CreateClassTests(McpTestCase):
    def setUp(self):
        self.user = make_user('alice')
        self.raw, _ = make_token(self.user, [scope_defs.SCHEDULE_WRITE])
        self.args = {
            'course_id': 'PHYS200', 'course_name': 'Waves',
            'start_date': '2026-09-01', 'end_date': '2026-12-01',
            'start_time': '14:00', 'end_time': '15:00',
            'rep_date': 'MON,WED', 'classroom': 'Hall A',
        }

    def test_first_call_previews_and_writes_nothing(self):
        payload = self.call_tool(self.raw, 'create_class', self.args)['structuredContent']
        self.assertEqual(payload['status'], 'preview')
        self.assertIn('confirmation_token', payload)
        self.assertEqual(Course.objects.count(), 0)

    def test_second_call_with_token_creates(self):
        token = self.call_tool(self.raw, 'create_class', self.args)['structuredContent']['confirmation_token']
        payload = self.call_tool(self.raw, 'create_class',
                                 {**self.args, 'confirmation_token': token})['structuredContent']
        self.assertEqual(payload['status'], 'created')
        self.assertEqual(Course.objects.filter(user=self.user).count(), 1)

    def test_token_is_bound_to_the_previewed_payload(self):
        """A token issued for one class must not commit a different one."""
        token = self.call_tool(self.raw, 'create_class', self.args)['structuredContent']['confirmation_token']
        result = self.call_tool(self.raw, 'create_class',
                                {**self.args, 'course_name': 'Something Else',
                                 'confirmation_token': token})
        self.assertTrue(result.get('isError'))
        self.assertEqual(Course.objects.count(), 0)

    def test_replayed_token_does_not_create_twice(self):
        token = self.call_tool(self.raw, 'create_class', self.args)['structuredContent']['confirmation_token']
        args = {**self.args, 'confirmation_token': token}
        first = self.call_tool(self.raw, 'create_class', args)['structuredContent']
        second = self.call_tool(self.raw, 'create_class', args)['structuredContent']
        self.assertEqual(first, second)
        self.assertEqual(Course.objects.count(), 1)

    def test_expired_token_is_refused(self):
        token = self.call_tool(self.raw, 'create_class', self.args)['structuredContent']['confirmation_token']
        AgentPendingWrite.objects.filter(token=token).update(
            expires_at=timezone.now() - timedelta(minutes=1))
        result = self.call_tool(self.raw, 'create_class', {**self.args, 'confirmation_token': token})
        self.assertTrue(result.get('isError'))
        self.assertEqual(Course.objects.count(), 0)

    def test_cannot_set_protected_fields(self):
        """course_outline / has_ai_content / parent_course are writable on
        CourseSerializer; the agent path must not expose them."""
        args = {**self.args, 'has_ai_content': True, 'parent_course': 999,
                'course_outline': '/etc/passwd'}
        token = self.call_tool(self.raw, 'create_class', args)['structuredContent']['confirmation_token']
        self.call_tool(self.raw, 'create_class', {**args, 'confirmation_token': token})
        course = Course.objects.get(user=self.user)
        self.assertFalse(course.has_ai_content)
        self.assertIsNone(course.parent_course)

    def test_sections_are_parented_to_the_new_course(self):
        args = {**self.args, 'sections': [{'course_id': 'PHYS200-LAB', 'rep_date': 'FRI',
                                           'start_time': '09:00', 'end_time': '11:00'}]}
        token = self.call_tool(self.raw, 'create_class', args)['structuredContent']['confirmation_token']
        self.call_tool(self.raw, 'create_class', {**args, 'confirmation_token': token})
        parent = Course.objects.get(user=self.user, course_id='PHYS200')
        lab = Course.objects.get(user=self.user, course_id='PHYS200-LAB')
        self.assertEqual(lab.parent_course_id, parent.pk)

    def test_overlap_is_surfaced_in_the_preview(self):
        Course.objects.create(
            user=self.user, course_id='CLASH', course_name='Clash',
            start_date=date(2026, 9, 1), end_date=date(2026, 12, 1),
            start_time=time(14, 30), end_time=time(15, 30),
            rep_date='MON,WED', classroom='Hall B')
        payload = self.call_tool(self.raw, 'create_class', self.args)['structuredContent']
        self.assertTrue(payload['preview'].get('overlaps'))

    def test_invalid_rep_date_is_rejected(self):
        result = self.call_tool(self.raw, 'create_class', {**self.args, 'rep_date': 'FUNDAY'})
        self.assertTrue(result.get('isError'))


class CreateEventTests(McpTestCase):
    def setUp(self):
        self.user = make_user('alice')
        self.friend = make_user('bob')
        Friend.objects.create(user=self.user, friend=self.friend, status=Friend.ACCEPTED)
        self.raw, _ = make_token(self.user, [scope_defs.EVENTS_WRITE])
        self.args = {'name': 'Gym', 'date': '2026-09-10',
                     'start_time': '18:00', 'end_time': '19:00'}

    def test_first_call_previews_and_writes_nothing(self):
        payload = self.call_tool(self.raw, 'create_event', self.args)['structuredContent']
        self.assertEqual(payload['status'], 'preview')
        self.assertEqual(Event.objects.count(), 0)

    def test_created_event_is_private_with_no_invites_or_chat(self):
        token = self.call_tool(self.raw, 'create_event', self.args)['structuredContent']['confirmation_token']
        self.call_tool(self.raw, 'create_event', {**self.args, 'confirmation_token': token})
        event = Event.objects.get(creator=self.user)
        self.assertEqual(event.visibility, Event.VISIBILITY_PRIVATE)
        self.assertIsNone(event.chat_room)
        self.assertEqual(event.invites.count(), 0)

    def test_invite_attempt_is_refused(self):
        result = self.call_tool(self.raw, 'create_event',
                                {**self.args, 'invite_usernames': ['bob']})
        self.assertTrue(result.get('isError'))
        self.assertEqual(Event.objects.count(), 0)

    def test_chat_post_attempt_is_refused(self):
        result = self.call_tool(self.raw, 'create_event',
                                {**self.args, 'source_chat_room_id': 1})
        self.assertTrue(result.get('isError'))

    def test_visibility_cannot_be_forced_public(self):
        args = {**self.args, 'visibility': 'PUBLIC'}
        token = self.call_tool(self.raw, 'create_event', args)['structuredContent']['confirmation_token']
        self.call_tool(self.raw, 'create_event', {**args, 'confirmation_token': token})
        self.assertEqual(Event.objects.get(creator=self.user).visibility, Event.VISIBILITY_PRIVATE)

    def test_restricted_user_cannot_create(self):
        from .models import FunctionRestriction
        FunctionRestriction.objects.create(
            user=self.user, restriction_type=FunctionRestriction.TYPE_BOTH,
            offense_count=1, is_active=True)
        result = self.call_tool(self.raw, 'create_event', self.args)
        self.assertTrue(result.get('isError'))
        self.assertEqual(Event.objects.count(), 0)

    def test_conflict_fails_by_default(self):
        make_course(self.user, 'CLASH', rep=ALL_DAYS,
                    start=time(18, 0), end=time(19, 0))
        args = {**self.args, 'date': date.today().isoformat()}
        token = self.call_tool(self.raw, 'create_event', args)['structuredContent']['confirmation_token']
        result = self.call_tool(self.raw, 'create_event', {**args, 'confirmation_token': token})
        self.assertTrue(result.get('isError'))
        self.assertEqual(Event.objects.count(), 0)

    def test_conflict_can_be_resolved_explicitly(self):
        make_course(self.user, 'CLASH', rep=ALL_DAYS,
                    start=time(18, 0), end=time(19, 0))
        args = {**self.args, 'date': date.today().isoformat(), 'on_conflict': 'keep_both'}
        token = self.call_tool(self.raw, 'create_event', args)['structuredContent']['confirmation_token']
        payload = self.call_tool(self.raw, 'create_event',
                                 {**args, 'confirmation_token': token})['structuredContent']
        self.assertEqual(payload['status'], 'created')


class TokenManagementApiTests(TestCase):
    """The mint/list/revoke endpoints are ordinary session API, so they
    authenticate with a JWT — the project has no SessionAuthentication."""

    def setUp(self):
        from rest_framework_simplejwt.tokens import RefreshToken
        self.user = make_user('alice')
        jwt = str(RefreshToken.for_user(self.user).access_token)
        self.client.defaults['HTTP_AUTHORIZATION'] = f'Bearer {jwt}'

    def test_mint_returns_raw_token_once(self):
        resp = self.client.post('/api/agent-tokens/',
                                data=json.dumps({'name': 'Hermes', 'scopes': [scope_defs.SCHEDULE_READ]}),
                                content_type='application/json')
        self.assertEqual(resp.status_code, 201)
        raw = resp.json()['token']
        self.assertTrue(raw.startswith(agent_auth.TOKEN_PREFIX))
        # The list endpoint must never echo it back.
        listed = self.client.get('/api/agent-tokens/').json()['tokens']
        self.assertNotIn('token', listed[0])

    def test_unknown_scope_is_rejected_at_mint(self):
        resp = self.client.post('/api/agent-tokens/',
                                data=json.dumps({'scopes': ['admin']}),
                                content_type='application/json')
        self.assertEqual(resp.status_code, 400)

    def test_scopes_can_be_edited_on_a_live_token(self):
        _, row = make_token(self.user, [scope_defs.SCHEDULE_READ])
        resp = self.client.patch(
            f'/api/agent-tokens/{row.pk}/',
            data=json.dumps({'scopes': [scope_defs.SCHEDULE_READ, scope_defs.EVENTS_WRITE]}),
            content_type='application/json')
        self.assertEqual(resp.status_code, 200)
        row.refresh_from_db()
        self.assertEqual(sorted(row.scopes), [scope_defs.EVENTS_WRITE, scope_defs.SCHEDULE_READ])

    def test_edited_scopes_take_effect_without_a_new_token(self):
        """The point of editing in place: the raw token keeps working, only
        what it can reach changes, on the very next request."""
        raw, row = make_token(self.user, [scope_defs.SCHEDULE_READ])
        self.client.patch(f'/api/agent-tokens/{row.pk}/',
                          data=json.dumps({'scopes': [scope_defs.UNREAD_READ]}),
                          content_type='application/json')
        resp = self.client.post(
            MCP_URL, data=json.dumps({'jsonrpc': '2.0', 'id': 1, 'method': 'tools/list'}),
            content_type='application/json', HTTP_AUTHORIZATION=f'Bearer {raw}')
        names = {t['name'] for t in resp.json()['result']['tools']}
        self.assertEqual(names, {'get_unread_count'})

    def test_edit_rejects_unknown_scope_and_empty_list(self):
        _, row = make_token(self.user, [scope_defs.SCHEDULE_READ])
        for body in ({'scopes': ['admin']}, {'scopes': []}):
            resp = self.client.patch(f'/api/agent-tokens/{row.pk}/',
                                     data=json.dumps(body), content_type='application/json')
            self.assertEqual(resp.status_code, 400)
        row.refresh_from_db()
        self.assertEqual(row.scopes, [scope_defs.SCHEDULE_READ])

    def test_cannot_edit_another_users_token(self):
        other = make_user('mallory')
        _, row = make_token(other, [scope_defs.SCHEDULE_READ])
        resp = self.client.patch(f'/api/agent-tokens/{row.pk}/',
                                 data=json.dumps({'scopes': [scope_defs.EVENTS_WRITE]}),
                                 content_type='application/json')
        self.assertEqual(resp.status_code, 404)
        row.refresh_from_db()
        self.assertEqual(row.scopes, [scope_defs.SCHEDULE_READ])

    def test_revoked_token_disappears_from_the_list(self):
        _, row = make_token(self.user, [scope_defs.SCHEDULE_READ])
        self.assertEqual(len(self.client.get('/api/agent-tokens/').json()['tokens']), 1)
        self.client.delete(f'/api/agent-tokens/{row.pk}/')
        self.assertEqual(self.client.get('/api/agent-tokens/').json()['tokens'], [])

    def test_cannot_edit_a_revoked_token(self):
        _, row = make_token(self.user, [scope_defs.SCHEDULE_READ])
        self.client.delete(f'/api/agent-tokens/{row.pk}/')
        resp = self.client.patch(f'/api/agent-tokens/{row.pk}/',
                                 data=json.dumps({'scopes': [scope_defs.EVENTS_WRITE]}),
                                 content_type='application/json')
        self.assertEqual(resp.status_code, 404)

    def test_cannot_revoke_another_users_token(self):
        other = make_user('mallory')
        _, row = make_token(other, [scope_defs.SCHEDULE_READ])
        self.assertEqual(self.client.delete(f'/api/agent-tokens/{row.pk}/').status_code, 404)
        row.refresh_from_db()
        self.assertIsNone(row.revoked_at)

    def test_live_token_cap(self):
        for _ in range(5):
            make_token(self.user, [scope_defs.SCHEDULE_READ])
        resp = self.client.post('/api/agent-tokens/',
                                data=json.dumps({'scopes': [scope_defs.SCHEDULE_READ]}),
                                content_type='application/json')
        self.assertEqual(resp.status_code, 400)
