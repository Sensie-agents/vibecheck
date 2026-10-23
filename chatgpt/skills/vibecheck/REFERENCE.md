# vibecheck protocol reference

Facts about the six tools' fields and lifecycle. What a reading means, what to
say next, and when to offer a check-in are the agent's call; `SKILL.md` carries
the consent rules and boundaries.

## Tools

- `request_vibecheck`: the only tool that sends a statement to the phone. One
  person-scoped ask at a time. Waits up to 45 seconds inline.
- `get_vibecheck_result`: non-blocking read of one request by `request_id`.
- `get_vibecheck_context`: recent completed readings, newest first, each with
  its `statement`, `verdict`, `confidence`, and `answered_at`.
- `get_vibecheck_status`: reflection-feed counts only. It says nothing about the
  phone or any reading.
- `post_vibecheck_statement`: adds one to three items to the optional reflection
  feed; never notifies the phone.
- `share_somacheck_context`: derived, user-authorized observations only.

## request_vibecheck

Input: `statement` (first person, 1 to 1000 characters, sent trimmed),
`idempotency_key` (a fresh UUID per logical ask; the same UUID with the same
statement is a retry and creates no second phone request; the same UUID with a
different statement is a conflict), `consent_basis`
(`user_requested_vibecheck` for a direct request now,
`user_approved_statement` after the person accepted the exact offered
statement).

Output: `state` (`pending`, `completed`, `expired`, `cancelled`, `error`),
`request_id` (`live:<uuid>`, bound to the connection that created it),
`statement` (the input, verbatim), `verdict` (`aligned`, `unaligned`, or null),
`confidence` (0..1 or null), `user_feedback` (`agreed`, `disagreed`,
`not_provided`, optional), `expires_at`, `idempotent_replay`,
`delivery_state` (`queued`, `processing`, `sent`, `failed`, `skipped`),
`cooldown_until`, `error_code`, `continuation_transport` (`poll` or
`claude_channel`), and on a local computer with no link a `setup` object
(`app_url`, `phone_steps`, `link_command`, `saved_statement`).

A delivery acknowledgement does not prove the phone displayed the statement.
A `completed` state with a verdict is the only evidence of a reading.

## get_vibecheck_result

Input: `request_id`. Output: `status` (`queued`, `pending`, `answered`,
`expired`, `cancelled`), `verdict`, `confidence`, `latency_s`,
`delivery_state`, `error_code`, `user_feedback`. It does not return the
proposition text; keep the proposition beside its `request_id`.

Polling: while `pending`, read the same handle about every 15 seconds until
`answered`, `expired`, or `cancelled`. Never create a second request to check
on the first. A request expires ten minutes after creation if no gesture
arrives.

## Capture quality

An unreadable capture asks the person to try again on the phone. It is not a
status and produces no third reading. A valid low-confidence reading is still
`aligned` or `unaligned`.

## Error codes on request_vibecheck

`setup_required` (no link on this computer, or the connection must be set up
again), `link_revoked` (reconnect in the host's connection settings, or in
SomaCheck under Settings, Agent, for a local link), `upgrade_required`,
`request_conflict`, `vibecheck_pending` (one is already waiting; keep it),
`rate_limited`, `live_ask_unavailable`, `backend_unavailable`,
`connection_failed`, plus the delivery codes `delivery_timeout`,
`delivery_failed`, `delivery_skipped`, `delivery_unavailable`,
`response_timeout`.

## Privacy

Raw motion never leaves SomaCheck. The agent receives the proposition, the
reading, the confidence, request status, and separately stored optional
feedback. Authentication and account scoping gate every call.
