"""The single MCP endpoint.

Stateless request/response only — no SSE stream, no session id. Production runs
`gunicorn --workers 2 --threads 2`, i.e. four concurrent requests for the whole
app; a long-lived stream per connected agent would starve the app of its own
threads. GET therefore answers 405, which is the spec's way of saying this
server offers no server-initiated stream.
"""

import json
import logging
import time

from django.http import JsonResponse
from rest_framework import permissions, status
from rest_framework.views import APIView

from . import auth as agent_auth
from . import protocol
from . import tools as tool_registry
from .tools import ToolError

logger = logging.getLogger(__name__)


def _unauthorized(request=None):
    """401 carrying the resource-metadata pointer (RFC 9728).

    This header is the entry point of the whole OAuth flow: a client with no
    credential fetches the metadata document, follows it to the authorization
    server, and starts the sign-in. Without it, a web connector has no way to
    discover how to authenticate and simply fails.

    The request is threaded through so the pointer names the host the client
    actually reached — see `_issuer`. Sending a dev client to the production
    domain is how this fails silently.
    """
    from .oauth import _issuer

    resp = JsonResponse({'error': 'invalid_token'}, status=status.HTTP_401_UNAUTHORIZED)
    resp['WWW-Authenticate'] = (
        f'Bearer realm="timetify-mcp", '
        f'resource_metadata="{_issuer(request)}/.well-known/oauth-protected-resource"'
    )
    return resp


class McpEndpointView(APIView):
    """POST /mcp/v1/

    `authentication_classes` is emptied deliberately. The project default is
    SimpleJWT's JWTAuthentication, which would try to decode an agent PAT and
    raise before this view ever ran — every request would 401 with a confusing
    JWT error. Clearing it also enforces the isolation the whole design rests
    on: a session JWT is not a valid credential here, and an agent token is not
    a valid credential anywhere else.
    """
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        return JsonResponse(
            {'error': 'method_not_allowed', 'detail': 'This server does not offer an event stream.'},
            status=status.HTTP_405_METHOD_NOT_ALLOWED,
        )

    def post(self, request):
        header = request.META.get('HTTP_AUTHORIZATION', '')
        if not header.startswith('Bearer '):
            return _unauthorized(request)

        row, principal = agent_auth.resolve_credential(header[len('Bearer '):].strip())
        if principal is None:
            # No token material in the log line, not even a prefix.
            logger.warning('mcp.auth_failed path=%s', request.path)
            return _unauthorized(request)

        try:
            body = json.loads(request.body or b'{}')
        except (ValueError, UnicodeDecodeError):
            return JsonResponse(
                {'jsonrpc': '2.0', 'id': None,
                 'error': {'code': protocol.PARSE_ERROR, 'message': 'Invalid JSON'}},
                status=status.HTTP_400_BAD_REQUEST,
            )

        def on_tool_call(name, arguments):
            return self._call_tool(principal, row, name, arguments)

        # JSON-RPC batching was dropped in the 2025-06-18 revision but older
        # clients still send arrays, so accept both shapes.
        if isinstance(body, list):
            responses = [r for r in (protocol.dispatch(m, principal, on_tool_call) for m in body) if r]
            if not responses:
                return JsonResponse({}, status=status.HTTP_202_ACCEPTED)
            return JsonResponse(responses, safe=False)

        response = protocol.dispatch(body, principal, on_tool_call)
        if response is None:
            # A notification gets no body by spec.
            return JsonResponse({}, status=status.HTTP_202_ACCEPTED)
        return JsonResponse(response)

    def _call_tool(self, principal, row, name, arguments):
        """Run one tool, enforcing scope and rate limit, and audit the outcome."""
        tool = tool_registry.get(name, principal.scopes)
        if tool is None:
            raise ValueError(f'Unknown tool: {name}')

        try:
            agent_auth.check_and_record(principal, row, is_write=tool.is_write)
        except agent_auth.RateLimited as exc:
            logger.warning(
                'mcp.rate_limited credential=%s user_id=%s tool=%s kind=%s',
                principal.credential_id, principal.user.id, name, exc.kind,
            )
            return {
                'content': [{'type': 'text', 'text': f'Rate limit exceeded ({exc.kind}). Try again shortly.'}],
                'isError': True,
            }

        started = time.monotonic()
        try:
            payload = tool.handler(principal, arguments)
        except ToolError as exc:
            logger.info(
                'mcp.tool_call credential=%s user_id=%s tool=%s ok=False ms=%d',
                principal.credential_id, principal.user.id, name,
                (time.monotonic() - started) * 1000,
            )
            return {'content': [{'type': 'text', 'text': str(exc)}], 'isError': True}
        except Exception:
            logger.exception(
                'mcp.tool_failed credential=%s user_id=%s tool=%s',
                principal.credential_id, principal.user.id, name,
            )
            return {'content': [{'type': 'text', 'text': 'The tool failed unexpectedly.'}], 'isError': True}

        logger.info(
            'mcp.tool_call credential=%s user_id=%s tool=%s ok=True ms=%d',
            principal.credential_id, principal.user.id, name,
            (time.monotonic() - started) * 1000,
        )
        return {
            'content': [{'type': 'text', 'text': json.dumps(payload, default=str)}],
            'structuredContent': payload,
            'isError': False,
        }
