import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createVibecheckServer } from "@somacheck/vibecheck";

const handle = "live:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const key = "22222222-2222-4222-8222-222222222222";

async function connect(t, api) {
  const server = createVibecheckServer({
    loadToken: async () => "synthetic-test-token",
    api,
    identity: { kind: "local", client_key: "codex" },
    liveAskWait: { now: () => 0, sleep: async () => {}, budgetMs: 0 },
    claudeChannelWatch: false,
  });
  const [client, serverTransport] = InMemoryTransport.createLinkedPair();
  const waiters = new Map();
  client.onmessage = (message) => {
    if (!("id" in message)) return;
    const resolve = waiters.get(message.id);
    if (resolve) {
      waiters.delete(message.id);
      resolve(message);
    }
  };
  await server.connect(serverTransport);
  await client.start();
  t.after(async () => client.close());
  const request = async (id, method, params = {}) => {
    const response = new Promise((resolve) => waiters.set(id, resolve));
    await client.send({ jsonrpc: "2.0", id, method, params });
    return response;
  };
  await request(1, "initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "codex-fixture", version: "1" },
  });
  await client.send({ jsonrpc: "2.0", method: "notifications/initialized" });
  return request;
}

test("Codex exposes six tools and requires an explicit consent basis", async (t) => {
  let creates = 0;
  const request = await connect(t, {
    requestVibecheck: async () => { creates += 1; },
  });
  const listed = await request(2, "tools/list");
  assert.deepEqual(listed.result.tools.map(({ name }) => name).sort(), [
    "get_vibecheck_context", "get_vibecheck_result", "get_vibecheck_status",
    "post_vibecheck_statement", "request_vibecheck", "share_somacheck_context",
  ]);
  const byName = Object.fromEntries(listed.result.tools.map((tool) => [tool.name, tool]));
  assert.deepEqual(byName.request_vibecheck.outputSchema.properties.state.enum,
    ["pending", "completed", "expired", "cancelled", "error"]);
  assert.deepEqual(byName.get_vibecheck_result.outputSchema.properties.status.enum,
    ["queued", "pending", "answered", "expired", "cancelled"]);
  assert.equal("statement" in byName.request_vibecheck.outputSchema.properties, false);
  assert.equal("statement" in byName.get_vibecheck_result.outputSchema.properties, false);
  const skill = readFileSync(new URL("../../plugins/vibecheck/skills/vibecheck/SKILL.md", import.meta.url), "utf8");
  assert.match(skill, /result schemas do not return the proposition text/i);
  assert.match(skill, /wait for acceptance before\s+calling `request_vibecheck`/i);
  const rejected = await request(3, "tools/call", {
    name: "request_vibecheck",
    arguments: { statement: "I want to pause.", idempotency_key: key },
  });
  assert.equal(rejected.result.isError, true);
  assert.equal(creates, 0);
});

test("Codex preserves account scope, exact proposition, one key, and same-handle terminal polling", async (t) => {
  const creates = [];
  const reads = [];
  let status = "pending";
  const request = await connect(t, {
    requestVibecheck: async (_token, identity, statement, idempotencyKey, consentBasis) => {
      creates.push({ identity, statement, idempotencyKey, consentBasis });
      return {
        request_id: handle, state: "pending", verdict: null, confidence: null,
        expires_at: "2099-01-01T00:00:00Z", idempotent_replay: false,
        delivery_state: "sent", cooldown_until: null,
      };
    },
    liveVibecheckResult: async (_token, identity, requestId) => {
      reads.push({ identity, requestId });
      return {
        status, verdict: null, confidence: null, latency_s: null,
        delivery_state: "sent", error_code: status === "expired" ? "response_timeout" : null,
      };
    },
  });
  const created = await request(2, "tools/call", {
    name: "request_vibecheck",
    arguments: {
      statement: "I want to pause before deciding.",
      idempotency_key: key,
      consent_basis: "user_requested_vibecheck",
    },
  });
  assert.equal(created.result.structuredContent.request_id, handle);
  assert.equal(created.result.structuredContent.state, "pending");
  assert.deepEqual(creates, [{
    identity: { kind: "local", client_key: "codex" },
    statement: "I want to pause before deciding.",
    idempotencyKey: key,
    consentBasis: "user_requested_vibecheck",
  }]);
  const poll = { name: "get_vibecheck_result", arguments: { request_id: handle } };
  const pending = await request(3, "tools/call", poll);
  assert.equal(pending.result.structuredContent.status, "pending");
  assert.match(pending.result.content[0].text, /phone presentation is not confirmed/i);
  status = "expired";
  const expired = await request(4, "tools/call", poll);
  assert.equal(expired.result.structuredContent.status, "expired");
  assert.match(expired.result.content[0].text, /stop polling/i);
  assert.equal(creates.length, 1);
  assert.deepEqual(reads, [
    { identity: { kind: "local", client_key: "codex" }, requestId: handle.slice(5) },
    { identity: { kind: "local", client_key: "codex" }, requestId: handle.slice(5) },
  ]);
});

test("a cancelled request is terminal and is never silently recreated", async (t) => {
  let creates = 0;
  const request = await connect(t, {
    requestVibecheck: async () => { creates += 1; },
    liveVibecheckResult: async () => ({
      status: "cancelled", verdict: null, confidence: null, latency_s: null,
      delivery_state: "sent", error_code: null,
    }),
  });
  const result = await request(2, "tools/call", {
    name: "get_vibecheck_result", arguments: { request_id: handle },
  });
  assert.equal(result.result.structuredContent.status, "cancelled");
  assert.match(result.result.content[0].text, /request is cancelled/i);
  assert.doesNotMatch(result.result.content[0].text, /call get_vibecheck_result/i);
  assert.equal(creates, 0);
});
