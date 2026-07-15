from django.db import migrations, models


def mark_existing_users_onboarded(apps, schema_editor):
    # Existing accounts predate the tour, so don't ambush them with it on next
    # login — only genuinely new sign-ups should start at False.
    CustomUser = apps.get_model("main", "CustomUser")
    CustomUser.objects.update(onboarding_completed=True)


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ("main", "0027_customuser_accepted_terms_marketing_opt_in"),
    ]

    operations = [
        migrations.AddField(
            model_name="customuser",
            name="onboarding_completed",
            field=models.BooleanField(default=False),
        ),
        migrations.RunPython(mark_existing_users_onboarded, noop),
    ]
