# vibecheck by Sensie

**Body language for AI agents, on your terms.** SomaCheck turns a consented three-second phone gesture into an Aligned or Unaligned signal with confidence, giving your agent context for how a thought or choice lands for you, while you remain the authority.

The agent never receives raw motion data and cannot use a result as truth,
diagnosis, authorization, approval, or a decision. The signal is context for
reflection; you decide what it means and what happens next.

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
npx -y @somacheck/vibecheck@0.6.12 link <CODE> --client claude
```

Version 0.6.12's link command also installs its compatibility plugin and an exact
user-scoped MCP entry. Before testing this marketplace candidate, remove those
two older surfaces so Claude sees one `vibecheck` toolset:

```text
claude mcp remove --scope user vibecheck
claude plugin uninstall vibecheck@somacheck-local
```

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
docker run --rm -i -v "$HOME/.sensie:/home/node/.sensie:ro" somacheck-vibecheck:0.6.12
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
