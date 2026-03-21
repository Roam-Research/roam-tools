#!/usr/bin/env node

/**
 * Builds the project and packs the MCP package into a .mcpb bundle.
 *
 * Usage:
 *   node scripts/pack-mcpb.mjs           # outputs packages/mcp/roam-mcp.mcpb
 *   node scripts/pack-mcpb.mjs --output path/to/output.mcpb
 *
 * Prerequisites:
 *   npm install -g @anthropic-ai/mcpb
 */

import { execSync } from "child_process";
import { existsSync, mkdirSync, cpSync, rmSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const mcpDir = join(root, "packages/mcp");
const stageDir = join(mcpDir, ".mcpb-stage");

// Parse --output flag
const outputIdx = process.argv.indexOf("--output");
const outputPath = outputIdx !== -1 ? process.argv[outputIdx + 1] : undefined;

function run(cmd, opts = {}) {
  console.log(`  $ ${cmd}`);
  execSync(cmd, { stdio: "inherit", ...opts });
}

function tryRun(cmd) {
  try {
    execSync(cmd, { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

// 1. Verify mcpb CLI is installed
if (!tryRun("mcpb --version")) {
  console.error(
    "Error: mcpb CLI not found. Install it with:\n  npm install -g @anthropic-ai/mcpb"
  );
  process.exit(1);
}

// 2. Build the project
console.log("Building project...");
run("npm run build", { cwd: root });

// 3. Create staging directory with only what the bundle needs
console.log("\nStaging bundle contents...");
if (existsSync(stageDir)) {
  rmSync(stageDir, { recursive: true });
}
mkdirSync(join(stageDir, "server"), { recursive: true });

// Copy manifest
cpSync(join(mcpDir, "manifest.json"), join(stageDir, "manifest.json"));

// Copy built server code
cpSync(join(mcpDir, "dist"), join(stageDir, "server"), { recursive: true });

// Install production dependencies into the staging directory
// The bundle needs node_modules available since it runs standalone
console.log("\nInstalling production dependencies...");
run(`npm pack --pack-destination ${stageDir}`, { cwd: join(root, "packages/core") });

// We need to create a minimal package.json for dependency installation
const { readFileSync, writeFileSync } = await import("fs");
const mcpPkg = JSON.parse(readFileSync(join(mcpDir, "package.json"), "utf-8"));
const stagePkg = {
  name: "roam-mcp-bundle",
  private: true,
  type: "module",
  dependencies: {
    ...mcpPkg.dependencies,
  },
};
// Point core dependency to the local tarball
const coreVersion = mcpPkg.dependencies["@roam-research/roam-tools-core"];
const coreTarball = `roam-research-roam-tools-core-${coreVersion}.tgz`;
stagePkg.dependencies["@roam-research/roam-tools-core"] = `file:./${coreTarball}`;

writeFileSync(join(stageDir, "package.json"), JSON.stringify(stagePkg, null, 2) + "\n");
run("npm install --omit=dev", { cwd: stageDir });

// Clean up staging package.json and tarball (not needed in bundle)
rmSync(join(stageDir, "package.json"));
rmSync(join(stageDir, "package-lock.json"), { force: true });
rmSync(join(stageDir, coreTarball), { force: true });

// 4. Pack the bundle
console.log("\nPacking .mcpb bundle...");
const packArgs = outputPath ? `${stageDir} ${outputPath}` : stageDir;
run(`mcpb pack ${packArgs}`);

// 5. Clean up staging directory
rmSync(stageDir, { recursive: true });

console.log("\nDone! Bundle created successfully.");
