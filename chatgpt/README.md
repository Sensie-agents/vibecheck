# SomaCheck Vibecheck: ChatGPT plugin package

This folder is the package uploaded to the OpenAI plugins dashboard
("Upload plugin to make changes"). Zip its contents (not the folder) and
upload on the existing SomaCheck Vibecheck plugin; each upload is a new
package version with its own review.

- `plugin.json`: listing metadata under `extensions.com.openai.interface`
  (display name, descriptions, category, URLs, three starter prompts, logo).
- `mcp.json`: the hosted Streamable HTTP server with OAuth dynamic client
  registration. The server origin never changes between versions.
- `skills/vibecheck/SKILL.md` and `REFERENCE.md`: the same skill text as the
  npm runtime of the pinned version, without Claude-only frontmatter.
- `assets/logo.png`: the SomaCheck mark (1024 px square).

Test credentials, the five positive and three negative test cases, and the
demo recording are entered in the dashboard's Review details, never here.
