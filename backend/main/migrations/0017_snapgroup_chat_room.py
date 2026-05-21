from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('main', '0016_message_replied_snap'),
    ]

    operations = [
        migrations.AddField(
            model_name='snapgroup',
            name='chat_room',
            field=models.OneToOneField(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='snap_group',
                to='main.chatroom',
            ),
        ),
    ]
