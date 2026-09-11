# SomaCheck for Cursor

**Body language for AI agents, on your terms.** SomaCheck turns a consented
three-second phone gesture into an Aligned or Unaligned signal with confidence,
giving Cursor context for how a thought or choice lands for you, while you
remain the authority.

This package contains one hosted MCP connection and one skill for Cursor.
You need your own SomaCheck account and iPhone with the
[SomaCheck beta](https://testflight.apple.com/join/C4mAH3zz) installed and
in-app setup and calibration completed.

## Developer preview install

Use the project setup below while marketplace review and real host acceptance
remain open. The package also includes the
[Cursor plugin manifest](https://cursor.com/docs/reference/plugins) for
marketplace submission. Project setup uses Cursor's documented locations:

1. **MCP server** — the one entry from this package's `mcp.json` merged into
   your project's `.cursor/mcp.json` (created if it doesn't exist). Merged,
   not overwritten: any servers already declared there survive untouched.
2. **Skill** — `skills/somacheck/SKILL.md` from this package copied to
   `.cursor/skills/somacheck/SKILL.md` in your project. Cursor's
   [Agent Skills docs](https://cursor.com/docs/skills) list `.cursor/skills/`
   as a project-level skill discovery location, loaded automatically on
   startup.
3. Restart Cursor (or reload the MCP connection) to pick up both changes.

From this package's directory (the directory containing this README),
`scripts/preview-install.mjs` automates steps 1–2 for your chosen project:

```
# Preview only — writes nothing, prints what would change.
node scripts/preview-install.mjs --project /path/to/your/project

# Write the merge/copy above. Safe to run more than once: an already
# up-to-date project makes zero changes on a second run.
node scripts/preview-install.mjs --project /path/to/your/project --apply

# Check an already-installed project against this package without writing
# anything (exact server url/fields, exact skill content).
node scripts/preview-install.mjs --project /path/to/your/project --verify
```

It refuses to touch a project when it can't do so safely: an existing
`somacheck` MCP server entry that doesn't exactly match this package's (extra
headers, a `command`, or a different URL), an existing skill file with
different content, malformed or non-object JSON, or any symlinked/escaping
target path all fail with **no writes**, to either target. Both targets are
preflighted before anything is written, and if writing the second target ever
fails after the first succeeded, the first write is rolled back — it never
deletes a pre-existing file or directory it didn't itself create. If a
concurrent edit is detected during rollback, that user content is left
untouched and the command reports that manual review is required. It does
not reformat or reorder unrelated `.cursor/mcp.json` content; it only splices
in the one `somacheck` entry.

This is a **developer preview**, not marketplace-plugin-install proof: it
confirms the MCP server and skill content are usable inside Cursor's
documented config locations, not that this specific `.cursor-plugin/`
bundle format loads through any packaged installer, and not that Cursor
itself has loaded or verified the result — run `--verify` after installing
to re-check the files on disk, not Cursor's own state.

### Import preview

What the two files above add to your project's Cursor config:

- One MCP server, `somacheck`, pointed at the hosted production endpoint
  `https://mcp.somacheck.com/functions/v1/mcp`.
- One skill, `somacheck`, describing when and how to offer or request a
  vibecheck.
- No rules, agents, commands, hooks, or variables. No API token or secret is
  declared or required — see below.

## OAuth and your own phone

`mcp.json` declares only a `url`, no static headers or token variables. The
`somacheck` MCP server is an OAuth-protected resource: it publishes its
protected-resource metadata at
`https://mcp.somacheck.com/functions/v1/mcp/.well-known/oauth-protected-resource`
(a path under the resource itself, not the bare `mcp.somacheck.com` origin),
and also returns that same URL in a `WWW-Authenticate` challenge header on an
unauthenticated request. [Cursor supports MCP OAuth](https://cursor.com/docs/mcp)
and initiates the browser sign-in. There is
no shared API key in this plugin, in this repo, or in Cursor's config — every
person authorizes their own account.

Consent happens twice, deliberately:

1. **Account-level (OAuth):** you approve Cursor's connection to your own
   SomaCheck account once, in the browser.
2. **Per-check-in:** the agent still needs your acceptance of the specific
   proposition before it sends a vibecheck to your phone (see
   `skills/somacheck/SKILL.md`), unless you asked for the vibecheck yourself.

## First gesture, poll, and revoke

Ask Cursor: **Use SomaCheck to vibecheck: “I want to simplify this project
before adding another feature.”**

For the first real host test, verify that Cursor completes sign-in and lists
the SomaCheck tools before requesting a check. Record any authentication
error without including tokens or authorization URLs. File installation and
public endpoint checks do not establish that this host acceptance passed.

1. **Request:** the agent calls `request_vibecheck` with a proposition and
   your consent basis. This sends one request to your phone.
2. **Gesture:** perform the three-second phone movement. Raw motion never
   reaches Cursor, the agent, or Cursor's model provider — only the result
   does.
3. **Poll:** if you don't answer immediately, the agent calls
   `get_vibecheck_result` with the returned `request_id` rather than creating
   a new request. `get_vibecheck_status` reports the reflection cache, not the
   individual request's result.
4. **Result:** the agent receives **Aligned** or **Unaligned** plus a
   confidence value, and uses it as context — never as an instruction,
   authorization, or assessment of you.
5. **Revoke:** disconnect the plugin's OAuth grant from your SomaCheck
   account settings at any time. A revoked connection fails safely on the
   next request; no result is invented and no other identity is substituted.

## Validate this package

```
node --test scripts/validate.test.mjs
```

This checks manifest/MCP-config structure: malformed or `null` JSON, a
non-string or non-kebab-case `name`, any `".."` path segment or symlink that
would escape the plugin root, missing referenced files (including a declared
`logo`), and an `mcp.json` `url` that is missing, non-`https`, carries
embedded credentials, or is a `command`/`headers` entry (unsupported by this
URL-only package). It confirms the package is **structurally valid**; it does
not run inside the actual Cursor host or certify a marketplace listing.

## Test the preview installer

```
node --test scripts/preview-install.test.mjs
```

Covers dry run (no writes), apply, idempotence (a second apply makes zero
changes), byte-for-byte preservation of unrelated `.cursor/mcp.json` content,
conflicting/malformed/symlinked targets each failing with no writes, `--verify`
against this package's existing validator, duplicate-key rejection, restrictive
file modes, stale-plan detection, and rollback of an already-applied write
when a later one in the same run fails. Passing this suite does not by itself
mean Cursor has loaded the installed result — that still needs `--verify`
against a real project, and ultimately a human confirming Cursor picks up the
merged server and skill.

## License and public distribution

MIT. See [LICENSE](LICENSE). The public distribution repository is
[Sensie-agents/vibecheck](https://github.com/Sensie-agents/vibecheck).
This package covers the connection configuration, skill, and installer;
the separately operated hosted service requires your own SomaCheck account.

## Brand

Body language for AI agents, on your terms. The
approved SomaCheck logo asset was not found in this repository, so no logo is
referenced here — do not add one without confirming it is the approved asset.
