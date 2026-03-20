import { cpSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const source = resolve(repoRoot, "packages/cli/src/help.txt");
const destination = resolve(repoRoot, "packages/cli/dist/help.txt");

mkdirSync(dirname(destination), { recursive: true });
cpSync(source, destination);
