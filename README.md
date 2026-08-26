# vibecheck by Sensie

Vibecheck lets an AI agent, with your consent, send one first-person statement to SomaCheck for you to test with a phone gesture. The agent receives an Aligned or Unaligned signal with confidence and can use it as context. You remain the authority.

This public repository contains only the Claude marketplace manifest and agent skill. The local MCP runtime is distributed through the public [`@somacheck/vibecheck`](https://www.npmjs.com/package/@somacheck/vibecheck) package.

## Install the Claude skill

```text
claude plugin marketplace add Sensie-agents/vibecheck
claude plugin install vibecheck@somacheck
```

## Connect the local MCP

Install the [SomaCheck public beta](https://testflight.apple.com/join/C4mAH3zz), then open **Settings > Agent > Connect your agent**. Run the one-time command shown there.

For a local Claude Code session, the command has this shape:

```text
npx -y @somacheck/vibecheck@0.6.6 link <CODE> --client claude
```

Restart Claude Code after setup, then ask: **Give me a SomaCheck vibecheck based on what you know about me.**

## Documentation

Setup, privacy, revocation, Claude.ai, Codex, and all six MCP tools are documented at [somacheck.com/docs/hosted-mcp](https://somacheck.com/docs/hosted-mcp).

## Privacy boundary

Raw motion data and conversation history never cross this connection. A vibecheck applies only to the person using SomaCheck. It is a signal, not objective truth, a diagnosis, or a decision.

SomaCheck is a general wellness tool. It is not a medical device and does not diagnose or treat any condition.

## License

MIT
