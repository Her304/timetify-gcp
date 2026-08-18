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

Deploy requirement: the runtime service account needs
`roles/iam.serviceAccountTokenCreator` ON ITSELF.

    gcloud iam service-accounts add-iam-policy-binding "$SA_EMAIL" \
        --member="serviceAccount:$SA_EMAIL" \
        --role="roles/iam.serviceAccountTokenCreator"

If signing is unavailable, `url()` falls back to the unsigned public URL rather
than raising, so a misconfigured deploy degrades to the old behaviour (working
but public) instead of an outage. That fallback is logged at ERROR — if it
appears in production, the bucket is still effectively world-readable and the
IAM binding above is missing.
"""

import logging

from django.core.exceptions import ImproperlyConfigured
from storages.backends.gcloud import GoogleCloudStorage, clean_name

logger = logging.getLogger(__name__)


class SignedGoogleCloudStorage(GoogleCloudStorage):
    """GoogleCloudStorage that can sign without a local private key."""

    # Cached across calls: resolving the service-account email hits the metadata
    # server, and refreshing credentials is not free either.
    _signer_email = None
    _signer_checked = False

    def _iam_signing_kwargs(self):
        """`service_account_email` + `access_token` for IAM-based signing.

        Returns {} when the credentials already hold a private key (local dev
        with a key file — google-cloud-storage signs those directly), or when
        no service-account identity can be determined.
        """
        credentials = self.client._credentials

        # A credential exposing `signer_email` AND a real private key can sign
        # locally; handing it IAM parameters would be redundant.
        if hasattr(credentials, 'signer') and getattr(credentials, '_private_key', None):
            return {}

        if not self._signer_checked:
            type(self)._signer_checked = True
            email = getattr(credentials, 'service_account_email', None)
            # Compute-engine credentials expose the email but only populate it
            # after a refresh against the metadata server.
            if email in (None, 'default'):
                try:
                    from google.auth.transport.requests import Request

                    credentials.refresh(Request())
                    email = getattr(credentials, 'service_account_email', None)
                except Exception:
                    logger.exception("gcs.signer_email_lookup_failed")
                    email = None
            type(self)._signer_email = None if email == 'default' else email

        if not self._signer_email:
            return {}

        token = getattr(credentials, 'token', None)
        if not token:
            try:
                from google.auth.transport.requests import Request

                credentials.refresh(Request())
                token = getattr(credentials, 'token', None)
            except Exception:
                logger.exception("gcs.token_refresh_failed")
                return {}

        if not token:
            return {}
        return {'service_account_email': self._signer_email, 'access_token': token}

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
            logger.error(
                "gcs.signing_failed name=%s — serving UNSIGNED public URL. "
                "Grant roles/iam.serviceAccountTokenCreator to the runtime "
                "service account on itself.",
                name, exc_info=True,
            )
            return blob.public_url
