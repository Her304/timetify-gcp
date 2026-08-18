"""Report accounts whose username or email differs only by letter case.

Run this BEFORE applying migration 0034, which adds case-insensitive unique
constraints on both columns. The migration cannot be applied while colliding
rows exist, and this command is the only way to see what would block it.

    python manage.py find_identity_collisions

Exits 1 when collisions are found so it can gate a deploy step.
"""

import logging

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db.models import Count
from django.db.models.functions import Lower

logger = logging.getLogger(__name__)
User = get_user_model()


class Command(BaseCommand):
    help = "Find users whose username or email collides case-insensitively."

    def _collisions(self, field):
        """The lowercased values of `field` shared by more than one account."""
        return (
            User.objects
            .annotate(folded=Lower(field))
            .values('folded')
            .annotate(n=Count('id'))
            .filter(n__gt=1)
            .order_by('folded')
        )

    def handle(self, *args, **options):
        found = 0

        for field in ('username', 'email'):
            rows = list(self._collisions(field))
            if not rows:
                self.stdout.write(self.style.SUCCESS(f"No {field} collisions."))
                continue

            found += len(rows)
            self.stdout.write(self.style.ERROR(f"\n{len(rows)} colliding {field}(s):"))
            for row in rows:
                # Oldest first: login resolves username__iexact to the lowest pk,
                # so the first account listed is the one currently winning.
                clash = (User.objects
                         .annotate(folded=Lower(field))
                         .filter(folded=row['folded'])
                         .order_by('pk')
                         .values_list('pk', 'username', 'email', 'date_joined'))
                self.stdout.write(f"  {field}={row['folded']!r}")
                for pk, username, email, joined in clash:
                    self.stdout.write(
                        f"    pk={pk} username={username!r} email={email!r} joined={joined:%Y-%m-%d}"
                    )

        if found:
            self.stdout.write(self.style.ERROR(
                f"\n{found} collision group(s). Rename or merge these accounts before "
                f"running migrate, or 0034 will fail to apply."
            ))
            raise SystemExit(1)

        self.stdout.write(self.style.SUCCESS("\nSafe to apply migration 0034."))
