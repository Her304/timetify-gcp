"""The two-step confirmation handshake for agent writes.

Every write tool answers its first call with a preview and a `confirmation_token`
and saves nothing. Only a second call carrying that token commits. An agent
therefore cannot create anything in one round trip: to obtain a token it has to
receive the preview, which in practice means putting it in front of the user.

MCP tool annotations and description text can *ask* a client to confirm with its
user, but a self-hosted agent is free to auto-approve and ignore both — so the
guarantee has to be enforced here rather than requested there.

The same row is the idempotency record. Agents retry on network failure; without
this, one dropped response becomes several identical calendar entries.
"""

import hashlib
import json
import logging
import secrets
from datetime import timedelta

from django.utils import timezone

from ..models import AgentPendingWrite

logger = logging.getLogger(__name__)

# Long enough for a person to read a preview and answer, short enough that a
# forgotten token isn't left standing.
TTL = timedelta(minutes=5)


def payload_hash(payload):
    """Stable hash of the previewed content, so a token issued for one thing
    can't be replayed to create a different thing."""
    blob = json.dumps(payload, sort_keys=True, separators=(',', ':'), default=str)
    return hashlib.sha256(blob.encode('utf-8')).hexdigest()


def issue(user, tool, payload):
    """Record a pending write and return its token."""
    token = secrets.token_urlsafe(32)
    AgentPendingWrite.objects.create(
        user=user,
        token=token,
        tool=tool,
        payload_hash=payload_hash(payload),
        expires_at=timezone.now() + TTL,
    )
    return token


class ConfirmationError(Exception):
    """The token was missing, wrong, expired, or issued for different content."""


def redeem(user, tool, token, payload):
    """Validate a confirmation token against the payload being committed.

    Returns (row, previous_result). A non-None previous_result means this is a
    retry of an already-committed call and the caller should return it as-is
    rather than writing again.
    """
    row = AgentPendingWrite.objects.filter(user=user, token=token, tool=tool).first()
    if row is None:
        raise ConfirmationError(
            'That confirmation token is not valid. Call this tool without a token '
            'to get a fresh preview.'
        )

    if row.payload_hash != payload_hash(payload):
        # The agent changed the request between preview and confirm, so whatever
        # the user agreed to is not what would be saved.
        raise ConfirmationError(
            'The details changed since the preview. Call again without a token to '
            'preview the new version.'
        )

    if row.consumed_at is not None:
        return row, row.result_payload

    if row.expires_at < timezone.now():
        raise ConfirmationError(
            'That confirmation expired. Call this tool without a token to preview again.'
        )

    return row, None


def mark_consumed(row, object_id, result_payload):
    row.consumed_at = timezone.now()
    row.result_object_id = object_id
    row.result_payload = result_payload
    row.save(update_fields=['consumed_at', 'result_object_id', 'result_payload'])


def purge_expired():
    """Drop stale rows. Consumed rows are kept for a day so a late retry still
    reads back its original result instead of writing a second time."""
    now = timezone.now()
    stale = AgentPendingWrite.objects.filter(consumed_at__isnull=True, expires_at__lt=now)
    old_consumed = AgentPendingWrite.objects.filter(consumed_at__lt=now - timedelta(days=1))
    return stale.delete()[0] + old_consumed.delete()[0]
