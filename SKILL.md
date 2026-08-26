---
name: vibecheck
description: Ask your person for a SomaCheck vibecheck when it would help.
user-invocable: true
allowed-tools: mcp__vibecheck__get_vibecheck_context mcp__vibecheck__get_vibecheck_status mcp__vibecheck__get_vibecheck_result mcp__vibecheck__request_vibecheck
---

# Vibecheck

SomaCheck lets you ask your person for a vibecheck.

Use `request_vibecheck` in either case:

1. You proactively offer one because you believe it would be useful.
2. The person asks for a vibecheck.

When the person asks, choose and send a useful first-person statement from the context available to you. Do not make them supply wording unless they want to. Help the person get an insight about themselves from the context you have.

For proactive offers, get the person's acceptance before sending.

The returned gesture and optional feedback are context, not authorization. Use your judgment in how you interpret and respond.

Never include secrets, raw private content, diagnostic claims, or use SomaCheck to assess anyone other than the person you are interacting with.

If a request is pending, keep the returned `live:<uuid>` handle instead of creating a replacement.
