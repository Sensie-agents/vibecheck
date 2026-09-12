# vibecheck by Sensie

**Body language for AI agents, on your terms.** SomaCheck turns a consented three-second phone gesture into an Aligned or Unaligned signal with confidence, giving your agent context for how a thought or choice lands for you, while you remain the authority.

The agent never receives raw motion data and cannot use a result as truth,
diagnosis, authorization, approval, or a decision. The signal is context for
reflection; you decide what it means and what happens next.

## Tools

The vibecheck MCP server exposes exactly six tools. Only `request_vibecheck`
creates an immediate phone ask; `post_vibecheck_statement` only stocks the
optional feed when you ask it to. Raw motion and private conversation
history never reach the agent through this connector, and a database state
is never proof of phone display. The signal is context, not truth,
diagnosis, authorization, approval, or a decision.

| Tool | Purpose |
| --- | --- |
| `request_vibecheck` | Send one consented first-person statement to your phone for an immediate vibecheck. The only tool that creates an immediate phone ask; waits up to 45 seconds for the answer. The result is context, not authorization. |
| `get_vibecheck_result` | Read one exact vibecheck by `request_id`. Use this to keep polling an immediate ask about every 15 seconds until the status is answered or expired. |
| `get_vibecheck_context` | Read your recent completed check-ins, newest first, so the agent can use prior outcomes as contextual signals. |
| `get_vibecheck_status` | Read the SomaCheck reflection-feed status before optional posting. Database state does not verify phone display. Use `get_vibecheck_context` for recent completed check-ins. |
| `post_vibecheck_statement` | Stock the optional SomaCheck feed with up to three personalized reflections for the person to consider later. Optional feed stock only; this is not an immediate phone ask and does not verify delivery. |
| `share_somacheck_context` | Share 1-20 concise, user-authorized context observations so SomaCheck can prepare richer propositions. Send derived summaries only; never raw conversation text, photos, credentials, identifiers, or diagnostic claims. |

## First successful vibecheck

Pick the host you actually use. Each route is separate; the next section only
matches the route you choose.

- **Claude Code (local Channel plugin).** Install the plugin and link SomaCheck
  in [Install the Claude Code Channel plugin](#install-the-claude-code-channel-plugin)
  below, then launch Claude Code with the approved Channel command. Channels
  remain the preferred path whenever Anthropic has allowlisted
  `vibecheck@somacheck` (or your Team/Enterprise admin has added it to
  `allowedChannelPlugins`); without that acceptance, plain Claude Code does
  **not** promise automatic next-turn delivery of the answer, so you will use
  the recovery handle described below.
- **Claude.ai and Claude Desktop (hosted OAuth).** The hosted OAuth route is
  served by the separately deployed MCP server at
  `https://mcp.somacheck.com/functions/v1/mcp`; the local Channel plugin does
  not change or claim that deployment. You connect Claude.ai or Claude
  Desktop to that hosted endpoint following
  [somacheck.com/docs/hosted-mcp](https://somacheck.com/docs/hosted-mcp) —
  this README does not assert that Anthropic's hosted OAuth path has
  accepted the plugin on your behalf. Real acceptance has to be observed in
  the host, not inferred from this repository.
- **Cursor and Windsurf.** Use the developer-preview packages in this
  repository's [`cursor/`](cursor/README.md) and
  [`windsurf/`](windsurf/README.md) directories. Their developer-preview
  setup guides are real; actual host OAuth and phone acceptance in each
  client have not been independently verified here, so do not treat
  either route as already accepted.

After the host is ready, ask the agent for **one consented immediate
vibecheck**. The existing explicit ask *is* the consent — do not bolt on
redundant "are you sure?" prompts. The agent picks the tool:

- **Immediate phone ask:** `request_vibecheck`. This is the only tool that
  sends a statement to your phone right now and waits up to 45 seconds for
  the answer. Use it when the user wants a check-in now.
- **Optional feed stock (not an immediate ask):** `post_vibecheck_statement`
  only stocks the reflection feed for later consideration. It does **not**
  ask your phone and does **not** verify delivery — do not choose it when
  the person asked for an immediate vibecheck.

The result returns three separate things: (a) the first-person statement
your agent sent, (b) the binary reading (**Aligned** or **Unaligned**), and
(c) the returned confidence. They are what the server recorded for that
`request_id`. The reading is derived from your phone gesture, but the returned
record alone is not independent proof of what your phone displayed.
**Only your own observation of what your phone actually showed you
confirms the phone display.** The reading is context, never truth,
diagnosis, authorization, approval, or a decision; you remain the
authority. A binary reading of **Unaligned** does not by itself prescribe
a pause or a meaning — you interpret it in your own context, and you
choose what to do next.

If the request is still pending, **keep the same `request_id` handle** and
poll `get_vibecheck_result` about every 15 seconds until the status is
answered, expired, or cancelled. Do not create a second
`request_vibecheck` for the same proposition just to poll status — open
the same SomaCheck app on the same account the original ask went to (or
wait with the existing handle) instead. Wasting a phone ask on a duplicate
is its own problem; preserving the original handle is the recovery path.

Example (non-sensitive, no efficacy claim):

> Agent, give me a vibecheck on "I want to commit to this direction for the
> rest of the week."

This is a *hypothetical* prompt — the only real outcome is the actual
returned result your phone and this server produce together. For example,
**if the actual returned result is `Unaligned` with confidence 0.71**, the
reading is a model interpretation relative to the proposition, not its cause;
the agent may offer to help you reframe the proposition, and *you* decide
whether the original still holds. **If the actual returned result is
`Cancelled`, the request has been terminated and the handle is no longer
polled.** **If the phone is unreachable** (no display, no prompt, no
network), that is a phone-side delivery problem: check the same handle,
confirm you are signed into the same SomaCheck account on the phone, and
retry — it is **not** an unreadable capture and does **not** call for a
third interpretation. **If the capture itself was unreadable** (motion
artifact, dropped gesture, bad baseline), that requires a fresh
`request_vibecheck` after the phone recovers; the unreadable capture is
retried, never reinterpreted.

## What this repository is

This public repository contains the **Claude marketplace manifest** (`.claude-plugin/marketplace.json`), the **Claude plugin manifest** (`.claude-plugin/plugin.json`), the **agent skill** (`SKILL.md`), and a **bundled local Channel server** (`.mcp.json`). The Channel lets an authorized phone result enter the same open Claude Code conversation so Claude can continue without another typed message.

The hosted vibecheck MCP server itself is **not** built from this repo. It is deployed and operated separately by Sensie. The local MCP runtime, with Claude Code continuation support, is distributed under MIT as the public [`@somacheck/vibecheck`](https://www.npmjs.com/package/@somacheck/vibecheck) npm package. This repository's Dockerfile assembles that exact, locked local stdio runtime for Glama's isolated build, security scan, and tool-schema introspection. It does not contain the server source and does not prove the hosted OAuth deployment.

Concretely:

- `SKILL.md` — what Claude reads to decide when a vibecheck would help.
- `.claude-plugin/marketplace.json` — Claude marketplace listing for `claude plugin marketplace add …`.
- `.claude-plugin/plugin.json` — declares the `vibecheck` MCP server as a Claude Channel.
- `.mcp.json` — launches the pinned public npm runtime locally over stdio with Channel support.
- `glama.json` — declares maintainers for the Glama MCP registry; see [Glama docs](https://glama.ai/mcp/methodology).
- `Dockerfile`, `package.json`, and `package-lock.json` — reproducible, non-root Glama image for the local stdio runtime. The image contains no SomaCheck account credential.
- `.github/workflows/ci.yml` — public CI that validates the manifests, builds and probes the Glama image, and guards the README doctrine and version drift. It uses no secrets and performs no deployment or publication.

[![validate manifests](https://github.com/Sensie-agents/vibecheck/actions/workflows/ci.yml/badge.svg)](https://github.com/Sensie-agents/vibecheck/actions/workflows/ci.yml)

## Install the Claude Code Channel plugin

```text
claude plugin marketplace add Sensie-agents/vibecheck
claude plugin install vibecheck@somacheck
```

Installing the plugin configures a local, plugin-scoped `vibecheck` MCP server. It reads the independently revocable Claude credential stored by the link command and never puts that credential in the plugin manifest.

Install the [SomaCheck public beta](https://testflight.apple.com/join/C4mAH3zz) and complete its in-app setup first, then in the CLI or your agent's native app ask: **Give me a SomaCheck vibecheck based on what you know about me.**

## Link SomaCheck and start the Channel

Get `<CODE>` from SomaCheck's **Settings > Agent > Connect your agent**, then link the local runtime:

```text
npx -y @somacheck/vibecheck@0.6.14 link <CODE> --client claude
```

Already linked? Install or repair the managed Claude setup without linking again:

```text
npx -y @somacheck/vibecheck@0.6.14 setup claude
```

Both commands install or update the public plugin, migrate recognized old
SomaCheck registrations, and enable Claude's native marketplace auto-updates
(`autoUpdate: true`) for `somacheck`. Unrelated configuration is preserved;
custom or ambiguous registrations require review and are not silently replaced.
This release is **plugin 0.6.15**, launching **runtime 0.6.14**. These version
numbers are independent.

Future reviewed plugin releases can update through Claude's marketplace.
Updates do not replace the running MCP process mid-conversation; reload the
plugin or start a new session after an update. This does not update the phone
app, Claude.ai, or a manually installed Desktop connector.

Then start Claude Code with this plugin's Channel:

```text
claude --channels plugin:vibecheck@somacheck
```

Anthropic currently permits that safe command only after either Anthropic has
allowlisted the plugin or a Team/Enterprise administrator has added
`vibecheck@somacheck` to `allowedChannelPlugins`. While Anthropic reviews the
plugin, its development-only acceptance test still uses the warning-gated
development flag. That flag is not the intended user experience.

Keep the session open; a closed session cannot receive Channel events. The
stable request handle remains the recovery path if an event is not delivered.
Claude Code does not acknowledge Channel notifications, so the plugin does not
also install a competing wake hook that could continue the same result twice.

Claude.ai remains available through the separately deployed hosted OAuth
connector at `https://mcp.somacheck.com/functions/v1/mcp`; the local Channel
plugin does not change or claim that deployment.

### Glama/local container boundary

The Glama release represents the **local stdio runtime**, not the separately hosted OAuth connector. It can be started without a credential so Glama can inspect its six tool schemas. Actual tool calls remain account-bound and fail with setup guidance until the person has linked SomaCheck.

For a single person's self-hosted local use, mount that person's existing link configuration read-only:

```text
docker run --rm -i -v "$HOME/.sensie:/home/node/.sensie:ro" somacheck-vibecheck:0.6.14
```

Never bake a pairing code, token, or `config.json` into the image. Do not share one mounted configuration between people or use this image as a multi-tenant service. Glama schema discovery alone is not evidence of an authenticated phone round trip.

## Documentation

### Cursor and Windsurf

Use the [Cursor setup package](cursor/README.md) to add SomaCheck's hosted
connection and skill to a project. Its installer previews changes, preserves
existing configuration, and verifies the result. The
[Windsurf / Cascade setup guide](windsurf/README.md) includes the native
remote-server configuration.

Both use your own SomaCheck OAuth connection and phone. These are developer
preview packages; actual host OAuth and phone acceptance and marketplace
listings remain to be verified. Claude Code Channels are a separate host
capability.

Full setup, the six MCP tools, revocation, and troubleshooting for Claude Code, Codex, and Claude.ai: [somacheck.com/docs](https://somacheck.com/docs) ([hosted MCP guide](https://somacheck.com/docs/hosted-mcp)).

## Privacy boundary

Raw motion data and conversation history never cross this connection. A vibecheck applies only to the person using SomaCheck. It is a signal, not objective truth, a diagnosis, or a decision.

SomaCheck is a general wellness tool. It is not a medical device and does not diagnose or treat any condition.

Full privacy policy, including agent connections and data retention: [somacheck.com/privacy](https://somacheck.com/privacy).

## License

MIT
