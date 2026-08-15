"""AI-agent bridge: a generic MCP server over the calling user's own data.

Deliberately separate from the JWT session API so a leaked agent token can't be
used to drive the app as the user. See CLAUDE/agent-mcp.md.
"""
