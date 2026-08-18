"""Signed-URL storage backend for user media.

Why this exists rather than just setting GS_QUERYSTRING_AUTH=True:

django-storages (1.14.x, the newest released line) signs by calling
`blob.generate_signed_url()` with whatever credentials the client holds. That
works only when those credentials carry a private key — i.e. a service-account
JSON file. On Cloud Run the credentials come from the metadata server and hold
just a bearer token, so the call raises

    AttributeError: you need a private key to sign credentials

and every avatar, snap and syllabus URL 500s. The usual workaround is to mount
a service-account key, which trades a public bucket for a long-lived private
key sitting in the environment — not obviously a win.

google-cloud-storage supports a third option: pass `service_account_email` plus
`access_token` and it signs through the IAM `signBlob` API instead of locally.
No key material anywhere, and the permission is grantable to exactly one
identity. That is what this backend does.

The subtlety, learned the hard way in production: the access token handed to
signBlob must be scoped for `cloud-platform`. Reusing the storage client's own
credentials looks natural and fails with

    403 ACCESS_TOKEN_SCOPE_INSUFFICIENT ... IAMCredentials.SignBlob

because google-cloud-storage scopes those to `devstorage.read_write`. The IAM
binding being correct makes this especially confusing to diagnose. Hence the
separate, explicitly scoped credentials in `_get_signing_credentials`.

Deploy requirement: the runtime service account needs
`roles/iam.serviceAccountTokenCreator` ON ITSELF.

    gcloud iam service-accounts add-iam-policy-binding "$SA_EMAIL" \
        --member="serviceAccount:$SA_EMAIL" \
        --role="roles/iam.serviceAccountTokenCreator"

If signing is unavailable, `url()` falls back to the unsigned public URL rather
than raising. Do not read that as a safety net: it only produces a *working*
URL while the bucket is still world-readable, and the whole point of this
backend is that it is not. Once the bucket is private the fallback 403s, so a
signing regression surfaces as every avatar, snap and syllabus breaking at
once. Either way `gcs.signing_failed` at ERROR means the same thing — media is
being served unsigned — and the cause is whatever the logged exception says,
not necessarily the IAM binding above.
"""

import logging

from django.core.exceptions import ImproperlyConfigured
from storages.backends.gcloud import GoogleCloudStorage, clean_name

logger = logging.getLogger(__name__)


# Signing through IAM needs a token scoped for iamcredentials.googleapis.com.
# The storage client's own credentials are NOT usable: google-cloud-storage
# scopes them to devstorage.read_write, and signBlob rejects such a token with
# 403 ACCESS_TOKEN_SCOPE_INSUFFICIENT even when the IAM binding is correct.
_SIGNING_SCOPES = ['https://www.googleapis.com/auth/cloud-platform']


class SignedGoogleCloudStorage(GoogleCloudStorage):
    """GoogleCloudStorage that can sign without a local private key."""

    # Credentials are cached on the class, not fetched per URL: a single feed
    # render can ask for dozens of URLs, and each uncached refresh is a round
    # trip to the metadata server. google-auth tracks expiry, so `valid` tells
    # us when a refresh is actually due.
    _signing_credentials = None

    @classmethod
    def _get_signing_credentials(cls):
        """Cloud-platform-scoped credentials, refreshed only when stale."""
        from google.auth.transport.requests import Request

        if cls._signing_credentials is None:
            import google.auth

            creds, _ = google.auth.default(scopes=_SIGNING_SCOPES)
            cls._signing_credentials = creds

        creds = cls._signing_credentials
        if not creds.valid:
            creds.refresh(Request())
        return creds

    def _iam_signing_kwargs(self):
        """`service_account_email` + `access_token` for IAM-based signing.

        Returns {} when the credentials already hold a private key (local dev
        with a key file — google-cloud-storage signs those directly), or when
        no service-account identity can be determined.
        """
        # A credential exposing a real private key can sign locally; handing it
        # IAM parameters would be redundant. Checked against the storage
        # client's credentials because that is what would do the signing.
        client_credentials = self.client._credentials
        if getattr(client_credentials, '_private_key', None):
            return {}

        try:
            creds = self._get_signing_credentials()
        except Exception:
            logger.exception("gcs.signing_credentials_failed")
            return {}

        email = getattr(creds, 'service_account_email', None)
        # Compute-engine credentials report the literal string 'default' until
        # refreshed against the metadata server.
        if email in (None, 'default'):
            logger.error(
                "gcs.signer_email_unavailable — credentials of type %s expose no "
                "service_account_email, so IAM signing cannot be attempted.",
                type(creds).__name__,
            )
            return {}

        if not creds.token:
            return {}
        return {'service_account_email': email, 'access_token': creds.token}

    def url(self, name, parameters=None):
        """Signed URL for the blob, falling back to the public URL on failure.

        Mirrors the parent implementation but injects IAM signing parameters.
        """
        name = self._normalize_name(clean_name(name))
        blob = self.bucket.blob(name)
        blob_params = self.get_object_parameters(name)
        no_signed_url = (
            blob_params.get("acl", self.default_acl) == "publicRead"
            or not self.querystring_auth
        )

        if no_signed_url:
            # Signing explicitly disabled — defer entirely to the parent so the
            # custom_endpoint handling stays in one place.
            return super().url(name, parameters=parameters)

        params = dict(parameters or {})
        for key, value in (
            ("bucket_bound_hostname", self.custom_endpoint),
            ("expiration", self.expiration),
            ("version", "v4"),
        ):
            if value and key not in params:
                params[key] = value
        params.update(self._iam_signing_kwargs())

        try:
            return blob.generate_signed_url(**params)
        except Exception:
            # Never let a signing problem turn into a broken page — but make it
            # extremely visible, because the fallback URL is only reachable
            # while the bucket is still public.
            # Read the exception before acting on this. The first production
            # occurrence was diagnosed as a missing IAM binding for hours
            # because an earlier version of this message asserted that cause;
            # the binding was correct and the token scope was wrong.
            logger.error(
                "gcs.signing_failed name=%s — serving UNSIGNED media URL, "
                "which only resolves while the bucket is public. Cause is in "
                "the traceback: ACCESS_TOKEN_SCOPE_INSUFFICIENT means the "
                "signing credentials are not cloud-platform scoped; "
                "PERMISSION_DENIED on signBlob means the runtime service "
                "account lacks roles/iam.serviceAccountTokenCreator on "
                "itself; 'you need a private key' means no IAM signing "
                "parameters were passed at all.",
                name, exc_info=True,
            )
            return blob.public_url
