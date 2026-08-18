"""Rate limits for the endpoints an attacker hammers.

Two things here are deliberately not DRF's defaults:

1. Client identity. DRF's SimpleRateThrottle.get_ident() falls back to using the
   ENTIRE X-Forwarded-For header as the cache key when NUM_PROXIES is unset.
   That header is attacker-controlled, so a caller who varies it per request
   gets a fresh bucket every time and the throttle does nothing. We instead take
   the Nth address from the right, counting only the proxies we actually run
   (TRUSTED_PROXY_COUNT), because everything to the LEFT of those is client-
   supplied and forgeable.

2. Credential-stuffing needs a second axis. Limiting login by IP alone lets a
   botnet spread one password guess per host across many IPs; limiting by
   username alone lets one IP walk the whole user list. Both are applied.

All of these depend on a cache shared across Cloud Run instances — see the
CACHES block in settings.py. With a per-process cache the counters fragment and
the limits are advisory at best.
"""

import hashlib
import logging

from django.conf import settings
from rest_framework.throttling import SimpleRateThrottle

logger = logging.getLogger(__name__)


def _hash(value):
    """Keys land in a shared cache (and DB rows) — don't store raw emails or
    usernames there. Truncated SHA-256 is plenty to keep buckets distinct."""
    return hashlib.sha256(value.encode('utf-8', 'ignore')).hexdigest()[:32]


class _BaseThrottle(SimpleRateThrottle):
    """Shared, spoof-resistant client identification."""

    def get_ident(self, request):
        """The client IP, ignoring any X-Forwarded-For entries we don't control.

        Cloud Run appends the real client address to XFF; anything a caller sent
        stays to the left of it. Counting `TRUSTED_PROXY_COUNT` from the right
        therefore lands on an address the platform wrote, not one the caller
        chose. Falls back to REMOTE_ADDR when the header is absent or short.
        """
        forwarded = request.META.get('HTTP_X_FORWARDED_FOR')
        remote_addr = request.META.get('REMOTE_ADDR')
        trusted = getattr(settings, 'TRUSTED_PROXY_COUNT', 1)

        if not forwarded or trusted < 1:
            return remote_addr

        addrs = [a.strip() for a in forwarded.split(',') if a.strip()]
        if not addrs:
            return remote_addr
        # addrs[-trusted] is the address written by our outermost trusted proxy.
        # If the header is shorter than expected, the leftmost entry is the most
        # trustworthy thing present.
        index = min(trusted, len(addrs))
        return addrs[-index]

    def _key(self, scope_suffix, value):
        return f"throttle_{self.scope}_{scope_suffix}_{value}"


class LoginIPThrottle(_BaseThrottle):
    """Caps total login attempts from one address — the botnet-free case."""
    scope = 'login_ip'

    def get_cache_key(self, request, view):
        return self._key('ip', self.get_ident(request))


class LoginUsernameThrottle(_BaseThrottle):
    """Caps attempts against a single account regardless of source address.

    Keyed case-insensitively because logins resolve that way (canonical_username),
    so "Admin" and "admin" must share one bucket rather than doubling the budget.
    """
    scope = 'login_username'

    def get_cache_key(self, request, view):
        username = ''
        data = getattr(request, 'data', None)
        if isinstance(data, dict):
            username = (data.get('username') or '').strip().lower()
        if not username:
            # Nothing to key on — let LoginIPThrottle carry this request.
            return None
        return self._key('user', _hash(username))


class RegisterThrottle(_BaseThrottle):
    """Blocks bulk account creation from one address."""
    scope = 'register'

    def get_cache_key(self, request, view):
        return self._key('ip', self.get_ident(request))


class PasswordResetIPThrottle(_BaseThrottle):
    """Blocks bulk enumeration/mailbombing from one address.

    The constant-response fix in PasswordResetRequestView removes the *signal*
    an enumerator reads; this removes their throughput.
    """
    scope = 'password_reset_ip'

    def get_cache_key(self, request, view):
        return self._key('ip', self.get_ident(request))


class PasswordResetEmailThrottle(_BaseThrottle):
    """Stops one mailbox being flooded with reset mail from many addresses."""
    scope = 'password_reset_email'

    def get_cache_key(self, request, view):
        email = ''
        data = getattr(request, 'data', None)
        if isinstance(data, dict):
            email = (data.get('email') or '').strip().lower()
        if not email:
            return None
        return self._key('email', _hash(email))


class RegistrationCheckThrottle(_BaseThrottle):
    """Caps the sign-up availability check.

    This endpoint tells an unauthenticated caller whether a username or email
    exists — deliberately, so step 1 of sign-up can fail fast instead of after
    the whole flow. That trade-off is defensible for one interactive check and
    indefensible as an unmetered bulk oracle, so the answer stays but the
    throughput does not. Generous enough that a real person filling in a form
    (and retrying a few taken names) never notices.
    """
    scope = 'registration_check'

    def get_cache_key(self, request, view):
        return self._key('ip', self.get_ident(request))


class UserSearchThrottle(_BaseThrottle):
    """Caps directory scraping. Keyed by account, not IP: search requires
    authentication, so the account is the meaningful actor and rotating IPs
    buys an attacker nothing."""
    scope = 'user_search'

    def get_cache_key(self, request, view):
        user = getattr(request, 'user', None)
        if user and user.is_authenticated:
            return self._key('user', user.pk)
        return self._key('ip', self.get_ident(request))
