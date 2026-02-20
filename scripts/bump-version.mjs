#!/usr/bin/env node

import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const newVersion = process.argv[2];
if (!newVersion) {
  console.error("Usage: node scripts/bump-version.mjs <version>");
  console.error("Example: node scripts/bump-version.mjs 0.5.0");
  process.exit(1);
}

if (!/^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/.test(newVersion)) {
  console.error(`Invalid version format: ${newVersion}`);
  process.exit(1);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf-8"));
}

function writeJson(path, data) {
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
}

function replaceInFile(path, pattern, replacement) {
  const content = readFileSync(path, "utf-8");
  if (!pattern.test(content)) {
    console.error(`  WARNING: No match found in ${path} for pattern ${pattern}`);
    return false;
  }
  const updated = content.replace(pattern, replacement);
  writeFileSync(path, updated);
  return true;
}

console.log(`Bumping all packages to ${newVersion}...\n`);

// 1. packages/core/package.json — version
const corePkg = readJson(join(root, "packages/core/package.json"));
corePkg.version = newVersion;
writeJson(join(root, "packages/core/package.json"), corePkg);
console.log(`  packages/core/package.json version → ${newVersion}`);

// 2. packages/mcp/package.json — version + core dependency
const mcpPkg = readJson(join(root, "packages/mcp/package.json"));
mcpPkg.version = newVersion;
mcpPkg.dependencies["@roam-research/roam-tools-core"] = `workspace:${newVersion}`;
writeJson(join(root, "packages/mcp/package.json"), mcpPkg);
console.log(`  packages/mcp/package.json version → ${newVersion}`);
console.log(`  packages/mcp/package.json core dep → workspace:${newVersion}`);

// 3. packages/cli/package.json — version + core dependency
const cliPkg = readJson(join(root, "packages/cli/package.json"));
cliPkg.version = newVersion;
cliPkg.dependencies["@roam-research/roam-tools-core"] = `workspace:${newVersion}`;
writeJson(join(root, "packages/cli/package.json"), cliPkg);
console.log(`  packages/cli/package.json version → ${newVersion}`);
console.log(`  packages/cli/package.json core dep → workspace:${newVersion}`);

// 4. packages/mcp/src/index.ts — McpServer version string
replaceInFile(
  join(root, "packages/mcp/src/index.ts"),
  /version: "[^"]+"/,
  `version: "${newVersion}"`,
);
console.log(`  packages/mcp/src/index.ts McpServer version → ${newVersion}`);

// 5. packages/cli/src/index.ts — Commander .version() call
replaceInFile(
  join(root, "packages/cli/src/index.ts"),
  /\.version\("[^"]+"\)/,
  `.version("${newVersion}")`,
);
console.log(`  packages/cli/src/index.ts Commander version → ${newVersion}`);

console.log(`\nDone! Run 'pnpm install' to sync pnpm-lock.yaml.`);
