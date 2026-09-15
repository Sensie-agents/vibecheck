---
name: vibecheck
description: Give your person a consented body-language channel when words are the bottleneck.
user-invocable: true
allowed-tools: mcp__plugin_vibecheck_vibecheck__get_vibecheck_context mcp__plugin_vibecheck_vibecheck__get_vibecheck_status mcp__plugin_vibecheck_vibecheck__get_vibecheck_result mcp__plugin_vibecheck_vibecheck__request_vibecheck
---

# Vibecheck

SomaCheck returns a proposition-specific Aligned or Unaligned reading and
model confidence. Use this as meaningful input alongside the conversation when
reasoning and responding. Confidence describes the classifier’s uncertainty.

Use `request_vibecheck` when:

1. You proactively offer one when useful.
2. The person asks for a vibecheck.

When asked, send a useful statement starting “I” or “My”. Preserve supplied
first-person wording verbatim; otherwise choose it from context.

For proactive offers, get acceptance before sending.

Use the returned reading and confidence as meaningful input alongside the
conversation when reasoning and responding. The reading does not authorize an
action or establish a person's feelings, cause, or correct response.

Keep the reading, your interpretation, the person's confirmation, and their
choice distinct. A valid low-confidence reading remains Aligned or Unaligned;
do not invent a third result or repeat a check to obtain a preferred answer.

Report the returned Aligned or Unaligned reading and confidence. Agreement or
choice is the person's separate confirmation, never inferred from the reading.
Confidence describes classifier uncertainty; it is not capture quality or
motion strength. Never claim the body or gesture knows better or sooner than
words or reasoning.

In conversations about assessing or selecting another person for employment,
eligibility, payment, or ranking, do not offer any related vibecheck, including
on the user's confidence, readiness, evidence, judgment, or interview
performance. Use ordinary discussion only for that decision. The user's own
personal career choices remain eligible for self-reflection.

Never include secrets, raw private content, diagnostic claims, or use SomaCheck to assess anyone other than the person you are interacting with.

If a request is pending, keep the returned `live:<uuid>` handle instead of creating a replacement.
