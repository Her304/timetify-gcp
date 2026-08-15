"""Tests for the OAuth 2.1 authorization server backing the MCP endpoint.

Weighted towards the ways an OAuth server gets broken into: open redirects,
code replay, PKCE bypass, refresh-token reuse, and scope escalation. The happy
path is one test; the rest are attempts to subvert it.

Run: python manage.py test main.test_agent_oauth
"""

import base64
import hashlib
import json
import secrets
from datetime import timedelta

from django.test import Client, TestCase
from django.utils import timezone
from django.utils.html import escape

from .models import OAuthAccessToken, OAuthAuthorizationCode, OAuthClient
from .mcp import scopes as scope_defs
from .test_agent_mcp import make_user

REDIRECT = 'https://client.example.com/callback'


def pkce_pair():
    verifier = secrets.token_urlsafe(48)
    challenge = base64.urlsafe_b64encode(
        hashlib.sha256(verifier.encode('ascii')).digest()
    ).rstrip(b'=').decode('ascii')
    return verifier, challenge


class OAuthTestCase(TestCase):
    def setUp(self):
        self.user = make_user('alice')
        self.password = 'pw-for-tests-only'
        self.client_row = OAuthClient.objects.create(
            client_id='test-client', name='Test Agent', redirect_uris=[REDIRECT],
        )

    def authorize_params(self, challenge, **over):
        params = {
            'client_id': self.client_row.client_id,
            'redirect_uri': REDIRECT,
            'response_type': 'code',
            'code_challenge': challenge,
            'code_challenge_method': 'S256',
            'state': 'xyz',
            'scope': f'{scope_defs.SCHEDULE_READ} {scope_defs.AVAILABILITY_READ}',
            'resource': 'https://timetify.net/mcp/v1/',
        }
        params.update(over)
        return params

    def get_code(self, challenge, scope=None):
        """Drive login + consent and pull the code out of the redirect."""
        params = self.authorize_params(challenge)
        if scope is not None:
            params['scope'] = scope
        self.client.post('/oauth/authorize', {
            **params, 'action': 'login',
            'username': self.user.username, 'password': self.password,
        })
        resp = self.client.post('/oauth/authorize', {**params, 'action': 'approve'})
        self.assertEqual(resp.status_code, 302, resp.content)
        from urllib.parse import parse_qs, urlparse
        return parse_qs(urlparse(resp['Location']).query)['code'][0]


class DiscoveryTests(OAuthTestCase):
    def test_protected_resource_metadata_points_at_the_auth_server(self):
        data = self.client.get('/.well-known/oauth-protected-resource').json()
        self.assertIn('/mcp/v1/', data['resource'])
        self.assertTrue(data['authorization_servers'])
        self.assertCountEqual(data['scopes_supported'], list(scope_defs.VALID))

    def test_authorization_server_metadata_advertises_s256_only(self):
        data = self.client.get('/.well-known/oauth-authorization-server').json()
        # Advertising `plain` would invite clients to use it.
        self.assertEqual(data['code_challenge_methods_supported'], ['S256'])
        self.assertEqual(data['response_types_supported'], ['code'])

    def test_mcp_401_advertises_where_to_authenticate(self):
        """Without this header a web connector cannot discover the flow at all."""
        resp = self.client.post('/mcp/v1/', data='{}', content_type='application/json')
        self.assertEqual(resp.status_code, 401)
        self.assertIn('resource_metadata=', resp['WWW-Authenticate'])


class RegistrationTests(TestCase):
    def _register(self, body):
        return self.client.post('/oauth/register', data=json.dumps(body),
                                content_type='application/json')

    def test_dynamic_registration_issues_a_client_id(self):
        resp = self._register({'client_name': 'Hermes', 'redirect_uris': [REDIRECT]})
        self.assertEqual(resp.status_code, 201)
        self.assertTrue(resp.json()['client_id'])
        # Public client by default — PKCE protects the exchange, no secret.
        self.assertNotIn('client_secret', resp.json())

    def test_confidential_client_gets_a_secret(self):
        resp = self._register({'redirect_uris': [REDIRECT],
                               'token_endpoint_auth_method': 'client_secret_post'})
        self.assertTrue(resp.json()['client_secret'])

    def test_loopback_http_allowed_other_http_rejected(self):
        self.assertEqual(self._register({'redirect_uris': ['http://127.0.0.1:8080/cb']}).status_code, 201)
        self.assertEqual(self._register({'redirect_uris': ['http://evil.example.com/cb']}).status_code, 400)

    def test_native_app_scheme_allowed_script_schemes_rejected(self):
        """RFC 8252 private-use schemes are real callbacks; javascript:/data:
        are not destinations at all, and nothing legitimate registers one."""
        self.assertEqual(self._register({'redirect_uris': ['com.example.app:/oauth']}).status_code, 201)
        for bad in ('javascript:alert(1)', 'data:text/html,x', 'file:///etc/passwd'):
            self.assertEqual(self._register({'redirect_uris': [bad]}).status_code, 400, bad)

    def test_missing_redirect_uris_rejected(self):
        self.assertEqual(self._register({'client_name': 'x'}).status_code, 400)

    def test_secret_is_not_stored_in_the_clear(self):
        secret = self._register({'redirect_uris': [REDIRECT],
                                 'token_endpoint_auth_method': 'client_secret_post'}).json()['client_secret']
        row = OAuthClient.objects.latest('created_at')
        self.assertNotEqual(row.secret_hash, secret)


class AuthorizeTests(OAuthTestCase):
    def test_unknown_client_shows_a_page_not_a_redirect(self):
        _, challenge = pkce_pair()
        resp = self.client.get('/oauth/authorize', self.authorize_params(challenge, client_id='nope'))
        self.assertEqual(resp.status_code, 400)

    def test_unregistered_redirect_uri_is_never_redirected_to(self):
        """The open-redirect case: an attacker-supplied callback must not be
        used as a destination, even to report the error."""
        _, challenge = pkce_pair()
        resp = self.client.get('/oauth/authorize',
                               self.authorize_params(challenge, redirect_uri='https://evil.example.com/steal'))
        self.assertEqual(resp.status_code, 400)
        self.assertNotIn('Location', resp)

    def test_redirect_uri_must_match_exactly_not_by_prefix(self):
        _, challenge = pkce_pair()
        resp = self.client.get('/oauth/authorize',
                               self.authorize_params(challenge, redirect_uri=REDIRECT + '.evil.com'))
        self.assertEqual(resp.status_code, 400)

    def test_missing_pkce_is_refused(self):
        resp = self.client.get('/oauth/authorize',
                               self.authorize_params('', code_challenge=''))
        self.assertEqual(resp.status_code, 302)
        self.assertIn('error=invalid_request', resp['Location'])

    def test_plain_pkce_method_is_refused(self):
        _, challenge = pkce_pair()
        resp = self.client.get('/oauth/authorize',
                               self.authorize_params(challenge, code_challenge_method='plain'))
        self.assertIn('error=invalid_request', resp['Location'])

    def test_anonymous_user_is_asked_to_sign_in(self):
        _, challenge = pkce_pair()
        resp = self.client.get('/oauth/authorize', self.authorize_params(challenge))
        self.assertEqual(resp.status_code, 200)
        self.assertContains(resp, 'sign in to continue')

    def test_bad_password_does_not_authenticate(self):
        _, challenge = pkce_pair()
        resp = self.client.post('/oauth/authorize', {
            **self.authorize_params(challenge), 'action': 'login',
            'username': self.user.username, 'password': 'wrong',
        })
        self.assertEqual(resp.status_code, 401)
        self.assertEqual(OAuthAuthorizationCode.objects.count(), 0)

    def test_username_case_does_not_affect_sign_in(self):
        """This page authenticates directly, while the app's login canonicalises
        first — so without the same normalisation, credentials that work in the
        app are rejected here purely on capitalisation."""
        _, challenge = pkce_pair()
        resp = self.client.post('/oauth/authorize', {
            **self.authorize_params(challenge), 'action': 'login',
            'username': self.user.username.upper(), 'password': self.password,
        })
        self.assertEqual(resp.status_code, 200)
        self.assertNotContains(resp, 'did not work')

    def test_consent_screen_lists_requested_scopes(self):
        _, challenge = pkce_pair()
        resp = self.client.post('/oauth/authorize', {
            **self.authorize_params(challenge), 'action': 'login',
            'username': self.user.username, 'password': self.password,
        })
        # escape(): the descriptions contain apostrophes, which the template
        # renders as &#x27; — comparing the raw string would fail on the markup.
        self.assertContains(resp, escape(scope_defs.DESCRIPTIONS[scope_defs.SCHEDULE_READ]))

    def test_denying_issues_no_code(self):
        _, challenge = pkce_pair()
        params = self.authorize_params(challenge)
        self.client.post('/oauth/authorize', {**params, 'action': 'login',
                                              'username': self.user.username,
                                              'password': self.password})
        resp = self.client.post('/oauth/authorize', {**params, 'action': 'deny'})
        self.assertIn('error=access_denied', resp['Location'])
        self.assertEqual(OAuthAuthorizationCode.objects.count(), 0)

    def test_pages_load_nothing_from_a_third_party_and_run_no_script(self):
        """These pages take a password. A script from someone else's origin
        could read the field, so there must not be one — from anywhere."""
        _, challenge = pkce_pair()
        login = self.client.get('/oauth/authorize', self.authorize_params(challenge))
        self.client.post('/oauth/authorize', {
            **self.authorize_params(challenge), 'action': 'login',
            'username': self.user.username, 'password': self.password,
        })
        consent = self.client.get('/oauth/authorize', self.authorize_params(challenge))

        for resp in (login, consent):
            body = resp.content.decode()
            for forbidden in ('<script', 'cdn.tailwindcss.com', 'fonts.googleapis.com',
                              'fonts.gstatic.com', '//cdn.', 'unpkg.com', 'jsdelivr'):
                self.assertNotIn(forbidden, body)
            # A wrapped {# … #} is not a comment to Django — it renders. Catching
            # it here beats discovering it on the live page.
            self.assertNotIn('{#', body)
            self.assertNotIn('{%', body)

    def test_unknown_scopes_are_dropped_not_granted(self):
        _, challenge = pkce_pair()
        code = self.get_code(challenge, scope='schedule:read admin *')
        row = OAuthAuthorizationCode.objects.get(code=code)
        self.assertEqual(row.scopes, [scope_defs.SCHEDULE_READ])


class TokenTests(OAuthTestCase):
    def _exchange(self, code, verifier, **over):
        body = {
            'grant_type': 'authorization_code', 'code': code,
            'code_verifier': verifier, 'redirect_uri': REDIRECT,
            'client_id': self.client_row.client_id,
        }
        body.update(over)
        return self.client.post('/oauth/token', body)

    def test_full_flow_yields_a_working_mcp_token(self):
        verifier, challenge = pkce_pair()
        code = self.get_code(challenge)
        payload = self._exchange(code, verifier).json()
        self.assertEqual(payload['token_type'], 'Bearer')

        resp = self.client.post(
            '/mcp/v1/', data=json.dumps({'jsonrpc': '2.0', 'id': 1, 'method': 'tools/list'}),
            content_type='application/json',
            HTTP_AUTHORIZATION=f"Bearer {payload['access_token']}")
        names = {t['name'] for t in resp.json()['result']['tools']}
        self.assertEqual(names, {'get_today_schedule', 'get_free_busy'})

    def test_pkce_mismatch_is_refused(self):
        _, challenge = pkce_pair()
        code = self.get_code(challenge)
        wrong_verifier, _ = pkce_pair()
        resp = self._exchange(code, wrong_verifier)
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(resp.json()['error'], 'invalid_grant')

    def test_missing_verifier_is_refused(self):
        _, challenge = pkce_pair()
        code = self.get_code(challenge)
        self.assertEqual(self._exchange(code, '').status_code, 400)

    def test_redirect_uri_must_match_the_authorization_request(self):
        verifier, challenge = pkce_pair()
        code = self.get_code(challenge)
        resp = self._exchange(code, verifier, redirect_uri='https://client.example.com/other')
        self.assertEqual(resp.status_code, 400)

    def test_code_is_single_use_and_replay_revokes_the_grant(self):
        """A replayed code means the code leaked, so everything issued from it
        is suspect — refusing the second exchange isn't enough on its own."""
        verifier, challenge = pkce_pair()
        code = self.get_code(challenge)
        first = self._exchange(code, verifier).json()
        self.assertIn('access_token', first)

        second = self._exchange(code, verifier)
        self.assertEqual(second.status_code, 400)

        resp = self.client.post(
            '/mcp/v1/', data=json.dumps({'jsonrpc': '2.0', 'id': 1, 'method': 'ping'}),
            content_type='application/json',
            HTTP_AUTHORIZATION=f"Bearer {first['access_token']}")
        self.assertEqual(resp.status_code, 401)

    def test_expired_code_is_refused(self):
        verifier, challenge = pkce_pair()
        code = self.get_code(challenge)
        OAuthAuthorizationCode.objects.filter(code=code).update(
            expires_at=timezone.now() - timedelta(seconds=1))
        self.assertEqual(self._exchange(code, verifier).status_code, 400)

    def test_another_clients_code_cannot_be_exchanged(self):
        verifier, challenge = pkce_pair()
        code = self.get_code(challenge)
        other = OAuthClient.objects.create(client_id='other', redirect_uris=[REDIRECT])
        self.assertEqual(self._exchange(code, verifier, client_id=other.client_id).status_code, 400)

    def test_refresh_rotates_and_old_refresh_stops_working(self):
        verifier, challenge = pkce_pair()
        first = self._exchange(self.get_code(challenge), verifier).json()

        rotated = self.client.post('/oauth/token', {
            'grant_type': 'refresh_token', 'refresh_token': first['refresh_token'],
            'client_id': self.client_row.client_id,
        })
        self.assertEqual(rotated.status_code, 200)
        self.assertNotEqual(rotated.json()['refresh_token'], first['refresh_token'])

        reused = self.client.post('/oauth/token', {
            'grant_type': 'refresh_token', 'refresh_token': first['refresh_token'],
            'client_id': self.client_row.client_id,
        })
        self.assertEqual(reused.status_code, 400)

    def test_unsupported_grant_type_is_refused(self):
        resp = self.client.post('/oauth/token', {
            'grant_type': 'password', 'client_id': self.client_row.client_id,
            'username': self.user.username, 'password': self.password,
        })
        self.assertEqual(resp.status_code, 400)


class OAuthTokenAtTheResourceTests(OAuthTestCase):
    def _token(self):
        verifier, challenge = pkce_pair()
        return self._exchange_ok(self.get_code(challenge), verifier)

    def _exchange_ok(self, code, verifier):
        return self.client.post('/oauth/token', {
            'grant_type': 'authorization_code', 'code': code,
            'code_verifier': verifier, 'redirect_uri': REDIRECT,
            'client_id': self.client_row.client_id,
        }).json()['access_token']

    def _ping(self, raw):
        return self.client.post(
            '/mcp/v1/', data=json.dumps({'jsonrpc': '2.0', 'id': 1, 'method': 'ping'}),
            content_type='application/json', HTTP_AUTHORIZATION=f'Bearer {raw}')

    def test_expired_access_token_is_rejected(self):
        raw = self._token()
        OAuthAccessToken.objects.all().update(expires_at=timezone.now() - timedelta(seconds=1))
        self.assertEqual(self._ping(raw).status_code, 401)

    def test_revoked_access_token_is_rejected_immediately(self):
        raw = self._token()
        self.client.post('/oauth/revoke', {'token': raw})
        self.assertEqual(self._ping(raw).status_code, 401)

    def test_inactive_user_token_is_rejected(self):
        raw = self._token()
        self.user.is_active = False
        self.user.save(update_fields=['is_active'])
        self.assertEqual(self._ping(raw).status_code, 401)

    def test_oauth_token_cannot_reach_the_session_api(self):
        """Same isolation guarantee the PATs have."""
        raw = self._token()
        self.assertEqual(self.client.get('/api/user/', HTTP_AUTHORIZATION=f'Bearer {raw}').status_code, 401)

    def test_scope_is_enforced_at_the_resource(self):
        verifier, challenge = pkce_pair()
        code = self.get_code(challenge, scope=scope_defs.SCHEDULE_READ)
        raw = self._exchange_ok(code, verifier)
        resp = self.client.post(
            '/mcp/v1/', data=json.dumps({'jsonrpc': '2.0', 'id': 1, 'method': 'tools/call',
                                         'params': {'name': 'get_unread_count', 'arguments': {}}}),
            content_type='application/json', HTTP_AUTHORIZATION=f'Bearer {raw}')
        self.assertIn('error', resp.json())


class PurgeTests(OAuthTestCase):
    """Housekeeping runs from the moderation cron, so it has to be safe to call
    on a live table — the failure mode that matters is deleting too much."""

    def test_purge_drops_dead_rows_and_keeps_live_ones(self):
        verifier, challenge = pkce_pair()
        code = self.get_code(challenge)
        live = self.client.post('/oauth/token', {
            'grant_type': 'authorization_code', 'code': code,
            'code_verifier': verifier, 'redirect_uri': REDIRECT,
            'client_id': self.client_row.client_id,
        }).json()

        stale_code = OAuthAuthorizationCode.objects.create(
            code='stale', client=self.client_row, user=self.user,
            redirect_uri=REDIRECT, code_challenge='x', scopes=[],
            expires_at=timezone.now() - timedelta(days=3),
        )
        stale_token = OAuthAccessToken.objects.create(
            user=self.user, client=self.client_row, scopes=[],
            token_hash='dead-token-hash', refresh_hash='dead-refresh-hash',
            expires_at=timezone.now() - timedelta(days=40),
            refresh_expires_at=timezone.now() - timedelta(days=10),
        )

        from .mcp.oauth import purge_expired
        self.assertEqual(purge_expired(), 2)
        self.assertFalse(OAuthAuthorizationCode.objects.filter(pk=stale_code.pk).exists())
        self.assertFalse(OAuthAccessToken.objects.filter(pk=stale_token.pk).exists())

        # The token issued moments ago must still work afterwards.
        resp = self.client.post(
            '/mcp/v1/', data=json.dumps({'jsonrpc': '2.0', 'id': 1, 'method': 'ping'}),
            content_type='application/json',
            HTTP_AUTHORIZATION=f"Bearer {live['access_token']}")
        self.assertEqual(resp.status_code, 200)

    def test_moderation_tick_reports_what_it_purged(self):
        OAuthAuthorizationCode.objects.create(
            code='stale', client=self.client_row, user=self.user,
            redirect_uri=REDIRECT, code_challenge='x', scopes=[],
            expires_at=timezone.now() - timedelta(days=3),
        )
        from .moderation_pipeline import run_moderation_tick
        summary = run_moderation_tick()
        self.assertEqual(summary['oauth_rows_purged'], 1)
        self.assertEqual(summary['errors'], 0)


class ConnectedAppsApiTests(OAuthTestCase):
    """Settings needs its own view of OAuth grants: without it a user can
    connect an app and then have no way to see or disconnect it."""

    def setUp(self):
        super().setUp()
        from rest_framework_simplejwt.tokens import RefreshToken
        # A second client: self.client carries the consent-flow session, and the
        # settings API is JWT-only (no SessionAuthentication in this project).
        self.api = Client()
        jwt = str(RefreshToken.for_user(self.user).access_token)
        self.api.defaults['HTTP_AUTHORIZATION'] = f'Bearer {jwt}'

    def _connect(self, scope=None):
        verifier, challenge = pkce_pair()
        code = self.get_code(challenge, scope=scope)
        return self.client.post('/oauth/token', {
            'grant_type': 'authorization_code', 'code': code,
            'code_verifier': verifier, 'redirect_uri': REDIRECT,
            'client_id': self.client_row.client_id,
        }).json()

    def _ping(self, raw):
        return self.client.post(
            '/mcp/v1/', data=json.dumps({'jsonrpc': '2.0', 'id': 1, 'method': 'ping'}),
            content_type='application/json', HTTP_AUTHORIZATION=f'Bearer {raw}')

    def test_connected_app_is_listed(self):
        self._connect()
        rows = self.api.get('/api/agent-connections/').json()['connections']
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['client_id'], self.client_row.client_id)
        self.assertEqual(rows[0]['name'], 'Test Agent')

    def test_refreshing_does_not_look_like_a_second_connection(self):
        """Rotation mints a row per refresh; the user approved once."""
        first = self._connect()
        self.client.post('/oauth/token', {
            'grant_type': 'refresh_token', 'refresh_token': first['refresh_token'],
            'client_id': self.client_row.client_id,
        })
        self.assertEqual(len(self.api.get('/api/agent-connections/').json()['connections']), 1)

    def test_scopes_are_the_union_of_live_grants(self):
        self._connect(scope=scope_defs.SCHEDULE_READ)
        self._connect(scope=scope_defs.AVAILABILITY_READ)
        rows = self.api.get('/api/agent-connections/').json()['connections']
        self.assertEqual(len(rows), 1)
        self.assertCountEqual(rows[0]['scopes'],
                              [scope_defs.SCHEDULE_READ, scope_defs.AVAILABILITY_READ])

    def test_disconnect_kills_every_live_token_for_that_app(self):
        first = self._connect()
        second = self._connect()
        resp = self.api.delete(f'/api/agent-connections/{self.client_row.client_id}/')
        self.assertEqual(resp.status_code, 204)
        self.assertEqual(self._ping(first['access_token']).status_code, 401)
        self.assertEqual(self._ping(second['access_token']).status_code, 401)
        self.assertEqual(self.api.get('/api/agent-connections/').json()['connections'], [])

    def test_disconnect_stops_a_refresh_from_reviving_access(self):
        first = self._connect()
        self.api.delete(f'/api/agent-connections/{self.client_row.client_id}/')
        rotated = self.client.post('/oauth/token', {
            'grant_type': 'refresh_token', 'refresh_token': first['refresh_token'],
            'client_id': self.client_row.client_id,
        })
        self.assertEqual(rotated.status_code, 400)

    def test_disconnect_consumes_an_unredeemed_code(self):
        """A code issued just before disconnecting is access the app hasn't
        collected yet — leaving it usable would undo the disconnect."""
        verifier, challenge = pkce_pair()
        code = self.get_code(challenge)
        self._connect()
        self.api.delete(f'/api/agent-connections/{self.client_row.client_id}/')
        resp = self.client.post('/oauth/token', {
            'grant_type': 'authorization_code', 'code': code,
            'code_verifier': verifier, 'redirect_uri': REDIRECT,
            'client_id': self.client_row.client_id,
        })
        self.assertEqual(resp.status_code, 400)

    def test_cannot_disconnect_another_users_grant(self):
        self._connect()
        from rest_framework_simplejwt.tokens import RefreshToken
        intruder = Client()
        jwt = str(RefreshToken.for_user(make_user('mallory')).access_token)
        intruder.defaults['HTTP_AUTHORIZATION'] = f'Bearer {jwt}'
        self.assertEqual(
            intruder.delete(f'/api/agent-connections/{self.client_row.client_id}/').status_code, 404)
        self.assertEqual(
            OAuthAccessToken.objects.filter(user=self.user, revoked_at__isnull=True).count(), 1)

    def test_connections_require_authentication(self):
        self.assertEqual(Client().get('/api/agent-connections/').status_code, 401)

    def test_other_users_connections_are_not_listed(self):
        self._connect()
        from rest_framework_simplejwt.tokens import RefreshToken
        other = Client()
        jwt = str(RefreshToken.for_user(make_user('bob')).access_token)
        other.defaults['HTTP_AUTHORIZATION'] = f'Bearer {jwt}'
        self.assertEqual(other.get('/api/agent-connections/').json()['connections'], [])


class IssuerTests(OAuthTestCase):
    """Whatever a client is told to authorize against must be the host it just
    talked to. Getting this wrong sends the handshake to another machine, which
    is what made the flow impossible to run against a local dev server."""

    def test_debug_server_advertises_itself_not_the_canonical_domain(self):
        with self.settings(DEBUG=True, ALLOWED_HOSTS=['127.0.0.1']):
            data = self.client.get('/.well-known/oauth-authorization-server',
                                   HTTP_HOST='127.0.0.1:8000').json()
        self.assertEqual(data['issuer'], 'http://127.0.0.1:8000')
        self.assertEqual(data['authorization_endpoint'], 'http://127.0.0.1:8000/oauth/authorize')

    def test_production_stays_pinned_to_the_canonical_domain(self):
        """A Host header must never be able to move the issuer in prod."""
        with self.settings(DEBUG=False, ALLOWED_HOSTS=['*'], CANONICAL_DOMAIN='timetify.net'):
            data = self.client.get('/.well-known/oauth-protected-resource',
                                   HTTP_HOST='attacker.example.com').json()
        self.assertEqual(data['authorization_servers'], ['https://timetify.net'])
        self.assertEqual(data['resource'], 'https://timetify.net/mcp/v1/')

    def test_401_pointer_follows_the_same_rule(self):
        with self.settings(DEBUG=True, ALLOWED_HOSTS=['127.0.0.1']):
            resp = self.client.post('/mcp/v1/', data='{}', content_type='application/json',
                                    HTTP_HOST='127.0.0.1:8000')
        self.assertIn('resource_metadata="http://127.0.0.1:8000/', resp['WWW-Authenticate'])


class CsrfTests(OAuthTestCase):
    """Django's test client disables CSRF enforcement by default, which is why
    every other test here passed while the live server answered 403 to the first
    request any real client makes. These use enforce_csrf_checks=True."""

    def setUp(self):
        super().setUp()
        self.strict = Client(enforce_csrf_checks=True)

    def test_machine_endpoints_do_not_require_a_csrf_token(self):
        """An MCP client's HTTP stack has no cookie and no CSRF token. If these
        are protected, the flow cannot start at all."""
        reg = self.strict.post('/oauth/register',
                               data=json.dumps({'redirect_uris': [REDIRECT]}),
                               content_type='application/json')
        self.assertEqual(reg.status_code, 201)

        for path, body in (('/oauth/token', {'grant_type': 'refresh_token',
                                             'client_id': self.client_row.client_id}),
                           ('/oauth/revoke', {'token': 'whatever'})):
            resp = self.strict.post(path, body)
            self.assertNotEqual(resp.status_code, 403, path)

    def test_the_consent_form_is_still_csrf_protected(self):
        """The one browser form here must keep its protection — approving is a
        state-changing POST a malicious page would love to make for you."""
        _, challenge = pkce_pair()
        resp = self.strict.post('/oauth/authorize', {
            **self.authorize_params(challenge), 'action': 'approve',
        })
        self.assertEqual(resp.status_code, 403)
        self.assertEqual(OAuthAuthorizationCode.objects.count(), 0)
