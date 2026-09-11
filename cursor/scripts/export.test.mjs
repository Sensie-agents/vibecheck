import { after, afterEach, before, test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  copyFile, lstat, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ALLOWLIST, exportFromArgs, parseArgs, scanForSecrets } from "./export.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(HERE, "..");
const REAL_MANIFEST = path.join(PACKAGE_ROOT, ".cursor-plugin", "plugin.json");
const ORIGINAL_CWD = process.cwd();
const MANIFEST_BEFORE = await readFile(REAL_MANIFEST);
const TEMP_ROOT = await realpath(tmpdir());
const SUITE_CWD = await mkdtemp(path.join(TEMP_ROOT, "cursor-export-suite-"));
const CWD_SENTINEL = path.join(SUITE_CWD, ".cursor-plugin", "plugin.json");
const SENTINEL_BYTES = Buffer.from('{"sentinel":"must-not-change"}\n');

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? SUITE_CWD,
      env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      const result = { code, stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr) };
      if (code !== 0 && !options.allowFailure) {
        reject(new Error(`${command} failed (${code}): ${result.stderr.toString("utf8")}`));
      } else resolve(result);
    });
  });
}

async function git(repo, ...args) {
  return run("git", args, { cwd: repo });
}

async function makeRepo(label, overrides = new Map()) {
  const repo = await mkdtemp(path.join(SUITE_CWD, `${label}-repo-`));
  await git(repo, "init", "--quiet", "--initial-branch=main");
  await git(repo, "config", "user.email", "cursor-export@test.invalid");
  await git(repo, "config", "user.name", "Cursor Export Test");
  await git(repo, "config", "commit.gpgsign", "false");
  for (const relative of ALLOWLIST) {
    const destination = path.join(repo, "packages", "cursor-plugin", relative);
    await mkdir(path.dirname(destination), { recursive: true });
    if (overrides.has(relative)) {
      const value = overrides.get(relative);
      if (value === null) continue;
      await writeFile(destination, value);
    } else {
      await copyFile(path.join(PACKAGE_ROOT, relative), destination);
    }
  }
  await git(repo, "add", "-A");
  await git(repo, "commit", "--quiet", "-m", "fixture");
  return {
    repo,
    sha: (await git(repo, "rev-parse", "HEAD")).stdout.toString("utf8").trim(),
  };
}

async function targets(label) {
  const parent = await mkdtemp(path.join(SUITE_CWD, `${label}-outputs-`));
  return { parent, out: path.join(parent, "candidate"), tar: path.join(parent, "candidate.tgz") };
}

async function expectAbsent(candidate) {
  await assert.rejects(lstat(candidate), (error) => error?.code === "ENOENT");
}

async function invoke(fixture, destination) {
  return exportFromArgs({ source: fixture.repo, sha: fixture.sha, out: destination.out, tar: destination.tar });
}

before(async () => {
  await mkdir(path.dirname(CWD_SENTINEL), { recursive: true });
  await writeFile(CWD_SENTINEL, SENTINEL_BYTES);
  process.chdir(SUITE_CWD);
});

afterEach(async () => {
  assert.deepEqual(await readFile(REAL_MANIFEST), MANIFEST_BEFORE, "real package manifest changed");
  assert.deepEqual(await readFile(CWD_SENTINEL), SENTINEL_BYTES, "cwd sentinel manifest changed");
});

after(async () => {
  process.chdir(ORIGINAL_CWD);
  await rm(SUITE_CWD, { recursive: true, force: true });
});

test("requires explicit canonical arguments and a full lowercase SHA", () => {
  assert.throws(() => parseArgs([]), /missing required/);
  assert.throws(() => parseArgs(["--source", "/tmp/x", "--sha", "HEAD", "--out", "/tmp/o", "--tar", "/tmp/a.tgz"]), /full lowercase/);
  assert.throws(() => parseArgs(["--source", "relative", "--sha", "a".repeat(40), "--out", "/tmp/o", "--tar", "/tmp/a.tgz"]), /absolute/);
});

test("secret scanner detects synthetic markers assembled only at runtime", () => {
  const github = ["gh", "p_", "abcdefghijklmnopqrstuvwxyz123456"].join("");
  const aws = ["AK", "IA", "ABCDEFGHIJKLMNOP"].join("");
  const privateKey = ["-----BEGIN ", "PRIVATE KEY-----"].join("");
  const findings = scanForSecrets(new Map([["README.md", Buffer.from(`${github}\n${aws}\n${privateKey}`)]]));
  assert.deepEqual(findings.map(({ rule }) => rule).sort(), ["aws-access-key", "github-token", "private-key"]);
});

test("rejects dirty plugin paths but permits unrelated dirtiness", async () => {
  const good = await makeRepo("dirty");
  const destination = await targets("dirty");
  await writeFile(path.join(good.repo, "unrelated.txt"), "dirty\n");
  await invoke(good, destination);
  assert.ok((await lstat(destination.tar)).isFile());

  const bad = await makeRepo("plugin-dirty");
  const badDestination = await targets("plugin-dirty");
  await writeFile(path.join(bad.repo, "packages", "cursor-plugin", "README.md"), "dirty\n");
  await assert.rejects(invoke(bad, badDestination), /must be clean/);
  await expectAbsent(badDestination.out);
  await expectAbsent(badDestination.tar);
});

test("rejects extra, missing, and symlink entries in the committed plugin tree", async () => {
  const extra = await makeRepo("extra");
  await writeFile(path.join(extra.repo, "packages", "cursor-plugin", "extra.txt"), "extra\n");
  await git(extra.repo, "add", "-A");
  await git(extra.repo, "commit", "--quiet", "-m", "extra");
  extra.sha = (await git(extra.repo, "rev-parse", "HEAD")).stdout.toString("utf8").trim();
  await assert.rejects(invoke(extra, await targets("extra")), /non-allowlisted/);

  const missing = await makeRepo("missing", new Map([["LICENSE", null]]));
  await assert.rejects(invoke(missing, await targets("missing")), /missing allowlisted/);

  const linked = await makeRepo("linked");
  const license = path.join(linked.repo, "packages", "cursor-plugin", "LICENSE");
  await rm(license);
  await symlink("README.md", license);
  await git(linked.repo, "add", "-A");
  await git(linked.repo, "commit", "--quiet", "-m", "symlink");
  linked.sha = (await git(linked.repo, "rev-parse", "HEAD")).stdout.toString("utf8").trim();
  await assert.rejects(invoke(linked, await targets("linked")), /not a regular/);
});

test("secret rejection is fail-closed and leaves no output or stage residue", async () => {
  const marker = ["gh", "p_", "abcdefghijklmnopqrstuvwxyz123456"].join("");
  const fixture = await makeRepo("secret", new Map([["README.md", `${marker}\n`]]));
  const destination = await targets("secret");
  await assert.rejects(invoke(fixture, destination), /secret scan rejected README.md/);
  await expectAbsent(destination.out);
  await expectAbsent(destination.tar);
  assert.deepEqual((await run("find", [destination.parent, "-maxdepth", "1", "-name", ".cursor-plugin-export-stage-*"])).stdout.toString("utf8"), "");
});

test("never overwrites an existing output, archive, or final-path symlink", async () => {
  const fixture = await makeRepo("existing");
  const existingOut = await targets("existing-out");
  await mkdir(existingOut.out);
  await writeFile(path.join(existingOut.out, "keep"), "keep\n");
  await assert.rejects(invoke(fixture, existingOut), /already exists/);
  assert.equal(await readFile(path.join(existingOut.out, "keep"), "utf8"), "keep\n");

  const existingTar = await targets("existing-tar");
  await writeFile(existingTar.tar, "keep\n");
  await assert.rejects(invoke(fixture, existingTar), /already exists/);
  assert.equal(await readFile(existingTar.tar, "utf8"), "keep\n");

  const linkedOut = await targets("linked-out");
  const target = path.join(linkedOut.parent, "real");
  await mkdir(target);
  await symlink(target, linkedOut.out);
  await assert.rejects(invoke(fixture, linkedOut), /already exists/);
  assert.ok((await lstat(linkedOut.out)).isSymbolicLink());
});

test("rejects symlinked output ancestors and outputs inside the repository", async () => {
  const fixture = await makeRepo("ancestor");
  const realParent = await mkdtemp(path.join(SUITE_CWD, "real-parent-"));
  const alias = path.join(SUITE_CWD, "parent-alias");
  await symlink(realParent, alias);
  await assert.rejects(invoke(fixture, { out: path.join(alias, "candidate"), tar: path.join(alias, "candidate.tgz") }), /symlink ancestor|canonical/);
  await assert.rejects(invoke(fixture, {
    out: path.join(fixture.repo, "candidate"), tar: path.join(fixture.repo, "candidate.tgz"),
  }), /outside the source/);
});

test("validator failure rolls back every publication path", async () => {
  const fixture = await makeRepo("invalid", new Map([["mcp.json", "{}\n"]]));
  const destination = await targets("invalid");
  await assert.rejects(invoke(fixture, destination), /failed validation/);
  await expectAbsent(destination.out);
  await expectAbsent(destination.tar);
});

test("actual package snapshot exports deterministically and passes its exported validator", async () => {
  const fixture = await makeRepo("actual");
  const first = await targets("actual-one");
  const second = await targets("actual-two");
  const firstReceipt = await invoke(fixture, first);
  const secondReceipt = await invoke(fixture, second);
  assert.equal(firstReceipt.archive_sha256, secondReceipt.archive_sha256);
  assert.deepEqual(await readFile(first.tar), await readFile(second.tar));
  const savedReceipt = JSON.parse(await readFile(path.join(first.out, "export-receipt.json"), "utf8"));
  assert.equal(savedReceipt.source_sha, fixture.sha);
  assert.equal(savedReceipt.archive_sha256, firstReceipt.archive_sha256);

  const validator = await import(`${new URL("./validate.mjs", import.meta.url).href}?test=${Date.now()}`);
  assert.deepEqual(await validator.validatePlugin(first.out), { valid: true, errors: [] });
  const listing = await run("tar", ["-tzf", first.tar]);
  assert.deepEqual(listing.stdout.toString("utf8").trim().split("\n"), ALLOWLIST.map((item) => `cursor-plugin/${item}`));
});

test("CLI has one entrypoint and succeeds from the isolated temporary cwd", async () => {
  const fixture = await makeRepo("cli");
  const destination = await targets("cli");
  const result = await run(process.execPath, [
    path.join(PACKAGE_ROOT, "scripts", "export.mjs"),
    "--source", fixture.repo,
    "--sha", fixture.sha,
    "--out", destination.out,
    "--tar", destination.tar,
  ]);
  assert.equal(result.code, 0);
  const parsed = JSON.parse(result.stdout.toString("utf8"));
  assert.equal(parsed.source_sha, fixture.sha);
  assert.ok((await lstat(destination.tar)).isFile());
});
