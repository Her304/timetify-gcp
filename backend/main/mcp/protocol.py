"""JSON-RPC 2.0 envelope + MCP method dispatch.

Hand-rolled rather than pulled from the official SDK: that SDK is asyncio /
Starlette shaped and this is a sync WSGI Django app, and keeping the wire
surface here means a spec revision is a patch to this file instead of a
dependency upgrade across an async boundary.
"""

import logging

from . import tools as tool_registry

logger = logging.getLogger(__name__)

SERVER_NAME = 'timetify'
SERVER_VERSION = '1.0.0'

# Newest first. We echo back the client's version when we know it, otherwise we
# answer with our preferred one and let the client decide whether to continue.
SUPPORTED_PROTOCOL_VERSIONS = ('2025-06-18', '2025-03-26', '2024-11-05')
PREFERRED_PROTOCOL_VERSION = SUPPORTED_PROTOCOL_VERSIONS[0]

PARSE_ERROR      = -32700
INVALID_REQUEST  = -32600
METHOD_NOT_FOUND = -32601
INVALID_PARAMS   = -32602
INTERNAL_ERROR   = -32603


def _result(req_id, payload):
    return {'jsonrpc': '2.0', 'id': req_id, 'result': payload}


def _error(req_id, code, message):
    return {'jsonrpc': '2.0', 'id': req_id, 'error': {'code': code, 'message': message}}


def _handle_initialize(principal, params):
    client_version = (params or {}).get('protocolVersion')
    version = client_version if client_version in SUPPORTED_PROTOCOL_VERSIONS else PREFERRED_PROTOCOL_VERSION
    return {
        'protocolVersion': version,
        'capabilities': {'tools': {'listChanged': False}},
        'serverInfo': {'name': SERVER_NAME, 'version': SERVER_VERSION},
        'instructions': (
            "Timetify exposes this user's own schedule and availability. "
            "Tools that create a class or an event are two-step: call once to "
            "get a preview and a confirmation_token, show that preview to the "
            "user, and only call again with the token once they have agreed."
        ),
    }


def _handle_tools_list(principal, params):
    # Filtered by scope, so an agent never sees a tool it would only be refused
    # on — the token's grant is legible from tools/list alone.
    return {'tools': [t.describe() for t in tool_registry.for_scopes(principal.scopes)]}


def _handle_tools_call(principal, params, on_tool_call):
    params = params or {}
    name = params.get('name')
    arguments = params.get('arguments') or {}

    if not isinstance(name, str) or not name:
        raise ValueError('tools/call requires a string "name"')
    if not isinstance(arguments, dict):
        raise ValueError('tools/call "arguments" must be an object')

    return on_tool_call(name, arguments)


def dispatch(message, principal, on_tool_call):
    """Handle one JSON-RPC request object.

    Returns a response dict, or None for notifications (which by spec get no
    response body at all).
    """
    if not isinstance(message, dict):
        return _error(None, INVALID_REQUEST, 'Request must be a JSON object')

    req_id = message.get('id')
    method = message.get('method')
    params = message.get('params')
    is_notification = 'id' not in message

    if not isinstance(method, str):
        return None if is_notification else _error(req_id, INVALID_REQUEST, 'Missing "method"')

    # Notifications: acknowledge by staying silent. `notifications/initialized`
    # is the only one we expect; unknown ones are ignored rather than erroring,
    # since a notification has no id to answer on anyway.
    if is_notification or method.startswith('notifications/'):
        return None

    try:
        if method == 'initialize':
            return _result(req_id, _handle_initialize(principal, params))
        if method == 'ping':
            return _result(req_id, {})
        if method == 'tools/list':
            return _result(req_id, _handle_tools_list(principal, params))
        if method == 'tools/call':
            return _result(req_id, _handle_tools_call(principal, params, on_tool_call))
        return _error(req_id, METHOD_NOT_FOUND, f'Unknown method: {method}')
    except ValueError as exc:
        return _error(req_id, INVALID_PARAMS, str(exc))
    except Exception:
        # Never surface a traceback to an external agent; the log line carries
        # the detail for us.
        logger.exception('mcp.dispatch_failed method=%s credential=%s', method, principal.credential_id)
        return _error(req_id, INTERNAL_ERROR, 'Internal error')
