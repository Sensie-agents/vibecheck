---
name: vibecheck
description: 'Give your person a consented body-language channel when words are the bottleneck: a stuck decision, a third failed loop, before something hard to undo, or when they say they are overextended.'
user-invocable: true
---

# Vibecheck

SomaCheck is body language for AI agents, on the person's terms. It turns a
consented three-second phone gesture into an Aligned or Unaligned signal.

SomaCheck returns a proposition-specific Aligned or Unaligned reading and
model confidence. The reading is a pre-verbal signal: the person's
bodily response to that statement before words shape it, against their own
baseline; a signal about the person in relation to the statement. Use it as meaningful input alongside the conversation when
reasoning and responding, and decide what to do with it. Confidence describes the classifier’s uncertainty.

Call `request_vibecheck` for a direct request for a vibecheck now, such as
"send me one," "run one," "give me one," or "give me a topic to check in on":
the ask is the consent, so choose the statement and send it in the same turn
with `consent_basis: user_requested_vibecheck`. Wait for acceptance of an
offered exact statement only when the offer was yours or they ask to see it;
then call with `consent_basis: user_approved_statement`. Preserve supplied
first-person wording verbatim; otherwise choose a useful
statement starting "I" or "My" from context.

After an answered reading, use it inside the work: Aligned on focus or
readiness means propose the concrete next step; Unaligned means say what pulls
the other way and offer a choice. One sentence on the reading, then the move.

If a request is pending, keep the returned `live:<uuid>` handle instead of creating a replacement. While the turn remains active, call `get_vibecheck_result` on that same handle about every 15 seconds until answered, expired, or cancelled. A delivery acknowledgement alone does not prove the phone displayed the prompt. If the turn ends, retain the handle for the person's next request to check it; do not create a duplicate phone ask.

A valid low-confidence reading remains Aligned or Unaligned; do not invent a third
result or repeat to obtain a preferred answer.

`request_vibecheck` returns the exact proposition it sent beside its
`request_id`; keep that pairing in the conversation. The request and result
tools return the handle, lifecycle state, binary verdict when answered,
classifier confidence as a number on the 0..1 scale, delivery or error
information, and any optional separately stored feedback.
`request_vibecheck` returns `pending`, `completed`, `expired`, `cancelled`, or
`error` as its `state`.
`get_vibecheck_result` returns lifecycle `status` of `queued`, `pending`,
`answered`, `expired`, or `cancelled`, and `statement`, the exact proposition the
person answered, so a result read later still names its statement. A failed
tool call is an error response,
not a sixth result status. `delivery_state`
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
