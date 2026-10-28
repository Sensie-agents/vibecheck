# SomaCheck Vibecheck: ChatGPT plugin package

This folder is the package uploaded to the OpenAI plugins dashboard
("Upload plugin to make changes"). Zip its contents (not the folder) and
upload on the existing SomaCheck Vibecheck plugin; each upload is a new
package version with its own review.

- `plugin.json`: listing metadata under `extensions.com.openai.interface`
  (display name, descriptions, category, URLs, three starter prompts, logo).
- `mcp.json`: the hosted Streamable HTTP server, URL only. The portal keeps the
  app's existing OAuth connection and rejects an auth block in the ZIP; the
  server origin never changes between versions. `plugin.json` `name` must equal
  the portal package name (`app-6aa2bf7c89148191bb2be7b73eb06cb6`).
- `skills/vibecheck/SKILL.md` and `REFERENCE.md`: the same skill text as the
  npm runtime of the pinned version, without Claude-only frontmatter.
- `assets/logo.png`: the SomaCheck mark (1024 px square).

- `extensions.com.openai.review`: the five positive and three negative test
  cases the review team runs, plus the commerce declaration. The portal imports
  them from the ZIP (the Review details drawer is not shown for updates to this
  plugin, so the manifest is the reliable channel). Reviewer credentials are
  never in this package: they go in the Submit dialog's private "Additional
  Submission Context" field at submission time.
