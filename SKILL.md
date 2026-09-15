---
name: vibecheck
description: Give your person a consented body-language channel when words are the bottleneck.
user-invocable: true
allowed-tools: mcp__plugin_vibecheck_vibecheck__get_vibecheck_context mcp__plugin_vibecheck_vibecheck__get_vibecheck_status mcp__plugin_vibecheck_vibecheck__get_vibecheck_result mcp__plugin_vibecheck_vibecheck__request_vibecheck
---

# Vibecheck

SomaCheck is body language for AI agents, on the person's terms. It turns a
consented three-second phone gesture into an Aligned or Unaligned signal.

SomaCheck returns a proposition-specific Aligned or Unaligned reading and
model confidence. Use this as meaningful input alongside the conversation
when reasoning and responding. Confidence describes the classifier’s
uncertainty.

Use `request_vibecheck` when:

1. You proactively offer one when useful.
2. The person asks for a vibecheck.

When asked, send a useful statement starting "I" or "My". Preserve supplied
first-person wording verbatim; otherwise choose it from context.

For proactive offers, get acceptance before sending.

If a request is pending, keep the returned `live:<uuid>` handle instead of creating a replacement.

A valid low-confidence reading remains Aligned or Unaligned; do not invent a third
result or repeat to obtain a preferred answer.

The result carries the exact proposition, its `request_id`, the Aligned or
Unaligned verdict, classifier confidence as a number on the 0..1 scale,
status or error information, and any optional separately stored feedback.
`request_vibecheck` returns a `pending` or `answered` state.
`get_vibecheck_result` returns lifecycle `status` of `queued`, `pending`,
`answered`, `expired`, `cancelled`, or `error`. `delivery_state`
(`queued`, `processing`, `sent`, `failed`, `skipped`) and `error_code`
are separate fields, not lifecycle states. An unreadable capture is a capture-quality outcome and must be retried; it is not a status.
Creation uses a fresh `idempotency_key` UUID; polling reuses the returned
`live:<uuid>` request handle and never issues a second create.
Authentication and account scoping gate every tool call; one person-scoped
ask at a time.

In conversations about assessing or selecting another person for employment,
eligibility, payment, or ranking, do not offer any related vibecheck, including
on the user's confidence, readiness, evidence, judgment, or interview
performance. Use ordinary discussion only for that decision. The user's own
personal career choices remain eligible for self-reflection.

Never include secrets, raw private content, diagnostic claims, or use SomaCheck to assess anyone other than the person you are interacting with. Raw motion never reaches agents or external models. Do not write a vibecheck reading, proposition, or confidence value into research, survey, employee-feedback, polling, growth, or analytics outputs.
