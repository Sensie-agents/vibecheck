import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const command = process.argv[2];
const args = process.argv.slice(3);

if (!command) {
  throw new Error("usage: node verify-mcp-runtime.mjs <command> [args...]");
}

const isolatedHome = mkdtempSync(join(tmpdir(), "vibecheck-glama-smoke-"));
const childHome = command === "docker" ? process.env.HOME : isolatedHome;
const child = spawn(command, args, {
  env: { ...process.env, HOME: childHome },
  stdio: ["pipe", "pipe", "pipe"],
});

let stdout = "";
let stderr = "";
let finished = false;

child.stderr.setEncoding("utf8");
child.stderr.on("data", (chunk) => {
  stderr += chunk;
});

const timer = setTimeout(() => {
  child.kill("SIGKILL");
  fail(`MCP smoke test timed out. stderr: ${stderr}`);
}, 15_000);

function send(message) {
  child.stdin.write(`${JSON.stringify(message)}\n`);
}

function fail(message) {
  if (finished) return;
  finished = true;
  clearTimeout(timer);
  child.kill("SIGKILL");
  rmSync(isolatedHome, { recursive: true, force: true });
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}

function pass() {
  if (finished) return;
  finished = true;
  clearTimeout(timer);
  child.stdin.end();
  child.kill("SIGTERM");
  rmSync(isolatedHome, { recursive: true, force: true });
  process.stdout.write("GLAMA MCP RUNTIME SMOKE: PASS\n");
}

function handle(message) {
  if (message.id === 1) {
    if (!message.result?.serverInfo?.name) {
      fail("initialize did not return serverInfo");
      return;
    }
    send({ jsonrpc: "2.0", method: "notifications/initialized" });
    send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
    return;
  }

  if (message.id === 2) {
    const names = new Set((message.result?.tools ?? []).map((tool) => tool.name));
    const required = [
      "get_vibecheck_context",
      "get_vibecheck_status",
      "share_somacheck_context",
      "post_vibecheck_statement",
      "get_vibecheck_result",
      "request_vibecheck",
    ];
    const missing = required.filter((name) => !names.has(name));
    if (missing.length > 0) {
      fail(`tools/list is missing: ${missing.join(", ")}`);
      return;
    }
    send({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "get_vibecheck_status", arguments: {} },
    });
    return;
  }

  if (message.id === 3) {
    const text = (message.result?.content ?? [])
      .filter((item) => item.type === "text")
      .map((item) => item.text)
      .join("\n");
    if (message.result?.isError !== true || !/not linked|setup|doctor/i.test(text)) {
      fail(`unauthenticated tool call did not fail with actionable setup guidance: ${JSON.stringify(message.result)}`);
      return;
    }
    pass();
  }
}

child.stdout.setEncoding("utf8");
child.stdout.on("data", (chunk) => {
  stdout += chunk;
  while (stdout.includes("\n")) {
    const newline = stdout.indexOf("\n");
    const line = stdout.slice(0, newline).trim();
    stdout = stdout.slice(newline + 1);
    if (!line) continue;
    try {
      handle(JSON.parse(line));
    } catch (error) {
      fail(`invalid MCP response: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
});

child.on("error", (error) => fail(`could not start MCP runtime: ${error.message}`));
child.on("exit", (code, signal) => {
  if (!finished) {
    fail(`MCP runtime exited early (${code ?? signal}). stderr: ${stderr}`);
  }
});

send({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "glama-release-smoke", version: "1.0.0" },
  },
});
