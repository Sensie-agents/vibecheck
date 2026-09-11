# Fixture: fail-duplicate-tool

Lists `request_vibecheck` twice and omits `share_somacheck_context`. Six
total rows but one is duplicated, so the duplicate check trips.

## Tools

The vibecheck MCP server exposes six tools (one is repeated).

| Tool | Purpose |
| --- | --- |
| `request_vibecheck` | Immediate phone ask. |
| `get_vibecheck_result` | Read one vibecheck. |
| `get_vibecheck_context` | Read recent check-ins. |
| `get_vibecheck_status` | Read the feed state. |
| `post_vibecheck_statement` | Stock the optional feed. |
| `request_vibecheck` | Same tool listed again, which is a duplicate. |
