import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const readJson = (path) => JSON.parse(readFileSync(join(root, path), "utf8"));
const readText = (path) => readFileSync(join(root, path), "utf8");

const wrapper = readJson("package.json");
const lockfile = readJson("package-lock.json");
const marketplace = readJson(".claude-plugin/marketplace.json");
const hostedConfig = readJson(".mcp.json");
const runtimeVersion = wrapper.dependencies?.["@somacheck/vibecheck"];
const plugin = marketplace.plugins?.find(({ name }) => name === "vibecheck");
const hostedServer = hostedConfig.mcpServers?.vibecheck;

assert.match(runtimeVersion ?? "", /^\d+\.\d+\.\d+$/, "runtime must pin an exact SemVer");
assert.equal(wrapper.private, true, "the Glama wrapper must remain private");
assert.equal(plugin?.source, ".", "the public Claude plugin must source from this repository");
assert.equal(plugin?.version, runtimeVersion, "Claude metadata and local runtime must share the reviewed version");
assert.equal(lockfile.packages?.[""]?.dependencies?.["@somacheck/vibecheck"], runtimeVersion,
  "package-lock root dependency must match the wrapper");
assert.equal(lockfile.packages?.[`node_modules/@somacheck/vibecheck`]?.version, runtimeVersion,
  "package-lock installed runtime must match the wrapper");

// The marketplace install is the hosted HTTP path. The local npm alternative
// is intentionally separate because it is the only path with Claude Code
// continuation support; neither path may silently replace the other.
assert.equal(hostedServer?.type, "http", "the bundled Claude connector must be hosted HTTP");
assert.equal(hostedServer?.url, "https://mcp.somacheck.com/functions/v1/mcp",
  "the hosted connector must use the canonical remote");
assert.equal("command" in (hostedServer ?? {}), false, "hosted connector must not become a local command");
assert.equal("args" in (hostedServer ?? {}), false, "hosted connector must not become a local command");

const readme = readText("README.md");
assert.match(readme, new RegExp(`@somacheck/vibecheck@${runtimeVersion.replaceAll(".", "\\.")}`),
  "README local install must pin the reviewed runtime");
assert.match(readme, /claude plugin install vibecheck@somacheck/, "README must retain the hosted plugin install");
assert.match(readme, /## Claude Code primary local Channel/, "README must identify the primary Claude Code Channel path");
assert.match(readme, /--dangerously-load-development-channels server:vibecheck/,
  "README must include the research-preview Channel launch command");

const dockerfile = readText("Dockerfile");
assert.match(dockerfile, new RegExp(`org\\.opencontainers\\.image\\.version=\\"${runtimeVersion.replaceAll(".", "\\.")}\\"`),
  "Docker metadata must identify the reviewed runtime");
assert.match(dockerfile, /ENTRYPOINT \["\.\/node_modules\/\.bin\/vibecheck"\]/,
  "Docker must invoke the local runtime binary");

for (const [path, contents] of [
  [".claude-plugin/marketplace.json", readText(".claude-plugin/marketplace.json")],
  ["package.json", readText("package.json")],
  ["package-lock.json", readText("package-lock.json")],
  ["README.md", readme],
  ["Dockerfile", dockerfile],
]) {
  assert.equal(contents.includes("0.6.7"), false, `${path} retains stale 0.6.7 metadata`);
  assert.equal(contents.includes("0.6.9"), false, `${path} retains stale 0.6.9 metadata`);
}

process.stdout.write(`CLAUDE PROFILE CONSISTENCY: PASS (${runtimeVersion})\n`);
