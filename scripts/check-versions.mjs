#!/usr/bin/env node

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf-8"));
}

const core = readJson(join(root, "packages/core/package.json"));
const mcp = readJson(join(root, "packages/mcp/package.json"));
const cli = readJson(join(root, "packages/cli/package.json"));

const errors = [];

// Check all three package versions match
if (core.version !== mcp.version || core.version !== cli.version) {
  errors.push(
    `Package versions don't match: core=${core.version}, mcp=${mcp.version}, cli=${cli.version}`
  );
}

// Check that mcp and cli depend on the correct core version
const mcpCoreDep = mcp.dependencies?.["@roam-research/roam-tools-core"];
if (mcpCoreDep !== core.version) {
  errors.push(
    `packages/mcp depends on core ${mcpCoreDep}, but core is ${core.version}`
  );
}

const cliCoreDep = cli.dependencies?.["@roam-research/roam-tools-core"];
if (cliCoreDep !== core.version) {
  errors.push(
    `packages/cli depends on core ${cliCoreDep}, but core is ${core.version}`
  );
}

// Check hardcoded version strings in source files (same patterns as bump-version.mjs)
const mcpSrc = readFileSync(join(root, "packages/mcp/src/index.ts"), "utf-8");
const mcpMatch = mcpSrc.match(/version: "([^"]+)"/);
if (!mcpMatch) {
  errors.push(`Could not find version string in packages/mcp/src/index.ts`);
} else if (mcpMatch[1] !== core.version) {
  errors.push(
    `packages/mcp/src/index.ts McpServer version is "${mcpMatch[1]}", expected "${core.version}"`
  );
}

const cliSrc = readFileSync(join(root, "packages/cli/src/index.ts"), "utf-8");
const cliMatch = cliSrc.match(/\.version\("([^"]+)"\)/);
if (!cliMatch) {
  errors.push(`Could not find version string in packages/cli/src/index.ts`);
} else if (cliMatch[1] !== core.version) {
  errors.push(
    `packages/cli/src/index.ts Commander version is "${cliMatch[1]}", expected "${core.version}"`
  );
}

if (errors.length > 0) {
  console.error("Version check failed:");
  for (const e of errors) {
    console.error(`  - ${e}`);
  }
  console.error("\nRun: npm run version:bump <version>");
  process.exit(1);
}

console.log(`All package versions consistent: ${core.version}`);
