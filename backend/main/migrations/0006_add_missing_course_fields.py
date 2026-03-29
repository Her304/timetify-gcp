from django.db import migrations, models
import datetime

class Migration(migrations.Migration):
    dependencies = [
        ('main', '0005_remove_course_classroom_remove_course_end_date_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='course',
            name='classroom',
            field=models.CharField(default='TBD', max_length=100),
        ),
        migrations.AddField(
            model_name='course',
            name='rep_date',
            field=models.CharField(default='Monday', max_length=100),
        ),
        migrations.AddField(
            model_name='course',
            name='start_time',
            field=models.TimeField(default=datetime.time(9, 0, 0)),
        ),
        migrations.AddField(
            model_name='course',
            name='end_time',
            field=models.TimeField(default=datetime.time(17, 0, 0)),
        ),
        migrations.AddField(
            model_name='course',
            name='start_date',
            field=models.DateField(default=datetime.date(2026, 1, 1)),
        ),
        migrations.AddField(
            model_name='course',
            name='end_date',
            field=models.DateField(default=datetime.date(2026, 12, 31)),
        ),
    ]