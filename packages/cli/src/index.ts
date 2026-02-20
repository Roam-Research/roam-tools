#!/usr/bin/env node

import { Command } from "commander";
import { z } from "zod";
import { randomUUID } from "crypto";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import type { CallToolResult } from "@roam-research/roam-tools-core";
import { RoamError, ErrorCodes, tools, routeToolCall } from "@roam-research/roam-tools-core";
import { connect } from "@roam-research/roam-tools-core/connect";

// Get file extension from MIME type
function getExtensionFromMimeType(mimeType: string): string {
  const mimeToExt: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/svg+xml": "svg",
    "image/bmp": "bmp",
    "image/tiff": "tiff",
    "application/pdf": "pdf",
  };
  return mimeToExt[mimeType] || "bin";
}

// Write image to temp directory and return metadata
function writeImageToTemp(data: string, mimeType: string): { type: "image"; path: string; mimeType: string; size: number } | { type: "image"; data: string; mimeType: string } {
  try {
    const tempDir = join(tmpdir(), "roam");
    mkdirSync(tempDir, { recursive: true });

    const ext = getExtensionFromMimeType(mimeType);
    const filename = `${randomUUID()}.${ext}`;
    const filePath = join(tempDir, filename);

    const buffer = Buffer.from(data, "base64");
    writeFileSync(filePath, buffer);

    return {
      type: "image",
      path: filePath,
      mimeType,
      size: buffer.length,
    };
  } catch {
    // Fall back to base64 output if file write fails
    return {
      type: "image",
      data,
      mimeType,
    };
  }
}

const program = new Command();

program
  .name("roam")
  .description("Roam Research CLI")
  .version("0.4.2");

// Override root --help with static reference card
const __dirname = dirname(fileURLToPath(import.meta.url));
const helpPaths = [
  join(__dirname, "help.txt"),
  join(__dirname, "../src/help.txt"),
];
let helpText: string | undefined;
for (const p of helpPaths) {
  try {
    helpText = readFileSync(p, "utf-8");
    break;
  } catch {}
}
if (helpText) {
  const staticHelp = helpText;
  program.helpInformation = () => staticHelp + "\n";
}

// Command aliases: full-name -> short form
const commandAliases: Record<string, string> = {
  "list-graphs": "lg",
  "setup-new-graph": "sg",
  "get-graph-guidelines": "gg",
  "get-page": "gp",
  "get-block": "gb",
  "get-backlinks": "bl",
  "search": "s",
  "search-templates": "st",
  "roam-query": "q",
  "get-open-windows": "win",
  "get-selection": "sel",
  "create-page": "cp",
  "create-block": "cb",
  "update-page": "up",
  "update-block": "ub",
  "delete-page": "dp",
  "delete-block": "db",
  "move-block": "mb",
  "open-main-window": "go",
  "open-sidebar": "side",
  "file-get": "fg",
  "file-upload": "fu",
  "file-delete": "fd",
};

// Flag aliases: camelCase param name -> single letter
const flagAliases: Record<string, string> = {
  // Lowercase
  graph: "g",
  nickname: "n",
  uid: "u",
  title: "t",
  query: "q",
  markdown: "m",
  parentUid: "p",
  maxDepth: "d",
  limit: "l",
  offset: "o",
  scope: "s",
  textAlign: "a",
  base64: "b",
  open: "e",
  search: "f",
  includePath: "i",
  filename: "N",
  sort: "r",
  childrenViewType: "v",
  // Uppercase (distinguishes from similar lowercase)
  mimetype: "E",
  filePath: "F",
  heading: "H",
  mergePages: "M",
  order: "O",
  sortOrder: "R",
  string: "S",
  type: "T",
  url: "U",
};

// Helper to check if a Zod schema field is optional
function isOptional(schema: z.ZodTypeAny): boolean {
  return schema.isOptional() || schema instanceof z.ZodOptional;
}

// Helper to get the base type of a Zod schema (unwrapping optional/nullable)
function getBaseType(schema: z.ZodTypeAny): z.ZodTypeAny {
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) {
    return getBaseType(schema._def.innerType);
  }
  return schema;
}

// Helper to check if schema contains a number type
function hasNumberType(schema: z.ZodTypeAny): boolean {
  const base = getBaseType(schema);
  if (base instanceof z.ZodNumber) return true;
  if (base instanceof z.ZodUnion) {
    return base._def.options.some((opt: z.ZodTypeAny) => getBaseType(opt) instanceof z.ZodNumber);
  }
  return false;
}

// Helper to check if schema is a boolean type
function hasBooleanType(schema: z.ZodTypeAny): boolean {
  return getBaseType(schema) instanceof z.ZodBoolean;
}

// Build commands dynamically from shared tool definitions
tools.forEach((tool) => {
  const cmdName = tool.name.replace(/_/g, "-");
  const cmd = program
    .command(cmdName)
    .description(tool.description);

  // Apply command alias
  const alias = commandAliases[cmdName];
  if (alias) cmd.alias(alias);

  // Add options from Zod schema shape
  const shape = tool.schema.shape as Record<string, z.ZodTypeAny>;
  for (const [param, fieldSchema] of Object.entries(shape)) {
    const isRequired = !isOptional(fieldSchema);
    const description = fieldSchema.description || "";

    // Build flag string with optional short alias
    const flagName = param.replace(/([A-Z])/g, "-$1").toLowerCase();
    const shortFlag = flagAliases[param];
    const longFlag = isRequired ? `--${flagName} <value>` : `--${flagName} [value]`;
    const flag = shortFlag ? `-${shortFlag}, ${longFlag}` : longFlag;

    cmd.option(flag, description);
  }

  // Handler
  cmd.action(async (options) => {
    const args: Record<string, unknown> = {};
    const shape = tool.schema.shape as Record<string, z.ZodTypeAny>;

    for (const [key, value] of Object.entries(options)) {
      if (value !== undefined) {
        const camelKey = key.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        const fieldSchema = shape[camelKey];

        if (fieldSchema && hasNumberType(fieldSchema) && !isNaN(Number(value))) {
          args[camelKey] = Number(value);
        } else if (fieldSchema && hasBooleanType(fieldSchema)) {
          args[camelKey] = value === "true" || value === true;
        } else {
          args[camelKey] = value;
        }
      }
    }

    try {
      const result: CallToolResult = await routeToolCall(tool.name, args);

      // Output each content item
      for (const item of result.content) {
        if (item.type === "text") {
          console.log(item.text);
        } else if (item.type === "image") {
          const imageInfo = writeImageToTemp(item.data, item.mimeType);
          console.log(JSON.stringify(imageInfo, null, 2));
        }
      }

      if (result.isError) {
        process.exit(1);
      }
    } catch (error) {
      // Handle RoamError with structured output
      if (error instanceof RoamError) {
        console.error(`Error [${error.code || "UNKNOWN"}]: ${error.message}`);

        // Show available graphs for GRAPH_NOT_SELECTED
        if (error.code === ErrorCodes.GRAPH_NOT_SELECTED && error.context?.available_graphs) {
          console.error("\nAvailable graphs:");
          const graphs = error.context.available_graphs as Array<{ nickname: string; name: string }>;
          for (const g of graphs) {
            console.error(`  - ${g.nickname} (${g.name})`);
          }
          console.error("\nUse --graph <nickname> to specify which graph to use.");
        }

        process.exit(1);
      }

      // Generic errors
      const message = error instanceof Error ? error.message : String(error);
      console.error(message);
      process.exit(1);
    }
  });
});

// ============================================================================
// Interactive Setup Command
// ============================================================================

// These options must stay in sync with ConnectOptions in packages/core/src/connect.ts
// and the manual arg parsing in packages/mcp/src/index.ts.
program
  .command("connect")
  .description("Connect to a Roam graph and obtain a token")
  .option("-g, --graph <name>", "Graph name (enables non-interactive mode)")
  .option("-n, --nickname <name>", "Short name you'll use to refer to this graph (required with --graph)")
  .option("--access-level <level>", "Access level: full, read-append, or read-only")
  .option("--public", "Public graph (read-only, hosted)")
  .option("--type <type>", "Graph type: hosted or offline")
  .option("--remove", "Remove a graph connection (use with --graph or --nickname)")
  .addHelpText("after", `
Examples:
  roam connect                                      Interactive setup
  roam connect -g my-graph -n main --access-level read-append
  roam connect -g help --public -n "Roam Help"      Connect to public graph
  roam connect --remove -g help                     Remove a connection
`)
  .action((options) => connect(options));

program.parse();
