// Non-destructive developer preview installer for the SomaCheck Cursor
// plugin package.
//
// Scope: Cursor's plugin docs (https://cursor.com/docs/reference/plugins)
// document no local-folder plugin loader, so the only way to try this
// package today is to hand-merge its one MCP server into a project's
// `.cursor/mcp.json` and copy its skill into `.cursor/skills/somacheck/`
// (see README.md "Developer preview install"). This script automates that
// exact hand-merge instead of replacing it with something Cursor doesn't
// document.
//
// Defaults to a dry run (prints the plan, writes nothing). Pass --apply to
// write. Pass --verify to check an already-installed project against this
// package without writing anything. Running this script does not run inside
// Cursor and does not certify that Cursor loads the result.
import {
  readFile,
  writeFile,
  stat,
  lstat,
  realpath,
  mkdir,
  rename,
  unlink,
  open,
  chmod,
} from "node:fs/promises";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { validatePlugin } from "./validate.mjs";

const PACKAGE_ROOT = fileURLToPath(new URL("..", import.meta.url));
const MCP_TARGET_SEGMENTS = [".cursor", "mcp.json"];
const SKILL_TARGET_SEGMENTS = [".cursor", "skills", "somacheck", "SKILL.md"];
const SERVER_NAME = "somacheck";
const TRUSTED_PLANS = new WeakSet();

export class InstallError extends Error {}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// True only when `existing` has exactly the same keys/values as `expected`
// (e.g. { url } with no extra "headers"/"command"), so any extra field or a
// differing url is treated as a real conflict, not silently accepted.
function serverMatches(existing, expected) {
  if (!isPlainObject(existing)) return false;
  const existingKeys = Object.keys(existing);
  const expectedKeys = Object.keys(expected);
  if (existingKeys.length !== expectedKeys.length) return false;
  return expectedKeys.every((key) => existing[key] === expected[key]);
}

// Names only the field(s) that differ between an existing server entry and
// the package's, never their values — an existing entry may carry a real
// Authorization header or command secret, and that must never reach a
// thrown message, console output, or a CLI transcript.
function describeFieldDiff(existing, expected) {
  if (!isPlainObject(existing)) return "existing value is not an object";
  const existingKeys = new Set(Object.keys(existing));
  const expectedKeys = new Set(Object.keys(expected));
  const extra = [...existingKeys].filter((key) => !expectedKeys.has(key));
  const missing = [...expectedKeys].filter((key) => !existingKeys.has(key));
  const differing = [...expectedKeys]
    .filter((key) => existingKeys.has(key) && existing[key] !== expected[key]);
  const parts = [];
  if (extra.length > 0) parts.push(`${extra.length} unexpected field(s)`);
  if (missing.length > 0) parts.push(`${missing.length} missing field(s)`);
  if (differing.length > 0) parts.push(`${differing.length} differing field(s)`);
  return parts.length > 0 ? parts.join("; ") : "fields differ";
}

// --- minimal JSON text-span scanner -----------------------------------
// Used only to find *where* to splice a new property into an already-valid
// JSON document (via node:fs text edits) without re-serializing the whole
// file, so unrelated servers/fields survive byte-for-byte.

function findMatchingBrace(text, openIndex) {
  let depth = 0;
  let inString = false;
  let escapeNext = false;
  for (let i = openIndex; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escapeNext) escapeNext = false;
      else if (ch === "\\") escapeNext = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function splitTopLevelRanges(text, sep) {
  const ranges = [];
  let depth = 0;
  let inString = false;
  let escapeNext = false;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escapeNext) escapeNext = false;
      else if (ch === "\\") escapeNext = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{" || ch === "[") depth++;
    else if (ch === "}" || ch === "]") depth--;
    else if (ch === sep && depth === 0) {
      ranges.push([start, i]);
      start = i + 1;
    }
  }
  ranges.push([start, text.length]);
  return ranges;
}

// Returns the direct-level { key, entryStartAbs, entryEndAbs, valueStartAbs }
// properties of the object spanning text[objOpenIdx]..text[objCloseIdx]
// (inclusive braces), in absolute offsets into `text`. `key` is the decoded
// string value (JSON.parse'd from its source text), so two differently
// *spelled* (e.g. unicode-escaped) source keys that decode to the same
// string compare equal here.
function findObjectEntries(text, objOpenIdx, objCloseIdx) {
  const inner = text.slice(objOpenIdx + 1, objCloseIdx);
  const entries = [];
  for (const [s, e] of splitTopLevelRanges(inner, ",")) {
    const segment = inner.slice(s, e);
    if (segment.trim() === "") continue;
    const colonRanges = splitTopLevelRanges(segment, ":");
    if (colonRanges.length < 2) continue;
    const [ks, ke] = colonRanges[0];
    let key;
    try {
      key = JSON.parse(segment.slice(ks, ke).trim());
    } catch {
      continue;
    }
    const valueStartRel = colonRanges[1][0];
    entries.push({
      key,
      entryStartAbs: objOpenIdx + 1 + s,
      entryEndAbs: objOpenIdx + 1 + e,
      valueStartAbs: objOpenIdx + 1 + s + valueStartRel,
    });
  }
  return entries;
}

function skipWhitespaceForward(text, index) {
  let i = index;
  while (i < text.length && /\s/.test(text[i])) i++;
  return i;
}

function trimTrailingWhitespaceIndex(text, endIndex) {
  let i = endIndex;
  while (i > 0 && /\s/.test(text[i - 1])) i--;
  return i;
}

function detectIndent(text, entries) {
  if (entries.length === 0) return "  ";
  const before = text.slice(0, entries[0].entryStartAbs);
  const match = /\n([ \t]*)$/.exec(before);
  return match ? match[1] : "  ";
}

// Inserts `"key": value` as a new direct property of the object spanning
// text[objOpenIdx]..text[objCloseIdx], preserving every other byte of
// `text` (existing entries, their formatting, and surrounding content).
function insertProperty(text, objOpenIdx, objCloseIdx, key, value) {
  const entries = findObjectEntries(text, objOpenIdx, objCloseIdx);
  const indent = detectIndent(text, entries);
  const serializedValue = JSON.stringify(value, null, 2)
    .split("\n")
    .map((line, index) => (index === 0 ? line : indent + line))
    .join("\n");
  const newEntryText = `${JSON.stringify(key)}: ${serializedValue}`;

  if (entries.length === 0) {
    return text.slice(0, objOpenIdx + 1) + `\n${indent}${newEntryText}\n` + text.slice(objCloseIdx);
  }
  const last = entries[entries.length - 1];
  const insertAt = trimTrailingWhitespaceIndex(text, last.entryEndAbs);
  return text.slice(0, insertAt) + `,\n${indent}${newEntryText}` + text.slice(insertAt);
}

function findRootObjectBounds(raw, label) {
  const rootOpen = raw.search(/\S/);
  if (rootOpen === -1 || raw[rootOpen] !== "{") {
    throw new InstallError(`${label}: expected a top-level JSON object`);
  }
  const rootClose = findMatchingBrace(raw, rootOpen);
  if (rootClose === -1) {
    throw new InstallError(`${label}: could not locate the closing brace of the top-level object`);
  }
  return { rootOpen, rootClose };
}

// Rejects duplicate keys in any object literal within `raw`. JSON.parse
// silently keeps the *last* occurrence of a duplicate key while
// findObjectEntries (used above to splice a new property in) finds the
// *first* — trusting either one alone means a plan could validate against
// one object's content and then text-splice into a different, shadowed
// object, silently failing to install (or corrupting) the live config. Any
// duplicate is therefore rejected outright rather than picked between.
// Comparison is by *decoded* key value (via findObjectEntries), so a
// differently-escaped spelling of the same key (e.g. a unicode escape) is
// still caught, and duplicate detection uses a Set rather than a plain
// object as a lookup table, so a key literally named "__proto__" is
// compared as an ordinary value rather than colliding with the prototype
// chain. Recurses into nested object values (not arrays: this file's
// schema has none) to also catch a duplicate key nested inside
// "mcpServers", e.g. two "somacheck" entries.
function assertNoDuplicateKeys(text, objOpenIdx, objCloseIdx, label) {
  const entries = findObjectEntries(text, objOpenIdx, objCloseIdx);
  const seen = new Set();
  for (const entry of entries) {
    if (seen.has(entry.key)) {
      throw new InstallError(
        `${label}: duplicate JSON key ${JSON.stringify(entry.key)} makes this file ambiguous to parse safely; resolve by hand before installing`,
      );
    }
    seen.add(entry.key);
  }
  for (const entry of entries) {
    const valueStart = skipWhitespaceForward(text, entry.valueStartAbs);
    if (text[valueStart] === "{") {
      const valueClose = findMatchingBrace(text, valueStart);
      if (valueClose !== -1) {
        assertNoDuplicateKeys(text, valueStart, valueClose, label);
      }
    }
  }
}

function spliceInSomacheckServer(raw, rootOpen, rootClose, parsedRoot, sourceServer) {
  if (parsedRoot.mcpServers === undefined) {
    return insertProperty(raw, rootOpen, rootClose, "mcpServers", { [SERVER_NAME]: sourceServer });
  }

  const rootEntries = findObjectEntries(raw, rootOpen, rootClose);
  const mcpServersEntry = rootEntries.find((entry) => entry.key === "mcpServers");
  if (!mcpServersEntry) {
    throw new InstallError('existing mcp.json: could not locate the "mcpServers" property text');
  }
  const valueOpen = skipWhitespaceForward(raw, mcpServersEntry.valueStartAbs);
  if (raw[valueOpen] !== "{") {
    throw new InstallError('existing mcp.json: "mcpServers" value is not a JSON object literal');
  }
  const valueClose = findMatchingBrace(raw, valueOpen);
  if (valueClose === -1) {
    throw new InstallError('existing mcp.json: could not locate the closing brace of "mcpServers"');
  }
  return insertProperty(raw, valueOpen, valueClose, SERVER_NAME, sourceServer);
}

// The text splice intentionally avoids reserializing the user's file, but it
// must still be treated as untrusted output until parsed again. This catches
// a scanner/splice disagreement before the content reaches an atomic write.
function assertValidSplicedMcpJson(raw, label, sourceServer) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new InstallError(`${label}: internal merge produced invalid JSON`);
  }
  if (!isPlainObject(parsed) || !isPlainObject(parsed.mcpServers)) {
    throw new InstallError(`${label}: internal merge produced an invalid mcpServers object`);
  }
  const { rootOpen, rootClose } = findRootObjectBounds(raw, label);
  assertNoDuplicateKeys(raw, rootOpen, rootClose, label);
  if (!serverMatches(parsed.mcpServers[SERVER_NAME], sourceServer)) {
    throw new InstallError(`${label}: internal merge did not produce the expected somacheck server`);
  }
}

// --- source package ------------------------------------------------------

async function loadSourceServer(packageRoot) {
  const raw = await readFile(path.join(packageRoot, "mcp.json"), "utf8");
  const parsed = JSON.parse(raw);
  const server = parsed?.mcpServers?.[SERVER_NAME];
  if (!isPlainObject(server)) {
    throw new InstallError(`${packageRoot}/mcp.json: missing a "${SERVER_NAME}" server entry`);
  }
  return server;
}

async function loadSourceSkill(packageRoot) {
  return readFile(path.join(packageRoot, "skills", SERVER_NAME, "SKILL.md"), "utf8");
}

// --- safe target resolution ------------------------------------------------

async function resolveProjectRoot(projectDir) {
  let info;
  try {
    info = await stat(projectDir);
  } catch {
    throw new InstallError(`--project path does not exist: ${projectDir}`);
  }
  if (!info.isDirectory()) {
    throw new InstallError(`--project path is not a directory: ${projectDir}`);
  }
  return realpath(projectDir);
}

function withTrailingSep(dir) {
  return dir.endsWith(path.sep) ? dir : dir + path.sep;
}

// Walks projectReal/segments[0]/segments[1]/... and refuses to proceed
// through a symlinked ancestor, a symlinked final target, or any path
// whose realpath resolves outside projectReal (e.g. a symlink pointing out
// of the project). Stops (successfully) at the first path segment that
// does not exist yet, since there is nothing further to check below it.
async function safeResolveTarget(projectReal, segments) {
  const projectRootWithSep = withTrailingSep(projectReal);
  let current = projectReal;
  for (let i = 0; i < segments.length; i++) {
    current = path.join(current, segments[i]);
    let info;
    try {
      info = await lstat(current);
    } catch {
      return { absolutePath: path.join(projectReal, ...segments), exists: false };
    }
    if (info.isSymbolicLink()) {
      throw new InstallError(`refusing to write through a symlinked path: ${current}`);
    }
    const real = await realpath(current);
    if (real !== projectReal && !real.startsWith(projectRootWithSep)) {
      throw new InstallError(`path resolves outside the project directory: ${current}`);
    }
    if (i === segments.length - 1) {
      return { absolutePath: real, exists: true };
    }
  }
  return { absolutePath: path.join(projectReal, ...segments), exists: false };
}

// --- planning --------------------------------------------------------------

function freshMcpJson(sourceServer) {
  return JSON.stringify({ mcpServers: { [SERVER_NAME]: sourceServer } }, null, 2) + "\n";
}

async function planMcpChange(mcpJsonPath, sourceServer) {
  let raw;
  let beforeIno;
  try {
    const info = await stat(mcpJsonPath);
    beforeIno = info.ino;
    raw = await readFile(mcpJsonPath, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") {
      return {
        action: "create",
        path: mcpJsonPath,
        segments: MCP_TARGET_SEGMENTS,
        newContent: freshMcpJson(sourceServer),
        beforeExisted: false,
        beforeContent: null,
        beforeIno: undefined,
      };
    }
    throw err;
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Never include the parser's message here: on malformed input it can
    // echo a snippet of the file's own content back into the thrown error.
    throw new InstallError(`${mcpJsonPath}: existing content is not valid JSON`);
  }
  if (!isPlainObject(parsed)) {
    throw new InstallError(`${mcpJsonPath}: top-level JSON value must be an object`);
  }

  const { rootOpen, rootClose } = findRootObjectBounds(raw, mcpJsonPath);
  assertNoDuplicateKeys(raw, rootOpen, rootClose, mcpJsonPath);

  if (parsed.mcpServers !== undefined && !isPlainObject(parsed.mcpServers)) {
    throw new InstallError(`${mcpJsonPath}: "mcpServers" must be an object`);
  }

  const existingServer = parsed.mcpServers?.[SERVER_NAME];
  if (existingServer !== undefined) {
    if (serverMatches(existingServer, sourceServer)) {
      return {
        action: "none",
        path: mcpJsonPath,
        segments: MCP_TARGET_SEGMENTS,
        beforeExisted: true,
        beforeContent: raw,
        beforeIno,
      };
    }
    throw new InstallError(
      `${mcpJsonPath}: an existing "${SERVER_NAME}" MCP server entry does not exactly match the ` +
        `package's server (${describeFieldDiff(existingServer, sourceServer)}); ` +
        "resolve the conflict manually before installing",
    );
  }

  const newContent = spliceInSomacheckServer(raw, rootOpen, rootClose, parsed, sourceServer);
  assertValidSplicedMcpJson(newContent, mcpJsonPath, sourceServer);
  return {
    action: parsed.mcpServers === undefined ? "add-mcpServers" : "add-server",
    path: mcpJsonPath,
    segments: MCP_TARGET_SEGMENTS,
    newContent,
    beforeExisted: true,
    beforeContent: raw,
    beforeIno,
  };
}

async function planSkillChange(skillPath, sourceContent) {
  let existing;
  let beforeIno;
  try {
    const info = await stat(skillPath);
    beforeIno = info.ino;
    existing = await readFile(skillPath, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") {
      return {
        action: "create",
        path: skillPath,
        segments: SKILL_TARGET_SEGMENTS,
        newContent: sourceContent,
        beforeExisted: false,
        beforeContent: null,
        beforeIno: undefined,
      };
    }
    throw err;
  }
  if (existing === sourceContent) {
    return {
      action: "none",
      path: skillPath,
      segments: SKILL_TARGET_SEGMENTS,
      beforeExisted: true,
      beforeContent: existing,
      beforeIno,
    };
  }
  throw new InstallError(
    `${skillPath}: an existing "${SERVER_NAME}" skill file does not exactly match the package's ` +
      "skill; resolve the conflict manually before installing",
  );
}

/**
 * Preflights both targets (mcp.json merge, skill copy) against a project
 * directory without writing anything. Throws InstallError on any conflict,
 * malformed input, ambiguous duplicate JSON key, or unsafe
 * (symlinked/escaping) target path.
 */
export async function planInstall({ projectDir, packageRoot }) {
  const { valid, errors } = await validatePlugin(packageRoot);
  if (!valid) {
    throw new InstallError(`source package failed validation: ${errors.join("; ")}`);
  }

  const sourceServer = await loadSourceServer(packageRoot);
  const sourceSkillContent = await loadSourceSkill(packageRoot);
  const projectReal = await resolveProjectRoot(projectDir);

  const mcpTarget = await safeResolveTarget(projectReal, MCP_TARGET_SEGMENTS);
  const skillTarget = await safeResolveTarget(projectReal, SKILL_TARGET_SEGMENTS);

  const mcp = await planMcpChange(mcpTarget.absolutePath, sourceServer);
  const skill = await planSkillChange(skillTarget.absolutePath, sourceSkillContent);

  const plan = {
    changed: mcp.action !== "none" || skill.action !== "none",
    projectReal,
    mcp: Object.freeze({ ...mcp, segments: Object.freeze([...mcp.segments]) }),
    skill: Object.freeze({ ...skill, segments: Object.freeze([...skill.segments]) }),
  };
  Object.freeze(plan);
  TRUSTED_PLANS.add(plan);
  return plan;
}

// Re-validates one planned op against the project's *current* on-disk state
// right before applyInstall writes anything: a symlinked ancestor/target
// (safeResolveTarget), a target that appeared or disappeared since planning,
// or a target whose content or inode no longer matches what was read during
// planning (a concurrent edit) all reject the whole apply rather than
// silently overwriting someone else's change. Returns the target's current
// permission bits (for preserving them across the write) when it existed.
async function preflightPlanOp(projectReal, op) {
  const resolved = await safeResolveTarget(projectReal, op.segments);
  if (resolved.absolutePath !== op.path) {
    throw new InstallError(`${op.path}: target path changed since planning; re-run to get a fresh plan`);
  }
  if (resolved.exists !== op.beforeExisted) {
    throw new InstallError(
      `${op.path}: ${op.beforeExisted ? "no longer exists" : "was created"} since planning (concurrent change) — re-run to get a fresh plan`,
    );
  }
  if (!op.beforeExisted) {
    return { mode: undefined };
  }
  const info = await stat(op.path);
  const currentContent = await readFile(op.path, "utf8");
  if (currentContent !== op.beforeContent || info.ino !== op.beforeIno) {
    throw new InstallError(`${op.path}: changed since planning (concurrent edit) — re-run to get a fresh plan`);
  }
  return { mode: info.mode & 0o777 };
}

// Writes `content` to `targetPath` via an exclusively-created (fails if it
// already exists), owner-only (0600), cryptographically-random-named temp
// file, then renames it into place — never a predictable temp path or the
// process's default (umask-derived) permissions, either of which could
// briefly leave a config file readable beyond its owner or racily
// overwritable by another local process. `mode`, when given, is applied to
// the final path after the rename so an existing file's permissions (e.g.
// an already-0600 config holding other MCP servers' secrets) are preserved
// rather than reset to the temp file's own mode. The temp file is removed
// on every failure path (create, write, or rename).
async function atomicWriteAt(targetPath, content, mode) {
  const tmpPath = path.join(
    path.dirname(targetPath),
    `.${path.basename(targetPath)}.preview-install-tmp-${randomBytes(16).toString("hex")}`,
  );
  let renamed = false;
  let writtenIno;
  try {
    const handle = await open(tmpPath, "wx", 0o600);
    try {
      await handle.writeFile(content, "utf8");
    } finally {
      await handle.close();
    }
    await rename(tmpPath, targetPath);
    renamed = true;
    writtenIno = (await lstat(targetPath)).ino;
    if (mode !== undefined) {
      await chmod(targetPath, mode);
    }
    return { inode: writtenIno };
  } catch (err) {
    if (renamed && writtenIno !== undefined && err && typeof err === "object") {
      err.writtenIno = writtenIno;
    }
    throw err;
  } finally {
    if (!renamed) {
      await unlink(tmpPath).catch(() => {});
    }
  }
}

// Restores one already-applied write during rollback, but only when it is
// still safe to do so: if the path became a symlink, or its content no
// longer matches exactly what this call wrote, something else touched it
// since — rolling back would either follow an attacker-controlled symlink
// or silently discard a concurrent edit, so this throws instead (reported
// to the caller as an honest rollback failure) and leaves the file alone.
async function rollbackWrite(projectReal, op, previousMode, writtenIno) {
  const resolved = await safeResolveTarget(projectReal, op.segments);
  if (resolved.absolutePath !== op.path || !resolved.exists) {
    throw new InstallError(`rollback of ${op.path} skipped: target path changed — refusing to overwrite it`);
  }
  let currentInfo;
  try {
    currentInfo = await lstat(op.path);
  } catch (err) {
    if (err.code === "ENOENT") return;
    throw new InstallError(`rollback of ${op.path} failed: cannot stat it`);
  }
  if (currentInfo.isSymbolicLink()) {
    throw new InstallError(`rollback of ${op.path} skipped: it became a symlink after writing — refusing to follow it`);
  }
  if (writtenIno !== undefined && currentInfo.ino !== writtenIno) {
    throw new InstallError(`rollback of ${op.path} skipped: target identity changed — refusing to overwrite it`);
  }
  const currentContent = await readFile(op.path, "utf8");
  if (currentContent !== op.newContent) {
    throw new InstallError(
      `rollback of ${op.path} skipped: its content changed after this write — not overwriting a possible concurrent edit`,
    );
  }
  if (op.beforeExisted) {
    await atomicWriteAt(op.path, op.beforeContent, previousMode);
  } else {
    await unlink(op.path);
  }
}

/**
 * Applies a plan from planInstall as a single transaction. Before writing
 * anything, every target is re-preflighted against the state recorded at
 * planning time (see preflightPlanOp) — a stale plan (concurrent edit,
 * creation, deletion, or symlink swap of either target) is rejected outright
 * rather than partially or silently overwritten. Each write then goes to a
 * temp file and is renamed into place (see atomicWriteAt), and if any write
 * after the first fails, every already-applied write is rolled back (see
 * rollbackWrite) before the error is re-thrown; a rollback that cannot
 * safely proceed reports its own failure rather than being swallowed. Never
 * deletes a pre-existing directory or file it didn't itself write.
 *
 * The optional `onBeforeWrite(op)` hook runs immediately before each op's
 * write and exists only for tests to inject a concurrent change or a fault
 * at a precise point in the sequence; it is not used by the CLI.
 */
export async function applyInstall(plan, { onBeforeWrite } = {}) {
  if (!plan || !TRUSTED_PLANS.has(plan)) {
    throw new InstallError("install plan was not produced by planInstall; re-run preflight before applying");
  }
  const ops = [plan.mcp, plan.skill].filter((op) => op.action !== "none");
  if (ops.length === 0) return { applied: [] };

  const preflighted = [];
  for (const op of ops) {
    preflighted.push(await preflightPlanOp(plan.projectReal, op));
  }

  const rollbacks = [];
  try {
    for (let i = 0; i < ops.length; i++) {
      const op = ops[i];
      let { mode: previousMode } = preflighted[i];
      if (onBeforeWrite) await onBeforeWrite(op);
      ({ mode: previousMode } = await preflightPlanOp(plan.projectReal, op));
      await mkdir(path.dirname(op.path), { recursive: true });
      let writeResult;
      try {
        writeResult = await atomicWriteAt(op.path, op.newContent, op.beforeExisted ? previousMode : undefined);
      } catch (err) {
        if (err?.writtenIno !== undefined) {
          rollbacks.push(() => rollbackWrite(plan.projectReal, op, previousMode, err.writtenIno));
        }
        throw err;
      }
      rollbacks.push(() => rollbackWrite(plan.projectReal, op, previousMode, writeResult.inode));
    }
  } catch (err) {
    const rollbackErrors = [];
    for (const rollback of rollbacks.reverse()) {
      try {
        await rollback();
      } catch (rollbackErr) {
        rollbackErrors.push(rollbackErr.message);
      }
    }
    if (rollbackErrors.length > 0) {
      throw new InstallError(
        `apply failed (${err.message}) and rollback also failed for ${rollbackErrors.length} write(s): ` +
          `${rollbackErrors.join("; ")} — check this project's Cursor config by hand`,
      );
    }
    throw err;
  }
  return { applied: ops.map((op) => op.path) };
}

/**
 * Checks an already-installed project against the package without writing
 * anything: the mcp.json "somacheck" server must exactly match (no extra
 * headers/command, exact url), and the skill file must exactly match.
 * Issue text never includes existing file content, credential values, or a
 * parser's error message — only generic, non-secret descriptions.
 */
export async function verifyInstall({ projectDir, packageRoot }) {
  const { valid, errors } = await validatePlugin(packageRoot);
  if (!valid) {
    throw new InstallError(`source package failed validation: ${errors.join("; ")}`);
  }

  const sourceServer = await loadSourceServer(packageRoot);
  const sourceSkillContent = await loadSourceSkill(packageRoot);
  const projectReal = await resolveProjectRoot(projectDir);

  const mcpTarget = await safeResolveTarget(projectReal, MCP_TARGET_SEGMENTS);
  const skillTarget = await safeResolveTarget(projectReal, SKILL_TARGET_SEGMENTS);

  const issues = [];

  try {
    const raw = await readFile(mcpTarget.absolutePath, "utf8");
    let parsed;
    try {
      parsed = JSON.parse(raw);
      if (isPlainObject(parsed)) {
        const { rootOpen, rootClose } = findRootObjectBounds(raw, mcpTarget.absolutePath);
        assertNoDuplicateKeys(raw, rootOpen, rootClose, mcpTarget.absolutePath);
      }
    } catch {
      issues.push(`${mcpTarget.absolutePath}: existing content is not valid JSON or has ambiguous duplicate keys`);
      parsed = undefined;
    }
    if (parsed !== undefined) {
      if (!isPlainObject(parsed) || (parsed.mcpServers !== undefined && !isPlainObject(parsed.mcpServers))) {
        issues.push(`${mcpTarget.absolutePath}: does not have the expected object structure`);
      } else {
        const server = parsed.mcpServers?.[SERVER_NAME];
        if (server === undefined) {
          issues.push(`${mcpTarget.absolutePath}: no "${SERVER_NAME}" server present`);
        } else if (!serverMatches(server, sourceServer)) {
          issues.push(
            `${mcpTarget.absolutePath}: "${SERVER_NAME}" server does not exactly match the package ` +
              `(${describeFieldDiff(server, sourceServer)})`,
          );
        }
      }
    }
  } catch (err) {
    issues.push(`${mcpTarget.absolutePath}: ${err.code === "ENOENT" ? "does not exist" : "unreadable"}`);
  }

  try {
    const content = await readFile(skillTarget.absolutePath, "utf8");
    if (content !== sourceSkillContent) {
      issues.push(`${skillTarget.absolutePath}: content does not exactly match the package's skill`);
    }
  } catch (err) {
    issues.push(`${skillTarget.absolutePath}: ${err.code === "ENOENT" ? "does not exist" : "unreadable"}`);
  }

  return { ok: issues.length === 0, issues };
}

// --- CLI ---------------------------------------------------------------

function describeMcpAction(action, { dryRun }) {
  const verb = dryRun ? "would " : "";
  switch (action) {
    case "create":
      return `.cursor/mcp.json: ${verb}create the file with the somacheck server`;
    case "add-mcpServers":
      return `.cursor/mcp.json: ${verb}add "mcpServers" with the somacheck server (other content untouched)`;
    case "add-server":
      return `.cursor/mcp.json: ${verb}add the somacheck server (other servers untouched)`;
    case "none":
      return ".cursor/mcp.json: already has the matching somacheck server (no change)";
    default:
      return `.cursor/mcp.json: ${action}`;
  }
}

function describeSkillAction(action, { dryRun }) {
  const verb = dryRun ? "would " : "";
  switch (action) {
    case "create":
      return `.cursor/skills/somacheck/SKILL.md: ${verb}create the file`;
    case "none":
      return ".cursor/skills/somacheck/SKILL.md: already matches the package skill (no change)";
    default:
      return `.cursor/skills/somacheck/SKILL.md: ${action}`;
  }
}

// Prints only the action taken per target (create / add-mcpServers /
// add-server / none) — never existing file content, credential values, or a
// byte-for-byte diff — so a dry run is safe to paste into a chat or ticket.
function printPlan(plan, { dryRun }) {
  console.log(`${dryRun ? "Dry run" : "Result"} for this project's Cursor config:`);
  console.log(`  ${describeMcpAction(plan.mcp.action, { dryRun })}`);
  console.log(`  ${describeSkillAction(plan.skill.action, { dryRun })}`);
  if (dryRun) {
    console.log("Nothing was written. Re-run with --apply to write these changes.");
  } else if (!plan.changed) {
    console.log("Nothing to write; already up to date.");
  }
  console.log(
    "This does not run inside Cursor and does not confirm Cursor loads the result " +
      "— see packages/cursor-plugin/README.md.",
  );
}

function parseArgs(argv) {
  const args = { project: undefined, apply: false, verify: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--project") {
      args.project = argv[++i];
    } else if (arg === "--apply") {
      args.apply = true;
    } else if (arg === "--verify") {
      args.verify = true;
    } else {
      throw new InstallError(`unknown argument: ${arg}`);
    }
  }
  if (!args.project) {
    throw new InstallError("--project <path> is required");
  }
  if (args.verify && args.apply) {
    throw new InstallError("--verify cannot be combined with --apply; run them separately");
  }
  return args;
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`preview-install: ${err.message}`);
    process.exitCode = 1;
    return;
  }

  const projectDir = path.resolve(args.project);

  if (args.verify) {
    try {
      const result = await verifyInstall({ projectDir, packageRoot: PACKAGE_ROOT });
      if (result.ok) {
        console.log("verify: OK — project's .cursor/mcp.json and skill exactly match this package.");
      } else {
        console.error("verify: FAILED");
        for (const issue of result.issues) console.error(`  - ${issue}`);
        process.exitCode = 1;
      }
    } catch (err) {
      console.error(`verify: ERROR — ${err.message}`);
      process.exitCode = 1;
    }
    return;
  }

  let plan;
  try {
    plan = await planInstall({ projectDir, packageRoot: PACKAGE_ROOT });
  } catch (err) {
    console.error(`preview-install: ${err.message}`);
    process.exitCode = 1;
    return;
  }

  if (!args.apply) {
    printPlan(plan, { dryRun: true });
    return;
  }

  if (!plan.changed) {
    printPlan(plan, { dryRun: false });
    return;
  }

  try {
    await applyInstall(plan);
    printPlan(plan, { dryRun: false });
  } catch (err) {
    console.error(`preview-install: apply failed — ${err.message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
