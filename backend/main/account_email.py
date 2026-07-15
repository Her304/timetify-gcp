"""Account lifecycle transactional emails (welcome, etc.), Resend-backed via
Anymail like moderation_email.py. Best-effort — failures are logged but never
block the calling request.
"""

from __future__ import annotations

import logging

from django.conf import settings
from django.core.mail import send_mail
from django.template.loader import render_to_string

logger = logging.getLogger(__name__)


def _from_email() -> str:
    return getattr(settings, 'WELCOME_FROM_EMAIL', None) or getattr(
        settings, 'DEFAULT_FROM_EMAIL', 'noreply@timetify.net',
    )


def send_welcome_email(user) -> bool:
    if not user.email:
        return False
    try:
        context = {'username': user.username, 'frontend_url': settings.FRONTEND_URL}
        html_body = render_to_string('emails/welcome.html', context)
        text_body = (
            f"Hey {user.username}, you're in!\n\n"
            f"Timetify's ready to go. Add your courses, see who's free, and "
            f"stop the group chat archaeology every time someone wants to "
            f"hang out.\n\n"
            f"Open Timetify: {settings.FRONTEND_URL}\n\n"
            f"Questions or feedback? Just reply to this email.\n\n"
            f"— Timetify"
        )
        send_mail(
            subject="Welcome to Timetify 🎉",
            message=text_body,
            from_email=_from_email(),
            recipient_list=[user.email],
            fail_silently=False,
            html_message=html_body,
        )
        return True
    except Exception:
        logger.exception("welcome email send failed: user_id=%s", user.id)
        return False
