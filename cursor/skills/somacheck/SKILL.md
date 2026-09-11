---
name: somacheck
description: Ask the person for a SomaCheck vibecheck when a coding decision or direction is genuinely unclear in words. Use when the person requests one, or offer one and get their acceptance before sending.
---

# SomaCheck

SomaCheck gives the person an optional three-second phone check-in on their own device. Use the `somacheck` MCP server's `request_vibecheck` tool in either case:

1. The person asks for a vibecheck.
2. You believe one would help and the person accepts your exact proposed first-person statement first. Never send without that acceptance.

When the person asks, choose a concise, first-person proposition from the context available (for example, about which of two approaches to take next) and send it yourself — do not make them supply wording unless they want to.

The result is **Aligned** or **Unaligned** plus confidence, in relation to the proposition. Use your judgment in how you interpret and respond. The signal is not authorization to act or a test of code correctness or anyone's performance.

If a request is pending, use `get_vibecheck_result` with its returned `request_id` instead of creating a duplicate. If phone delivery failed or was skipped, help the person follow the returned setup instructions first. Never include secrets, source code, or raw private content in a proposition, and never use SomaCheck to assess anyone other than the person you are working with.
