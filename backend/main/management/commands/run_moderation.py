from django.core.management.base import BaseCommand

from main.moderation_pipeline import run_moderation_tick


class Command(BaseCommand):
    help = "Run one moderation tick — process pending/appeal reports, expire snaps and restrictions."

    def handle(self, *args, **options):
        summary = run_moderation_tick()
        for k, v in summary.items():
            self.stdout.write(f"{k}: {v}")
