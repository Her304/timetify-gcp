import os
from django.conf import settings
from django.core.mail import send_mail
from django.db.models import Q
import logging

class DatabaseLogHandler(logging.Handler):
    def emit(self, record):
        try:
            from .models import BackendLog
            user = getattr(record, 'user', None)
            message = self.format(record)
            BackendLog.objects.create(
                user=user if user and user.is_authenticated else None,
                level=record.levelname,
                message=message
            )
        except Exception:
            pass

def canonical_username(raw):
    """The stored-case username matching `raw`, or `raw` unchanged if none does.

    Usernames are case-insensitive throughout the app: sign-up and the profile
    editor both enforce uniqueness with `username__iexact`, so "JaeHyun" and
    "jaehyun" can never both exist. A case-sensitive lookup therefore buys
    nothing and only produces silent misses, which is why every username entry
    point should route through here.

    Falls back to the input rather than None so callers can hand the result
    straight to `authenticate()` and still get the ordinary failure.
    """
    # Lazy, like DatabaseLogHandler above: settings' LOGGING imports this module
    # before the app registry is ready, so no model may be imported at module
    # scope.
    from django.contrib.auth import get_user_model

    if not raw:
        return raw
    match = (get_user_model().objects
             .filter(username__iexact=str(raw))
             .values_list('username', flat=True)
             .first())
    return match if match is not None else raw


def users_by_username(raw_names):
    """Users whose usernames case-insensitively match any of `raw_names`.

    Django has no `__iin`, so the `iexact` terms are OR'd together. Note the
    empty-input guard: an empty `Q()` matches *every* row, so short-circuiting
    is what keeps a caller that passes no names from selecting the whole table.
    """
    from django.contrib.auth import get_user_model

    names = [str(n) for n in (raw_names or []) if str(n).strip()]
    if not names:
        return get_user_model().objects.none()
    q = Q()
    for name in names:
        q |= Q(username__iexact=name)
    return get_user_model().objects.filter(q)


def send_email(to_email, subject, message):
    """Send email using configured backend"""
    try:
        send_mail(
            subject=subject,
            message=message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[to_email],
            fail_silently=False,
        )
        return True
    except Exception as e:
        print(f"Email error: {e}")
        return False