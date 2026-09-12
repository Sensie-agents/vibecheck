import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const verifier = new URL("./verify-mcp-runtime.mjs", import.meta.url).pathname;
const reviewed = [
  "get_vibecheck_context",
  "get_vibecheck_status",
  "share_somacheck_context",
  "post_vibecheck_statement",
  "get_vibecheck_result",
  "request_vibecheck",
];

async function rejectedTools(tools) {
  const fixtureRoot = await mkdtemp(join(tmpdir(), "vibecheck-runtime-fixture-"));
  const fixture = join(fixtureRoot, "runtime.mjs");
  await writeFile(fixture, `
    import readline from "node:readline";
    const tools = ${JSON.stringify(tools)};
    readline.createInterface({ input: process.stdin }).on("line", (line) => {
      const request = JSON.parse(line);
      if (request.id === 1) console.log(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { serverInfo: { name: "fixture" }, capabilities: {} } }));
      if (request.id === 2) console.log(JSON.stringify({ jsonrpc: "2.0", id: 2, result: { tools: tools.map((name) => ({ name })) } }));
    });
  `);
  try {
    await assert.rejects(
      execFileAsync(process.execPath, [verifier, process.execPath, fixture]),
      (error) => error.code === 1 && /exactly six reviewed tools/.test(error.stderr),
    );
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
}

test("runtime verifier rejects an unexpected seventh tool", async () => {
  await rejectedTools([...reviewed, "unreviewed_tool"]);
});

test("runtime verifier rejects a duplicate-named seventh tool", async () => {
  await rejectedTools([...reviewed, reviewed[0]]);
});
