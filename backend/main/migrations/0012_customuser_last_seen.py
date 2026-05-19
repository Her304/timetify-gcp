from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('main', '0011_snap_snapaudience'),
    ]

    operations = [
        migrations.AddField(
            model_name='customuser',
            name='last_seen',
            field=models.DateTimeField(blank=True, db_index=True, null=True),
        ),
    ]
