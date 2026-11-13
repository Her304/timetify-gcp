"""Housekeeping done by the moderation cron tick.

`BackendLog` is the one table nothing else trims, and on Neon's free plan the
storage cap blocks every write once crossed, so the retention boundary is worth
pinning: old rows go, recent rows stay.
"""

from datetime import timedelta

from django.test import TestCase
from django.utils import timezone

from main.models import BackendLog
from main.moderation_pipeline import BACKEND_LOG_RETENTION_DAYS, purge_backend_logs


class BackendLogRetentionTests(TestCase):
    def _log(self, age_days):
        row = BackendLog.objects.create(level="INFO", message=f"{age_days}d old")
        # `timestamp` is auto_now_add, so it can only be backdated with update().
        BackendLog.objects.filter(pk=row.pk).update(
            timestamp=timezone.now() - timedelta(days=age_days)
        )
        return row

    def test_purges_only_rows_past_retention(self):
        old = self._log(BACKEND_LOG_RETENTION_DAYS + 1)
        recent = self._log(BACKEND_LOG_RETENTION_DAYS - 1)

        self.assertEqual(purge_backend_logs(), 1)
        self.assertFalse(BackendLog.objects.filter(pk=old.pk).exists())
        self.assertTrue(BackendLog.objects.filter(pk=recent.pk).exists())
