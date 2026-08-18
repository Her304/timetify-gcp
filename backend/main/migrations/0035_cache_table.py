"""Create the database cache table backing rate limiting.

settings.CACHES falls back to DatabaseCache when REDIS_URL is unset, and DRF's
throttles store their counters there. Normally this table is created by
`manage.py createcachetable`, but that is a manual step easy to forget on a new
environment — and if it is missed, every throttled request raises instead of
being limited. Doing it as a migration ties it to the deploy.

The schema is exactly what createcachetable generates.
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('main', '0034_case_insensitive_identity'),
    ]

    operations = [
        migrations.RunSQL(
            sql="""
                CREATE TABLE IF NOT EXISTS "main_cache_table" (
                    "cache_key" varchar(255) NOT NULL PRIMARY KEY,
                    "value" text NOT NULL,
                    "expires" timestamp with time zone NOT NULL
                );
                CREATE INDEX IF NOT EXISTS "main_cache_table_expires"
                    ON "main_cache_table" ("expires");
            """,
            reverse_sql='DROP TABLE IF EXISTS "main_cache_table";',
        ),
    ]
