import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const json = (path) => JSON.parse(readFileSync(path, "utf8"));
const runtime = json("package.json").dependencies["@somacheck/vibecheck"];
const manifest = json("plugins/vibecheck/plugin.json");
const mcp = json("plugins/vibecheck/mcp.json");
const market = json(".agents/plugins/marketplace.json");
const claude = json(".mcp.json");
const claudeManifest = json(".claude-plugin/plugin.json");
const claudeMarketplace = json(".claude-plugin/marketplace.json");
const skill = readFileSync("plugins/vibecheck/skills/vibecheck/SKILL.md", "utf8");
const claudeSkill = readFileSync("SKILL.md", "utf8");

assert.equal(manifest.version, claudeManifest.version);
assert.equal(manifest.version, claudeMarketplace.plugins.find(({ name }) => name === "vibecheck").version);
assert.equal(manifest.name, "vibecheck");
assert.equal(manifest.$schema, "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json");
assert.equal(mcp.$schema, "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json");
assert.deepEqual(mcp.mcpServers.vibecheck, {
  type: "stdio",
  command: "npx",
  args: ["-y", `@somacheck/vibecheck@${runtime}`, "serve", "--client", "codex"],
});
assert.equal(market.name, "somacheck-local");
assert.equal(market.plugins.length, 1);
assert.equal(market.plugins[0].source.path, "./plugins/vibecheck");
assert.equal(existsSync("skills"), false, "the Claude plugin root must not gain a default skills/ directory");
assert.equal(claudeManifest.skills, ".", "Claude must explicitly load its root SKILL.md");
assert.match(claudeSkill, /allowed-tools: mcp__plugin_vibecheck_vibecheck__get_vibecheck_context .*mcp__plugin_vibecheck_vibecheck__request_vibecheck/);
assert.deepEqual(claude.mcpServers.vibecheck.args, [
  "-y", `@somacheck/vibecheck@${runtime}`, "serve", "--client", "claude", "--channel",
]);
assert.match(skill, /Preserve supplied\s+first-person wording verbatim/i);
assert.match(skill, /get_vibecheck_result/);
assert.match(skill, /wait for acceptance before\s+calling `request_vibecheck`/i);
assert.match(skill, /request_vibecheck` returns `pending`, `completed`, `expired`, `cancelled`, or\s+`error`/);
assert.match(skill, /result schemas do not return the proposition text/i);
assert.doesNotMatch(skill, /mcp__plugin_vibecheck_vibecheck__/);
console.log(`CODEX PORTABLE PROFILE: PASS (bundle ${manifest.version}; runtime ${runtime}; Claude root skill and Channel preserved)`);
