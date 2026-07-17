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


def send_username_change_notification(user, old_username: str) -> bool:
    """Heads-up email sent to the account's confirmed address after a username
    change. Deliberately sent to `user.email` (not derived from the request) so
    that if a session is hijacked and the account is renamed, the real owner
    still gets the alert and a reset-password nudge."""
    if not user.email:
        return False
    try:
        reset_url = f"{settings.FRONTEND_URL.rstrip('/')}/password_reset/"
        context = {
            'old_username': old_username,
            'new_username': user.username,
            'reset_url': reset_url,
            'frontend_url': settings.FRONTEND_URL,
        }
        html_body = render_to_string('emails/username_changed.html', context)
        text_body = (
            f"Hey {old_username},\n\n"
            f"The username on your Timetify account was just changed from "
            f"{old_username} to {user.username}. If that was you, you're all "
            f"set.\n\n"
            f"Didn't change this? Someone may have access to your account. "
            f"Reset your password right away:\n\n{reset_url}\n\n"
            f"— Timetify"
        )
        send_mail(
            subject="Your Timetify username was changed",
            message=text_body,
            from_email=_from_email(),
            recipient_list=[user.email],
            fail_silently=False,
            html_message=html_body,
        )
        return True
    except Exception:
        logger.exception("username-change notification send failed: user_id=%s", user.id)
        return False


def send_email_change_verification(user, new_email: str, verify_url: str) -> bool:
    """Send the 'confirm your new email' link to the *new* address. Deliberately
    sent to `new_email`, not `user.email`, so the change only completes if the
    user actually controls the new inbox."""
    if not new_email:
        return False
    try:
        context = {
            'username': user.username,
            'new_email': new_email,
            'verify_url': verify_url,
            'frontend_url': settings.FRONTEND_URL,
        }
        html_body = render_to_string('emails/email_change_verification.html', context)
        text_body = (
            f"Hey {user.username},\n\n"
            f"Confirm you want to use {new_email} as your Timetify email by "
            f"opening this link:\n\n{verify_url}\n\n"
            f"The link expires in 24 hours. If you didn't request this, you can "
            f"ignore this email — your address won't change.\n\n"
            f"— Timetify"
        )
        send_mail(
            subject="Confirm your new Timetify email",
            message=text_body,
            from_email=_from_email(),
            recipient_list=[new_email],
            fail_silently=False,
            html_message=html_body,
        )
        return True
    except Exception:
        logger.exception("email-change verification send failed: user_id=%s", user.id)
        return False
