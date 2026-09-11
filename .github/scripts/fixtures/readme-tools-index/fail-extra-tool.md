# Fixture: fail-extra-tool

Adds a seventh tool to the table. The guard must reject this for having
seven rows instead of six.

## Tools

The vibecheck MCP server exposes six (well, seven) tools.

| Tool | Purpose |
| --- | --- |
| `request_vibecheck` | Immediate phone ask. |
| `get_vibecheck_result` | Read one vibecheck. |
| `get_vibecheck_context` | Read recent check-ins. |
| `get_vibecheck_status` | Read the feed state. |
| `post_vibecheck_statement` | Stock the optional feed. |
| `share_somacheck_context` | Share user-authorized context. |
| `delete_vibecheck_history` | Delete a vibecheck history entry. |
