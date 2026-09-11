// Structural validator for this Cursor plugin package.
//
// Scope: proves the package is well-formed enough for Cursor's documented
// manifest/discovery rules (https://cursor.com/docs/reference/plugins). It
// does NOT run inside the actual Cursor host, so passing this does not by
// itself prove Cursor will load or list the plugin — see
// docs/publish/cursor-plugin-submission.md.
//
// This package is URL-only (one remote MCP server, no stdio command, no
// static headers/secrets), so the validator rejects "command" and "headers"
// entries in mcp.json rather than silently skipping them.
import { readFile, stat, realpath, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const NAME_RE = /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/;

function fail(errors, message) {
  errors.push(message);
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasDotDotSegment(relativePath) {
  return relativePath.split(/[\\/]+/).includes("..");
}

// Resolves relativePath against pluginRoot, rejecting absolute paths and any
// ".." segment outright (not just segments that would resolve outside root).
function resolveInsidePlugin(pluginRoot, relativePath, errors, label) {
  if (typeof relativePath !== "string" || relativePath.length === 0) {
    fail(errors, `${label}: not a non-empty string`);
    return null;
  }
  if (path.isAbsolute(relativePath)) {
    fail(errors, `${label}: must be a relative path, got absolute "${relativePath}"`);
    return null;
  }
  if (hasDotDotSegment(relativePath)) {
    fail(errors, `${label}: ".." path segments are not allowed: "${relativePath}"`);
    return null;
  }
  return path.resolve(pluginRoot, relativePath);
}

// Confirms `resolved` exists and, after following symlinks, is still inside
// pluginRootReal — a symlink can point outside the plugin even when the
// declared relative path string itself contains no traversal.
async function verifyExistsInsideRoot(pluginRootReal, resolved, relativePath, errors, label) {
  let real;
  try {
    real = await realpath(resolved);
  } catch {
    fail(errors, `${label}: referenced path does not exist: "${relativePath}"`);
    return null;
  }
  const rootWithSep = pluginRootReal.endsWith(path.sep) ? pluginRootReal : pluginRootReal + path.sep;
  if (real !== pluginRootReal && !real.startsWith(rootWithSep)) {
    fail(errors, `${label}: resolves outside the plugin root (possibly via a symlink): "${relativePath}"`);
    return null;
  }
  return real;
}

async function pathExists(candidate) {
  try {
    await stat(candidate);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath, errors, label) {
  let raw;
  try {
    raw = await readFile(filePath, "utf8");
  } catch {
    fail(errors, `${label}: file not found at ${filePath}`);
    return { ok: false };
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    fail(errors, `${label}: invalid JSON (${err.message})`);
    return { ok: false };
  }
  if (parsed === null) {
    fail(errors, `${label}: JSON value is null, expected an object`);
    return { ok: false };
  }
  return { ok: true, value: parsed };
}

function validateMcpUrl(url, errors) {
  if (typeof url !== "string" || url.length === 0) {
    fail(errors, "mcp.json: server has no url");
    return;
  }
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    fail(errors, `mcp.json: url is not a valid URL: "${url}"`);
    return;
  }
  if (parsed.protocol !== "https:") {
    fail(errors, `mcp.json: url must be https, got "${parsed.protocol}"`);
  }
  if (parsed.username || parsed.password) {
    fail(errors, `mcp.json: url must not embed credentials: "${url}"`);
  }
}

async function validateSkillDir(skillDirPath, label, errors) {
  const skillMd = path.join(skillDirPath, "SKILL.md");
  if (!(await pathExists(skillMd))) {
    fail(errors, `${label}: missing SKILL.md`);
    return;
  }
  const raw = await readFile(skillMd, "utf8");
  const frontmatter = /^---\n([\s\S]*?)\n---/.exec(raw);
  if (!frontmatter) {
    fail(errors, `${label}/SKILL.md: missing YAML frontmatter block`);
    return;
  }
  if (!/^name:\s*\S+/m.test(frontmatter[1])) {
    fail(errors, `${label}/SKILL.md: frontmatter missing name`);
  }
  if (!/^description:\s*\S+/m.test(frontmatter[1])) {
    fail(errors, `${label}/SKILL.md: frontmatter missing description`);
  }
}

// Scans a directory for the documented default convention: each subdirectory
// containing a SKILL.md is one skill. Used both for the default `skills/`
// folder and for a manifest-declared `skills` path, which replaces it
// (https://cursor.com/docs/reference/plugins: "If a manifest field is
// specified, it replaces folder discovery for that component").
async function validateSkillsDirectory(skillsDir, label, errors) {
  const entries = await readdir(skillsDir, { withFileTypes: true });
  const skillDirs = entries.filter((entry) => entry.isDirectory());
  if (skillDirs.length === 0) {
    fail(errors, `${label}: directory exists but contains no skill subdirectories`);
  }
  for (const entry of skillDirs) {
    await validateSkillDir(path.join(skillsDir, entry.name), `${label}/${entry.name}`, errors);
  }
}

/**
 * Validate a Cursor plugin package rooted at pluginRoot.
 * Returns { valid: boolean, errors: string[] }.
 */
export async function validatePlugin(pluginRoot) {
  const errors = [];
  const pluginRootReal = await realpath(pluginRoot);
  const manifestPath = path.join(pluginRoot, ".cursor-plugin", "plugin.json");
  const manifestResult = await readJson(manifestPath, errors, "plugin.json");
  const manifest = manifestResult.ok ? manifestResult.value : null;

  let manifestDeclaresSkills = false;

  if (manifest !== null) {
    if (!isPlainObject(manifest)) {
      fail(errors, "plugin.json: top level must be an object");
    } else {
      if (typeof manifest.name !== "string" || !NAME_RE.test(manifest.name)) {
        fail(errors, `plugin.json: name must be a lowercase kebab-case string, got ${JSON.stringify(manifest.name)}`);
      }
      if (manifest.logo !== undefined) {
        if (typeof manifest.logo !== "string" || manifest.logo.length === 0) {
          fail(errors, "plugin.json: logo must be a non-empty string when present");
        } else if (!/^https?:\/\//.test(manifest.logo)) {
          const resolved = resolveInsidePlugin(pluginRoot, manifest.logo, errors, "plugin.json logo");
          if (resolved !== null) {
            const real = await verifyExistsInsideRoot(pluginRootReal, resolved, manifest.logo, errors, "plugin.json logo");
            if (real !== null) {
              const logoStat = await stat(real);
              if (!logoStat.isFile()) {
                fail(errors, `plugin.json logo: not a file: "${manifest.logo}"`);
              }
            }
          }
        }
      }
      for (const field of ["skills", "rules", "agents", "commands"]) {
        const value = manifest[field];
        if (value === undefined) continue;
        if (field === "skills") manifestDeclaresSkills = true;
        const candidates = Array.isArray(value) ? value : [value];
        for (const candidate of candidates) {
          const resolved = resolveInsidePlugin(pluginRoot, candidate, errors, `plugin.json ${field}`);
          if (resolved === null) continue;
          const real = await verifyExistsInsideRoot(pluginRootReal, resolved, candidate, errors, `plugin.json ${field}`);
          if (real !== null && field === "skills") {
            const skillsStat = await stat(real);
            if (!skillsStat.isDirectory()) {
              fail(errors, `plugin.json skills: "${candidate}" is not a directory`);
            } else {
              await validateSkillsDirectory(real, `plugin.json skills (${candidate})`, errors);
            }
          }
        }
      }
    }
  }

  // Default skill discovery only applies when the manifest does not declare
  // its own "skills" field (a manifest field replaces folder discovery).
  if (!manifestDeclaresSkills) {
    const skillsDir = path.join(pluginRoot, "skills");
    if (await pathExists(skillsDir)) {
      await validateSkillsDirectory(skillsDir, "skills", errors);
    }
  }

  // mcp.json: required, must declare at least one server with a valid,
  // credential-free https url. This package is URL-only: stdio "command"
  // entries and static "headers" (a place secrets could hide) are rejected
  // rather than silently skipped.
  const mcpJsonPath = path.join(pluginRoot, "mcp.json");
  const mcpResult = await readJson(mcpJsonPath, errors, "mcp.json");
  const mcpConfig = mcpResult.ok ? mcpResult.value : null;
  if (mcpConfig !== null) {
    if (!isPlainObject(mcpConfig) || !isPlainObject(mcpConfig.mcpServers)) {
      fail(errors, "mcp.json: missing top-level mcpServers object");
    } else {
      const serverNames = Object.keys(mcpConfig.mcpServers);
      if (serverNames.length === 0) {
        fail(errors, "mcp.json: mcpServers is empty");
      }
      for (const serverName of serverNames) {
        const server = mcpConfig.mcpServers[serverName];
        if (!isPlainObject(server)) {
          fail(errors, `mcp.json: server "${serverName}" is not an object`);
          continue;
        }
        if (server.command !== undefined) {
          fail(errors, `mcp.json: server "${serverName}" uses a "command" (stdio) entry, which this URL-only package does not support`);
          continue;
        }
        if (server.headers !== undefined) {
          fail(errors, `mcp.json: server "${serverName}" declares "headers"; this package does not support static headers or secrets`);
        }
        validateMcpUrl(server.url, errors);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

async function main() {
  const pluginRoot = fileURLToPath(new URL("..", import.meta.url));
  const { valid, errors } = await validatePlugin(pluginRoot);
  if (!valid) {
    console.error(`Structural validation FAILED (${errors.length} issue(s)):`);
    for (const error of errors) console.error(`  - ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log("Structural validation passed. This does not certify Cursor-host loading — see docs/publish/cursor-plugin-submission.md.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
