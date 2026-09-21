"""Throttling tests.

Two properties from main/throttling.py worth pinning down:

1. Rate limits actually fire — the sign-up availability oracle is deliberately
   an existence oracle (for fast sign-up UX) and must not become an unmetered
   bulk-enumeration endpoint.
2. Client identity is spoof-resistant: the throttle keys on the
   X-Forwarded-For entry written by our own proxy (counted from the right),
   never on the caller-supplied part of the header.
"""

from unittest import mock

from django.core.cache import cache
from django.test import SimpleTestCase, TestCase, override_settings
from rest_framework.test import APIRequestFactory

from main.throttling import LoginIPThrottle, RegistrationCheckThrottle


class AvailabilityOracleThrottleTests(TestCase):
    def setUp(self):
        cache.clear()

    def test_fourth_availability_check_in_a_minute_is_throttled(self):
        # DRF reads DEFAULT_THROTTLE_RATES at class-definition time, so
        # override_settings cannot change it — patch the rate table directly.
        from rest_framework.test import APIClient
        client = APIClient()
        with mock.patch.dict(RegistrationCheckThrottle.THROTTLE_RATES,
                             {"registration_check": "3/min"}):
            for _ in range(3):
                response = client.post("/api/register/check/", {"username": "someone"})
                self.assertEqual(response.status_code, 200)
            fourth = client.post("/api/register/check/", {"username": "someone"})
            self.assertEqual(fourth.status_code, 429)


class SpoofResistantIdentTests(SimpleTestCase):
    """Rotating a forged X-Forwarded-For must not mint fresh throttle buckets."""

    def make_request(self, **meta):
        request = APIRequestFactory().post("/", **meta)
        # DRF's factory exposes WSGI-style META; ensure both spellings exist.
        request.META["HTTP_X_FORWARDED_FOR"] = meta.get("HTTP_X_FORWARDED_FOR", "")
        request.META["REMOTE_ADDR"] = meta.get("REMOTE_ADDR", "127.0.0.1")
        return request

    def test_ident_is_the_last_trusted_proxy_entry(self):
        # Cloud Run (TRUSTED_PROXY_COUNT=1) appends the real client address;
        # everything to its left is caller-controlled.
        throttle = LoginIPThrottle()
        request = self.make_request(
            HTTP_X_FORWARDED_FOR="1.2.3.4, 5.6.7.8", REMOTE_ADDR="127.0.0.1")
        self.assertEqual(throttle.get_ident(request), "5.6.7.8")

    def test_rotating_the_forged_prefix_does_not_change_ident(self):
        throttle = LoginIPThrottle()
        idents = {
            throttle.get_ident(self.make_request(
                HTTP_X_FORWARDED_FOR=f"10.0.0.{i}, 5.6.7.8"))
            for i in range(5)
        }
        self.assertEqual(idents, {"5.6.7.8"})

    def test_falls_back_to_remote_addr_without_forwarded_header(self):
        throttle = LoginIPThrottle()
        request = self.make_request(REMOTE_ADDR="192.168.1.10")
        self.assertEqual(throttle.get_ident(request), "192.168.1.10")

    def test_zero_trusted_proxies_ignores_forwarded_header(self):
        with override_settings(TRUSTED_PROXY_COUNT=0):
            throttle = LoginIPThrottle()
            request = self.make_request(
                HTTP_X_FORWARDED_FOR="1.2.3.4", REMOTE_ADDR="192.168.1.10")
            self.assertEqual(throttle.get_ident(request), "192.168.1.10")
