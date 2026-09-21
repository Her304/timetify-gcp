"""Settings for the test suite and CI — no external services.

Inherits everything from ``backend.settings``, then swaps the database for
in-memory SQLite and the email backend for locmem so tests never touch the
production Cloud SQL instance or send real email through Resend.

Run with::

    DEBUG=True BACK_SENTRY_DSN= python manage.py test main.tests \\
        --settings=backend.test_settings

``BACK_SENTRY_DSN=`` (empty) is important: settings.py initialises Sentry at
import time, and an empty DSN disables the client, so test failures can never
page production.
"""

from .settings import *  # noqa: F401,F403

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": ":memory:",
    }
}

# Transactional email must never leave the process during a test run.
EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"
