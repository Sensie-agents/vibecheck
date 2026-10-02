import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const json = (path) => JSON.parse(readFileSync(path, "utf8"));
const runtime = json("package.json").dependencies["@somacheck/vibecheck"];
const manifest = json("plugin.json");
const mcp = json("mcp.json");
const market = json(".agents/plugins/marketplace.json");
const claude = json(".mcp.json");
const skill = readFileSync("skills/vibecheck/SKILL.md", "utf8");

assert.equal(manifest.version, runtime);
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
assert.equal(market.plugins[0].source.path, "./");
assert.deepEqual(claude.mcpServers.vibecheck.args, [
  "-y", `@somacheck/vibecheck@${runtime}`, "serve", "--client", "claude", "--channel",
]);
assert.match(skill, /Preserve supplied\s+first-person wording verbatim/i);
assert.match(skill, /get_vibecheck_result/);
assert.match(skill, /proactive offers, get acceptance before sending/i);
assert.doesNotMatch(skill, /mcp__plugin_vibecheck_vibecheck__/);
console.log(`CODEX PORTABLE PROFILE: PASS (${runtime}; Claude Channel preserved)`);
