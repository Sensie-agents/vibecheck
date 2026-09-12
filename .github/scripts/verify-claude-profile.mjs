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

// First successful-use route must keep the three host paths separate and
// surface the immediate-ask recovery flow. These are static guidance gates;
// real host/phone acceptance is unperformed by this verifier.
const firstUseRegexes = [
  /## First successful vibecheck/,
  /Claude Code \(local Channel plugin\)/,
  /Claude\.ai and Claude Desktop \(hosted OAuth\)/,
  /Cursor and Windsurf/,
  /request_vibecheck/,
  /post_vibecheck_statement/,
  /keep the same `request_id` handle/,
  /database.{0,40}not\s*\n?\s*proof the phone/i,
  /you remain the authority/i,
  /does \*\*not\*\*\s*\n?\s*promise automatic next-turn delivery/i,
  /existing explicit ask \*is\* the consent/i,
];
for (const pattern of firstUseRegexes) {
  assert.match(readme, pattern,
    `README first-use section must satisfy /${pattern.source}/; real host/phone acceptance is unperformed`);
}
assert.match(readme, /Channel[\s\S]{0,120}preferred/i,
  "README must keep Channels as the preferred path when allowlisted");

// Database state must never be claimed as proof of phone display.
assert.doesNotMatch(readme, /database[\s\S]{0,120}proves?[\s\S]{0,40}(phone|display|displayed)/i,
  "README must not claim a database state proves phone display");
assert.doesNotMatch(readme, /database row proves/i,
  "README must not claim a database row proves phone display");

// First-use section must not promise automatic Channel delivery in plain
// (non-allowlisted) Claude. Negative mutations below pin this behaviour.
assert.match(readme, /without that acceptance, Claude Code does \*\*not\*\*[\s\S]{0,200}next-turn delivery/i,
  "README must refuse to promise automatic next-turn delivery without allowlisted Channels");

// A `quota=exactly N` style cap must never be presented as an immediate-ask
// or per-check-in limit on `request_vibecheck`. The feed-stock tool has its
// own reviewed cap; the phone ask does not.
assert.doesNotMatch(readme,
  /request_vibecheck[\s\S]{0,400}quota\s*=\s*exactly\s*\d+/i,
  "README must not advertise a `quota=exactly N` cap on request_vibecheck");
assert.doesNotMatch(readme,
  /quota\s*=\s*exactly\s*\d+[\s\S]{0,200}request_vibecheck/i,
  "README must not advertise a `quota=exactly N` cap on request_vibecheck");

// The first-use section's "immediate phone ask" sentence must identify
// `request_vibecheck` as that tool — `post_vibecheck_statement` only feeds
// the optional reflection stock and never asks the phone.
assert.match(readme,
  /Immediate phone ask:\*\*\s*`request_vibecheck`/,
  "README first-use section must mark request_vibecheck as the immediate phone ask");
assert.doesNotMatch(readme,
  /Immediate phone ask:\*\*\s*`post_vibecheck_statement`/,
  "README first-use section must not mark post_vibecheck_statement as the immediate phone ask");

// Negative-mutation checks: each stale or misleading setup guidance must
// cause the guard to fail. We mutate the README copy in memory and re-run
// the full live guard set so any single regression (install pin, first-use,
// doctrine, version drift, channel-preferred, etc.) trips the right reason.
//
// These are static guidance gates: real host/phone acceptance is
// unperformed by this verifier.
function runMutationGuards(mutatedReadme, label) {
  const text = mutatedReadme;
  for (const pattern of firstUseRegexes) {
    assert.match(text, pattern,
      `[${label}] first-use guard must still match /${pattern.source}/`);
  }
  assert.match(text, /Channel[\s\S]{0,120}preferred/i,
    `[${label}] Channels must remain the preferred path`);
  assert.doesNotMatch(text, /database[\s\S]{0,120}proves?[\s\S]{0,40}(phone|display|displayed)/i,
    `[${label}] database state must not be claimed as proof of phone display`);
  assert.doesNotMatch(text, /database row proves/i,
    `[${label}] database row must not be claimed as proof`);
  assert.match(text,
    /without that acceptance, Claude Code does \*\*not\*\*[\s\S]{0,200}next-turn delivery/i,
    `[${label}] plain Claude must not be promised automatic next-turn delivery`);
  assert.doesNotMatch(text,
    /request_vibecheck[\s\S]{0,400}quota\s*=\s*exactly\s*\d+/i,
    `[${label}] must not advertise a quota=exactly N cap on request_vibecheck`);
  assert.doesNotMatch(text,
    /quota\s*=\s*exactly\s*\d+[\s\S]{0,200}request_vibecheck/i,
    `[${label}] must not advertise a quota=exactly N cap on request_vibecheck`);
  assert.match(text,
    /Immediate phone ask:\*\*\s*`request_vibecheck`/,
    `[${label}] first-use section must mark request_vibecheck as the immediate phone ask`);
  assert.doesNotMatch(text,
    /Immediate phone ask:\*\*\s*`post_vibecheck_statement`/,
    `[${label}] first-use section must not mark post_vibecheck_statement as the immediate phone ask`);
  // Cross-reference the canonical install guard so a stale runtime pin or a
  // missing `setup claude` line trips this checker too.
  assert.match(text,
    new RegExp(`@somacheck/vibecheck@${runtimeVersion.replaceAll(".", "\\.")}`),
    `[${label}] README local install must pin the reviewed runtime`);
  assert.match(text,
    new RegExp(`@somacheck/vibecheck@${runtimeVersion.replaceAll(".", "\\.")} setup claude`),
    `[${label}] README must use the reviewed managed upgrade path`);
}

function expectFirstUseFailure(mutatedReadme, label, expectedErrorPattern) {
  let trip = null;
  try {
    runMutationGuards(mutatedReadme, label);
  } catch (caught) {
    trip = caught;
  }
  assert.ok(trip,
    `[${label}] must trip the live guard but the mutated copy passed`);
  assert.match(trip.message, expectedErrorPattern,
    `[${label}] must trip the live guard for the intended reason`);
}

const runtimePinPattern = new RegExp(
  `@somacheck/vibecheck@${runtimeVersion.replaceAll(".", "\\.")}`,
  "g",
);

// Stale runtime pin: drop every reference to the reviewed runtime version so
// the first-use guard (which references the same anchor indirectly via the
// file's general install language) and the explicit README install guard
// above both observe the regression.
const staleRuntime = readme
  .replaceAll(runtimePinPattern, "@somacheck/vibecheck@0.6.7")
  .replaceAll(`plugin ${plugin.version}`, "plugin 0.6.7");
expectFirstUseFailure(staleRuntime, "stale-runtime-pin",
  /README local install must pin the reviewed runtime|stale 0\.6\.7/);

// quota=exactly3 must fail: the feed-stock cap must never be presented as a
// phone-ask or per-check-in limit on `request_vibecheck`. We splice the
// phrase into the first-use section; the channel/preferred and consent
// guards remain intact so the only trip should come from the guidance
// itself or the doctrine guard above. The phrasing "exactly 3" inside an
// immediate-ask sentence is the regression.
const quotaExactly3 = readme.replace(
  /(\*\*Immediate phone ask:\*\* `request_vibecheck`\. This is the only tool that[\s\S]{0,220})/,
  "$1\n\nWARN: quota=exactly3 per request.\n",
);
expectFirstUseFailure(quotaExactly3, "quota-exactly-3",
  /Channel[\s\S]{0,120}preferred|first-use guard must still match|quota=exactly/);

// Unconditional Channel delivery must fail: plain Claude without an
// allowlisted plugin must not be promised automatic next-turn delivery.
const unconditionalChannel = readme.replace(
  /without that acceptance, Claude Code does \*\*not\*\*\s*\n?\s*promise automatic next-turn delivery/i,
  "without that acceptance, Claude Code always delivers the answer automatically",
);
expectFirstUseFailure(unconditionalChannel, "unconditional-channel-delivery",
  /plain Claude must not be promised automatic next-turn delivery|first-use guard must still match/);

// Wrong-tool immediate ask must fail: presenting `post_vibecheck_statement`
// as the immediate phone ask contradicts the first-use instruction.
const wrongToolImmediate = readme.replace(
  /\*\*Immediate phone ask:\*\* `request_vibecheck`/,
  "**Immediate phone ask:** `post_vibecheck_statement`",
);
expectFirstUseFailure(wrongToolImmediate, "wrong-tool-immediate-ask",
  /first-use guard must still match|Channels must remain the preferred path|mark request_vibecheck as the immediate phone ask|not mark post_vibecheck_statement as the immediate phone ask/);

process.stdout.write(`CLAUDE PROFILE CONSISTENCY: PASS (${runtimeVersion})\n`);
