# vibecheck by Sensie

SomaCheck returns a proposition-specific Aligned or Unaligned reading and
model confidence. Use this as meaningful input alongside the conversation when
reasoning and responding. Confidence describes the classifier’s uncertainty.

The agent never receives raw motion data.

## Tools

The vibecheck MCP server exposes exactly six tools. Only `request_vibecheck`
creates an immediate phone ask; `post_vibecheck_statement` only stocks the
optional feed when you ask it to. Raw motion and private conversation
history never reach the agent through this connector, and a database state
is never proof of phone display.

| Tool | Purpose |
| --- | --- |
| `request_vibecheck` | Ask the person's body now: send one statement to their phone and wait up to 45 seconds for a precognitive reading, Aligned or Unaligned. |
| `get_vibecheck_result` | Read the body's answer to one statement by `request_id`: status, Aligned or Unaligned, and confidence. Non-blocking; poll while pending. |
| `get_vibecheck_context` | Read the person's recent completed readings, newest first, as precognitive context. Not for one pending ask. |
| `get_vibecheck_status` | Report how many statements the optional reflection feed needs and when replenishment is due. Says nothing about the phone or any reading. |
| `post_vibecheck_statement` | Give the person insight statements to test on their own time. Adds one to three items to the optional reflection feed, returns immediately, never notifies the phone. |
| `share_somacheck_context` | Share 1–20 bounded, derived, user-authorized observations; raw conversations and secrets are rejected. |

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
confirms the phone display.**

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
**if the actual returned result is `Unaligned` with confidence 0.71**.
**If the actual returned result is
`Cancelled`, the request has been terminated and the handle is no longer
polled.** **If the phone is unreachable** (no display, no prompt, no
network), keep and check the same handle, then check delivery, account, and
connection state, including whether you are signed into the same SomaCheck
account on the phone. This is **not** an unreadable capture. **If the capture itself was unreadable** (motion
artifact, dropped gesture, bad baseline), retry the gesture in the app against
the original pending ask; retry the gesture; do not treat the unreadable capture as a result. Create a fresh `request_vibecheck` only after the original ask
is terminal and the person explicitly wants a new ask.

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
npx -y @somacheck/vibecheck@0.6.20 link <CODE> --client claude
```

Already linked? Install or repair the managed Claude setup without linking again:

```text
npx -y @somacheck/vibecheck@0.6.20 setup claude
```

Both commands install or update the public plugin, migrate recognized old
SomaCheck registrations, and enable Claude's native marketplace auto-updates
(`autoUpdate: true`) for `somacheck`. Unrelated configuration is preserved;
custom or ambiguous registrations require review and are not silently replaced.
This release is **plugin 0.6.20**, launching **runtime 0.6.20**. These version
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
docker run --rm -i -v "$HOME/.sensie:/home/node/.sensie:ro" somacheck-vibecheck:0.6.20
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

Raw motion data and conversation history never cross this connection. A vibecheck applies only to the person using SomaCheck.

SomaCheck is a general wellness tool. It is not a medical device and does not diagnose or treat any condition.

Full privacy policy, including agent connections and data retention: [somacheck.com/privacy](https://somacheck.com/privacy).

## License

MIT
