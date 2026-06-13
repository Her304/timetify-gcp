from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("main", "0023_event_allow_join_requests"),
    ]

    operations = [
        migrations.AlterField(
            model_name="eventinvite",
            name="status",
            field=models.CharField(
                choices=[
                    ("PENDING", "Pending"),
                    ("ACCEPTED", "Accepted"),
                    ("DECLINED", "Declined"),
                    ("REQUESTED", "Requested"),
                ],
                default="PENDING",
                max_length=9,
            ),
        ),
    ]
