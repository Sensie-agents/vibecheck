import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const readJson = (path) => JSON.parse(readFileSync(join(root, path), "utf8"));
const readText = (path) => readFileSync(join(root, path), "utf8");

const wrapper = readJson("package.json");
const lockfile = readJson("package-lock.json");
const marketplace = readJson(".claude-plugin/marketplace.json");
const manifest = readJson(".claude-plugin/plugin.json");
const mcpConfig = readJson(".mcp.json");
const runtimeVersion = wrapper.dependencies?.["@somacheck/vibecheck"];
const plugin = marketplace.plugins?.find(({ name }) => name === "vibecheck");
const channelServer = mcpConfig.mcpServers?.vibecheck;
const publishedBaseline = { plugin: "0.6.14", runtime: "0.6.13" };
const semverParts = (version) => version.split(".").map(Number);
const compareSemver = (left, right) => {
  const a = semverParts(left);
  const b = semverParts(right);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
};

assert.match(runtimeVersion ?? "", /^\d+\.\d+\.\d+$/, "runtime must pin an exact SemVer");
assert.equal(wrapper.private, true, "the Glama wrapper must remain private");
assert.equal(plugin?.source, ".", "the public Claude plugin must source from this repository");
assert.equal(plugin?.version, manifest.version, "marketplace and plugin manifest versions must agree");
assert.match(plugin?.version ?? "", /^\d+\.\d+\.\d+$/, "plugin must use SemVer");
if (runtimeVersion !== publishedBaseline.runtime) {
  assert.ok(compareSemver(plugin.version, publishedBaseline.plugin) > 0,
    "a changed runtime pin requires a plugin version newer than the published plugin");
}
assert.equal(lockfile.packages?.[""]?.dependencies?.["@somacheck/vibecheck"], runtimeVersion,
  "package-lock root dependency must match the wrapper");
assert.equal(lockfile.packages?.[`node_modules/@somacheck/vibecheck`]?.version, runtimeVersion,
  "package-lock installed runtime must match the wrapper");

assert.deepEqual(manifest.channels, [{ server: "vibecheck" }],
  "the plugin must bind its vibecheck MCP server as a Channel");
assert.equal(channelServer?.command, "npx", "the Channel must use the portable npx launcher");
assert.deepEqual(channelServer?.args, [
  "-y",
  `@somacheck/vibecheck@${runtimeVersion}`,
  "serve",
  "--client",
  "claude",
  "--channel",
], "the Channel must launch the exact pinned Claude runtime");
assert.equal("url" in (channelServer ?? {}), false,
  "the Channel plugin must not silently fall back to the hosted OAuth connector");

const skill = readText("SKILL.md");
for (const tool of [
  "get_vibecheck_context",
  "get_vibecheck_status",
  "get_vibecheck_result",
  "request_vibecheck",
]) {
  assert.match(skill, new RegExp(`mcp__plugin_vibecheck_vibecheck__${tool}`),
    `skill must allow the plugin-scoped ${tool} tool`);
}
assert.doesNotMatch(skill, /mcp__vibecheck__/,
  "public Claude plugin skill must not retain direct-server tool names");

const readme = readText("README.md");
assert.match(readme, new RegExp(`@somacheck/vibecheck@${runtimeVersion.replaceAll(".", "\\.")}`),
  "README local install must pin the reviewed runtime");
assert.match(readme, new RegExp(`plugin ${plugin.version.replaceAll(".", "\\.")}`),
  "README must identify the independently versioned plugin release");
assert.match(readme, /claude plugin install vibecheck@somacheck/, "README must retain the plugin install");
assert.match(readme, /## Link SomaCheck and start the Channel/, "README must identify the primary Claude Code Channel path");
assert.match(readme, /claude --channels plugin:vibecheck@somacheck/,
  "README must include the approved Channel launch command");
assert.match(readme, new RegExp(`@somacheck/vibecheck@${runtimeVersion.replaceAll(".", "\\.")} setup claude`),
  "README must use the reviewed managed upgrade path");
assert.match(readme, /autoUpdate: true/,
  "README must explain native marketplace auto-updates");
assert.doesNotMatch(readme, /claude mcp remove --scope user vibecheck/,
  "README must not instruct unconditional removal of potentially custom user configuration");

const dockerfile = readText("Dockerfile");
assert.match(dockerfile, new RegExp(`org\\.opencontainers\\.image\\.version=\\"${runtimeVersion.replaceAll(".", "\\.")}\\"`),
  "Docker metadata must identify the reviewed runtime");
assert.match(dockerfile, /ENTRYPOINT \["\.\/node_modules\/\.bin\/vibecheck"\]/,
  "Docker must invoke the local runtime binary");

for (const [path, contents] of [
  [".claude-plugin/marketplace.json", readText(".claude-plugin/marketplace.json")],
  [".claude-plugin/plugin.json", readText(".claude-plugin/plugin.json")],
  [".mcp.json", readText(".mcp.json")],
  ["package.json", readText("package.json")],
  ["package-lock.json", readText("package-lock.json")],
  ["README.md", readme],
  ["Dockerfile", dockerfile],
]) {
  assert.equal(contents.includes("0.6.7"), false, `${path} retains stale 0.6.7 metadata`);
  assert.equal(contents.includes("0.6.9"), false, `${path} retains stale 0.6.9 metadata`);
}

// First successful-use route must keep the three host paths separate,
// surface the immediate-ask recovery flow, and refuse to hallucinate
// phone-display proof. These are static guidance gates; real host/phone
// acceptance is unperformed by this verifier.
//
// The live README and every negative mutation below run through the same
// `validateFirstUse(text, label)` function so the live guard and the
// mutation guard can never silently disagree about the doctrine.
const FIRST_USE_REQUIRED = [
  /## First successful vibecheck/,
  /Claude Code \(local Channel plugin\)/,
  /Claude\.ai and Claude Desktop \(hosted OAuth\)/,
  /Cursor and Windsurf\b/,
  /request_vibecheck/,
  /post_vibecheck_statement/,
  /keep the same `request_id` handle/,
  /Only your own observation of what your phone actually showed you\s*\n?confirms the phone display/i,
  /you remain the authority/i,
  /without that acceptance, plain Claude Code does[\s\n]+?\*\*not\*\*[\s\S]{0,200}next-turn delivery/i,
  /existing explicit ask \*is\* the consent/i,
];
const FIRST_USE_PROHIBITED = [
  // No claimed host acceptance that this repo cannot prove.
  /Devin Desktop/i,
  /both hosts? (host|have) (their own )?(marketplace|pending)/i,
  // No claim that a duplicate ask overwrites the first pending handle —
  // we cannot observe server-side behaviour, so we tell people to
  // preserve the original handle and never assert what the duplicate does.
  /duplicate (will|will|might)? ?overwrite[s]? (the )?first (pending )?handle/i,
  // The hallucinated proof phrase we explicitly removed from the README.
  /matched proposition,?\s*binary reading,?\s*and confidence (together )?confirm what the phone saw/i,
  // No fixed interpretation prescribed for Unaligned.
  /is a signal to pause/i,
  // An unreadable capture preserves the original pending ask. Creating a
  // fresh request at this point can duplicate or conflict with that ask.
  /unreadable[\s\S]{0,180}requires? (?:a )?fresh `request_vibecheck`/i,
  // Unconditional Channel delivery must never be promised without an
  // allowlisted plugin.
  /Claude Code always delivers the answer automatically/i,
];
// `quota=exactly N` style cap must never be presented as an immediate-ask
// or per-check-in limit on `request_vibecheck`. The feed-stock tool has
// its own reviewed cap; the phone ask does not. Both the literal marker
// AND natural prose like "exactly 3 propositions required" must fail.
const QUOTA_LITERAL = /quota\s*=\s*exactly\s*\d+/i;
const QUOTA_NATURAL = /(?:request_vibecheck[\s\S]{0,400}exactly\s*\d+[\s\S]{0,80}(?:proposition|statement|ask|required|limit|check[\s-]?in))|(?:exactly\s*\d+[\s\S]{0,80}(?:proposition|statement|ask|required|limit|check[\s-]?in)[\s\S]{0,200}request_vibecheck)/i;

function validateFirstUse(text, label = "live") {
  for (const match of text.matchAll(/@somacheck\/vibecheck@(\d+\.\d+\.\d+)/g)) {
    assert.equal(match[1], runtimeVersion, `[${label}] stale runtime command`);
  }
  // Run prohibited-phrase checks first so a regression that adds a
  // prohibited claim trips the validator for the prohibited reason,
  // not for an incidental required-pattern gap left by the same edit.
  for (const pattern of FIRST_USE_PROHIBITED) {
    assert.doesNotMatch(text, pattern,
      `[${label}] first-use section must not match prohibited /${pattern.source}/`);
  }
  assert.doesNotMatch(text, /Claude Code always delivers the answer automatically/i,
    `[${label}] unconditional Channel delivery must not be promised without allowlist`);
  for (const pattern of FIRST_USE_REQUIRED) {
    assert.match(text, pattern,
      `[${label}] first-use section must satisfy /${pattern.source}/; real host/phone acceptance is unperformed`);
  }
  assert.match(text, /Channel[\s\S]{0,120}preferred/i,
    `[${label}] Channels must remain the preferred path when allowlisted`);
  assert.doesNotMatch(text,
    /database[\s\S]{0,120}proves?[\s\S]{0,40}(phone|display|displayed)/i,
    `[${label}] database state must not be claimed as proof of phone display`);
  assert.doesNotMatch(text, /database row proves/i,
    `[${label}] database row must not be claimed as proof`);
  // Mark the immediate-ask sentence explicitly. Negative mutations below
  // pin both the positive and the wrong-tool assertion in one validator
  // call so they cannot drift apart.
  assert.match(text,
    /Immediate phone ask:\*\*\s*`request_vibecheck`/,
    `[${label}] first-use section must mark request_vibecheck as the immediate phone ask`);
  assert.doesNotMatch(text,
    /Immediate phone ask:\*\*\s*`post_vibecheck_statement`/,
    `[${label}] first-use section must not mark post_vibecheck_statement as the immediate phone ask`);
  // Quota cap, both literal marker and natural phrasing.
  assert.doesNotMatch(text, QUOTA_LITERAL,
    `[${label}] must not advertise a quota=exactly N cap on request_vibecheck`);
  assert.doesNotMatch(text, QUOTA_NATURAL,
    `[${label}] must not advertise a natural "exactly N propositions required" feed cap on request_vibecheck`);
  // Cross-reference the canonical install guard so a stale runtime pin or a
  // missing `setup claude` line trips this checker too.
  assert.match(text,
    new RegExp(`@somacheck/vibecheck@${runtimeVersion.replaceAll(".", "\\.")}`),
    `[${label}] README local install must pin the reviewed runtime`);
  assert.match(text,
    new RegExp(`@somacheck/vibecheck@${runtimeVersion.replaceAll(".", "\\.")} setup claude`),
    `[${label}] README must use the reviewed managed upgrade path`);
  // Cancelled is a recognised terminal status alongside answered/expired.
  assert.match(text, /answered,\s*expired,?\s*or cancelled/i,
    `[${label}] recovery flow must include the cancelled terminal status`);
}

// Live guard: run the same validator on the actual README.
validateFirstUse(readme, "live");

// Negative-mutation checks: each stale or misleading setup guidance must
// (a) actually change the README text, (b) trip the validator, and
// (c) trip the validator for the *intended* assertion reason — never for
// some unrelated allowed alternative that happens to also be missing.
//
// These are static guidance gates: real host/phone acceptance is
// unperformed by this verifier.
function expectFirstUseFailure(mutatedReadme, baselineText, label, expectedErrorPattern) {
  assert.notEqual(mutatedReadme, baselineText,
    `[${label}] mutation must actually change the README text`);
  let trip = null;
  try {
    validateFirstUse(mutatedReadme, label);
  } catch (caught) {
    trip = caught;
  }
  assert.ok(trip,
    `[${label}] must trip the validator but the mutated copy passed`);
  assert.match(trip.message, expectedErrorPattern,
    `[${label}] must trip the validator for the intended reason — got: ${trip.message}`);
}

const runtimePinPattern = new RegExp(
  `@somacheck/vibecheck@${runtimeVersion.replaceAll(".", "\\.")}`,
);

// Stale runtime pin: change only the FIRST reviewed-runtime pin so a
// single stale command can be detected while the other current pins
// remain. Earlier versions replaced every reference at once; that masked
// regressions where one command was updated and another was not.
const staleRuntimeSingle = readme.replace(
  runtimePinPattern,
  "@somacheck/vibecheck@0.6.12",
);
assert.ok(staleRuntimeSingle.includes(`@somacheck/vibecheck@${runtimeVersion}`),
  "single-pin regression must leave other current commands intact");
expectFirstUseFailure(staleRuntimeSingle, readme, "stale-runtime-pin-single",
  /stale runtime command/);

// quota=exactly3 must fail: the feed-stock cap must never be presented as
// a phone-ask or per-check-in limit on `request_vibecheck`. We splice the
// literal marker into the first-use section; every other required pattern
// remains intact, so the only trip should come from the quota assertion.
const quotaExactly3 = readme.replace(
  /(\*\*Immediate phone ask:\*\* `request_vibecheck`\. This is the only tool that[\s\S]{0,220})/,
  "$1\n\nWARN: quota=exactly3 per request.\n",
);
expectFirstUseFailure(quotaExactly3, readme, "quota-exactly-3",
  /must not advertise a quota=exactly N cap on request_vibecheck/);

// Natural feed-quota prose must fail too — not only the invented marker.
// "exactly 3 propositions required" is the natural phrasing that a future
// contributor might write without thinking about how it reads on the
// immediate-ask path.
const quotaNatural = readme.replace(
  /(\*\*Immediate phone ask:\*\* `request_vibecheck`\. This is the only tool that[\s\S]{0,220})/,
  "$1\n\nNote: exactly 3 propositions required per check-in.\n",
);
expectFirstUseFailure(quotaNatural, readme, "quota-natural-exactly-3",
  /natural "exactly N propositions required" feed cap/);

// Unconditional Channel delivery must fail: plain Claude without an
// allowlisted plugin must not be promised automatic next-turn delivery.
const unconditionalChannel = readme.replace(
  /without that acceptance, plain Claude Code does[\s\n]+?\*\*not\*\*\s*\n?\s*promise automatic next-turn delivery/i,
  "without that acceptance, Claude Code always delivers the answer automatically",
);
expectFirstUseFailure(unconditionalChannel, readme, "unconditional-channel-delivery",
  /Claude Code always delivers the answer automatically/);

// Wrong-tool immediate ask must fail: presenting `post_vibecheck_statement`
// as the immediate phone ask contradicts the first-use instruction.
const wrongToolImmediate = readme.replace(
  /\*\*Immediate phone ask:\*\* `request_vibecheck`/,
  "**Immediate phone ask:** `post_vibecheck_statement`",
);
expectFirstUseFailure(wrongToolImmediate, readme, "wrong-tool-immediate-ask",
  /mark request_vibecheck as the immediate phone ask|not mark post_vibecheck_statement as the immediate phone ask/);

// Hallucinated phone-display proof must fail: the exact phrase this review
// asked us to remove ("matched proposition, binary reading, and confidence
// together confirm what the phone saw") must be rejected if a future
// contributor pastes it back in.
const hallucinatedProof = readme.replace(
  /Only your own observation of what your phone actually showed you\s*\n?confirms the phone display\./i,
  "Only the matched proposition, binary reading, and confidence together confirm what the phone saw.",
);
expectFirstUseFailure(hallucinatedProof, readme, "hallucinated-phone-proof",
  /first-use section must not match prohibited.*matched proposition/);

// Devin Desktop must fail: the invented host must never be re-added.
const devinDesktop = readme.replace(
  /- \*\*Cursor and Windsurf\.\*\*/,
  "- **Cursor, Windsurf, and Devin Desktop.**",
);
expectFirstUseFailure(devinDesktop, readme, "devin-desktop",
  /first-use section must not match prohibited.*Devin Desktop/);

// "duplicate will overwrite first pending handle" must fail: unverified
// server-side behaviour. Preserve-handle guidance is the only honest
// instruction.
const duplicateOverwrite = readme.replace(
  /Wasting a phone ask on a duplicate\s*\n?is its own problem; preserving the original handle is the recovery path\./,
  "The duplicate will overwrite the first pending handle and waste a phone ask.",
);
expectFirstUseFailure(duplicateOverwrite, readme, "duplicate-overwrites-handle",
  /first-use section must not match prohibited.*overwrite/);

// Fixed Unaligned interpretation must fail: "is a signal to pause" is the
// exact fixed prescription this review asked us to remove.
const unalignedPause = readme.replace(
  /A binary reading of \*\*Unaligned\*\* does not by itself prescribe\s*\n?a pause or a meaning/,
  "A high-confidence *Unaligned* on the proposition is a signal to pause",
);
expectFirstUseFailure(unalignedPause, readme, "unaligned-prescribes-pause",
  /first-use section must not match prohibited.*signal to pause/);

// Cancelled terminal status must be required: a regression that drops it
// (e.g. only `answered or expired`) must trip the validator.
const droppedCancelled = readme.replace(
  /answered, expired, or cancelled/,
  "answered or expired",
);
expectFirstUseFailure(droppedCancelled, readme, "dropped-cancelled-status",
  /recovery flow must include the cancelled terminal status/);

// Unreadable capture must retain the original pending ask. Reintroducing the
// old instruction to create a fresh MCP request must fail even when every
// other first-use requirement remains intact.
const freshRequestAfterUnreadable = readme.replace(
  /retry the gesture in the app against\s*\n?the original pending ask; the unreadable capture is retried, never\s*\n?reinterpreted\. Create a fresh `request_vibecheck` only after the original ask\s*\n?is terminal and the person explicitly wants a new ask\./,
  "that requires a fresh `request_vibecheck` after the phone recovers; the unreadable capture is retried, never reinterpreted.",
);
expectFirstUseFailure(freshRequestAfterUnreadable, readme, "fresh-request-after-unreadable",
  /first-use section must not match prohibited.*unreadable/);

process.stdout.write(`CLAUDE PROFILE CONSISTENCY: PASS (${runtimeVersion})\n`);
