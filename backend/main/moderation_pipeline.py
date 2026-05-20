"""AI moderation pipeline.

Two surfaces drive the same logic:
  * `python manage.py run_moderation` (called by Cloud Scheduler via the
    management command path) — see `management/commands/run_moderation.py`.
  * `POST /api/admin/run-moderation/` (secret-header auth, also called by
    Cloud Scheduler if the cron is configured to hit HTTP rather than shell
    into a job) — see `AdminRunModerationView` in views.py.

Both call `run_moderation_tick()` below. Admin overrides
(`AdminReportActView`) call `admin_remove` / `admin_dismiss`.

The pipeline operates on `Report` rows in their current `status`:

  - `pending`         → generate AI report v1, set appeal_deadline, email both
                       parties, advance to `ai_reported`.
  - `ai_reported`     → if `appeal_deadline` has passed with no Appeal, leave
                       in place (no automated action; admins can still act).
  - `appeal_pending`  → generate AI report v2, run similarity vs v1, route to
                       `enforce()` or to a v3 tiebreaker, advance to
                       `appeal_analyzed` (intermediate) or terminal.
  - `third_loop`      → guarded retry path if a previous tick crashed mid-v3.

`enforce()` is the only routine that mutates content + applies a
`FunctionRestriction`. `appeal_upheld()` creates mutual `UserBlock` rows.
`warn` is logged + emails the reported user only.
"""

from __future__ import annotations

import io
import json
import logging
import math
import os
from base64 import b64encode
from datetime import timedelta
from typing import Optional

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from .models import (
    Report, AiReport, Appeal, SimilarityCheck,
    FunctionRestriction, UserBlock,
    Snap, Message,
)
from .moderation_email import (
    email_v1_to_reporter, email_v1_to_reported,
    email_enforcement, email_appeal_upheld_to_reporter,
    email_appeal_upheld_to_reported, email_warn_to_reported,
    email_admin_repeat_offender, email_admin_action,
)

logger = logging.getLogger(__name__)

# Tunables ---------------------------------------------------------------------
APPEAL_WINDOW_DAYS = 7
SIMILARITY_THRESHOLD = 0.60
RESTRICTION_DURATIONS_DAYS = {1: 3, 2: 7, 3: 30}  # 4th+ → permanent

GPT_MODEL = 'gpt-4o-mini'
EMBED_MODEL = 'text-embedding-3-small'


# --- OpenAI client ------------------------------------------------------------
def _openai_client():
    """Build a fresh OpenAI client — matches the construction pattern in
    main/pdf.py. Reads OPENAI_API_KEY from the environment."""
    from openai import OpenAI
    return OpenAI()


# --- Content extraction -------------------------------------------------------
def _extract_video_first_frame_bytes(file_field) -> Optional[bytes]:
    """Decode a single frame from a video FileField. Falls back to None if
    ffmpeg / Pillow isn't able to read it; the AI call will still run on the
    `template_reasons` + `free_text` alone."""
    try:
        import cv2  # opencv-python is in requirements via course-outline parsing
    except Exception:
        logger.warning("opencv not available; cannot extract video frame")
        return None
    try:
        # Stream the file to a temp path so cv2 can seek.
        import tempfile
        suffix = os.path.splitext(getattr(file_field, 'name', '') or '')[1] or '.mp4'
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            for chunk in file_field.chunks():
                tmp.write(chunk)
            tmp_path = tmp.name
        cap = cv2.VideoCapture(tmp_path)
        try:
            ok, frame = cap.read()
            if not ok or frame is None:
                return None
            ok, buf = cv2.imencode('.jpg', frame)
            if not ok:
                return None
            return buf.tobytes()
        finally:
            cap.release()
            try:
                os.unlink(tmp_path)
            except Exception:
                pass
    except Exception:
        logger.exception("video frame extraction failed")
        return None


def extract_content(report: Report) -> dict:
    """Return a dict the GPT call understands:
       { 'kind': 'photo'|'video'|'text',
         'mime': 'image/jpeg'|... (None for text),
         'image_b64': str|None,
         'text': str|None,
         'caption': str|None }
    """
    if report.content_type == Report.CONTENT_SNAP:
        snap = report.snap
        if not snap:
            return {'kind': 'text', 'text': '[snap deleted]', 'image_b64': None, 'mime': None, 'caption': None}
        if snap.media_type == Snap.MEDIA_PHOTO:
            try:
                snap.media_file.open('rb')
                data = snap.media_file.read()
                snap.media_file.close()
            except Exception:
                logger.exception("snap photo fetch failed")
                data = None
            if not data:
                return {'kind': 'text', 'text': '[snap photo unreadable]', 'image_b64': None, 'mime': None, 'caption': snap.caption}
            return {
                'kind': 'photo',
                'mime': 'image/jpeg',
                'image_b64': b64encode(data).decode('ascii'),
                'text': None,
                'caption': snap.caption or None,
            }
        # video
        try:
            snap.media_file.open('rb')
            frame = _extract_video_first_frame_bytes(snap.media_file)
            snap.media_file.close()
        except Exception:
            frame = None
        if not frame:
            return {'kind': 'text', 'text': '[video frame unavailable]', 'image_b64': None, 'mime': None, 'caption': snap.caption}
        return {
            'kind': 'video',
            'mime': 'image/jpeg',
            'image_b64': b64encode(frame).decode('ascii'),
            'text': None,
            'caption': snap.caption or None,
        }

    # chat_message
    msg = report.chat_message
    if not msg:
        return {'kind': 'text', 'text': '[message deleted]', 'image_b64': None, 'mime': None, 'caption': None}
    return {
        'kind': 'text',
        'mime': None,
        'image_b64': None,
        # The DB row keeps content even when is_removed=True; the AI must see
        # the original to decide.
        'text': msg.content or '',
        'caption': None,
    }


# --- GPT call -----------------------------------------------------------------
_PROMPT_BASE = (
    "You are a content moderation system for Timetify, a university "
    "schedule-sharing app.\n\n"
    "The following content was reported by another user.\n"
    "Reported reasons: {reasons}\n"
    "Reporter's additional notes: {free_text}\n\n"
    "Analyze this content objectively. Generate a JSON response with this "
    "exact shape:\n"
    "{{\n"
    '  "report_document": "2-3 paragraph neutral assessment written for both '
    'the reporter and the person being reported to read. Explain what was '
    'found and whether it appears to violate community guidelines.",\n'
    '  "violation_likelihood": <float 0.0-1.0>,\n'
    '  "violation_categories": {{"harassment": <float>, "spam": <float>, '
    '"inappropriate": <float>, "threats": <float>, "hate_speech": <float>}},\n'
    '  "recommended_action": "remove" | "warn" | "dismiss",\n'
    '  "reasoning": "one sentence internal justification (not shown to users)"\n'
    "}}\n\n"
    "Be objective. Do not assume guilt. This report will be sent to both parties."
)

_PROMPT_V3_SUFFIX = (
    "\n\nThis is an independent tiebreaker analysis. Ignore any prior "
    "assessments. Evaluate the raw content solely on its own merits."
)


def _build_user_content(content: dict, version: int, report: Report) -> list:
    reasons = ', '.join(report.template_reasons or []) or 'none'
    free_text = (report.free_text or '').strip() or 'none'
    prompt = _PROMPT_BASE.format(reasons=reasons, free_text=free_text)
    if version == 3:
        prompt = prompt + _PROMPT_V3_SUFFIX

    parts: list = [{'type': 'text', 'text': prompt}]
    if content['kind'] == 'text':
        body = (content.get('text') or '').strip() or '[empty]'
        parts.append({'type': 'text', 'text': f"\n[Reported chat message]:\n{body}"})
    else:  # photo / video
        # Caption rides along as text context.
        cap = (content.get('caption') or '').strip()
        if cap:
            parts.append({'type': 'text', 'text': f"\n[Snap caption]: {cap}"})
        parts.append({
            'type': 'image_url',
            'image_url': {
                'url': f"data:{content['mime']};base64,{content['image_b64']}"
            },
        })
    return parts


def call_gpt4o_mini(report: Report, version: int) -> AiReport:
    """Run one AI moderation pass and persist an AiReport row. Raises on any
    upstream failure — the caller decides whether to swallow or retry."""
    content = extract_content(report)
    user_content = _build_user_content(content, version, report)

    client = _openai_client()
    completion = client.chat.completions.create(
        model=GPT_MODEL,
        messages=[
            {'role': 'system', 'content': 'You are a strict but fair moderator. Always respond with valid JSON.'},
            {'role': 'user', 'content': user_content},
        ],
        response_format={'type': 'json_object'},
        temperature=0.2,
    )
    raw = completion.choices[0].message.content or '{}'
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        logger.warning("moderation: invalid JSON from GPT, defaulting to dismiss")
        parsed = {
            'report_document': 'AI response could not be parsed. Defaulting to no action.',
            'violation_likelihood': 0.0,
            'violation_categories': {},
            'recommended_action': 'dismiss',
            'reasoning': 'JSON parse failure',
        }

    ai = AiReport.objects.create(
        report=report,
        version=version,
        provider=GPT_MODEL,
        raw_response=parsed,
        report_document=str(parsed.get('report_document') or '')[:8000],
        violation_likelihood=float(parsed.get('violation_likelihood') or 0.0),
        violation_categories=parsed.get('violation_categories') or {},
        recommended_action=(parsed.get('recommended_action') or 'dismiss').strip().lower()[:12],
    )
    return ai


# --- Similarity ---------------------------------------------------------------
def _cosine(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    num = sum(x * y for x, y in zip(a, b))
    da = math.sqrt(sum(x * x for x in a))
    db = math.sqrt(sum(y * y for y in b))
    if da == 0 or db == 0:
        return 0.0
    return num / (da * db)


def run_similarity(report: Report, v1: AiReport, v2: AiReport) -> SimilarityCheck:
    client = _openai_client()
    resp = client.embeddings.create(
        model=EMBED_MODEL,
        input=[v1.report_document, v2.report_document],
    )
    e1 = resp.data[0].embedding
    e2 = resp.data[1].embedding
    score = _cosine(e1, e2)
    check, _ = SimilarityCheck.objects.update_or_create(
        report=report,
        defaults={
            'ai_report_v1': v1,
            'ai_report_v2': v2,
            'similarity_score': score,
            'provider': EMBED_MODEL,
            'raw_response': {'usage': getattr(resp, 'usage', {}).__dict__ if hasattr(resp, 'usage') else {}},
        },
    )
    return check


# --- Outcome routines ---------------------------------------------------------
def _content_target_for(report: Report):
    if report.content_type == Report.CONTENT_SNAP:
        return report.snap
    return report.chat_message


def _soft_delete_content(report: Report):
    target = _content_target_for(report)
    if not target:
        return
    if report.content_type == Report.CONTENT_SNAP:
        target.is_removed = True
        target.save(update_fields=['is_removed'])
    else:
        target.is_removed = True
        target.removed_at = timezone.now()
        target.save(update_fields=['is_removed', 'removed_at'])


def _restriction_kind_for(report: Report) -> str:
    return (
        FunctionRestriction.TYPE_SNAP
        if report.content_type == Report.CONTENT_SNAP
        else FunctionRestriction.TYPE_CHAT
    )


def _next_offense_count(user) -> int:
    """All-time count of restrictions applied to this user, including expired
    ones. The plan's ladder is cumulative ('1st = 3d, 2nd = 7d, …'), not
    'currently-active'."""
    return FunctionRestriction.objects.filter(user=user).count() + 1


def enforce(report: Report) -> None:
    """Final adverse outcome — soft-delete content, apply restriction, email
    both parties, escalate to admin alert at 3rd+ offense."""
    with transaction.atomic():
        _soft_delete_content(report)
        offense = _next_offense_count(report.reported_user)
        duration_days = RESTRICTION_DURATIONS_DAYS.get(offense)
        expires = timezone.now() + timedelta(days=duration_days) if duration_days else None
        restriction = FunctionRestriction.objects.create(
            user=report.reported_user,
            restriction_type=_restriction_kind_for(report),
            report=report,
            offense_count=offense,
            expires_at=expires,
            is_active=True,
        )
        report.status = Report.STATUS_ENFORCED
        if hasattr(report, 'appeal') and report.appeal:
            report.appeal.status = Appeal.STATUS_ENFORCED
            report.appeal.save(update_fields=['status'])
        report.save(update_fields=['status', 'updated_at'])

    try:
        email_enforcement(report, restriction)
    except Exception:
        logger.exception("enforcement email failed")

    if offense >= 3:
        try:
            email_admin_repeat_offender(report.reported_user, offense)
        except Exception:
            logger.exception("admin repeat-offender email failed")


def appeal_upheld(report: Report) -> None:
    """Appeal succeeded. No content removal; mutual UserBlock so the two
    parties never see each other again. Both rows carry the report ref so an
    admin can audit them."""
    with transaction.atomic():
        report.status = Report.STATUS_APPEAL_UPHELD
        if hasattr(report, 'appeal') and report.appeal:
            report.appeal.status = Appeal.STATUS_UPHELD
            report.appeal.save(update_fields=['status'])
        report.save(update_fields=['status', 'updated_at'])
        UserBlock.objects.get_or_create(
            blocker=report.reporter,
            blocked=report.reported_user,
            defaults={'reason': UserBlock.REASON_APPEAL, 'report': report},
        )
        UserBlock.objects.get_or_create(
            blocker=report.reported_user,
            blocked=report.reporter,
            defaults={'reason': UserBlock.REASON_APPEAL, 'report': report},
        )

    try:
        email_appeal_upheld_to_reporter(report)
        email_appeal_upheld_to_reported(report)
    except Exception:
        logger.exception("appeal-upheld emails failed")


def mark_warned(report: Report) -> None:
    """All AI reports agreed `warn` — no content removal, no restriction, just
    a heads-up email to the reported user."""
    report.status = Report.STATUS_WARNED
    report.save(update_fields=['status', 'updated_at'])
    try:
        email_warn_to_reported(report)
    except Exception:
        logger.exception("warn email failed")


def admin_remove(report: Report) -> None:
    """Human override: same effects as enforce() but skips the AI gate, marks
    status as admin_removed, and sends the 'human review outcome' email."""
    with transaction.atomic():
        _soft_delete_content(report)
        offense = _next_offense_count(report.reported_user)
        duration_days = RESTRICTION_DURATIONS_DAYS.get(offense)
        expires = timezone.now() + timedelta(days=duration_days) if duration_days else None
        FunctionRestriction.objects.create(
            user=report.reported_user,
            restriction_type=_restriction_kind_for(report),
            report=report,
            offense_count=offense,
            expires_at=expires,
            is_active=True,
        )
        report.status = Report.STATUS_ADMIN_REMOVED
        if hasattr(report, 'appeal') and report.appeal:
            report.appeal.status = Appeal.STATUS_ENFORCED
            report.appeal.save(update_fields=['status'])
        report.save(update_fields=['status', 'updated_at'])
    try:
        email_admin_action(report, removed=True)
    except Exception:
        logger.exception("admin-action email failed")


def admin_dismiss(report: Report) -> None:
    """Human override: no effects beyond marking status + emailing parties."""
    report.status = Report.STATUS_ADMIN_DISMISSED
    if hasattr(report, 'appeal') and report.appeal:
        report.appeal.status = Appeal.STATUS_UPHELD
        report.appeal.save(update_fields=['status'])
    report.save(update_fields=['status', 'updated_at'])
    try:
        email_admin_action(report, removed=False)
    except Exception:
        logger.exception("admin-action email failed")


# --- Pipeline tick ------------------------------------------------------------
def _process_pending(report: Report) -> str:
    """`pending` → run v1, email both parties, advance to ai_reported."""
    v1 = call_gpt4o_mini(report, version=1)
    report.appeal_deadline = timezone.now() + timedelta(days=APPEAL_WINDOW_DAYS)
    action = v1.recommended_action
    report.status = Report.STATUS_AI_REPORTED
    report.save(update_fields=['appeal_deadline', 'status', 'updated_at'])
    try:
        email_v1_to_reporter(report, v1)
        email_v1_to_reported(report, v1)
    except Exception:
        logger.exception("v1 emails failed")
    return f"v1:{action}"


def _process_appeal_pending(report: Report) -> str:
    """`appeal_pending` → v2 + similarity. ≥0.60 → enforce; else v3 tiebreaker
    → 2-of-3 vote tally → enforce or appeal_upheld. If all three say `warn`
    and none say `remove`, fall back to mark_warned."""
    v1 = report.ai_reports.filter(version=1).first()
    if not v1:
        # Shouldn't happen; recover by generating v1 first then bail out.
        logger.warning("appeal_pending without v1 on report #%s — backfilling v1", report.pk)
        call_gpt4o_mini(report, version=1)
        return 'v1_backfill'

    v2 = call_gpt4o_mini(report, version=2)
    sim = run_similarity(report, v1, v2)
    if sim.similarity_score >= SIMILARITY_THRESHOLD:
        # Strong agreement → terminal based on majority recommendation
        # (if both say warn, route to warn; if both say remove, enforce).
        votes_remove = sum(1 for a in (v1, v2) if a.recommended_action == 'remove')
        if votes_remove >= 1:
            enforce(report)
        else:
            # Both v1+v2 agree on warn or dismiss
            mark_warned(report) if any(a.recommended_action == 'warn' for a in (v1, v2)) else appeal_upheld(report)
        return f"appeal_terminal_sim>={SIMILARITY_THRESHOLD}"

    # Disagreement → v3 tiebreaker. Mark intermediate status before the call so
    # a crash mid-tick is recoverable.
    report.status = Report.STATUS_THIRD_LOOP
    report.save(update_fields=['status', 'updated_at'])
    v3 = call_gpt4o_mini(report, version=3)
    votes_remove = sum(1 for a in (v1, v2, v3) if a.recommended_action == 'remove')
    if votes_remove >= 2:
        enforce(report)
        return 'v3_enforce'
    # No remove majority: if everyone said warn → warn; else appeal upheld.
    if all(a.recommended_action == 'warn' for a in (v1, v2, v3)):
        mark_warned(report)
        return 'v3_warn'
    appeal_upheld(report)
    return 'v3_appeal_upheld'


def _process_third_loop(report: Report) -> str:
    """Crash recovery — a previous tick advanced to third_loop but didn't
    finalize. Re-run v3 (cheap) and tally."""
    v1 = report.ai_reports.filter(version=1).first()
    v2 = report.ai_reports.filter(version=2).first()
    if not (v1 and v2):
        # Bad state; reset to appeal_pending so the next tick rebuilds.
        logger.warning("third_loop without v1/v2 on report #%s — resetting", report.pk)
        report.status = Report.STATUS_APPEAL_PENDING
        report.save(update_fields=['status', 'updated_at'])
        return 'third_loop_reset'
    v3 = report.ai_reports.filter(version=3).first() or call_gpt4o_mini(report, version=3)
    votes_remove = sum(1 for a in (v1, v2, v3) if a.recommended_action == 'remove')
    if votes_remove >= 2:
        enforce(report)
        return 'v3_enforce'
    if all(a.recommended_action == 'warn' for a in (v1, v2, v3)):
        mark_warned(report)
        return 'v3_warn'
    appeal_upheld(report)
    return 'v3_appeal_upheld'


SNAP_MEDIA_RETENTION_DAYS = 30


def purge_snap_media() -> int:
    """Phase 9: hard-delete snap media (GCS blob) for any snap created more
    than `SNAP_MEDIA_RETENTION_DAYS` ago, EXCEPT for snaps tied to an
    in-flight moderation case — those keep their evidence intact until the
    case terminates and the next sweep can purge.

    The DB row stays as a tombstone (caption + audience + Report FKs intact);
    only `media_file` is cleared. Naturally-expired snaps are already invisible
    via `SnapFeedView`'s `expires_at__gt=now` filter, so we deliberately do
    NOT flip `is_removed` here — that flag is reserved for user/moderation
    removals (semantic clarity for admins reading the SnapAdmin list filter).
    """
    cutoff = timezone.now() - timedelta(days=SNAP_MEDIA_RETENTION_DAYS)
    in_flight_statuses = [
        Report.STATUS_PENDING, Report.STATUS_AI_REPORTED,
        Report.STATUS_APPEAL_PENDING, Report.STATUS_APPEAL_ANALYZED,
        Report.STATUS_THIRD_LOOP,
    ]
    candidates = (
        Snap.objects
        .filter(created_at__lt=cutoff)
        .exclude(media_file='')
        .exclude(reports__status__in=in_flight_statuses)
    )
    count = 0
    for snap in candidates.iterator():
        try:
            snap.media_file.delete(save=False)
        except Exception:
            logger.exception("snap blob delete failed pk=%s", snap.pk)
            continue
        # `media_file.delete(save=False)` only clears the bound name on the
        # field instance; persist that to the DB explicitly.
        snap.media_file = ''
        snap.save(update_fields=['media_file'])
        count += 1
    return count


def deactivate_expired_restrictions() -> int:
    """Flip `is_active=False` on restrictions past their `expires_at`. Read
    paths already treat expired rows as inactive, but flipping the flag keeps
    the admin list clean and makes the `offense_count` ladder reliable."""
    now = timezone.now()
    expired = FunctionRestriction.objects.filter(
        is_active=True, expires_at__isnull=False, expires_at__lt=now,
    )
    return expired.update(is_active=False)


def run_moderation_tick() -> dict:
    """One cron pass. Picks up actionable reports in batches, runs each
    through the appropriate handler, swallows per-report exceptions so a
    single bad row can't block the rest of the queue."""
    summary = {
        'pending': 0, 'appeal_pending': 0, 'third_loop': 0,
        'snap_media_purged': 0, 'restrictions_expired': 0,
        'errors': 0,
    }

    pending = Report.objects.filter(status=Report.STATUS_PENDING).order_by('created_at')[:50]
    for r in pending:
        try:
            _process_pending(r)
            summary['pending'] += 1
        except Exception:
            logger.exception("moderation: pending #%s failed", r.pk)
            summary['errors'] += 1

    appeal = Report.objects.filter(status=Report.STATUS_APPEAL_PENDING).order_by('created_at')[:50]
    for r in appeal:
        try:
            _process_appeal_pending(r)
            summary['appeal_pending'] += 1
        except Exception:
            logger.exception("moderation: appeal_pending #%s failed", r.pk)
            summary['errors'] += 1

    third = Report.objects.filter(status=Report.STATUS_THIRD_LOOP).order_by('created_at')[:25]
    for r in third:
        try:
            _process_third_loop(r)
            summary['third_loop'] += 1
        except Exception:
            logger.exception("moderation: third_loop #%s failed", r.pk)
            summary['errors'] += 1

    summary['snap_media_purged'] = purge_snap_media()
    summary['restrictions_expired'] = deactivate_expired_restrictions()
    return summary
