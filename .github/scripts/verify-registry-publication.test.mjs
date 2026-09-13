import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

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
  const result = preflight({ requestedVersion: "0.6.17" });
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
  assert.equal(workflow.match(/--proto '=https' --proto-redir '=https'/g)?.length, 3);
  assert.equal(workflow.match(/--max-filesize /g)?.length, 3);
  assert.doesNotMatch(workflow, /secrets\.|GITHUB_TOKEN|personal.access|\bPAT\b/i);
  const preflight = workflow.indexOf("verify-registry-publication.mjs preflight");
  const validate = workflow.indexOf("mcp-publisher validate server.json");
  const login = workflow.indexOf("mcp-publisher login github-oidc");
  const publish = workflow.indexOf("mcp-publisher publish server.json");
  assert.ok(preflight > 0 && preflight < validate && validate < login && login < publish);
});
