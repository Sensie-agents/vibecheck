# SomaCheck MCP for Windsurf / Cascade (Devin Desktop)

Manual merge instructions for adding SomaCheck to the Windsurf (now branded
**Devin Desktop / Cascade**) MCP user config.

Canonical value proposition:

> **Body language for AI agents, on your terms.** SomaCheck turns a
> consented three-second phone gesture into an **Aligned** or **Unaligned**
> signal with confidence, giving your agent context for how a thought or
> choice lands for you, while you remain the authority.

The reading is context, never truth, diagnosis, authorization, approval,
or a decision. Raw motion never reaches the agent or any external model
provider.

## Config location

Windsurf reads MCP servers from the per-user file:

```
~/.codeium/windsurf/mcp_config.json
```

Use the **top-level `mcpServers` key** (not `servers`). The remote
SomaCheck server uses `serverUrl`. OAuth is supported; the host
initiates the flow itself, so do not paste a static credential here.

## Manual merge

1. Open `~/.codeium/windsurf/mcp_config.json` in your editor.
2. Preserve every existing entry under `mcpServers`. Do not delete or
   rename other servers.
3. Add the `somacheck` block shown in `mcp_config.json` alongside the
   other servers, keeping valid JSON (commas between objects, no
   trailing comma after the last one).
4. Save the file. Reload Cascade / Devin Desktop so it picks up the
   new server. Initiate the host's OAuth sign-in from the native MCP
   UI; OAuth acceptance and on-phone real confirmation remain
   pending in this build.

Example shape (merge into your existing file, do not replace it):

```json
{
  "mcpServers": {
    "<your-existing-server>": { "...": "..." },
    "somacheck": {
      "serverUrl": "https://mcp.somacheck.com/functions/v1/mcp"
    }
  }
}
```

The Windsurf / Cascade UI may now label the product as **Devin
Desktop** or **Cascade**; the config path and key name above remain
authoritative. For host-side setup details see the official docs:
<https://docs.devin.ai/desktop/cascade/mcp>.

## Try it: a copyable prompt

> Use SomaCheck to vibecheck: I want to simplify this project before
> adding another feature.

## Boundaries

This package is a **configuration package prepared for review**. Actual
Windsurf OAuth completion, tool availability, on-phone acceptance, and
marketplace listing have **not yet been verified** in this build.

## Prerequisites

- Install and open the SomaCheck mobile app on the **phone you intend
  to hold**. The agent cannot capture motion from your laptop; the
  reading lives on the phone you register and calibrate.
- Complete the app's first-run calibration so the phone has a
  personal baseline.
- Sign in to Windsurf / Cascade so the host can complete its own
  OAuth handshake with SomaCheck when the first tool is called.

## Using the server

- Send **one exact proposition per request**, phrased in the first
  person (for example, "I want to send this message as written.").
  The agent receives the proposition, the processed reading, and
  confidence; it never sees raw motion.
- Check the **Home** screen on your own phone; additional queued statements may be
  under **Settings > Vibechecks** when supported by the installed app.
  Requests can expire and delivery is not guaranteed. Report missing
  delivery via the returned status; never promise an indefinite queue.
- After the gesture, call **`get_vibecheck_result`** with the exact
  `request_id` returned by the original vibecheck. Stop on
  `expired`, `cancelled`, or `revoked`. Recheck with a bounded interval;
  do not poll indefinitely, and do not start a second vibecheck in
  parallel.
- An **Unaligned** reading is model-interpreted inner conflict
  relative to the proposition, not its cause or correct response.
  Consider reframing the proposition. The person remains the
  authority on what any reading means.
- Vibechecks can be **cancelled or expire**. Treat a missing or
  expired result as no signal rather than an Unaligned reading.
- **Revoke** the host's access any time by revoking the named
  connection in your SomaCheck account or agent settings.
  Revocation is immediate; the next call will fail until the host
  completes OAuth again.
- No diagnosis, performance, decision, or authorization claim is
  made about any reading. The signal is context for the person and
  the agent; the person decides.
