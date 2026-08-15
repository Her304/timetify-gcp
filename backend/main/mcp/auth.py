"""Credential resolution and rate limiting for the MCP endpoint.

Everything above this layer works with a Principal and never learns which kind
of credential produced it, so adding OAuth later means adding one resolver
branch rather than touching tools, scopes or the protocol.
"""

import hashlib
import logging
import secrets
from dataclasses import dataclass
from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from ..models import AgentAccessToken
from . import scopes as scope_defs

logger = logging.getLogger(__name__)

TOKEN_PREFIX = 'ttfy_agent_'
# Kept in sync with oauth.TOKEN_PREFIX; duplicated rather than imported so this
# module stays free of a circular import back through the OAuth views.
OAUTH_TOKEN_PREFIX = 'ttfy_oat_'

# Reads: agents poll, so this is generous. Writes: a loop that creates calendar
# rows is far more damaging than one that reads them, and no human-driven agent
# needs to create ten things a minute.
READ_LIMIT_PER_MINUTE = 60
WRITE_LIMIT_PER_MINUTE = 10

# last_used_at only drives a "last used" hint in Settings, so minute-granularity
# is plenty and saves a DB write on every single poll.
LAST_USED_RESOLUTION = timedelta(seconds=60)


@dataclass(frozen=True)
class Principal:
    """An authenticated agent caller. `credential_id` is what lands in audit
    logs — never the raw token, and never its hash."""
    user: object
    scopes: frozenset
    credential_id: str
    credential_kind: str

    def has(self, scope):
        return scope in self.scopes


class RateLimited(Exception):
    def __init__(self, kind):
        self.kind = kind
        super().__init__(f"{kind} rate limit exceeded")


def mint_raw_token():
    """Return a new raw token. The prefix makes a leaked token greppable in
    logs and recognisable to secret scanners."""
    return TOKEN_PREFIX + secrets.token_urlsafe(32)


def hash_token(raw):
    return hashlib.sha256(raw.encode('utf-8')).hexdigest()


def _resolve_pat(raw):
    tok = (
        AgentAccessToken.objects
        .select_related('user')
        .filter(token_hash=hash_token(raw), revoked_at__isnull=True)
        .first()
    )
    if tok is None:
        return None, None
    # A deactivated account loses agent read access too — otherwise a ban would
    # only close the front door.
    if not tok.user.is_active:
        return None, None
    return tok, Principal(
        user=tok.user,
        scopes=frozenset(scope_defs.clean(tok.scopes)),
        credential_id=f'pat:{tok.pk}',
        credential_kind='pat',
    )


def _resolve_oauth(raw):
    from django.utils import timezone as dj_tz
    from ..models import OAuthAccessToken

    tok = (
        OAuthAccessToken.objects
        .select_related('user', 'client')
        .filter(token_hash=hash_token(raw), revoked_at__isnull=True)
        .first()
    )
    if tok is None or not tok.user.is_active:
        return None, None
    # Unlike a PAT, an OAuth access token expires on its own; the client is
    # expected to refresh rather than have the user re-consent.
    if tok.expires_at < dj_tz.now():
        return None, None
    return tok, Principal(
        user=tok.user,
        scopes=frozenset(scope_defs.clean(tok.scopes)),
        credential_id=f'oauth:{tok.pk}',
        credential_kind='oauth',
    )


def resolve_credential(raw):
    """Map a bearer token to (row, Principal), or (None, None).

    Dispatching on prefix rather than trying each resolver in turn keeps the two
    credential systems unambiguous. Everything above this line works with a
    Principal and never learns which kind produced it — which is why adding
    OAuth meant adding a branch here and nothing else.
    """
    if not raw:
        return None, None
    if raw.startswith(TOKEN_PREFIX):
        return _resolve_pat(raw)
    if raw.startswith(OAUTH_TOKEN_PREFIX):
        return _resolve_oauth(raw)
    return None, None


def _bump_window(row, started_field, count_field, limit):
    """Fixed 60s window counter held on the credential row.

    Deliberately not cache-backed: with no CACHES configured Django falls back
    to a per-process LocMemCache, so a cache throttle would count roughly
    1/(workers x instances) of the real traffic.
    """
    now = timezone.now()
    started = getattr(row, started_field)
    count = getattr(row, count_field)

    if started is None or (now - started).total_seconds() >= 60:
        setattr(row, started_field, now)
        setattr(row, count_field, 1)
        return True
    if count >= limit:
        return False
    setattr(row, count_field, count + 1)
    return True


def check_and_record(principal, row, is_write):
    """Apply the rate limit and refresh last_used_at in one write.

    Raises RateLimited when the caller is over budget. Writes consume both the
    write budget and the read budget, so a write loop can't sidestep the
    overall per-token ceiling.
    """
    fields = []
    with transaction.atomic():
        row = type(row).objects.select_for_update().get(pk=row.pk)

        if not _bump_window(row, 'window_started_at', 'window_count', READ_LIMIT_PER_MINUTE):
            row.save(update_fields=['window_started_at', 'window_count'])
            raise RateLimited('read')
        fields += ['window_started_at', 'window_count']

        if is_write:
            if not _bump_window(row, 'write_window_started_at', 'write_window_count', WRITE_LIMIT_PER_MINUTE):
                row.save(update_fields=fields)
                raise RateLimited('write')
            fields += ['write_window_started_at', 'write_window_count']

        now = timezone.now()
        if row.last_used_at is None or (now - row.last_used_at) >= LAST_USED_RESOLUTION:
            row.last_used_at = now
            fields.append('last_used_at')

        row.save(update_fields=fields)
