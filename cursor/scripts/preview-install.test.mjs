import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  symlink,
  rm,
  stat,
  lstat,
  readlink,
  realpath,
  readdir,
  chmod,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { planInstall, applyInstall, verifyInstall, InstallError } from "./preview-install.mjs";

const execFileAsync = promisify(execFile);

const SCRIPT_PATH = fileURLToPath(new URL("./preview-install.mjs", import.meta.url));
const PACKAGE_ROOT = fileURLToPath(new URL("..", import.meta.url));
const SOURCE_URL = "https://mcp.somacheck.com/functions/v1/mcp";

async function makeTempDir(prefix) {
  return mkdtemp(path.join(tmpdir(), prefix));
}

async function makeProjectDir() {
  return makeTempDir("cursor-plugin-project-");
}

async function pathExists(candidate) {
  try {
    await stat(candidate);
    return true;
  } catch {
    return false;
  }
}

function mcpJsonPath(projectDir) {
  return path.join(projectDir, ".cursor", "mcp.json");
}

function skillPath(projectDir) {
  return path.join(projectDir, ".cursor", "skills", "somacheck", "SKILL.md");
}

// Builds a minimal fixture package (mirroring packages/cursor-plugin's own
// shape) so "source validation" tests can exercise a broken source without
// touching the real, owned mcp.json/validate.mjs/SKILL.md files.
async function makeFixturePackage({ mcpServers, skillContent, plugin } = {}) {
  const root = await makeTempDir("cursor-plugin-source-");
  await mkdir(path.join(root, ".cursor-plugin"), { recursive: true });
  await writeFile(
    path.join(root, ".cursor-plugin", "plugin.json"),
    JSON.stringify(plugin ?? { name: "somacheck" }, null, 2),
  );
  await writeFile(
    path.join(root, "mcp.json"),
    JSON.stringify({ mcpServers: mcpServers ?? { somacheck: { url: SOURCE_URL } } }, null, 2),
  );
  if (skillContent !== null) {
    await mkdir(path.join(root, "skills", "somacheck"), { recursive: true });
    await writeFile(
      path.join(root, "skills", "somacheck", "SKILL.md"),
      skillContent ?? "---\nname: somacheck\ndescription: Test skill.\n---\nBody.\n",
    );
  }
  return root;
}

async function cleanup(...dirs) {
  for (const dir of dirs) {
    await rm(dir, { recursive: true, force: true });
  }
}

test("missing config: dry run reports create-both and writes nothing", async () => {
  const project = await makeProjectDir();
  try {
    const plan = await planInstall({ projectDir: project, packageRoot: PACKAGE_ROOT });
    assert.equal(plan.changed, true);
    assert.equal(plan.mcp.action, "create");
    assert.equal(plan.skill.action, "create");
    assert.equal(await pathExists(mcpJsonPath(project)), false);
    assert.equal(await pathExists(skillPath(project)), false);
  } finally {
    await cleanup(project);
  }
});

test("missing config: apply creates both files with the exact merged/copied content", async () => {
  const project = await makeProjectDir();
  try {
    const plan = await planInstall({ projectDir: project, packageRoot: PACKAGE_ROOT });
    await applyInstall(plan);

    const mcp = JSON.parse(await readFile(mcpJsonPath(project), "utf8"));
    assert.deepEqual(mcp.mcpServers.somacheck, { url: SOURCE_URL });

    const sourceSkill = await readFile(path.join(PACKAGE_ROOT, "skills", "somacheck", "SKILL.md"), "utf8");
    const installedSkill = await readFile(skillPath(project), "utf8");
    assert.equal(installedSkill, sourceSkill);
  } finally {
    await cleanup(project);
  }
});

test("dry run: --project only (no --apply) via the CLI writes nothing", async () => {
  const project = await makeProjectDir();
  try {
    const { stdout } = await execFileAsync(process.execPath, [SCRIPT_PATH, "--project", project]);
    assert.match(stdout, /Dry run/);
    assert.match(stdout, /Nothing was written/);
    assert.equal(await pathExists(mcpJsonPath(project)), false);
    assert.equal(await pathExists(skillPath(project)), false);
  } finally {
    await cleanup(project);
  }
});

test("idempotence: a second apply makes zero changes", async () => {
  const project = await makeProjectDir();
  try {
    const firstPlan = await planInstall({ projectDir: project, packageRoot: PACKAGE_ROOT });
    await applyInstall(firstPlan);
    const mcpAfterFirst = await readFile(mcpJsonPath(project), "utf8");
    const skillAfterFirst = await readFile(skillPath(project), "utf8");

    const secondPlan = await planInstall({ projectDir: project, packageRoot: PACKAGE_ROOT });
    assert.equal(secondPlan.changed, false);
    assert.equal(secondPlan.mcp.action, "none");
    assert.equal(secondPlan.skill.action, "none");

    const applied = await applyInstall(secondPlan);
    assert.deepEqual(applied.applied, []);

    assert.equal(await readFile(mcpJsonPath(project), "utf8"), mcpAfterFirst);
    assert.equal(await readFile(skillPath(project), "utf8"), skillAfterFirst);
  } finally {
    await cleanup(project);
  }
});

test("idempotence: --apply run twice via the CLI succeeds both times", async () => {
  const project = await makeProjectDir();
  try {
    await execFileAsync(process.execPath, [SCRIPT_PATH, "--project", project, "--apply"]);
    const { stdout } = await execFileAsync(process.execPath, [SCRIPT_PATH, "--project", project, "--apply"]);
    assert.match(stdout, /already up to date/);
  } finally {
    await cleanup(project);
  }
});

test("preserves an existing unrelated server byte-for-byte and does not reorder/reformat the file", async () => {
  const project = await makeProjectDir();
  try {
    const existing =
      '{\n    "mcpServers": {\n        "otherTool": {\n            "url": "https://example.com/mcp",\n            "headers": { "X-Test": "keep-me" }\n        }\n    }\n}\n';
    await mkdir(path.dirname(mcpJsonPath(project)), { recursive: true });
    await writeFile(mcpJsonPath(project), existing);

    const otherToolSnippet = existing.slice(existing.indexOf('"otherTool"'), existing.indexOf("}\n    }\n}") + 1);

    const plan = await planInstall({ projectDir: project, packageRoot: PACKAGE_ROOT });
    assert.equal(plan.mcp.action, "add-server");
    await applyInstall(plan);

    const updated = await readFile(mcpJsonPath(project), "utf8");
    assert.ok(updated.includes(otherToolSnippet), "unrelated server text must survive byte-for-byte");

    const parsed = JSON.parse(updated);
    assert.deepEqual(parsed.mcpServers.otherTool, { url: "https://example.com/mcp", headers: { "X-Test": "keep-me" } });
    assert.deepEqual(parsed.mcpServers.somacheck, { url: SOURCE_URL });
  } finally {
    await cleanup(project);
  }
});

test("preserves other top-level fields when mcpServers is absent entirely", async () => {
  const project = await makeProjectDir();
  try {
    const existing = '{\n  "otherTopLevelSetting": true\n}\n';
    await mkdir(path.dirname(mcpJsonPath(project)), { recursive: true });
    await writeFile(mcpJsonPath(project), existing);

    const plan = await planInstall({ projectDir: project, packageRoot: PACKAGE_ROOT });
    assert.equal(plan.mcp.action, "add-mcpServers");
    await applyInstall(plan);

    const parsed = JSON.parse(await readFile(mcpJsonPath(project), "utf8"));
    assert.equal(parsed.otherTopLevelSetting, true);
    assert.deepEqual(parsed.mcpServers.somacheck, { url: SOURCE_URL });
  } finally {
    await cleanup(project);
  }
});

test("conflict: an existing somacheck server with extra headers fails with no writes", async () => {
  const project = await makeProjectDir();
  try {
    const existing = JSON.stringify(
      { mcpServers: { somacheck: { url: SOURCE_URL, headers: { Authorization: "Bearer x" } } } },
      null,
      2,
    );
    await mkdir(path.dirname(mcpJsonPath(project)), { recursive: true });
    await writeFile(mcpJsonPath(project), existing);

    await assert.rejects(
      planInstall({ projectDir: project, packageRoot: PACKAGE_ROOT }),
      (err) => err instanceof InstallError && /does not exactly match/.test(err.message),
    );
    assert.equal(await readFile(mcpJsonPath(project), "utf8"), existing);
    assert.equal(await pathExists(skillPath(project)), false);
  } finally {
    await cleanup(project);
  }
});

test("conflict: an existing somacheck server with a different url fails with no writes", async () => {
  const project = await makeProjectDir();
  try {
    const existing = JSON.stringify({ mcpServers: { somacheck: { url: "https://evil.example/mcp" } } }, null, 2);
    await mkdir(path.dirname(mcpJsonPath(project)), { recursive: true });
    await writeFile(mcpJsonPath(project), existing);

    await assert.rejects(planInstall({ projectDir: project, packageRoot: PACKAGE_ROOT }), InstallError);
    assert.equal(await readFile(mcpJsonPath(project), "utf8"), existing);
  } finally {
    await cleanup(project);
  }
});

test("conflict diagnostics never echo existing header credentials", async () => {
  const project = await makeProjectDir();
  // Keep the fixture credential out of the source/exporter's static secret
  // scanner while still exercising a realistic bearer header at runtime.
  const secretMarker = ["super", "secret", "header", "value"].join("-");
  const secret = ["Bear", "er", " ", secretMarker].join("");
  try {
    await mkdir(path.dirname(mcpJsonPath(project)), { recursive: true });
    await writeFile(mcpJsonPath(project), JSON.stringify({
      mcpServers: { somacheck: { url: SOURCE_URL, headers: { Authorization: secret } } },
    }));

    await assert.rejects(
      execFileAsync(process.execPath, [SCRIPT_PATH, "--project", project]),
      (err) => {
        assert.doesNotMatch(err.stderr, new RegExp(secretMarker));
        return true;
      },
    );
    const result = await verifyInstall({ projectDir: project, packageRoot: PACKAGE_ROOT });
    assert.equal(result.ok, false);
    assert.doesNotMatch(result.issues.join("\n"), new RegExp(secretMarker));
  } finally {
    await cleanup(project);
  }
});

test("duplicate JSON keys, including escaped spellings, fail closed before writes", async () => {
  const project = await makeProjectDir();
  try {
    await mkdir(path.dirname(mcpJsonPath(project)), { recursive: true });
    const duplicateRoot = '{"mcpServers":{},"\\u006dcpServers":{"other":{"url":"https://example.com"}}}\n';
    await writeFile(mcpJsonPath(project), duplicateRoot);
    await assert.rejects(
      planInstall({ projectDir: project, packageRoot: PACKAGE_ROOT }),
      (err) => err instanceof InstallError && /duplicate JSON key/.test(err.message),
    );
    assert.equal(await readFile(mcpJsonPath(project), "utf8"), duplicateRoot);
    assert.equal(await pathExists(skillPath(project)), false);

    const duplicateNested = '{"mcpServers":{"somacheck":{"url":"https://example.com"},"\\u0073omacheck":{"url":"https://example.com"}}}\n';
    await writeFile(mcpJsonPath(project), duplicateNested);
    const verification = await verifyInstall({ projectDir: project, packageRoot: PACKAGE_ROOT });
    assert.equal(verification.ok, false);
    assert.ok(verification.issues.some((issue) => /duplicate JSON key|ambiguous duplicate keys/.test(issue)));
  } finally {
    await cleanup(project);
  }
});

test("__proto__ is treated as an ordinary JSON key without prototype mutation", async () => {
  const project = await makeProjectDir();
  try {
    await mkdir(path.dirname(mcpJsonPath(project)), { recursive: true });
    await writeFile(mcpJsonPath(project), '{"mcpServers":{"__proto__":{"url":"https://example.com"}}}\n');
    const plan = await planInstall({ projectDir: project, packageRoot: PACKAGE_ROOT });
    await applyInstall(plan);
    assert.equal(Object.prototype.somacheck, undefined);
    const parsed = JSON.parse(await readFile(mcpJsonPath(project), "utf8"));
    assert.deepEqual(parsed.mcpServers.somacheck, { url: SOURCE_URL });
  } finally {
    await cleanup(project);
  }
});

test("conflict: a differing existing skill file fails with no writes to either target", async () => {
  const project = await makeProjectDir();
  try {
    await mkdir(path.dirname(skillPath(project)), { recursive: true });
    await writeFile(skillPath(project), "# A different, hand-edited skill\n");

    await assert.rejects(
      planInstall({ projectDir: project, packageRoot: PACKAGE_ROOT }),
      (err) => err instanceof InstallError && /differing|does not exactly match/.test(err.message),
    );
    assert.equal(await readFile(skillPath(project), "utf8"), "# A different, hand-edited skill\n");
    assert.equal(await pathExists(mcpJsonPath(project)), false);
  } finally {
    await cleanup(project);
  }
});

test("malformed: invalid JSON in the project's mcp.json fails with no writes", async () => {
  const project = await makeProjectDir();
  try {
    await mkdir(path.dirname(mcpJsonPath(project)), { recursive: true });
    await writeFile(mcpJsonPath(project), "{ not valid json");

    await assert.rejects(
      planInstall({ projectDir: project, packageRoot: PACKAGE_ROOT }),
      (err) => err instanceof InstallError && /not valid JSON/.test(err.message),
    );
    assert.equal(await readFile(mcpJsonPath(project), "utf8"), "{ not valid json");
  } finally {
    await cleanup(project);
  }
});

test("malformed: a non-object top-level mcp.json fails with no writes", async () => {
  const project = await makeProjectDir();
  try {
    await mkdir(path.dirname(mcpJsonPath(project)), { recursive: true });
    await writeFile(mcpJsonPath(project), "[]");

    await assert.rejects(
      planInstall({ projectDir: project, packageRoot: PACKAGE_ROOT }),
      (err) => err instanceof InstallError && /must be an object/.test(err.message),
    );
  } finally {
    await cleanup(project);
  }
});

test("malformed: mcpServers is not an object fails with no writes", async () => {
  const project = await makeProjectDir();
  try {
    await mkdir(path.dirname(mcpJsonPath(project)), { recursive: true });
    await writeFile(mcpJsonPath(project), JSON.stringify({ mcpServers: "nope" }));

    await assert.rejects(
      planInstall({ projectDir: project, packageRoot: PACKAGE_ROOT }),
      (err) => err instanceof InstallError && /"mcpServers" must be an object/.test(err.message),
    );
  } finally {
    await cleanup(project);
  }
});

test("symlink ancestor: a symlinked .cursor directory fails with no writes", async () => {
  const project = await makeProjectDir();
  const outside = await makeTempDir("cursor-plugin-outside-");
  try {
    await symlink(outside, path.join(project, ".cursor"));

    await assert.rejects(
      planInstall({ projectDir: project, packageRoot: PACKAGE_ROOT }),
      (err) => err instanceof InstallError && /symlink/.test(err.message),
    );
    assert.equal(await pathExists(path.join(outside, "mcp.json")), false);
  } finally {
    await cleanup(project, outside);
  }
});

test("symlink target: a symlinked mcp.json file fails with no writes", async () => {
  const project = await makeProjectDir();
  const outside = await makeTempDir("cursor-plugin-outside-");
  try {
    const outsideFile = path.join(outside, "elsewhere.json");
    await writeFile(outsideFile, "{}");
    await mkdir(path.join(project, ".cursor"), { recursive: true });
    await symlink(outsideFile, mcpJsonPath(project));

    await assert.rejects(
      planInstall({ projectDir: project, packageRoot: PACKAGE_ROOT }),
      (err) => err instanceof InstallError && /symlink/.test(err.message),
    );
    assert.equal(await readFile(outsideFile, "utf8"), "{}");
  } finally {
    await cleanup(project, outside);
  }
});

test("source validation: a source package that fails the existing validator blocks the install with no writes", async () => {
  const project = await makeProjectDir();
  const brokenSource = await makeFixturePackage({ mcpServers: {} });
  try {
    await assert.rejects(
      planInstall({ projectDir: project, packageRoot: brokenSource }),
      (err) => err instanceof InstallError && /source package failed validation/.test(err.message),
    );
    await assert.rejects(
      verifyInstall({ projectDir: project, packageRoot: brokenSource }),
      (err) => err instanceof InstallError && /source package failed validation/.test(err.message),
    );
    assert.equal(await pathExists(mcpJsonPath(project)), false);
  } finally {
    await cleanup(project, brokenSource);
  }
});

test("partial write failure: if the second write fails, the first write is rolled back", async () => {
  const project = await makeProjectDir();
  try {
    const plan = await planInstall({ projectDir: project, packageRoot: PACKAGE_ROOT });
    assert.equal(plan.mcp.action, "create");
    assert.equal(plan.skill.action, "create");

    // Sabotage the second (skill) target after preflight but before apply:
    // create it as a directory so the temp-file rename onto it fails.
    await mkdir(skillPath(project), { recursive: true });

    await assert.rejects(applyInstall(plan));

    // The first write (mcp.json) must have been rolled back (it did not
    // exist before, so rollback removes it) — no partial state left behind.
    assert.equal(await pathExists(mcpJsonPath(project)), false);
    // The sabotage directory itself (pre-existing "user content") must
    // survive untouched — never deleted by rollback.
    const skillStat = await stat(skillPath(project));
    assert.equal(skillStat.isDirectory(), true);
  } finally {
    await cleanup(project);
  }
});

test("partial write failure restores an existing first target byte-for-byte", async () => {
  const project = await makeProjectDir();
  try {
    const originalMcp = '{\n  "mcpServers": {\n    "other": { "url": "https://example.com" }\n  }\n}\n';
    await mkdir(path.dirname(mcpJsonPath(project)), { recursive: true });
    await writeFile(mcpJsonPath(project), originalMcp);
    const plan = await planInstall({ projectDir: project, packageRoot: PACKAGE_ROOT });
    assert.equal(plan.mcp.action, "add-server");
    assert.equal(plan.skill.action, "create");

    // Make the second target fail after the first target has been atomically
    // replaced. Rollback must restore the original bytes, not a reserialized
    // approximation of the user's config.
    await mkdir(skillPath(project), { recursive: true });
    await assert.rejects(applyInstall(plan));
    assert.equal(await readFile(mcpJsonPath(project), "utf8"), originalMcp);
    assert.equal((await stat(mcpJsonPath(project))).isFile(), true);
  } finally {
    await cleanup(project);
  }
});

test("atomic writes preserve existing mode, use restrictive new modes, and clean temp files", async () => {
  const project = await makeProjectDir();
  try {
    const plan = await planInstall({ projectDir: project, packageRoot: PACKAGE_ROOT });
    await applyInstall(plan);
    assert.equal((await stat(mcpJsonPath(project))).mode & 0o777, 0o600);
    assert.equal((await stat(skillPath(project))).mode & 0o777, 0o600);
    assert.deepEqual((await readdir(path.dirname(mcpJsonPath(project)))).filter((name) => name.includes("preview-install-tmp")), []);

    const existingProject = await makeProjectDir();
    try {
      await mkdir(path.dirname(mcpJsonPath(existingProject)), { recursive: true });
      await writeFile(mcpJsonPath(existingProject), '{"mcpServers":{"other":{"url":"https://example.com"}}}\n');
      await chmod(mcpJsonPath(existingProject), 0o600);
      const existingPlan = await planInstall({ projectDir: existingProject, packageRoot: PACKAGE_ROOT });
      await applyInstall(existingPlan);
      assert.equal((await stat(mcpJsonPath(existingProject))).mode & 0o777, 0o600);
      assert.deepEqual((await readdir(path.dirname(mcpJsonPath(existingProject)))).filter((name) => name.includes("preview-install-tmp")), []);
    } finally {
      await cleanup(existingProject);
    }
  } finally {
    await cleanup(project);
  }
});

test("atomic temp creation does not follow a predictable legacy temp symlink", async () => {
  const project = await makeProjectDir();
  const outside = await makeTempDir("cursor-plugin-temp-symlink-");
  const originalNow = Date.now;
  const frozenNow = 1_700_000_000_000;
  try {
    const projectReal = await realpath(project);
    const canonicalTarget = mcpJsonPath(projectReal);
    const sentinel = path.join(outside, "sentinel.txt");
    // The former implementation used
    // `${targetPath}.preview-install-tmp-${process.pid}-${Date.now()}`.
    // Planting that name as a symlink makes a follow/overwrite bug observable.
    const plantedTemp = `${canonicalTarget}.preview-install-tmp-${process.pid}-${frozenNow}`;
    await mkdir(path.dirname(canonicalTarget), { recursive: true });
    await writeFile(sentinel, "must remain untouched\n");
    Date.now = () => frozenNow;
    await symlink(sentinel, plantedTemp);

    const plan = await planInstall({ projectDir: project, packageRoot: PACKAGE_ROOT });
    await applyInstall(plan);

    assert.deepEqual(JSON.parse(await readFile(canonicalTarget, "utf8")).mcpServers.somacheck, {
      url: SOURCE_URL,
    });
    assert.equal((await stat(canonicalTarget)).mode & 0o777, 0o600);
    assert.equal(await readFile(sentinel, "utf8"), "must remain untouched\n");
    assert.equal((await lstat(plantedTemp)).isSymbolicLink(), true);
    assert.equal(await readlink(plantedTemp), sentinel);
  } finally {
    Date.now = originalNow;
    await cleanup(project, outside);
  }
});

test("stale existing-file plans reject before writing and preserve the user's edit", async () => {
  const project = await makeProjectDir();
  try {
    await mkdir(path.dirname(mcpJsonPath(project)), { recursive: true });
    await writeFile(mcpJsonPath(project), '{"mcpServers":{"other":{"url":"https://example.com"}}}\n');
    const plan = await planInstall({ projectDir: project, packageRoot: PACKAGE_ROOT });
    const userEdit = '{"mcpServers":{"other":{"url":"https://user-edited.example"}}}\n';
    await writeFile(mcpJsonPath(project), userEdit);
    await assert.rejects(applyInstall(plan), (err) => /changed since planning/.test(err.message));
    assert.equal(await readFile(mcpJsonPath(project), "utf8"), userEdit);
    assert.equal(await pathExists(skillPath(project)), false);
  } finally {
    await cleanup(project);
  }
});

test("stale new-file plans reject a file created after planning without clobbering it", async () => {
  const project = await makeProjectDir();
  try {
    const plan = await planInstall({ projectDir: project, packageRoot: PACKAGE_ROOT });
    await mkdir(path.dirname(mcpJsonPath(project)), { recursive: true });
    const userFile = '{"mcpServers":{"user":{"url":"https://user.example"}}}\n';
    await writeFile(mcpJsonPath(project), userFile);
    await assert.rejects(applyInstall(plan), (err) => /was created since planning/.test(err.message));
    assert.equal(await readFile(mcpJsonPath(project), "utf8"), userFile);
    assert.equal(await pathExists(skillPath(project)), false);
  } finally {
    await cleanup(project);
  }
});

test("symlink swap after planning rejects before writing outside the project", async () => {
  const project = await makeProjectDir();
  const outside = await makeTempDir("cursor-plugin-symlink-swap-");
  try {
    const plan = await planInstall({ projectDir: project, packageRoot: PACKAGE_ROOT });
    await symlink(outside, path.join(project, ".cursor"));
    await assert.rejects(applyInstall(plan), (err) => /symlink/.test(err.message));
    assert.equal(await pathExists(path.join(outside, "mcp.json")), false);
    assert.equal(await pathExists(path.join(outside, "skills")), false);
  } finally {
    await cleanup(project, outside);
  }
});

test("rollback refuses to clobber a concurrent user edit to the first target", async () => {
  const project = await makeProjectDir();
  try {
    const plan = await planInstall({ projectDir: project, packageRoot: PACKAGE_ROOT });
    let writeCount = 0;
    await assert.rejects(
      applyInstall(plan, {
        onBeforeWrite: async (op) => {
          writeCount += 1;
          if (writeCount !== 2) return;
          await writeFile(mcpJsonPath(project), "user concurrent edit\n");
          await mkdir(skillPath(project), { recursive: true });
        },
      }),
      (err) => /rollback also failed|changed after this write/.test(err.message),
    );
    assert.equal(await readFile(mcpJsonPath(project), "utf8"), "user concurrent edit\n");
    assert.equal((await stat(skillPath(project))).isDirectory(), true);
  } finally {
    await cleanup(project);
  }
});

test("apply rejects a forged plan rather than writing an arbitrary path", async () => {
  const project = await makeProjectDir();
  const outside = await makeTempDir("cursor-plugin-forged-plan-");
  const target = path.join(outside, "not-a-project-target.json");
  try {
    await assert.rejects(
      applyInstall({
        projectReal: project,
        mcp: { action: "create", path: target, segments: ["..", "outside"], beforeExisted: false, newContent: "secret" },
        skill: { action: "none" },
      }),
      (err) => /not produced by planInstall/.test(err.message),
    );
    assert.equal(await pathExists(target), false);
  } finally {
    await cleanup(project, outside);
  }
});

test("verify: passes after a clean apply and fails before it", async () => {
  const project = await makeProjectDir();
  try {
    const before = await verifyInstall({ projectDir: project, packageRoot: PACKAGE_ROOT });
    assert.equal(before.ok, false);
    assert.ok(before.issues.length >= 2);

    const plan = await planInstall({ projectDir: project, packageRoot: PACKAGE_ROOT });
    await applyInstall(plan);

    const after = await verifyInstall({ projectDir: project, packageRoot: PACKAGE_ROOT });
    assert.deepEqual(after.issues, []);
    assert.equal(after.ok, true);
  } finally {
    await cleanup(project);
  }
});

test("verify: fails when the installed server has an extra field the source does not declare", async () => {
  const project = await makeProjectDir();
  try {
    const plan = await planInstall({ projectDir: project, packageRoot: PACKAGE_ROOT });
    await applyInstall(plan);

    const raw = JSON.parse(await readFile(mcpJsonPath(project), "utf8"));
    raw.mcpServers.somacheck.command = "npx";
    await writeFile(mcpJsonPath(project), JSON.stringify(raw, null, 2));

    const result = await verifyInstall({ projectDir: project, packageRoot: PACKAGE_ROOT });
    assert.equal(result.ok, false);
    assert.ok(result.issues.some((issue) => issue.includes("does not exactly match")));
  } finally {
    await cleanup(project);
  }
});

test("CLI: --verify reports OK after --apply and never claims Cursor itself was checked", async () => {
  const project = await makeProjectDir();
  try {
    await execFileAsync(process.execPath, [SCRIPT_PATH, "--project", project, "--apply"]);
    const { stdout } = await execFileAsync(process.execPath, [SCRIPT_PATH, "--project", project, "--verify"]);
    assert.match(stdout, /verify: OK/);
    assert.doesNotMatch(stdout, /verified in Cursor/i);
  } finally {
    await cleanup(project);
  }
});

test("CLI: requires --project", async () => {
  await assert.rejects(execFileAsync(process.execPath, [SCRIPT_PATH]), (err) => {
    assert.match(err.stderr, /--project <path> is required/);
    return true;
  });
});

test("CLI: rejects --verify combined with --apply", async () => {
  const project = await makeProjectDir();
  try {
    await assert.rejects(
      execFileAsync(process.execPath, [SCRIPT_PATH, "--project", project, "--verify", "--apply"]),
      (err) => {
        assert.match(err.stderr, /cannot be combined/);
        return true;
      },
    );
  } finally {
    await cleanup(project);
  }
});
