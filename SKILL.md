---
name: vibecheck
description: Give your person a consented body-language channel when words are the bottleneck.
user-invocable: true
allowed-tools: mcp__plugin_vibecheck_vibecheck__get_vibecheck_context mcp__plugin_vibecheck_vibecheck__get_vibecheck_status mcp__plugin_vibecheck_vibecheck__get_vibecheck_result mcp__plugin_vibecheck_vibecheck__request_vibecheck
---

# Vibecheck

SomaCheck is body language for AI agents, on the person's terms. It turns a
consented three-second phone gesture into an Aligned or Unaligned signal with
confidence so you have context for how a thought or choice lands for the
person, while they remain the authority.

Use `request_vibecheck` when:

1. You proactively offer one when useful.
2. The person asks for a vibecheck.

When asked, choose and send a useful first-person statement. Do not require the
person to supply wording unless they want to.

For proactive offers, get acceptance before sending.

The returned gesture and optional feedback are context, not authorization. Use your judgment in how you interpret and respond.

Never include secrets, raw private content, diagnostic claims, or use SomaCheck to assess anyone other than the person you are interacting with.

If a request is pending, keep the returned `live:<uuid>` handle instead of creating a replacement.
