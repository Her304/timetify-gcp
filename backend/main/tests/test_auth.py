"""Authentication and account-flow tests.

Covers the behaviours the README documents: default-deny API access,
case-insensitive usernames, the sign-up availability oracle, and the
anti-enumeration password-reset flow.
"""

from django.contrib.auth import get_user_model
from django.contrib.auth.tokens import default_token_generator
from django.core import mail
from django.core.cache import cache
from django.test import TestCase
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode
from rest_framework.test import APIClient

User = get_user_model()

PASSWORD = "correct-horse-battery-9"


def register_payload(username="alice", email="alice@example.com"):
    return {
        "username": username,
        "password": PASSWORD,
        "password2": PASSWORD,
        "email": email,
        "university": "McGill",
        "major": "Computer Science",
        "grad_year": 2027,
        "accepted_terms": True,
    }


class AuthTestCase(TestCase):
    def setUp(self):
        cache.clear()  # throttle buckets live in the cache; start each test empty
        self.client = APIClient()


class RegistrationTests(AuthTestCase):
    def test_register_creates_user_and_sends_welcome_email(self):
        response = self.client.post("/api/register/", register_payload())
        self.assertEqual(response.status_code, 201)
        self.assertTrue(User.objects.filter(username="alice").exists())
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ["alice@example.com"])

    def test_register_without_terms_is_rejected(self):
        payload = register_payload()
        payload["accepted_terms"] = False
        response = self.client.post("/api/register/", payload)
        self.assertEqual(response.status_code, 400)

    def test_weak_password_is_rejected(self):
        payload = register_payload()
        payload["password"] = payload["password2"] = "password123"
        response = self.client.post("/api/register/", payload)
        self.assertEqual(response.status_code, 400)

    def test_username_is_unique_case_insensitively(self):
        self.client.post("/api/register/", register_payload(username="alice"))
        response = self.client.post(
            "/api/register/", register_payload(username="Alice", email="bob@example.com"))
        self.assertEqual(response.status_code, 400)
        self.assertIn("already taken", str(response.data.get("username", "")))

    def test_availability_oracle_reports_taken_username(self):
        self.client.post("/api/register/", register_payload())
        response = self.client.post("/api/register/check/", {"username": "ALICE"})
        self.assertEqual(response.status_code, 200)
        self.assertIn("username", response.data)

    def test_availability_oracle_reports_free_username(self):
        response = self.client.post("/api/register/check/", {"username": "fresh-name"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, {})


class LoginTests(AuthTestCase):
    def register(self, username="alice"):
        self.client.post("/api/register/", register_payload(username=username))

    def login(self, username="alice", password=PASSWORD):
        return self.client.post("/api/login/", {"username": username, "password": password})

    def test_login_returns_tokens(self):
        self.register()
        response = self.login()
        self.assertEqual(response.status_code, 200)
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)

    def test_login_username_is_case_insensitive(self):
        self.register(username="Alice")
        response = self.login(username="alice")
        self.assertEqual(response.status_code, 200)

    def test_wrong_password_error_does_not_reveal_account_existence(self):
        self.register(username="alice")
        known = self.login(username="alice", password="wrong-password-9")
        unknown = self.login(username="nobody", password="wrong-password-9")
        # Same status and same message shape: no account-existence oracle.
        self.assertEqual(known.status_code, 401)
        self.assertEqual(unknown.status_code, 401)
        self.assertEqual(
            known.data.get("detail"), unknown.data.get("detail"),
        )


class AccessControlTests(AuthTestCase):
    """Default-deny: unauthenticated requests never see private data."""

    def register_and_login(self):
        self.client.post("/api/register/", register_payload())
        response = self.client.post(
            "/api/login/", {"username": "alice", "password": PASSWORD})
        return response.data["access"]

    def test_protected_endpoint_rejects_unauthenticated_requests(self):
        response = self.client.get("/api/courses/")
        self.assertEqual(response.status_code, 401)

    def test_jwt_grants_access(self):
        token = self.register_and_login()
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        response = self.client.get("/api/courses/")
        self.assertEqual(response.status_code, 200)

    def test_cross_user_isolation_on_courses(self):
        token = self.register_and_login()
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        self.client.post("/api/courses/", {
            "course_id": "CS101", "course_name": "Intro",
            "start_date": "2026-05-04", "end_date": "2026-08-14",
            "start_time": "13:30", "end_time": "15:30",
            "rep_date": "Tuesday,Thursday", "classroom": "Hall A",
        })
        # A second user sees only their own (empty) course list.
        self.client.post(
            "/api/register/", register_payload(username="bob", email="bob@example.com"))
        other = self.client.post(
            "/api/login/", {"username": "bob", "password": PASSWORD}).data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {other}")
        response = self.client.get("/api/courses/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, [])


class PasswordResetTests(AuthTestCase):
    def setUp(self):
        super().setUp()
        self.user = User.objects.create_user(
            username="alice", password=PASSWORD, email="alice@example.com",
            university="McGill", major="CS", grad_year=2027,
        )

    def request_reset(self, email="alice@example.com"):
        return self.client.post("/api/password-reset/", {"email": email})

    def test_unknown_and_known_email_get_identical_response(self):
        known = self.request_reset("alice@example.com")
        unknown = self.request_reset("nobody@example.com")
        self.assertEqual(known.status_code, 200)
        self.assertEqual(unknown.status_code, 200)
        self.assertEqual(dict(known.data), dict(unknown.data))

    def test_reset_email_only_sent_for_registered_address(self):
        self.request_reset("nobody@example.com")
        self.assertEqual(len(mail.outbox), 0)
        self.request_reset("alice@example.com")
        self.assertEqual(len(mail.outbox), 1)

    def test_reset_link_points_at_canonical_domain(self):
        self.request_reset()
        body = mail.outbox[0].body
        self.assertIn("https://timetify.net/reset-password/", body)
        self.assertNotIn("run.app", body)

    def test_confirm_endpoint_validates_token(self):
        uid = urlsafe_base64_encode(force_bytes(self.user.pk))
        token = default_token_generator.make_token(self.user)
        check = self.client.get(f"/api/password-reset/confirm/{uid}/{token}/")
        self.assertEqual(check.status_code, 200)
        self.assertTrue(check.data["valid"])

    def test_reset_password_login_flow(self):
        uid = urlsafe_base64_encode(force_bytes(self.user.pk))
        token = default_token_generator.make_token(self.user)
        new_password = "brand-new-staple-horse-7"
        response = self.client.post(
            f"/api/password-reset/confirm/{uid}/{token}/",
            {"new_password1": new_password, "new_password2": new_password},
        )
        self.assertEqual(response.status_code, 200)
        # Old password is dead, new one works.
        old = self.client.post(
            "/api/login/", {"username": "alice", "password": PASSWORD})
        new = self.client.post(
            "/api/login/", {"username": "alice", "password": new_password})
        self.assertEqual(old.status_code, 401)
        self.assertEqual(new.status_code, 200)

    def test_tampered_token_is_rejected(self):
        uid = urlsafe_base64_encode(force_bytes(self.user.pk))
        response = self.client.post(
            f"/api/password-reset/confirm/{uid}/not-a-real-token/",
            {"new_password1": "brand-new-staple-horse-7",
             "new_password2": "brand-new-staple-horse-7"},
        )
        self.assertEqual(response.status_code, 400)
