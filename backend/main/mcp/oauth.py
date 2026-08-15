"""OAuth 2.1 authorization server for the MCP endpoint.

This is what lets a user connect from a web client (claude.ai, ChatGPT) by
signing in, instead of pasting a token into a config file — those UIs take a
URL and run the auth handshake; they have no field for a static bearer header.

Timetify is both the authorization server and the resource server here. That's
the simple shape for a single first-party API, and it avoids standing up (or
paying for) a separate identity provider when Django already owns the accounts.

Security posture, all enforced below and covered by tests:
  - PKCE S256 required. `plain` is rejected outright, and a missing challenge
    is rejected — there are no non-PKCE clients to stay compatible with.
  - redirect_uri must match a registered URI exactly (no prefix matching), so
    this can't be turned into an open redirect.
  - Authorization codes are single-use, 60s, and bound to client + redirect_uri
    + challenge; all are re-checked at redemption.
  - Access and refresh tokens are stored as sha256 only.
  - Refresh tokens rotate on every use.

The login + consent pages are rendered by Django rather than the SPA: the SPA
authenticates with a JWT in localStorage on a different origin, and bouncing
through it would mean moving credentials across origins for no benefit. Django
already has sessions and auth middleware installed.
"""

import hashlib
import json
import logging
import secrets
from datetime import timedelta
from urllib.parse import urlencode, urlparse, urlunparse

from django.conf import settings
from django.contrib.auth import authenticate, login as django_login
from django.http import JsonResponse, HttpResponseRedirect
from django.shortcuts import render
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt, csrf_protect
from django.views.decorators.http import require_http_methods

from ..models import OAuthAccessToken, OAuthAuthorizationCode, OAuthClient
from . import scopes as scope_defs

logger = logging.getLogger(__name__)

TOKEN_PREFIX = 'ttfy_oat_'
REFRESH_PREFIX = 'ttfy_ort_'

CODE_TTL = timedelta(seconds=60)
ACCESS_TTL = timedelta(hours=1)
REFRESH_TTL = timedelta(days=30)

MAX_CLIENTS_PER_HOUR = 20


def _issuer(request=None):
    """Public origin of this server.

    In production this must be the canonical domain rather than the Cloud Run
    hostname: nginx proxies /mcp/v1/, /oauth/* and /.well-known/oauth-* through
    to Django, and an issuer that doesn't match where the client actually talked
    to us is a spec violation the client will reject.

    In DEBUG it is derived from the request instead, because that same rule cuts
    the other way locally: a dev server on 127.0.0.1:8000 was telling clients its
    authorization server was https://timetify.net, sending the handshake to a
    different machine entirely and making the flow impossible to run end-to-end
    without deploying. `request.get_host()` is validated against ALLOWED_HOSTS by
    Django, and production stays pinned regardless, so no Host header a caller
    can send changes what a real client is told.
    """
    if request is not None and settings.DEBUG:
        return f"{request.scheme}://{request.get_host()}"
    return f"https://{getattr(settings, 'CANONICAL_DOMAIN', 'timetify.net')}"


def _hash(raw):
    return hashlib.sha256(raw.encode('utf-8')).hexdigest()


def _json_error(code, description, status=400):
    return JsonResponse({'error': code, 'error_description': description}, status=status)


def _redirect_with(uri, params):
    parts = urlparse(uri)
    query = f"{parts.query}&{urlencode(params)}" if parts.query else urlencode(params)
    return HttpResponseRedirect(urlunparse(parts._replace(query=query)))


# ---------------------------------------------------------------------------
# Discovery
# ---------------------------------------------------------------------------

def protected_resource_metadata(request):
    """RFC 9728. The 401 from /mcp/v1/ points here, and this points at the
    authorization server — that chain is how a client bootstraps with no
    out-of-band configuration."""
    return JsonResponse({
        'resource': f'{_issuer(request)}/mcp/v1/',
        'authorization_servers': [_issuer(request)],
        'scopes_supported': sorted(scope_defs.VALID),
        'bearer_methods_supported': ['header'],
    })


def authorization_server_metadata(request):
    """RFC 8414."""
    return JsonResponse({
        'issuer': _issuer(request),
        'authorization_endpoint': f'{_issuer(request)}/oauth/authorize',
        'token_endpoint': f'{_issuer(request)}/oauth/token',
        'registration_endpoint': f'{_issuer(request)}/oauth/register',
        'revocation_endpoint': f'{_issuer(request)}/oauth/revoke',
        'scopes_supported': sorted(scope_defs.VALID),
        'response_types_supported': ['code'],
        'grant_types_supported': ['authorization_code', 'refresh_token'],
        # S256 only — advertising `plain` would invite clients to use it.
        'code_challenge_methods_supported': ['S256'],
        'token_endpoint_auth_methods_supported': ['none', 'client_secret_post'],
    })


# ---------------------------------------------------------------------------
# Dynamic client registration (RFC 7591)
# ---------------------------------------------------------------------------

# Schemes that don't identify a destination but execute in whatever context
# resolves them. A registered redirect_uri is later handed to the browser in a
# Location header, and while browsers refuse to navigate to these, they can
# still reach a client's own URL handler. Nothing legitimate registers one.
BLOCKED_SCHEMES = frozenset({'javascript', 'data', 'vbscript', 'file', 'blob', 'about'})


def _valid_redirect_uri(uri):
    """https anywhere, or http on loopback only.

    Loopback is allowed because MCP clients frequently run locally and catch the
    redirect on 127.0.0.1; plain http to any other host would put an
    authorization code on the wire in cleartext.
    """
    try:
        parts = urlparse(uri)
    except ValueError:
        return False
    scheme = parts.scheme.lower()
    if scheme in BLOCKED_SCHEMES:
        return False
    if scheme == 'https':
        return bool(parts.netloc)
    if scheme == 'http':
        return parts.hostname in ('localhost', '127.0.0.1', '::1')
    # Private-use schemes (RFC 8252 native app callbacks) are permitted but must
    # be absolute — a bare path is not somewhere we can send a browser.
    return bool(scheme and (parts.netloc or parts.path))


# csrf_exempt on all three machine-to-machine endpoints below. They are called
# by an MCP client's HTTP stack, not a browser form: there is no session, no
# cookie and no token to send, so CsrfViewMiddleware answers 403 and the whole
# flow dies at the first step. Nothing is lost by exempting them — CSRF defends
# a cookie-authenticated request, and these authenticate with the client's own
# credentials (PKCE verifier, client_secret, or the token being revoked), none
# of which a browser attaches automatically. /oauth/authorize is the one browser
# form here and keeps @csrf_protect.
@csrf_exempt
@require_http_methods(['POST'])
def register(request):
    recent = OAuthClient.objects.filter(
        created_at__gte=timezone.now() - timedelta(hours=1)
    ).count()
    if recent >= MAX_CLIENTS_PER_HOUR:
        # Anyone can register under DCR, so the only real control is volume.
        # A client_id on its own still grants nothing without user consent.
        logger.warning('oauth.registration_throttled recent=%s', recent)
        return _json_error('temporarily_unavailable', 'Too many registrations. Try again later.', 503)

    try:
        body = json.loads(request.body or b'{}')
    except (ValueError, UnicodeDecodeError):
        return _json_error('invalid_client_metadata', 'Body must be JSON.')

    uris = body.get('redirect_uris')
    if not isinstance(uris, list) or not uris:
        return _json_error('invalid_redirect_uri', 'redirect_uris is required.')
    if any(not isinstance(u, str) or not _valid_redirect_uri(u) for u in uris):
        return _json_error('invalid_redirect_uri', 'redirect_uris must be https, or http on loopback.')

    auth_method = body.get('token_endpoint_auth_method', 'none')
    client_id = secrets.token_urlsafe(24)
    secret = None
    secret_hash = None
    if auth_method == 'client_secret_post':
        secret = secrets.token_urlsafe(32)
        secret_hash = _hash(secret)

    client = OAuthClient.objects.create(
        client_id=client_id,
        secret_hash=secret_hash,
        name=str(body.get('client_name') or '')[:200],
        redirect_uris=uris,
    )
    logger.info('oauth.client_registered client_id=%s name=%s', client.client_id, client.name)

    payload = {
        'client_id': client.client_id,
        'client_id_issued_at': int(client.created_at.timestamp()),
        'redirect_uris': uris,
        'token_endpoint_auth_method': auth_method,
        'grant_types': ['authorization_code', 'refresh_token'],
        'response_types': ['code'],
        'client_name': client.name,
    }
    if secret:
        payload['client_secret'] = secret
    return JsonResponse(payload, status=201)


# ---------------------------------------------------------------------------
# Authorization + consent
# ---------------------------------------------------------------------------

def _authorize_error(request, message):
    return render(request, 'oauth/error.html', {'message': message}, status=400)


@csrf_protect
@require_http_methods(['GET', 'POST'])
def authorize(request):
    """The user-facing half: sign in, then approve or deny.

    Parameter errors are shown as a page rather than redirected back to the
    client, because until redirect_uri is validated against a registration we
    have no destination we can safely send a browser to.
    """
    src = request.POST if request.method == 'POST' else request.GET

    client_id     = src.get('client_id', '')
    redirect_uri  = src.get('redirect_uri', '')
    response_type = src.get('response_type', '')
    challenge     = src.get('code_challenge', '')
    method        = src.get('code_challenge_method', '')
    state         = src.get('state', '')
    resource      = src.get('resource', '')
    requested     = [s for s in (src.get('scope', '') or '').split() if s]

    client = OAuthClient.objects.filter(client_id=client_id).first()
    if client is None:
        return _authorize_error(request, 'Unknown application.')
    # Exact match only. Prefix or substring matching here is the classic route
    # to an open redirect and, through it, code theft.
    if redirect_uri not in (client.redirect_uris or []):
        return _authorize_error(request, 'This application sent a redirect address we do not recognise.')

    # From here on the redirect_uri is trusted, so protocol errors can go back
    # to the client the way the spec expects.
    def deny(code, desc):
        params = {'error': code, 'error_description': desc}
        if state:
            params['state'] = state
        return _redirect_with(redirect_uri, params)

    if response_type != 'code':
        return deny('unsupported_response_type', 'Only the authorization code flow is supported.')
    if method != 'S256' or not challenge:
        return deny('invalid_request', 'PKCE with S256 is required.')

    granted = scope_defs.clean(requested) or list(scope_defs.DEFAULT)

    ctx = {
        'client': client,
        'scope_rows': [{'id': s, 'label': scope_defs.DESCRIPTIONS.get(s, s),
                        'is_write': s in scope_defs.WRITE_SCOPES} for s in granted],
        'params': {
            'client_id': client_id, 'redirect_uri': redirect_uri,
            'response_type': response_type, 'code_challenge': challenge,
            'code_challenge_method': method, 'state': state,
            'scope': ' '.join(granted), 'resource': resource,
        },
    }

    # Not authenticated → sign in first. This is the redirect-to-login the whole
    # flow exists for.
    if not request.user.is_authenticated:
        if request.method == 'POST' and src.get('action') == 'login':
            user = authenticate(request,
                                username=src.get('username', ''),
                                password=src.get('password', ''))
            if user is None or not user.is_active:
                return render(request, 'oauth/login.html',
                              {**ctx, 'error': 'that username or password did not work.'}, status=401)
            django_login(request, user)
            return render(request, 'oauth/consent.html', ctx)
        return render(request, 'oauth/login.html', ctx)

    if request.method == 'POST' and src.get('action') == 'approve':
        code = secrets.token_urlsafe(32)
        OAuthAuthorizationCode.objects.create(
            code=code, client=client, user=request.user,
            redirect_uri=redirect_uri, code_challenge=challenge,
            scopes=granted, resource=resource,
            expires_at=timezone.now() + CODE_TTL,
        )
        logger.info('oauth.code_issued user_id=%s client_id=%s scopes=%s',
                    request.user.id, client.client_id, granted)
        params = {'code': code}
        if state:
            params['state'] = state
        return _redirect_with(redirect_uri, params)

    if request.method == 'POST' and src.get('action') == 'deny':
        return deny('access_denied', 'The user declined.')

    return render(request, 'oauth/consent.html', ctx)


# ---------------------------------------------------------------------------
# Token endpoint
# ---------------------------------------------------------------------------

def _client_authenticated(client, request):
    if client.secret_hash is None:
        return True  # public client; PKCE is what protects the exchange
    return _hash(request.POST.get('client_secret', '')) == client.secret_hash


def _issue_tokens(user, client, granted, resource):
    access = TOKEN_PREFIX + secrets.token_urlsafe(32)
    refresh = REFRESH_PREFIX + secrets.token_urlsafe(32)
    now = timezone.now()
    row = OAuthAccessToken.objects.create(
        user=user, client=client, scopes=granted,
        token_hash=_hash(access), refresh_hash=_hash(refresh),
        expires_at=now + ACCESS_TTL, refresh_expires_at=now + REFRESH_TTL,
        resource=resource or '',
    )
    return row, {
        'access_token': access,
        'token_type': 'Bearer',
        'expires_in': int(ACCESS_TTL.total_seconds()),
        'refresh_token': refresh,
        'scope': ' '.join(granted),
    }


@csrf_exempt
@require_http_methods(['POST'])
def token(request):
    grant_type = request.POST.get('grant_type', '')
    client = OAuthClient.objects.filter(client_id=request.POST.get('client_id', '')).first()
    if client is None or not _client_authenticated(client, request):
        return _json_error('invalid_client', 'Unknown or unauthenticated client.', 401)

    if grant_type == 'authorization_code':
        return _grant_authorization_code(request, client)
    if grant_type == 'refresh_token':
        return _grant_refresh(request, client)
    return _json_error('unsupported_grant_type', f'Unsupported grant_type: {grant_type}')


def _grant_authorization_code(request, client):
    code = request.POST.get('code', '')
    verifier = request.POST.get('code_verifier', '')
    redirect_uri = request.POST.get('redirect_uri', '')

    row = OAuthAuthorizationCode.objects.select_related('user', 'client').filter(code=code).first()
    if row is None or row.client_id != client.pk:
        return _json_error('invalid_grant', 'Unknown authorization code.')
    if row.consumed_at is not None:
        # Replay. The code is already spent; anything issued from it is suspect,
        # so drop every token from this grant rather than just refusing.
        OAuthAccessToken.objects.filter(
            user=row.user, client=client, revoked_at__isnull=True
        ).update(revoked_at=timezone.now())
        logger.warning('oauth.code_replay user_id=%s client_id=%s', row.user_id, client.client_id)
        return _json_error('invalid_grant', 'This code has already been used.')
    if row.expires_at < timezone.now():
        return _json_error('invalid_grant', 'This code has expired.')
    if row.redirect_uri != redirect_uri:
        return _json_error('invalid_grant', 'redirect_uri does not match the authorization request.')

    # PKCE: S256(verifier) must equal the challenge recorded at authorize time.
    if not verifier:
        return _json_error('invalid_request', 'code_verifier is required.')
    digest = hashlib.sha256(verifier.encode('ascii')).digest()
    import base64
    computed = base64.urlsafe_b64encode(digest).rstrip(b'=').decode('ascii')
    if not secrets.compare_digest(computed, row.code_challenge):
        return _json_error('invalid_grant', 'PKCE verification failed.')

    row.consumed_at = timezone.now()
    row.save(update_fields=['consumed_at'])

    _, payload = _issue_tokens(row.user, client, scope_defs.clean(row.scopes), row.resource)
    logger.info('oauth.token_issued user_id=%s client_id=%s', row.user_id, client.client_id)
    return JsonResponse(payload)


def _grant_refresh(request, client):
    presented = request.POST.get('refresh_token', '')
    row = OAuthAccessToken.objects.select_related('user').filter(
        refresh_hash=_hash(presented), client=client, revoked_at__isnull=True,
    ).first()
    if row is None:
        return _json_error('invalid_grant', 'Unknown or revoked refresh token.')
    if row.refresh_expires_at and row.refresh_expires_at < timezone.now():
        return _json_error('invalid_grant', 'This refresh token has expired.')
    if not row.user.is_active:
        return _json_error('invalid_grant', 'Account is not active.')

    # Rotate: the presented token dies with the row it belonged to, so reusing
    # an old refresh token fails instead of silently working forever.
    row.revoked_at = timezone.now()
    row.save(update_fields=['revoked_at'])

    _, payload = _issue_tokens(row.user, client, scope_defs.clean(row.scopes), row.resource)
    return JsonResponse(payload)


@csrf_exempt
@require_http_methods(['POST'])
def revoke(request):
    """RFC 7009. Always answers 200 — telling a caller whether a token existed
    would make this an oracle."""
    presented = request.POST.get('token', '')
    if presented:
        digest = _hash(presented)
        OAuthAccessToken.objects.filter(revoked_at__isnull=True).filter(
            **({'token_hash': digest} if presented.startswith(TOKEN_PREFIX) else {'refresh_hash': digest})
        ).update(revoked_at=timezone.now())
    return JsonResponse({})


def purge_expired():
    """Housekeeping for the moderation cron."""
    now = timezone.now()
    codes = OAuthAuthorizationCode.objects.filter(expires_at__lt=now - timedelta(days=1)).delete()[0]
    tokens = OAuthAccessToken.objects.filter(
        refresh_expires_at__lt=now - timedelta(days=7)
    ).delete()[0]
    return codes + tokens
