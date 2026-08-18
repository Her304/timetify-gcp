"""Case-insensitive uniqueness for username and email.

RegisterSerializer.validate_username/validate_email check this in Python, but
two concurrent sign-ups can both pass validation before either commits. Only a
database constraint closes that window, and it also protects the paths that do
not go through the serializer at all (createsuperuser, shell, data imports).

If this migration fails with a uniqueness error, colliding rows already exist:
run `python manage.py find_identity_collisions` to list them, rename or merge
the accounts, then re-run migrate.
"""

from django.db import migrations, models
from django.db.models.functions import Lower


class Migration(migrations.Migration):

    dependencies = [
        ('main', '0033_oauthclient_oauthauthorizationcode_oauthaccesstoken'),
    ]

    operations = [
        migrations.AddConstraint(
            model_name='customuser',
            constraint=models.UniqueConstraint(
                Lower('username'),
                name='customuser_username_ci_unique',
                violation_error_message='that username is already taken.',
            ),
        ),
        migrations.AddConstraint(
            model_name='customuser',
            constraint=models.UniqueConstraint(
                Lower('email'),
                name='customuser_email_ci_unique',
                violation_error_message='an account with this email already exists.',
            ),
        ),
    ]
