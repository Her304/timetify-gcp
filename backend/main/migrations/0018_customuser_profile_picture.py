from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('main', '0017_snapgroup_chat_room'),
    ]

    operations = [
        migrations.AddField(
            model_name='customuser',
            name='profile_picture',
            field=models.ImageField(blank=True, null=True, upload_to='profile_pictures/'),
        ),
    ]
