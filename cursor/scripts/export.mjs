// Build a deterministic, validated Cursor-plugin publication candidate from an
// immutable Git commit. This command never reads package content from the worktree.
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import {
  chmod, copyFile, lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile,
} from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";

const PACKAGE_PREFIX = "packages/cursor-plugin/";
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const GENERATOR_VERSION = "2.0.0";

export const ALLOWLIST = Object.freeze([
  ".cursor-plugin/plugin.json",
  "LICENSE",
  "README.md",
  "mcp.json",
  "scripts/export.mjs",
  "scripts/export.test.mjs",
  "scripts/preview-install.mjs",
  "scripts/preview-install.test.mjs",
  "scripts/validate.mjs",
  "scripts/validate.test.mjs",
  "skills/somacheck/SKILL.md",
].sort());

const ALLOWED = new Set(ALLOWLIST);
const SECRET_RULES = Object.freeze([
  ["github-token", /\b(?:ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/],
  ["aws-access-key", /\bAKIA[0-9A-Z]{16}\b/],
  ["private-key", /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/],
  ["secret-key", /\bsk-(?:ant-)?[A-Za-z0-9_-]{20,}\b/],
  ["slack-token", /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/],
  ["bearer-token", /\bBearer\s+[A-Za-z0-9._~+\/-]{20,}/i],
  ["credential-assignment", /\b(?:api[_-]?key|token|secret|password)\s*[:=]\s*["'][^"'\r\n]{12,}["']/i],
]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function fail(message) {
  throw new Error(message);
}

export function parseArgs(argv) {
  const permitted = new Set(["source", "sha", "out", "tar"]);
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (typeof flag !== "string" || !flag.startsWith("--") || !permitted.has(flag.slice(2))) {
      fail(`unknown argument: ${String(flag)}`);
    }
    const key = flag.slice(2);
    if (Object.hasOwn(values, key)) fail(`duplicate argument: --${key}`);
    if (typeof value !== "string" || value.length === 0 || value.startsWith("--")) {
      fail(`--${key} requires a value`);
    }
    values[key] = value;
  }
  for (const key of permitted) {
    if (!Object.hasOwn(values, key)) fail(`missing required argument: --${key}`);
  }
  for (const key of ["source", "out", "tar"]) {
    if (!path.isAbsolute(values[key])) fail(`--${key} must be an absolute path`);
  }
  if (!/^[0-9a-f]{40}$/.test(values.sha)) fail("--sha must be a full lowercase 40-character commit SHA");
  if (!values.tar.endsWith(".tgz")) fail("--tar must end in .tgz");
  return values;
}

function runGit(source, args, { maxBytes = 16 * 1024 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, {
      cwd: source,
      env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    let size = 0;
    let exceeded = false;
    child.stdout.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        exceeded = true;
        child.kill("SIGKILL");
      } else stdout.push(chunk);
    });
    child.stderr.on("data", (chunk) => {
      if (Buffer.concat(stderr).length < 64 * 1024) stderr.push(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (exceeded) return reject(new Error("git output exceeded safety limit"));
      if (code !== 0) return reject(new Error(`git command failed: ${Buffer.concat(stderr).toString("utf8").trim()}`));
      resolve(Buffer.concat(stdout));
    });
  });
}

export function scanForSecrets(files) {
  const findings = [];
  for (const [relative, bytes] of files) {
    const text = bytes.toString("utf8");
    for (const [label, pattern] of SECRET_RULES) {
      if (pattern.test(text)) findings.push({ path: relative, rule: label });
    }
  }
  return findings;
}

async function pathMustNotExist(candidate, label) {
  try {
    await lstat(candidate);
    fail(`${label} already exists`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

async function requireSafeExistingDirectory(directory, label) {
  const resolved = path.resolve(directory);
  let cursor = resolved;
  while (true) {
    const info = await lstat(cursor);
    if (info.isSymbolicLink()) fail(`${label} has a symlink ancestor`);
    if (cursor === path.parse(cursor).root) break;
    cursor = path.dirname(cursor);
  }
  const canonical = await realpath(resolved);
  if (canonical !== resolved) fail(`${label} must be a canonical path without symlink aliases`);
  if (!(await lstat(resolved)).isDirectory()) fail(`${label} parent is not a directory`);
}

function isInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== "..");
}

async function validateTargets(source, out, archive) {
  const outResolved = path.resolve(out);
  const archiveResolved = path.resolve(archive);
  if (path.dirname(outResolved) !== path.dirname(archiveResolved)) {
    fail("--out and --tar must have the same existing parent directory");
  }
  await requireSafeExistingDirectory(path.dirname(outResolved), "output");
  await pathMustNotExist(outResolved, "--out");
  await pathMustNotExist(archiveResolved, "--tar");
  const sourceReal = await realpath(source);
  if (isInside(sourceReal, outResolved) || isInside(sourceReal, archiveResolved)) {
    fail("outputs must be outside the source repository");
  }
  return { out: outResolved, archive: archiveResolved, parent: path.dirname(outResolved) };
}

function parseTree(raw) {
  const records = raw.toString("utf8").split("\0").filter(Boolean);
  const entries = new Map();
  for (const record of records) {
    const tab = record.indexOf("\t");
    if (tab < 0) fail("unexpected git tree record");
    const metadata = record.slice(0, tab).split(" ");
    const fullPath = record.slice(tab + 1);
    if (metadata.length !== 3 || !fullPath.startsWith(PACKAGE_PREFIX)) fail("unexpected git tree entry");
    const [mode, type, object] = metadata;
    const relative = fullPath.slice(PACKAGE_PREFIX.length);
    if (!relative || !ALLOWED.has(relative)) fail(`commit contains non-allowlisted plugin path: ${relative || fullPath}`);
    if (entries.has(relative)) fail(`duplicate plugin path: ${relative}`);
    if (type !== "blob" || mode !== "100644" || !/^[0-9a-f]{40,64}$/.test(object)) {
      fail(`plugin path is not a regular non-executable file: ${relative}`);
    }
    entries.set(relative, object);
  }
  const missing = ALLOWLIST.filter((item) => !entries.has(item));
  if (missing.length) fail(`commit is missing allowlisted plugin path: ${missing[0]}`);
  return entries;
}

function writeOctal(header, offset, length, value) {
  const encoded = value.toString(8).padStart(length - 1, "0") + "\0";
  header.write(encoded, offset, length, "ascii");
}

function tarHeader(name, size) {
  if (Buffer.byteLength(name) > 100) fail(`archive path is too long: ${name}`);
  const header = Buffer.alloc(512, 0);
  header.write(name, 0, 100, "utf8");
  writeOctal(header, 100, 8, 0o644);
  writeOctal(header, 108, 8, 0);
  writeOctal(header, 116, 8, 0);
  writeOctal(header, 124, 12, size);
  writeOctal(header, 136, 12, 0);
  header.fill(0x20, 148, 156);
  header[156] = "0".charCodeAt(0);
  header.write("ustar\0", 257, 6, "ascii");
  header.write("00", 263, 2, "ascii");
  header.write("root", 265, 4, "ascii");
  header.write("root", 297, 4, "ascii");
  writeOctal(header, 329, 8, 0);
  writeOctal(header, 337, 8, 0);
  let checksum = 0;
  for (const byte of header) checksum += byte;
  header.write(checksum.toString(8).padStart(6, "0"), 148, 6, "ascii");
  header[154] = 0;
  header[155] = 0x20;
  return header;
}

function buildArchive(files) {
  const blocks = [];
  for (const relative of ALLOWLIST) {
    const bytes = files.get(relative);
    blocks.push(tarHeader(`cursor-plugin/${relative}`, bytes.length), bytes);
    const padding = (512 - (bytes.length % 512)) % 512;
    if (padding) blocks.push(Buffer.alloc(padding));
  }
  blocks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(blocks), { level: 9, mtime: 0 });
}

async function writeCandidate(root, files) {
  for (const relative of ALLOWLIST) {
    const destination = path.join(root, relative);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, files.get(relative), { flag: "wx", mode: 0o600 });
    await chmod(destination, 0o644);
  }
}

async function validateCandidate(root) {
  const validatorUrl = `${pathToFileURL(path.join(root, "scripts", "validate.mjs")).href}?export=${Date.now()}`;
  const module = await import(validatorUrl);
  if (typeof module.validatePlugin !== "function") fail("exported validator has no validatePlugin function");
  const result = await module.validatePlugin(root);
  if (!result?.valid) fail(`exported candidate failed validation (${result?.errors?.length ?? 0} errors)`);
}

async function publishDirectory(stage, destination) {
  await mkdir(destination, { mode: 0o700 });
  try {
    for (const relative of [...ALLOWLIST, "export-receipt.json"]) {
      const target = path.join(destination, relative);
      await mkdir(path.dirname(target), { recursive: true });
      await copyFile(path.join(stage, relative), target, fsConstants.COPYFILE_EXCL);
    }
  } catch (error) {
    await rm(destination, { recursive: true, force: true });
    throw error;
  }
}

export async function exportFromArgs(input) {
  const args = Array.isArray(input)
    ? parseArgs(input)
    : parseArgs(["--source", input?.source, "--sha", input?.sha, "--out", input?.out, "--tar", input?.tar]);
  const source = path.resolve(args.source);
  const sourceReal = await realpath(source);
  if (sourceReal !== source) fail("--source must be a canonical repository path without symlink aliases");
  const root = (await runGit(source, ["rev-parse", "--show-toplevel"])).toString("utf8").trim();
  if (root !== source) fail("--source must be the repository root");
  const resolvedSha = (await runGit(source, ["rev-parse", "--verify", `${args.sha}^{commit}`])).toString("utf8").trim();
  if (resolvedSha !== args.sha) fail("--sha did not resolve to the exact requested commit");
  const dirty = await runGit(source, ["status", "--porcelain=v1", "-z", "--untracked-files=all", "--", "packages/cursor-plugin"]);
  if (dirty.length) fail("packages/cursor-plugin must be clean at the requested release SHA");

  const targets = await validateTargets(source, args.out, args.tar);
  const tree = parseTree(await runGit(source, ["ls-tree", "-rz", "--full-tree", args.sha, "--", "packages/cursor-plugin"]));
  const files = new Map();
  for (const relative of ALLOWLIST) {
    files.set(relative, await runGit(source, ["cat-file", "blob", tree.get(relative)], { maxBytes: MAX_FILE_BYTES }));
  }
  const findings = scanForSecrets(files);
  if (findings.length) fail(`secret scan rejected ${findings[0].path} (${findings[0].rule})`);

  const archiveBytes = buildArchive(files);
  const receipt = {
    schema_version: 1,
    generator_version: GENERATOR_VERSION,
    source_sha: args.sha,
    archive_sha256: sha256(archiveBytes),
    files: Object.fromEntries(ALLOWLIST.map((relative) => [relative, sha256(files.get(relative))])),
  };

  const stage = await mkdtemp(path.join(targets.parent, ".cursor-plugin-export-stage-"));
  let outputCreated = false;
  let archiveCreated = false;
  try {
    const candidate = path.join(stage, "cursor-plugin");
    await mkdir(candidate);
    await writeCandidate(candidate, files);
    await validateCandidate(candidate);
    await writeFile(path.join(candidate, "export-receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    const stagedArchive = path.join(stage, "candidate.tgz");
    await writeFile(stagedArchive, archiveBytes, { flag: "wx", mode: 0o600 });
    await publishDirectory(candidate, targets.out);
    outputCreated = true;
    await copyFile(stagedArchive, targets.archive, fsConstants.COPYFILE_EXCL);
    archiveCreated = true;
    await chmod(targets.archive, 0o644);
    await rm(stage, { recursive: true, force: true });
    return { ...receipt, out: targets.out, tar: targets.archive };
  } catch (error) {
    if (archiveCreated) await rm(targets.archive, { force: true });
    if (outputCreated) await rm(targets.out, { recursive: true, force: true });
    await rm(stage, { recursive: true, force: true });
    throw error;
  }
}

const isEntrypoint = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isEntrypoint) {
  exportFromArgs(process.argv.slice(2)).then(
    (result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`),
    (error) => {
      process.stderr.write(`Cursor export failed: ${error instanceof Error ? error.message : "unknown error"}\n`);
      process.exitCode = 1;
    },
  );
}
