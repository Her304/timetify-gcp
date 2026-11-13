"""The Cloud Scheduler trigger for the moderation tick.

Until Nov 2026 this endpoint had never once succeeded in production, for two
independent reasons these tests pin down:

1. `MODERATION_RUN_SECRET` was set on Cloud Run but never read into settings,
   so the view always answered 503.
2. Scheduler sends a Google OIDC token as `Authorization: Bearer …`; the
   default JWTAuthentication 401'd it before the view could check the secret.
"""

from unittest import mock

from django.test import TestCase, override_settings
from rest_framework.test import APIClient

URL = "/api/admin/run-moderation/"
SECRET = "test-moderation-secret"


@override_settings(MODERATION_RUN_SECRET=SECRET)
class RunModerationEndpointTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    @mock.patch("main.moderation_pipeline.run_moderation_tick", return_value={"pending": 0})
    def test_foreign_bearer_token_does_not_block_a_valid_secret(self, tick):
        # Shape of a real Cloud Scheduler call: OIDC bearer + secret header.
        response = self.client.post(
            URL,
            HTTP_AUTHORIZATION="Bearer eyJhbGciOiJSUzI1NiJ9.not-our-jwt.sig",
            HTTP_X_MODERATION_SECRET=SECRET,
        )
        self.assertEqual(response.status_code, 200)
        tick.assert_called_once()

    @mock.patch("main.moderation_pipeline.run_moderation_tick")
    def test_wrong_secret_is_forbidden_and_runs_nothing(self, tick):
        response = self.client.post(URL, HTTP_X_MODERATION_SECRET="wrong")
        self.assertEqual(response.status_code, 403)
        tick.assert_not_called()

    @override_settings(MODERATION_RUN_SECRET=None)
    @mock.patch("main.moderation_pipeline.run_moderation_tick")
    def test_unset_secret_disables_the_endpoint(self, tick):
        response = self.client.post(URL, HTTP_X_MODERATION_SECRET="")
        self.assertEqual(response.status_code, 503)
        tick.assert_not_called()
