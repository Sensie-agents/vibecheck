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

assert.match(runtimeVersion ?? "", /^\d+\.\d+\.\d+$/, "runtime must pin an exact SemVer");
assert.equal(wrapper.private, true, "the Glama wrapper must remain private");
assert.equal(plugin?.source, ".", "the public Claude plugin must source from this repository");
assert.equal(plugin?.version, manifest.version, "marketplace and plugin manifest versions must agree");
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
assert.match(readme, /claude plugin install vibecheck@somacheck/, "README must retain the plugin install");
assert.match(readme, /## Link SomaCheck and start the Channel/, "README must identify the primary Claude Code Channel path");
assert.match(readme, /claude --channels plugin:vibecheck@somacheck/,
  "README must include the approved Channel launch command");
assert.match(readme, /claude mcp remove --scope user vibecheck/,
  "README must prevent a duplicate direct MCP registration during the 0.6.12 migration");

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

process.stdout.write(`CLAUDE PROFILE CONSISTENCY: PASS (${runtimeVersion})\n`);
