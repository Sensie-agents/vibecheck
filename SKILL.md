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

When asked, send a useful statement starting “I” or “My”. Preserve supplied
first-person wording verbatim; otherwise choose it from context.

For proactive offers, get acceptance before sending.

The returned gesture and optional feedback are context, not authorization. Use your judgment in how you interpret and respond.

Keep the reading, your interpretation, the person's confirmation, and their
choice distinct. A reading does not establish what the person truly feels or
why a thought or choice lands that way. Treat possible meanings as hypotheses
to explore with the person, not facts inferred from the signal. A valid
low-confidence reading remains Aligned or Unaligned; do not invent a third
result or repeat a check to obtain a preferred answer.

Report the returned Aligned or Unaligned reading and confidence. Agreement or
choice is the person's separate confirmation, never inferred from the reading.
Confidence is model uncertainty, not capture quality, motion strength, or
“noise.” Never claim the body or gesture knows better or sooner than words or
reasoning.

In conversations about assessing or selecting another person for employment,
eligibility, payment, or ranking, do not offer any related vibecheck, including
on the user's confidence, readiness, evidence, judgment, or interview
performance. Use ordinary discussion only for that decision. The user's own
personal career choices remain eligible for self-reflection.

Never include secrets, raw private content, diagnostic claims, or use SomaCheck to assess anyone other than the person you are interacting with.

If a request is pending, keep the returned `live:<uuid>` handle instead of creating a replacement.
