from django import forms
from django.conf import settings
from django.contrib.auth.forms import PasswordResetForm
from django.contrib.auth import get_user_model

User = get_user_model()

class CustomPasswordResetForm(PasswordResetForm):
    def clean_email(self):
        email = self.cleaned_data.get('email')
        if not User.objects.filter(email=email).exists():
            raise forms.ValidationError("There is no user registered with this email address.")
        return email

    def save(self, **kwargs):
        # Force the canonical public domain in prod so the emailed link never
        # leaks whichever Cloud Run hostname (the ugly *.run.app one vs. the
        # timetify.net alias) the request happened to arrive on. Left alone in
        # local dev so links keep pointing at localhost.
        if not settings.DEBUG:
            kwargs['domain_override'] = settings.CANONICAL_DOMAIN
            kwargs['use_https'] = True
        return super().save(**kwargs)
