# Fixture: fail-renamed-tool

Renames `share_somacheck_context` to a non-canonical name. Six total rows
but the last row is not the expected canonical tool, so the per-position
check trips.

## Tools

The vibecheck MCP server exposes six tools (one has been renamed).

| Tool | Purpose |
| --- | --- |
| `request_vibecheck` | Immediate phone ask. |
| `get_vibecheck_result` | Read one vibecheck. |
| `get_vibecheck_context` | Read recent check-ins. |
| `get_vibecheck_status` | Read the feed state. |
| `post_vibecheck_statement` | Stock the optional feed. |
| `share_somacheck_observations` | Renamed: was share_somacheck_context. |
