#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const EXPECTED_REPOSITORY = "Sensie-agents/vibecheck";
export const EXPECTED_REF = "refs/heads/main";
export const EXPECTED_SERVER = "io.github.Sensie-agents/vibecheck";
export const EXPECTED_PACKAGE = "@somacheck/vibecheck";
export const EXPECTED_REMOTE = "https://mcp.somacheck.com/functions/v1/mcp";

const semver = /^\d+\.\d+\.\d+$/;
const sri = /^sha512-[A-Za-z0-9+/]+={0,2}$/;
const sha = /^[0-9a-f]{40}$/;

function object(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function packageEntry(manifest) {
  const entries = Array.isArray(manifest?.packages) ? manifest.packages : [];
  return entries.find((entry) => entry?.registryType === "npm" && entry?.identifier === EXPECTED_PACKAGE);
}

function lockEntry(lock) {
  return object(lock?.packages)?.["node_modules/@somacheck/vibecheck"];
}

export function verifyPreflight({ manifest, wrapper, lock, npmMetadata, requestedVersion, repository, ref, eventName }) {
  const errors = [];
  const entry = packageEntry(manifest);
  const locked = lockEntry(lock);
  const runtimeVersion = wrapper?.dependencies?.[EXPECTED_PACKAGE];

  if (repository !== EXPECTED_REPOSITORY) errors.push("repository-mismatch");
  if (ref !== EXPECTED_REF) errors.push("ref-mismatch");
  if (eventName !== "workflow_dispatch") errors.push("event-mismatch");
  if (!semver.test(requestedVersion ?? "")) errors.push("invalid-requested-version");
  if (manifest?.name !== EXPECTED_SERVER) errors.push("namespace-mismatch");
  if (manifest?.version !== requestedVersion) errors.push("manifest-version-mismatch");
  if (wrapper?.version !== requestedVersion) errors.push("wrapper-version-mismatch");
  if (runtimeVersion !== requestedVersion) errors.push("runtime-version-mismatch");
  if (entry?.version !== requestedVersion || entry?.transport?.type !== "stdio") {
    errors.push("manifest-package-mismatch");
  }
  if (!Array.isArray(manifest?.remotes) || !manifest.remotes.some(
    (remote) => remote?.type === "streamable-http" && remote?.url === EXPECTED_REMOTE,
  )) errors.push("remote-mismatch");
  if (locked?.version !== requestedVersion) errors.push("lock-version-mismatch");
  if (locked?.resolved !== `https://registry.npmjs.org/@somacheck/vibecheck/-/vibecheck-${requestedVersion}.tgz`) {
    errors.push("lock-tarball-mismatch");
  }
  if (!sri.test(locked?.integrity ?? "")) errors.push("lock-integrity-invalid");
  if (npmMetadata?.name !== EXPECTED_PACKAGE || npmMetadata?.version !== requestedVersion) {
    errors.push("npm-version-mismatch");
  }
  if (npmMetadata?.mcpName !== EXPECTED_SERVER) errors.push("npm-namespace-mismatch");
  if (!sri.test(npmMetadata?.dist?.integrity ?? "")) errors.push("npm-integrity-invalid");
  if (npmMetadata?.dist?.integrity !== locked?.integrity) errors.push("npm-lock-integrity-mismatch");

  return { valid: errors.length === 0, errors };
}

function registryEntries(payload) {
  if (object(payload?.server)) return [payload];
  return Array.isArray(payload?.servers) ? payload.servers : [];
}

export function verifyReadback({ payload, requestedVersion }) {
  const candidate = registryEntries(payload).find((entry) => {
    const meta = entry?._meta?.["io.modelcontextprotocol.registry/official"];
    const pkg = packageEntry(entry?.server);
    return entry?.server?.name === EXPECTED_SERVER
      && entry?.server?.version === requestedVersion
      && meta?.status === "active"
      && meta?.isLatest === true
      && pkg?.version === requestedVersion
      && pkg?.transport?.type === "stdio";
  });
  return { valid: Boolean(candidate), errors: candidate ? [] : ["registry-readback-mismatch"] };
}

function args(argv) {
  const result = { command: argv[0] };
  for (let i = 1; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, "");
    if (!key || argv[i + 1] === undefined) throw new Error("invalid arguments");
    result[key] = argv[i + 1];
  }
  return result;
}

async function json(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function main(argv) {
  const options = args(argv);
  if (options.command === "preflight") {
    const result = verifyPreflight({
      manifest: await json(options.manifest),
      wrapper: await json(options.wrapper),
      lock: await json(options.lock),
      npmMetadata: await json(options["npm-metadata"]),
      requestedVersion: options.version,
      repository: options.repository,
      ref: options.ref,
      eventName: options.event,
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    if (!result.valid) process.exitCode = 1;
    return;
  }
  if (options.command === "readback") {
    if (!semver.test(options.version ?? "") || options["publisher-version"] !== "1.8.1") {
      throw new Error("invalid release version");
    }
    const payload = await json(options["registry-response"]);
    const result = verifyReadback({ payload, requestedVersion: options.version });
    if (!result.valid) {
      process.stdout.write(`${JSON.stringify(result)}\n`);
      process.exitCode = 1;
      return;
    }
    if (!sha.test(options.sha ?? "")) throw new Error("invalid source SHA");
    const manifestBytes = await readFile(options.manifest);
    const receipt = {
      schemaVersion: 1,
      repository: EXPECTED_REPOSITORY,
      ref: EXPECTED_REF,
      sourceSha: options.sha,
      version: options.version,
      publisherVersion: options["publisher-version"],
      manifestSha256: createHash("sha256").update(manifestBytes).digest("hex"),
      registryStatus: "active",
      registryIsLatest: true,
      observedAt: new Date().toISOString(),
    };
    await writeFile(options.receipt, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
    process.stdout.write(`${JSON.stringify({ valid: true, receiptWritten: true })}\n`);
    return;
  }
  throw new Error("usage: verify-registry-publication.mjs <preflight|readback> [options]");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await main(process.argv.slice(2)); }
  catch { process.stdout.write('{"valid":false,"errors":["invalid-input"]}\n'); process.exitCode = 1; }
}
