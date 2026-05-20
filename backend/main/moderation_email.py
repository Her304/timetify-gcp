"""Resend-backed transactional emails for the moderation pipeline.

All sends go through Django's `send_mail`, which is wired to Anymail's Resend
backend in settings (`EMAIL_BACKEND='anymail.backends.resend.EmailBackend'`).
Failures are logged but don't raise — emails are best-effort; the database
state of the Report row is authoritative.

`MODERATION_FROM_EMAIL` overrides the global `DEFAULT_FROM_EMAIL` so prod
can use `report@timetify.net` while dev keeps `onboarding@resend.dev`.
"""

from __future__ import annotations

import logging

from django.conf import settings
from django.core.mail import send_mail

logger = logging.getLogger(__name__)


def _from_email() -> str:
    return getattr(settings, 'MODERATION_FROM_EMAIL', None) or getattr(
        settings, 'DEFAULT_FROM_EMAIL', 'noreply@timetify.net',
    )


def _send(to_email: str, subject: str, body: str) -> bool:
    if not to_email:
        return False
    try:
        send_mail(
            subject=subject,
            message=body,
            from_email=_from_email(),
            recipient_list=[to_email],
            fail_silently=False,
        )
        return True
    except Exception:
        logger.exception("moderation email send failed: to=%s subject=%s", to_email, subject)
        return False


def _content_label(report) -> str:
    return 'snap' if report.content_type == 'snap' else 'message'


# --- v1 emails ---------------------------------------------------------------
def email_v1_to_reporter(report, v1):
    subject = "Your report has been reviewed by AI"
    body = (
        f"Hi @{report.reporter.username},\n\n"
        f"You filed a report about a {_content_label(report)} on Timetify. "
        f"Our automated moderator has finished reviewing it.\n\n"
        f"--- AI assessment ---\n"
        f"{v1.report_document}\n\n"
        f"Recommended action: {v1.recommended_action}\n\n"
        f"If we end up removing the content, you'll get a follow-up email. "
        f"The person you reported has a 7-day window to file an appeal — "
        f"once that window closes (or their appeal is resolved), the case is "
        f"finalized.\n\n"
        f"— Timetify Moderation"
    )
    return _send(report.reporter.email, subject, body)


def email_v1_to_reported(report, v1):
    subject = "Content you posted has been reported"
    deadline = report.appeal_deadline.strftime('%Y-%m-%d %H:%M UTC') if report.appeal_deadline else 'soon'
    body = (
        f"Hi @{report.reported_user.username},\n\n"
        f"A {_content_label(report)} you posted on Timetify has been reported "
        f"by another user. Here is our automated moderator's assessment:\n\n"
        f"--- AI assessment ---\n"
        f"{v1.report_document}\n\n"
        f"Recommended action: {v1.recommended_action}\n\n"
        f"If you disagree with this assessment, you can file an appeal in the "
        f"app before {deadline}. If you don't appeal and the AI recommended "
        f"removal, the content will stay published unless an admin acts; if "
        f"you do appeal, a second independent analysis will be run and the "
        f"outcome decided on the spot.\n\n"
        f"— Timetify Moderation"
    )
    return _send(report.reported_user.email, subject, body)


# --- Terminal emails ---------------------------------------------------------
def email_enforcement(report, restriction):
    subject = "Content removed — moderation outcome"
    expires_at = (
        restriction.expires_at.strftime('%Y-%m-%d %H:%M UTC')
        if restriction.expires_at else 'permanently'
    )
    rkind = restriction.restriction_type.replace('_', ' ')
    reporter_body = (
        f"Hi @{report.reporter.username},\n\n"
        f"The {_content_label(report)} you reported has been removed after "
        f"our review process. Thanks for helping keep Timetify a safe space.\n\n"
        f"— Timetify Moderation"
    )
    reported_body = (
        f"Hi @{report.reported_user.username},\n\n"
        f"After review, the {_content_label(report)} you posted has been "
        f"removed for violating our community guidelines.\n\n"
        f"As a result, your {rkind} privileges are restricted until "
        f"{expires_at}. This is your offense #{restriction.offense_count}.\n\n"
        f"Repeated violations lead to longer restrictions and, eventually, "
        f"permanent loss of access. Please review the community guidelines "
        f"before continuing to post.\n\n"
        f"— Timetify Moderation"
    )
    _send(report.reporter.email, subject, reporter_body)
    _send(report.reported_user.email, subject, reported_body)


def email_appeal_upheld_to_reporter(report):
    subject = "Report outcome — no violation found"
    body = (
        f"Hi @{report.reporter.username},\n\n"
        f"The {_content_label(report)} you reported has been reviewed "
        f"multiple times and our moderation system concluded that it does "
        f"not violate the community guidelines. No action will be taken.\n\n"
        f"To prevent any further friction, you and the other user have been "
        f"mutually blocked from interacting on Timetify. You can lift this "
        f"block from your profile settings at any time.\n\n"
        f"— Timetify Moderation"
    )
    return _send(report.reporter.email, subject, body)


def email_appeal_upheld_to_reported(report):
    subject = "Your appeal was successful"
    body = (
        f"Hi @{report.reported_user.username},\n\n"
        f"Your appeal was successful — after independent review, the "
        f"reported {_content_label(report)} was found not to violate our "
        f"community guidelines. No action will be taken against your account.\n\n"
        f"To prevent any further friction, you and the reporter have been "
        f"mutually blocked from interacting on Timetify. You can lift this "
        f"block from your profile settings at any time.\n\n"
        f"— Timetify Moderation"
    )
    return _send(report.reported_user.email, subject, body)


def email_warn_to_reported(report):
    subject = "Community guidelines reminder"
    body = (
        f"Hi @{report.reported_user.username},\n\n"
        f"After review, the {_content_label(report)} you posted was flagged "
        f"as a minor concern. No content has been removed and no restriction "
        f"has been applied, but we'd encourage you to take a moment to "
        f"review our community guidelines.\n\n"
        f"— Timetify Moderation"
    )
    return _send(report.reported_user.email, subject, body)


def email_admin_repeat_offender(user, offense_count):
    admin_to = getattr(settings, 'MODERATION_ADMIN_EMAIL', None) or _from_email()
    subject = f"Repeat offender flagged: @{user.username}"
    body = (
        f"User @{user.username} (id={user.id}, email={user.email}) has "
        f"reached offense #{offense_count}.\n\n"
        f"Review their full history in the admin dashboard and decide "
        f"whether a manual permanent restriction is warranted.\n"
    )
    return _send(admin_to, subject, body)


def email_admin_action(report, removed: bool):
    subject = "Human review outcome"
    action = "removed by an admin" if removed else "dismissed by an admin"
    body_template = (
        f"After human review, the {_content_label(report)} in your report "
        f"has been {action}.\n\n"
        f"— Timetify Moderation"
    )
    _send(
        report.reporter.email,
        subject,
        f"Hi @{report.reporter.username},\n\n{body_template}",
    )
    _send(
        report.reported_user.email,
        subject,
        f"Hi @{report.reported_user.username},\n\n{body_template}",
    )
