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
const sha = /^[0-9a-f]{40}$/;

function validSha512Sri(value) {
  if (typeof value !== "string" || !/^sha512-[A-Za-z0-9+/]{86}==$/.test(value)) return false;
  const encoded = value.slice("sha512-".length);
  const digest = Buffer.from(encoded, "base64");
  return digest.byteLength === 64 && digest.toString("base64") === encoded;
}

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

function exactKeys(value, keys) {
  return object(value) !== null
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}

function exactManifestShape(manifest, version) {
  const packages = Array.isArray(manifest?.packages) ? manifest.packages : [];
  const remotes = Array.isArray(manifest?.remotes) ? manifest.remotes : [];
  return exactKeys(manifest, ["$schema", "name", "title", "description", "version", "websiteUrl", "packages", "remotes"])
    && manifest?.name === EXPECTED_SERVER
    && manifest?.version === version
    && packages.length === 1
    && exactKeys(packages[0], ["registryType", "identifier", "version", "transport"])
    && packages[0]?.registryType === "npm"
    && packages[0]?.identifier === EXPECTED_PACKAGE
    && packages[0]?.version === version
    && exactKeys(packages[0]?.transport, ["type"])
    && packages[0]?.transport?.type === "stdio"
    && remotes.length === 1
    && exactKeys(remotes[0], ["type", "url"])
    && remotes[0]?.type === "streamable-http"
    && remotes[0]?.url === EXPECTED_REMOTE;
}

function publicationFields(manifest) {
  return {
    $schema: manifest?.$schema,
    name: manifest?.name,
    title: manifest?.title,
    description: manifest?.description,
    version: manifest?.version,
    websiteUrl: manifest?.websiteUrl,
    packages: manifest?.packages?.map((entry) => ({
      registryType: entry?.registryType,
      identifier: entry?.identifier,
      version: entry?.version,
      transport: { type: entry?.transport?.type },
    })),
    remotes: manifest?.remotes?.map((entry) => ({ type: entry?.type, url: entry?.url })),
  };
}

export function verifyPreflight({ manifest, wrapper, lock, npmMetadata, requestedVersion, repository, ref, eventName }) {
  const errors = [];
  const entry = packageEntry(manifest);
  const locked = lockEntry(lock);
  const lockRoot = object(lock?.packages)?.[""];
  const runtimeVersion = wrapper?.dependencies?.[EXPECTED_PACKAGE];

  if (repository !== EXPECTED_REPOSITORY) errors.push("repository-mismatch");
  if (ref !== EXPECTED_REF) errors.push("ref-mismatch");
  if (eventName !== "workflow_dispatch") errors.push("event-mismatch");
  if (!semver.test(requestedVersion ?? "")) errors.push("invalid-requested-version");
  if (manifest?.name !== EXPECTED_SERVER) errors.push("namespace-mismatch");
  if (manifest?.version !== requestedVersion) errors.push("manifest-version-mismatch");
  if (!exactManifestShape(manifest, requestedVersion)) errors.push("manifest-shape-mismatch");
  if (wrapper?.version !== requestedVersion) errors.push("wrapper-version-mismatch");
  if (runtimeVersion !== requestedVersion) errors.push("runtime-version-mismatch");
  if (entry?.version !== requestedVersion || entry?.transport?.type !== "stdio") {
    errors.push("manifest-package-mismatch");
  }
  if (lock?.name !== wrapper?.name || lock?.version !== wrapper?.version
      || lockRoot?.name !== wrapper?.name || lockRoot?.version !== wrapper?.version
      || lockRoot?.dependencies?.[EXPECTED_PACKAGE] !== requestedVersion) {
    errors.push("lock-root-mismatch");
  }
  if (locked?.version !== requestedVersion) errors.push("lock-version-mismatch");
  if (locked?.resolved !== `https://registry.npmjs.org/@somacheck/vibecheck/-/vibecheck-${requestedVersion}.tgz`) {
    errors.push("lock-tarball-mismatch");
  }
  if (!validSha512Sri(locked?.integrity)) errors.push("lock-integrity-invalid");
  if (npmMetadata?.name !== EXPECTED_PACKAGE || npmMetadata?.version !== requestedVersion) {
    errors.push("npm-version-mismatch");
  }
  if (npmMetadata?.mcpName !== EXPECTED_SERVER) errors.push("npm-namespace-mismatch");
  if (!validSha512Sri(npmMetadata?.dist?.integrity)) errors.push("npm-integrity-invalid");
  if (npmMetadata?.dist?.integrity !== locked?.integrity) errors.push("npm-lock-integrity-mismatch");
  if (npmMetadata?.dist?.tarball !== locked?.resolved) errors.push("npm-lock-tarball-mismatch");

  return { valid: errors.length === 0, errors };
}

function registryEntries(payload) {
  if (object(payload?.server)) return [payload];
  return Array.isArray(payload?.servers) ? payload.servers : [];
}

export function verifyReadback({ payload, requestedVersion, reviewedManifest }) {
  const candidate = registryEntries(payload).find((entry) => {
    const meta = entry?._meta?.["io.modelcontextprotocol.registry/official"];
    return exactManifestShape(entry?.server, requestedVersion)
      && JSON.stringify(publicationFields(entry?.server)) === JSON.stringify(publicationFields(reviewedManifest))
      && meta?.status === "active"
      && meta?.isLatest === true;
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
    const reviewedManifest = await json(options.manifest);
    const result = verifyReadback({ payload, requestedVersion: options.version, reviewedManifest });
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
