from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("main", "0026_event_card_message_type"),
    ]

    operations = [
        migrations.AddField(
            model_name="customuser",
            name="accepted_terms",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="customuser",
            name="marketing_opt_in",
            field=models.BooleanField(default=False),
        ),
    ]
