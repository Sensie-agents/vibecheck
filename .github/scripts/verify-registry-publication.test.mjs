import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import {
  EXPECTED_PACKAGE,
  EXPECTED_REF,
  EXPECTED_REPOSITORY,
  EXPECTED_SERVER,
  verifyPreflight,
  verifyReadback,
} from "./verify-registry-publication.mjs";

const manifest = JSON.parse(await readFile(new URL("../../server.json", import.meta.url), "utf8"));
const wrapper = JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8"));
const lock = JSON.parse(await readFile(new URL("../../package-lock.json", import.meta.url), "utf8"));
const version = manifest.version;
const execFileAsync = promisify(execFile);
const integrity = lock.packages["node_modules/@somacheck/vibecheck"].integrity;
const npmMetadata = {
  name: EXPECTED_PACKAGE,
  version,
  mcpName: EXPECTED_SERVER,
  dist: {
    integrity,
    tarball: `https://registry.npmjs.org/@somacheck/vibecheck/-/vibecheck-${version}.tgz`,
  },
};

function preflight(overrides = {}) {
  return verifyPreflight({
    manifest, wrapper, lock, npmMetadata, requestedVersion: version,
    repository: EXPECTED_REPOSITORY, ref: EXPECTED_REF, eventName: "workflow_dispatch",
    ...overrides,
  });
}

test("accepts the exact public main manifest, runtime, lock SRI, and npm metadata", () => {
  assert.deepEqual(preflight(), { valid: true, errors: [] });
});

test("rejects a namespace that does not match the public repository owner", () => {
  const result = preflight({ manifest: { ...manifest, name: "io.github.sensie-app/vibecheck" } });
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes("namespace-mismatch"));
});

test("rejects an input version that differs from reviewed manifests", () => {
  const result = preflight({ requestedVersion: "0.6.16" });
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes("manifest-version-mismatch"));
  assert.ok(result.errors.includes("runtime-version-mismatch"));
});

test("rejects npm integrity drift from the reproducible lock", () => {
  const result = preflight({ npmMetadata: { ...npmMetadata, dist: { integrity: `sha512-${"A".repeat(88)}` } } });
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes("npm-lock-integrity-mismatch"));
});

test("rejects malformed SHA-512 length and incoherent root lock metadata", () => {
  const malformed = preflight({ npmMetadata: { ...npmMetadata, dist: { ...npmMetadata.dist, integrity: "sha512-YQ==" } } });
  assert.ok(malformed.errors.includes("npm-integrity-invalid"));
  const brokenLock = structuredClone(lock);
  brokenLock.packages[""].dependencies[EXPECTED_PACKAGE] = "0.6.14";
  assert.ok(preflight({ lock: brokenLock }).errors.includes("lock-root-mismatch"));
});

test("rejects extra unreviewed package or remote routes", () => {
  const extraPackage = { ...manifest, packages: [...manifest.packages, manifest.packages[0]] };
  assert.ok(preflight({ manifest: extraPackage }).errors.includes("manifest-shape-mismatch"));
  const extraRemote = { ...manifest, remotes: [...manifest.remotes, { type: "streamable-http", url: "https://other.example/mcp" }] };
  assert.ok(preflight({ manifest: extraRemote }).errors.includes("manifest-shape-mismatch"));
  const extraPackageField = structuredClone(manifest);
  extraPackageField.packages[0].registryBaseUrl = "https://other.example";
  assert.ok(preflight({ manifest: extraPackageField }).errors.includes("manifest-shape-mismatch"));
});

test("rejects a fork repository, non-main ref, or non-manual event", () => {
  assert.ok(preflight({ repository: "someone/vibecheck" }).errors.includes("repository-mismatch"));
  assert.ok(preflight({ ref: "refs/heads/release" }).errors.includes("ref-mismatch"));
  assert.ok(preflight({ eventName: "pull_request" }).errors.includes("event-mismatch"));
});

const registryPayload = {
  server: manifest,
  _meta: { "io.modelcontextprotocol.registry/official": { status: "active", isLatest: true } },
};

test("accepts only an active exact latest Registry readback", () => {
  assert.deepEqual(verifyReadback({ payload: registryPayload, requestedVersion: version, reviewedManifest: manifest }), { valid: true, errors: [] });
});

test("rejects stale, inactive, or non-latest Registry readback", () => {
  assert.equal(verifyReadback({ payload: registryPayload, requestedVersion: "0.6.14", reviewedManifest: manifest }).valid, false);
  assert.equal(verifyReadback({ payload: { ...registryPayload, _meta: { "io.modelcontextprotocol.registry/official": { status: "active", isLatest: false } } }, requestedVersion: version, reviewedManifest: manifest }).valid, false);
  assert.equal(verifyReadback({ payload: { ...registryPayload, _meta: { "io.modelcontextprotocol.registry/official": { status: "deprecated", isLatest: true } } }, requestedVersion: version, reviewedManifest: manifest }).valid, false);
});

test("readback rejects wrong canonical remote, package version, and reviewed copy", () => {
  const wrongRemote = structuredClone(registryPayload);
  wrongRemote.server.remotes[0].url = "https://other.example/mcp";
  assert.equal(verifyReadback({ payload: wrongRemote, requestedVersion: version, reviewedManifest: manifest }).valid, false);
  const wrongPackage = structuredClone(registryPayload);
  wrongPackage.server.packages[0].version = "0.6.14";
  assert.equal(verifyReadback({ payload: wrongPackage, requestedVersion: version, reviewedManifest: manifest }).valid, false);
  const wrongCopy = structuredClone(registryPayload);
  wrongCopy.server.description = "Different unreviewed copy";
  assert.equal(verifyReadback({ payload: wrongCopy, requestedVersion: version, reviewedManifest: manifest }).valid, false);
});

test("workflow is manual, main-only, checksum/action pinned, and gates before OIDC", async () => {
  const workflow = await readFile(new URL("../workflows/publish-official-registry.yml", import.meta.url), "utf8");
  assert.match(workflow, /^on:\n  workflow_dispatch:/m);
  assert.doesNotMatch(workflow, /^  (push|pull_request):/m);
  assert.match(workflow, /github\.repository == 'Sensie-agents\/vibecheck' && github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /permissions:\n      contents: read\n      id-token: write/);
  assert.match(workflow, /concurrency:\n  group: official-registry-publication\n  cancel-in-progress: false/);
  assert.match(workflow, /actions\/checkout@[0-9a-f]{40}/);
  assert.match(workflow, /actions\/upload-artifact@[0-9a-f]{40}/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /PUBLISHER_ARCHIVE_SHA256: [0-9a-f]{64}/);
  assert.match(workflow, /mcp-publisher --version 2>&1 \| grep -Eq/);
  assert.equal(workflow.match(/--proto '=https' --proto-redir '=https'/g)?.length, 3);
  assert.equal(workflow.match(/--max-filesize /g)?.length, 3);
  assert.doesNotMatch(workflow, /secrets\.|GITHUB_TOKEN|personal.access|\bPAT\b/i);
  const preflight = workflow.indexOf("verify-registry-publication.mjs preflight");
  const validate = workflow.indexOf("mcp-publisher validate server.json");
  const login = workflow.indexOf("mcp-publisher login github-oidc");
  const publish = workflow.indexOf("mcp-publisher publish server.json");
  assert.ok(preflight > 0 && preflight < validate && validate < login && login < publish);
});

function publisherVersionCommand(workflow, publisherPath) {
  const line = workflow.split("\n").find((candidate) =>
    candidate.includes("mcp-publisher --version") && candidate.includes("grep -Eq"));
  assert.ok(line, "workflow publisher version check must be extractable");
  const quotedPath = `'${publisherPath.replaceAll("'", `'"'"'`)}'`;
  return line.trim().replace(".ci/bin/mcp-publisher", quotedPath);
}

async function runPublisherVersionCheck(command, expectedVersion = "1.8.1") {
  return execFileAsync("bash", ["-o", "pipefail", "-c", command], {
    env: { ...process.env, PUBLISHER_VERSION: expectedVersion },
  });
}

test("extracted workflow check accepts the actual Darwin publisher stderr banner", {
  skip: process.platform !== "darwin" || !existsSync("/opt/homebrew/bin/mcp-publisher"),
}, async () => {
  const workflow = await readFile(new URL("../workflows/publish-official-registry.yml", import.meta.url), "utf8");
  await runPublisherVersionCheck(publisherVersionCommand(workflow, "/opt/homebrew/bin/mcp-publisher"));
});

test("extracted workflow check fails closed for a wrong version and a nonzero publisher", async (t) => {
  const workflow = await readFile(new URL("../workflows/publish-official-registry.yml", import.meta.url), "utf8");
  const fixture = await mkdtemp(join(tmpdir(), "mcp-publisher-version-"));
  t.after(() => rm(fixture, { recursive: true }));
  const wrong = join(fixture, "wrong-version");
  const failing = join(fixture, "nonzero");
  await writeFile(wrong, "#!/bin/sh\necho 'mcp-publisher 1.8.0 (fixture)' >&2\n");
  await writeFile(failing, "#!/bin/sh\necho 'mcp-publisher 1.8.1 (fixture)' >&2\nexit 7\n");
  await chmod(wrong, 0o755);
  await chmod(failing, 0o755);
  await assert.rejects(runPublisherVersionCheck(publisherVersionCommand(workflow, wrong)));
  await assert.rejects(runPublisherVersionCheck(publisherVersionCommand(workflow, failing)));
});
