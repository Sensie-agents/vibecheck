# vibecheck by Sensie

Vibecheck lets an AI agent, with your consent, send one first-person statement to SomaCheck for you to test with a phone gesture. The agent receives an Aligned or Unaligned signal with confidence and can use it as context. You remain the authority.

This public repository contains the Claude marketplace manifest, the agent skill, and a bundled connector to SomaCheck's hosted MCP server. A local, npm-distributed MCP runtime with Claude Code continuation support is also available through the public [`@somacheck/vibecheck`](https://www.npmjs.com/package/@somacheck/vibecheck) package.

## Install the Claude skill and connector

```text
claude plugin marketplace add Sensie-agents/vibecheck
claude plugin install vibecheck@somacheck
```

Installing the plugin also configures the `vibecheck` MCP connector, pointed at SomaCheck's hosted server (`https://mcp.somacheck.com/functions/v1/mcp`). Claude will prompt you to complete OAuth sign-in with your SomaCheck account on first use.

Install the [SomaCheck public beta](https://testflight.apple.com/join/C4mAH3zz) and complete its in-app setup first, then in the CLI or your agent's native app ask: **Give me a SomaCheck vibecheck based on what you know about me.**

## Local MCP alternative

For Claude Code sessions that want automatic continuation when a delayed phone result arrives, link the local npm package instead of the bundled hosted connector:

```text
npx -y @somacheck/vibecheck@0.6.7 link <CODE> --client claude
```

Get `<CODE>` from SomaCheck's **Settings > Agent > Connect your agent**, then restart Claude Code.

## Documentation

Full setup, the six MCP tools, revocation, and troubleshooting for Claude Code, Codex, and Claude.ai: [somacheck.com/docs](https://somacheck.com/docs) ([hosted MCP guide](https://somacheck.com/docs/hosted-mcp)).

## Privacy boundary

Raw motion data and conversation history never cross this connection. A vibecheck applies only to the person using SomaCheck. It is a signal, not objective truth, a diagnosis, or a decision.

SomaCheck is a general wellness tool. It is not a medical device and does not diagnose or treat any condition.

Full privacy policy, including agent connections and data retention: [somacheck.com/privacy](https://somacheck.com/privacy).

## License

MIT
