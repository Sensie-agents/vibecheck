import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { validatePlugin } from "./validate.mjs";

const REAL_PLUGIN_ROOT = path.resolve(new URL(".", import.meta.url).pathname, "..");

async function makeFixture() {
  const dir = await mkdtemp(path.join(tmpdir(), "cursor-plugin-fixture-"));
  return dir;
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(value, null, 2));
}

test("the real package in this repo validates cleanly", async () => {
  const { valid, errors } = await validatePlugin(REAL_PLUGIN_ROOT);
  assert.deepEqual(errors, []);
  assert.equal(valid, true);
});

test("rejects malformed JSON in plugin.json", async () => {
  const root = await makeFixture();
  try {
    await mkdir(path.join(root, ".cursor-plugin"), { recursive: true });
    await writeFile(path.join(root, ".cursor-plugin", "plugin.json"), "{ not valid json");
    await writeJson(path.join(root, "mcp.json"), {
      mcpServers: { x: { url: "https://example.com/mcp" } },
    });
    const { valid, errors } = await validatePlugin(root);
    assert.equal(valid, false);
    assert.ok(errors.some((e) => e.includes("invalid JSON")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects plugin.json containing the JSON literal null", async () => {
  const root = await makeFixture();
  try {
    await mkdir(path.join(root, ".cursor-plugin"), { recursive: true });
    await writeFile(path.join(root, ".cursor-plugin", "plugin.json"), "null");
    await writeJson(path.join(root, "mcp.json"), {
      mcpServers: { x: { url: "https://example.com/mcp" } },
    });
    const { valid, errors } = await validatePlugin(root);
    assert.equal(valid, false);
    assert.ok(errors.some((e) => e.includes("plugin.json") && e.includes("null")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects mcp.json containing the JSON literal null", async () => {
  const root = await makeFixture();
  try {
    await writeJson(path.join(root, ".cursor-plugin", "plugin.json"), { name: "somacheck" });
    await mkdir(root, { recursive: true });
    await writeFile(path.join(root, "mcp.json"), "null");
    const { valid, errors } = await validatePlugin(root);
    assert.equal(valid, false);
    assert.ok(errors.some((e) => e.includes("mcp.json") && e.includes("null")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects a numeric plugin.json name instead of coercing it to a string", async () => {
  const root = await makeFixture();
  try {
    await writeJson(path.join(root, ".cursor-plugin", "plugin.json"), { name: 12345 });
    await writeJson(path.join(root, "mcp.json"), {
      mcpServers: { x: { url: "https://example.com/mcp" } },
    });
    const { valid, errors } = await validatePlugin(root);
    assert.equal(valid, false);
    assert.ok(errors.some((e) => e.includes("name must be a lowercase kebab-case string")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects a boolean plugin.json name instead of coercing it to a string", async () => {
  const root = await makeFixture();
  try {
    await writeJson(path.join(root, ".cursor-plugin", "plugin.json"), { name: true });
    await writeJson(path.join(root, "mcp.json"), {
      mcpServers: { x: { url: "https://example.com/mcp" } },
    });
    const { valid, errors } = await validatePlugin(root);
    assert.equal(valid, false);
    assert.ok(errors.some((e) => e.includes("name must be a lowercase kebab-case string")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects a plugin.json name that is not kebab-case", async () => {
  const root = await makeFixture();
  try {
    await writeJson(path.join(root, ".cursor-plugin", "plugin.json"), { name: "SomaCheck Plugin!" });
    await writeJson(path.join(root, "mcp.json"), {
      mcpServers: { x: { url: "https://example.com/mcp" } },
    });
    const { valid, errors } = await validatePlugin(root);
    assert.equal(valid, false);
    assert.ok(errors.some((e) => e.includes("kebab-case")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects a skills reference that does not exist", async () => {
  const root = await makeFixture();
  try {
    await writeJson(path.join(root, ".cursor-plugin", "plugin.json"), {
      name: "somacheck",
      skills: "./no-such-skills-dir",
    });
    await writeJson(path.join(root, "mcp.json"), {
      mcpServers: { x: { url: "https://example.com/mcp" } },
    });
    const { valid, errors } = await validatePlugin(root);
    assert.equal(valid, false);
    assert.ok(errors.some((e) => e.includes("does not exist")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects path traversal in a manifest path field", async () => {
  const root = await makeFixture();
  try {
    await writeJson(path.join(root, ".cursor-plugin", "plugin.json"), {
      name: "somacheck",
      skills: "../../etc",
    });
    await writeJson(path.join(root, "mcp.json"), {
      mcpServers: { x: { url: "https://example.com/mcp" } },
    });
    const { valid, errors } = await validatePlugin(root);
    assert.equal(valid, false);
    assert.ok(errors.some((e) => e.includes('".." path segments are not allowed')));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('rejects a ".." path segment even when it resolves back inside the plugin root', async () => {
  const root = await makeFixture();
  try {
    await mkdir(path.join(root, "a"), { recursive: true });
    await writeJson(path.join(root, ".cursor-plugin", "plugin.json"), {
      name: "somacheck",
      rules: "a/../a",
    });
    await writeJson(path.join(root, "mcp.json"), {
      mcpServers: { x: { url: "https://example.com/mcp" } },
    });
    const { valid, errors } = await validatePlugin(root);
    assert.equal(valid, false);
    assert.ok(errors.some((e) => e.includes('".." path segments are not allowed')));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects a logo path that does not exist", async () => {
  const root = await makeFixture();
  try {
    await writeJson(path.join(root, ".cursor-plugin", "plugin.json"), {
      name: "somacheck",
      logo: "assets/logo.svg",
    });
    await writeJson(path.join(root, "mcp.json"), {
      mcpServers: { x: { url: "https://example.com/mcp" } },
    });
    const { valid, errors } = await validatePlugin(root);
    assert.equal(valid, false);
    assert.ok(errors.some((e) => e.includes("plugin.json logo") && e.includes("does not exist")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects a manifest path that escapes the plugin root via a symlink", async () => {
  const root = await makeFixture();
  const outsideDir = await mkdtemp(path.join(tmpdir(), "cursor-plugin-outside-"));
  try {
    await writeFile(path.join(outsideDir, "secret.md"), "not part of this plugin");
    await symlink(outsideDir, path.join(root, "escape-link"));
    await writeJson(path.join(root, ".cursor-plugin", "plugin.json"), {
      name: "somacheck",
      rules: "escape-link/secret.md",
    });
    await writeJson(path.join(root, "mcp.json"), {
      mcpServers: { x: { url: "https://example.com/mcp" } },
    });
    const { valid, errors } = await validatePlugin(root);
    assert.equal(valid, false);
    assert.ok(errors.some((e) => e.includes("resolves outside the plugin root")));
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outsideDir, { recursive: true, force: true });
  }
});

test("rejects an mcp url with embedded credentials", async () => {
  const root = await makeFixture();
  try {
    await writeJson(path.join(root, ".cursor-plugin", "plugin.json"), { name: "somacheck" });
    await writeJson(path.join(root, "mcp.json"), {
      mcpServers: { somacheck: { url: "https://user:pass@mcp.somacheck.com/functions/v1/mcp" } },
    });
    const { valid, errors } = await validatePlugin(root);
    assert.equal(valid, false);
    assert.ok(errors.some((e) => e.includes("must not embed credentials")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects an mcp server command entry instead of silently skipping it", async () => {
  const root = await makeFixture();
  try {
    await writeJson(path.join(root, ".cursor-plugin", "plugin.json"), { name: "somacheck" });
    await writeJson(path.join(root, "mcp.json"), {
      mcpServers: { somacheck: { command: "npx", args: ["-y", "arbitrary-mcp-server"] } },
    });
    const { valid, errors } = await validatePlugin(root);
    assert.equal(valid, false);
    assert.ok(errors.some((e) => e.includes('"command" (stdio) entry') && e.includes("does not support")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects an mcp server with static headers", async () => {
  const root = await makeFixture();
  try {
    await writeJson(path.join(root, ".cursor-plugin", "plugin.json"), { name: "somacheck" });
    await writeJson(path.join(root, "mcp.json"), {
      mcpServers: {
        somacheck: {
          url: "https://mcp.somacheck.com/functions/v1/mcp",
          headers: { Authorization: "Bearer secret" },
        },
      },
    });
    const { valid, errors } = await validatePlugin(root);
    assert.equal(valid, false);
    assert.ok(errors.some((e) => e.includes('declares "headers"')));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects an absolute logo path even without traversal segments", async () => {
  const root = await makeFixture();
  try {
    await writeJson(path.join(root, ".cursor-plugin", "plugin.json"), {
      name: "somacheck",
      logo: "/etc/passwd",
    });
    await writeJson(path.join(root, "mcp.json"), {
      mcpServers: { x: { url: "https://example.com/mcp" } },
    });
    const { valid, errors } = await validatePlugin(root);
    assert.equal(valid, false);
    assert.ok(errors.some((e) => e.includes("absolute")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects mcp.json with no servers", async () => {
  const root = await makeFixture();
  try {
    await writeJson(path.join(root, ".cursor-plugin", "plugin.json"), { name: "somacheck" });
    await writeJson(path.join(root, "mcp.json"), { mcpServers: {} });
    const { valid, errors } = await validatePlugin(root);
    assert.equal(valid, false);
    assert.ok(errors.some((e) => e.includes("mcpServers is empty")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects an mcp server entry with a missing url", async () => {
  const root = await makeFixture();
  try {
    await writeJson(path.join(root, ".cursor-plugin", "plugin.json"), { name: "somacheck" });
    await writeJson(path.join(root, "mcp.json"), { mcpServers: { somacheck: {} } });
    const { valid, errors } = await validatePlugin(root);
    assert.equal(valid, false);
    assert.ok(errors.some((e) => e.includes("no url")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects an mcp server entry with a non-https url", async () => {
  const root = await makeFixture();
  try {
    await writeJson(path.join(root, ".cursor-plugin", "plugin.json"), { name: "somacheck" });
    await writeJson(path.join(root, "mcp.json"), {
      mcpServers: { somacheck: { url: "http://mcp.somacheck.com/functions/v1/mcp" } },
    });
    const { valid, errors } = await validatePlugin(root);
    assert.equal(valid, false);
    assert.ok(errors.some((e) => e.includes("must be https")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects a SKILL.md with no frontmatter", async () => {
  const root = await makeFixture();
  try {
    await writeJson(path.join(root, ".cursor-plugin", "plugin.json"), { name: "somacheck" });
    await writeJson(path.join(root, "mcp.json"), {
      mcpServers: { somacheck: { url: "https://example.com/mcp" } },
    });
    await mkdir(path.join(root, "skills", "somacheck"), { recursive: true });
    await writeFile(path.join(root, "skills", "somacheck", "SKILL.md"), "# No frontmatter here\n");
    const { valid, errors } = await validatePlugin(root);
    assert.equal(valid, false);
    assert.ok(errors.some((e) => e.includes("frontmatter")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("validates SKILL.md frontmatter under a manifest-declared skills path, not just the default skills/ folder", async () => {
  const root = await makeFixture();
  try {
    await writeJson(path.join(root, ".cursor-plugin", "plugin.json"), {
      name: "somacheck",
      skills: "./my-skills",
    });
    await writeJson(path.join(root, "mcp.json"), {
      mcpServers: { somacheck: { url: "https://mcp.somacheck.com/functions/v1/mcp" } },
    });
    await mkdir(path.join(root, "my-skills", "somacheck"), { recursive: true });
    await writeFile(path.join(root, "my-skills", "somacheck", "SKILL.md"), "# No frontmatter here\n");
    const { valid, errors } = await validatePlugin(root);
    assert.equal(valid, false);
    assert.ok(errors.some((e) => e.includes("plugin.json skills") && e.includes("frontmatter")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("accepts a minimal well-formed fixture", async () => {
  const root = await makeFixture();
  try {
    await writeJson(path.join(root, ".cursor-plugin", "plugin.json"), { name: "somacheck" });
    await writeJson(path.join(root, "mcp.json"), {
      mcpServers: { somacheck: { url: "https://mcp.somacheck.com/functions/v1/mcp" } },
    });
    await mkdir(path.join(root, "skills", "somacheck"), { recursive: true });
    await writeFile(
      path.join(root, "skills", "somacheck", "SKILL.md"),
      "---\nname: somacheck\ndescription: Test skill.\n---\nBody.\n",
    );
    const { valid, errors } = await validatePlugin(root);
    assert.deepEqual(errors, []);
    assert.equal(valid, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
