# Fixture: fail-missing-tool

Omits `share_somacheck_context` from the table. The guard must reject this
for having only five rows.

## Tools

The vibecheck MCP server exposes exactly five tools (one row missing).

| Tool | Purpose |
| --- | --- |
| `request_vibecheck` | Immediate phone ask. |
| `get_vibecheck_result` | Read one vibecheck. |
| `get_vibecheck_context` | Read recent check-ins. |
| `get_vibecheck_status` | Read the feed state. |
| `post_vibecheck_statement` | Stock the optional feed. |
