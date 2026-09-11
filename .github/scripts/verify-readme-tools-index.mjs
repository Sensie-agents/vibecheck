// Focused README tools-index drift guard for the public vibecheck repo.
//
// Why this exists:
//   mcp.so and similar MCP directories index the public README's tool list
//   directly. This guard pins the README to the canonical six-tool set so
//   the directory card cannot drift, gain, duplicate, or quietly rename a
//   tool. The runtime's six tool schemas live in the upstream
//   packages/vibecheck source; their names are mirrored here and in the
//   smoke test in verify-mcp-runtime.mjs, which this script cross-checks
//   against so the two cannot drift apart.
//
// Scope:
//   - Reads README.md, the canonical tool list, and local fixture READMEs.
//   - Asserts the `## Tools` section's first Markdown table lists exactly
//     the canonical tools, in order, exactly once.
//   - Re-runs the same check against fixture READMEs that exercise the
//     negative cases (missing / extra / duplicate / renamed tool) and
//     asserts each one trips the guard for the right reason.
//   - Cross-checks the canonical list against verify-mcp-runtime.mjs so
//     the doc guard and the runtime smoke test stay in lock-step.
//
// Offline and credential-free. Uses Node's built-in `node:assert/strict`
// and reads only local files. No network calls.

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const EXPECTED_TOOLS = JSON.parse(
  readFileSync(join(root, ".github/scripts/fixtures/expected-tools.json"), "utf8"),
);

// Cross-check: parse the canonical required-tool list out of the runtime
// smoke test script and assert it matches EXPECTED_TOOLS as a set. If the
// two diverge, the doc guard and the runtime smoke test will be telling
// different stories to humans and to directory scrapers, so we fail here.
const runtimeScript = readFileSync(
  join(root, ".github/scripts/verify-mcp-runtime.mjs"),
  "utf8",
);
const runtimeListMatch = runtimeScript.match(/const required = \[([\s\S]*?)\];/);
assert.ok(
  runtimeListMatch,
  "verify-mcp-runtime.mjs must declare `const required = [...]` for the cross-check",
);
const runtimeTools = new Set(
  runtimeListMatch[1]
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.replace(/^["']|["']$/g, "")),
);
assert.equal(
  runtimeTools.size,
  EXPECTED_TOOLS.length,
  `runtime smoke test required-set size (${runtimeTools.size}) must equal EXPECTED_TOOLS length (${EXPECTED_TOOLS.length})`,
);
for (const tool of EXPECTED_TOOLS) {
  assert.ok(
    runtimeTools.has(tool),
    `runtime smoke test verify-mcp-runtime.mjs is missing canonical tool \`${tool}\`; keep verify-mcp-runtime.mjs and expected-tools.json in lock-step`,
  );
}

function extractToolsFromSection(readmeText, label) {
  const headingMatch = readmeText.match(/^## Tools\s*$/m);
  assert.ok(
    headingMatch,
    `[${label}] must expose a conventional \`## Tools\` heading for directory indexing`,
  );
  const afterHead = readmeText.slice(headingMatch.index);
  // Bound the section to the next `## ` heading so we do not falsely match
  // tool names that appear in unrelated later sections.
  const nextHeading = afterHead.slice(2).search(/^## /m);
  const toolsSection = nextHeading === -1 ? afterHead : afterHead.slice(0, 2 + nextHeading);

  // The first Markdown table inside the section, where tool names must be
  // presented as backticked code so directories like mcp.so can scrape them.
  const tableLines = toolsSection
    .split("\n")
    .filter((line, idx, all) => {
      // Take a contiguous run of pipe-table lines starting at the first
      // such line in the section. Robust to files that do not end in a
      // newline (the trailing-line regex trick is otherwise easy to miss).
      const firstTableIdx = all.findIndex((l) => /^\|.*\|/.test(l));
      return idx >= firstTableIdx && /^\|.*\|/.test(line);
    });
  assert.ok(
    tableLines.length > 0,
    `[${label}] Tools section must contain a Markdown table listing the MCP tools`,
  );

  const dataRows = tableLines
    .filter((row) => !/^\|\s*-/.test(row))
    .filter((row) => /`[^`]+`/.test(row.split("|")[1] ?? ""));

  return dataRows.map((row) => {
    const codeMatch = row.split("|")[1].match(/`([^`]+)`/);
    return codeMatch[1];
  });
}

function checkReadmeTools(readmeText, label) {
  const tools = extractToolsFromSection(readmeText, label);
  assert.equal(
    tools.length,
    EXPECTED_TOOLS.length,
    `[${label}] Tools table must have exactly ${EXPECTED_TOOLS.length} rows (got ${tools.length})`,
  );
  assert.equal(new Set(tools).size, tools.length,
    `[${label}] Tools table must not duplicate rows`);
  for (let i = 0; i < EXPECTED_TOOLS.length; i++) {
    assert.equal(
      tools[i],
      EXPECTED_TOOLS[i],
      `[${label}] Tools table row ${i + 1} must be \`${EXPECTED_TOOLS[i]}\` (got \`${tools[i] ?? "<missing>"}\`)`,
    );
  }
  const unique = new Set(tools);
  assert.equal(
    unique.size,
    tools.length,
    `[${label}] Tools table must not duplicate rows`,
  );
}

// Run the guard against the live README.
checkReadmeTools(readFileSync(join(root, "README.md"), "utf8"), "README.md");

// Run the same guard against fixture READMEs. Each negative fixture must
// trip the guard for the right reason; the positive fixture must pass.
// Future regressions get a real failing test instead of a comment.
const fixturesDir = join(root, ".github/scripts/fixtures/readme-tools-index");
const fixtures = readdirSync(fixturesDir)
  .filter((name) => name.endsWith(".md"))
  .sort();
assert.ok(
  fixtures.length > 0,
  "tools-index fixture directory must contain at least one .md fixture",
);
assert.deepEqual(fixtures, [
  "fail-duplicate-tool.md", "fail-extra-tool.md", "fail-missing-tool.md",
  "fail-renamed-tool.md", "pass-correct.md",
], "All required positive and negative fixtures must remain present");

for (const fixture of fixtures) {
  const path = join(fixturesDir, fixture);
  const text = readFileSync(path, "utf8");
  const label = fixture.replace(/\.md$/, "");
  const expectPass = label.startsWith("pass-");
  let actualError = null;
  try {
    checkReadmeTools(text, label);
  } catch (error) {
    actualError = error;
  }
  if (expectPass) {
    assert.equal(
      actualError,
      null,
      `[${label}] fixture must pass the guard but failed: ${actualError?.message ?? "<no message>"}`,
    );
  } else {
    assert.ok(
      actualError,
      `[${label}] fixture must trip the guard but it passed`,
    );
    const expectedFailure = {
      "fail-missing-tool": /exactly 6 rows \(got 5\)/,
      "fail-extra-tool": /exactly 6 rows \(got 7\)/,
      "fail-duplicate-tool": /must not duplicate rows/,
      "fail-renamed-tool": /Tools table row 6 must be `share_somacheck_context`/,
    }[label];
    assert.ok(expectedFailure, "Every negative fixture needs a specific expected failure");
    assert.match(actualError.message, expectedFailure,
      `[${label}] fixture must fail for its intended reason`);
  }
}

process.stdout.write(
  `README TOOLS INDEX: PASS (${EXPECTED_TOOLS.length} canonical tools; ${fixtures.length} fixtures checked; runtime smoke-test list in lock-step)\n`,
);
