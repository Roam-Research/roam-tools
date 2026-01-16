# Optional Graph Parameter Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the graph parameter optional on all tools, auto-detecting the open graph when not specified.

**Architecture:** Create a graph resolver module that queries Roam's `/api/graphs/open` endpoint and remembers the last used graph. The router extracts the optional `graph` param, resolves it, creates a client, and dispatches to operations.

**Tech Stack:** TypeScript, Roam local API

---

### Task 1: Create the graph resolver module

**Files:**
- Create: `src/core/graph-resolver.ts`

**Step 1: Create the graph-resolver.ts file**

```typescript
// src/core/graph-resolver.ts
import { readFile } from "fs/promises";
import { homedir } from "os";
import { join } from "path";

// In-memory state for last used graph
let lastUsedGraph: string | null = null;

// Get the API port from ~/.roam-api-port
async function getPort(): Promise<number> {
  try {
    const portFile = join(homedir(), ".roam-api-port");
    const content = await readFile(portFile, "utf-8");
    return parseInt(content.trim(), 10);
  } catch {
    return 3333;
  }
}

// Response type from Roam API
interface GraphsResponse {
  success: boolean;
  result?: string[];
  error?: string;
}

// Fetch list of open graphs from Roam
export async function getOpenGraphs(): Promise<string[]> {
  const port = await getPort();
  const url = `http://localhost:${port}/api/graphs/open`;

  const response = await fetch(url, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });

  const data = (await response.json()) as GraphsResponse;

  if (!data.success) {
    throw new Error(data.error || "Failed to get open graphs");
  }

  return data.result || [];
}

// Resolve which graph to use
export async function resolveGraph(providedGraph?: string): Promise<string> {
  // If graph is explicitly provided, use it and remember it
  if (providedGraph) {
    lastUsedGraph = providedGraph;
    return providedGraph;
  }

  // Fetch open graphs
  const openGraphs = await getOpenGraphs();

  // No graphs open
  if (openGraphs.length === 0) {
    throw new Error(
      "No graphs are currently open in Roam. Please open a graph in the Roam desktop app."
    );
  }

  // If last used graph is still open, use it
  if (lastUsedGraph && openGraphs.includes(lastUsedGraph)) {
    return lastUsedGraph;
  }

  // Exactly one graph open - use it
  if (openGraphs.length === 1) {
    lastUsedGraph = openGraphs[0];
    return openGraphs[0];
  }

  // Multiple graphs open - error with numbered list
  const graphList = openGraphs
    .map((g, i) => `${i + 1}. ${g}`)
    .join("\n");

  throw new Error(
    `Multiple graphs are open. Please ask the user which graph to use:\n${graphList}\nThen include their choice as the 'graph' parameter in your next call.`
  );
}

// For testing: reset state
export function resetLastUsedGraph(): void {
  lastUsedGraph = null;
}

// For testing: get current state
export function getLastUsedGraph(): string | null {
  return lastUsedGraph;
}
```

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS with no errors

**Step 3: Commit**

```bash
git add src/core/graph-resolver.ts
git commit -m "feat: add graph resolver module"
```

---

### Task 2: Add graph parameter to all tool schemas

**Files:**
- Modify: `src/core/tools.ts`

**Step 1: Add graphProperty constant after the JsonSchemaProperty interface (around line 13)**

Add after line 13:

```typescript
// Common graph property for all tools
const graphProperty: JsonSchemaProperty = {
  type: "string",
  description: "Graph name (optional - auto-detects if omitted)",
};
```

**Step 2: Add graph to create_page properties (line 37-40)**

Replace:
```typescript
      properties: {
        title: { type: "string", description: "Page title" },
        markdown: { type: "string", description: "Markdown content for the page" },
      },
```

With:
```typescript
      properties: {
        graph: graphProperty,
        title: { type: "string", description: "Page title" },
        markdown: { type: "string", description: "Markdown content for the page" },
      },
```

**Step 3: Add graph to create_block properties (line 51-58)**

Replace:
```typescript
      properties: {
        parentUid: { type: "string", description: "UID of parent block or page" },
        markdown: { type: "string", description: "Markdown content for the block" },
        order: {
          oneOf: [{ type: "number" }, { type: "string", enum: ["first", "last"] }],
          description: "Position (number, 'first', or 'last'). Defaults to 'last'",
        },
      },
```

With:
```typescript
      properties: {
        graph: graphProperty,
        parentUid: { type: "string", description: "UID of parent block or page" },
        markdown: { type: "string", description: "Markdown content for the block" },
        order: {
          oneOf: [{ type: "number" }, { type: "string", enum: ["first", "last"] }],
          description: "Position (number, 'first', or 'last'). Defaults to 'last'",
        },
      },
```

**Step 4: Add graph to update_block properties (line 69-74)**

Replace:
```typescript
      properties: {
        uid: { type: "string", description: "Block UID" },
        string: { type: "string", description: "New text content" },
        open: { type: "boolean", description: "Collapse state" },
        heading: { type: "number", description: "Heading level (0-3)" },
      },
```

With:
```typescript
      properties: {
        graph: graphProperty,
        uid: { type: "string", description: "Block UID" },
        string: { type: "string", description: "New text content" },
        open: { type: "boolean", description: "Collapse state" },
        heading: { type: "number", description: "Heading level (0-3)" },
      },
```

**Step 5: Add graph to delete_block properties (line 86-88)**

Replace:
```typescript
      properties: {
        uid: { type: "string", description: "Block UID to delete" },
      },
```

With:
```typescript
      properties: {
        graph: graphProperty,
        uid: { type: "string", description: "Block UID to delete" },
      },
```

**Step 6: Add graph to delete_page properties (line 100-102)**

Replace:
```typescript
      properties: {
        uid: { type: "string", description: "Page UID to delete" },
      },
```

With:
```typescript
      properties: {
        graph: graphProperty,
        uid: { type: "string", description: "Page UID to delete" },
      },
```

**Step 7: Add graph to search properties (line 115-120)**

Replace:
```typescript
      properties: {
        query: { type: "string", description: "Search query" },
        searchPages: { type: "boolean", description: "Include pages (default: true)" },
        searchBlocks: { type: "boolean", description: "Include blocks (default: true)" },
        limit: { type: "number", description: "Max results (default: 100)" },
      },
```

With:
```typescript
      properties: {
        graph: graphProperty,
        query: { type: "string", description: "Search query" },
        searchPages: { type: "boolean", description: "Include pages (default: true)" },
        searchBlocks: { type: "boolean", description: "Include blocks (default: true)" },
        limit: { type: "number", description: "Max results (default: 100)" },
      },
```

**Step 8: Add graph to get_page properties (line 131-134)**

Replace:
```typescript
      properties: {
        uid: { type: "string", description: "Page UID" },
        title: { type: "string", description: "Page title (alternative to uid)" },
      },
```

With:
```typescript
      properties: {
        graph: graphProperty,
        uid: { type: "string", description: "Page UID" },
        title: { type: "string", description: "Page title (alternative to uid)" },
      },
```

**Step 9: Add graph to get_block properties (line 144-146)**

Replace:
```typescript
      properties: {
        uid: { type: "string", description: "Block UID" },
      },
```

With:
```typescript
      properties: {
        graph: graphProperty,
        uid: { type: "string", description: "Block UID" },
      },
```

**Step 10: Add graph to get_backlinks properties (line 157-159)**

Replace:
```typescript
      properties: {
        uid: { type: "string", description: "UID of page or block to get backlinks for" },
      },
```

With:
```typescript
      properties: {
        graph: graphProperty,
        uid: { type: "string", description: "UID of page or block to get backlinks for" },
      },
```

**Step 11: Add graph to get_focused_block properties (line 170-171)**

Replace:
```typescript
      properties: {},
```

With:
```typescript
      properties: {
        graph: graphProperty,
      },
```

**Step 12: Add graph to get_current_page properties (line 180-181)**

Replace:
```typescript
      properties: {},
```

With:
```typescript
      properties: {
        graph: graphProperty,
      },
```

**Step 13: Add graph to open properties (line 191-194)**

Replace:
```typescript
      properties: {
        uid: { type: "string", description: "UID of page or block" },
        title: { type: "string", description: "Page title (alternative to uid)" },
      },
```

With:
```typescript
      properties: {
        graph: graphProperty,
        uid: { type: "string", description: "UID of page or block" },
        title: { type: "string", description: "Page title (alternative to uid)" },
      },
```

**Step 14: Add graph to open_sidebar properties (line 205-211)**

Replace:
```typescript
      properties: {
        uid: { type: "string", description: "UID of page or block" },
        type: {
          type: "string",
          enum: ["block", "outline", "mentions"],
          description: "View type (default: outline)",
        },
      },
```

With:
```typescript
      properties: {
        graph: graphProperty,
        uid: { type: "string", description: "UID of page or block" },
        type: {
          type: "string",
          enum: ["block", "outline", "mentions"],
          description: "View type (default: outline)",
        },
      },
```

**Step 15: Run typecheck**

Run: `npm run typecheck`
Expected: PASS with no errors

**Step 16: Commit**

```bash
git add src/core/tools.ts
git commit -m "feat: add optional graph parameter to all tools"
```

---

### Task 3: Update the router to resolve graph and create client per call

**Files:**
- Modify: `src/core/tools.ts`

**Step 1: Add imports at top of file (after line 4)**

Add after the existing imports:

```typescript
import { RoamClient } from "./client.js";
import {
  PageOperations,
  BlockOperations,
  SearchOperations,
  NavigationOperations,
} from "./operations/index.js";
import { resolveGraph } from "./graph-resolver.js";
```

**Step 2: Replace the createRouter function (lines 234-256)**

Replace the entire `createRouter` function with:

```typescript
// Create a router function that resolves graph and dispatches to operations
export async function routeToolCall(
  toolName: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const tool = findTool(toolName);
  if (!tool) {
    throw new Error(`Unknown tool: ${toolName}`);
  }

  // Extract graph from args and resolve it
  const { graph, ...restArgs } = args;
  const resolvedGraph = await resolveGraph(graph as string | undefined);

  // Create client and operations for this call
  const client = new RoamClient({ graphName: resolvedGraph });
  const operations: Operations = {
    pages: new PageOperations(client),
    blocks: new BlockOperations(client),
    search: new SearchOperations(client),
    navigation: new NavigationOperations(client),
  };

  const op = operations[tool.operation];
  const method = (op as unknown as Record<string, unknown>)[tool.method] as (
    args: Record<string, unknown>
  ) => Promise<unknown>;

  const result = await method.call(op, restArgs);

  // For void operations, return { success: true }
  if (tool.returnsSuccess) {
    return { success: true };
  }

  return result;
}

// Backwards compatibility: createRouter still works but uses routeToolCall internally
export function createRouter(_operations?: Operations) {
  return routeToolCall;
}
```

**Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS with no errors

**Step 4: Commit**

```bash
git add src/core/tools.ts
git commit -m "refactor: router resolves graph and creates client per call"
```

---

### Task 4: Simplify MCP server

**Files:**
- Modify: `src/mcp/index.ts`

**Step 1: Replace entire file contents**

```typescript
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { tools, routeToolCall } from "../core/tools.js";

const server = new Server(
  { name: "roam-mcp", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

// List tools - map to MCP format (exclude operation/method fields)
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: tools.map(({ name, description, inputSchema }) => ({
    name,
    description,
    inputSchema,
  })),
}));

// Handle tool calls via router
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    const result = await routeToolCall(name, args as Record<string, unknown>);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: `Error: ${message}` }],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Roam MCP server running");
}

main().catch(console.error);
```

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS with no errors

**Step 3: Test MCP server starts**

Run: `echo '{}' | timeout 2 npm run mcp 2>&1 || true`
Expected: Should see "Roam MCP server running" (no graph name mentioned)

**Step 4: Commit**

```bash
git add src/mcp/index.ts
git commit -m "refactor: simplify MCP server, remove graph requirement"
```

---

### Task 5: Simplify CLI

**Files:**
- Modify: `src/cli/index.ts`

**Step 1: Replace entire file contents**

```typescript
#!/usr/bin/env node

import { Command } from "commander";
import { tools, routeToolCall, type JsonSchemaProperty } from "../core/tools.js";

const program = new Command();

program
  .name("roam")
  .description("Roam Research CLI")
  .version("0.1.0");

// Build commands dynamically from shared tool definitions
tools.forEach((tool) => {
  const cmd = program
    .command(tool.name.replace(/_/g, "-")) // create_page -> create-page
    .description(tool.description);

  // Add options from inputSchema
  const { properties, required = [] } = tool.inputSchema;
  for (const [param, schema] of Object.entries(properties)) {
    const propSchema = schema as JsonSchemaProperty;
    const isRequired = required.includes(param);

    // Build flag string
    const flagName = param.replace(/([A-Z])/g, "-$1").toLowerCase(); // parentUid -> parent-uid
    const flag = isRequired ? `--${flagName} <value>` : `--${flagName} [value]`;

    cmd.option(flag, propSchema.description);
  }

  // Handler
  cmd.action(async (options) => {
    // Convert CLI options back to tool args
    // parent-uid -> parentUid
    const args: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(options)) {
      if (value !== undefined) {
        const camelKey = key.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        const propSchema = tool.inputSchema.properties[camelKey];
        // Check for number type (direct or via oneOf)
        const hasNumberType =
          propSchema?.type === "number" ||
          propSchema?.oneOf?.some((o) => o.type === "number");
        const hasBooleanType = propSchema?.type === "boolean";

        if (hasNumberType && !isNaN(Number(value))) {
          args[camelKey] = Number(value);
        } else if (hasBooleanType) {
          args[camelKey] = value === "true" || value === true;
        } else {
          args[camelKey] = value;
        }
      }
    }

    try {
      const result = await routeToolCall(tool.name, args);
      console.log(JSON.stringify(result, null, 2));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Error: ${message}`);
      process.exit(1);
    }
  });
});

program.parse();
```

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS with no errors

**Step 3: Test CLI help shows graph option on commands**

Run: `npm run cli -- create-page --help`
Expected: Should show `--graph [value]` option along with `--title` and `--markdown`

**Step 4: Commit**

```bash
git add src/cli/index.ts
git commit -m "refactor: simplify CLI, remove global graph option"
```

---

### Task 6: Make graphName optional in types

**Files:**
- Modify: `src/core/types.ts`

**Step 1: Update RoamClientConfig interface (line 57-60)**

Replace:
```typescript
export interface RoamClientConfig {
  graphName: string;
  port?: number;
}
```

With:
```typescript
export interface RoamClientConfig {
  graphName?: string;
  port?: number;
}
```

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: May show error in client.ts about graphName being possibly undefined

**Step 3: Commit (if typecheck passes)**

```bash
git add src/core/types.ts
git commit -m "chore: make graphName optional in RoamClientConfig"
```

---

### Task 7: Update RoamClient to require graphName at runtime

**Files:**
- Modify: `src/core/client.ts`

**Step 1: Update constructor to validate graphName (lines 10-15)**

Replace:
```typescript
  constructor(config: RoamClientConfig) {
    this.graphName = config.graphName;
    if (config.port) {
      this.port = config.port;
    }
  }
```

With:
```typescript
  constructor(config: RoamClientConfig) {
    if (!config.graphName) {
      throw new Error("graphName is required");
    }
    this.graphName = config.graphName;
    if (config.port) {
      this.port = config.port;
    }
  }
```

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS with no errors

**Step 3: Commit**

```bash
git add src/core/client.ts
git commit -m "chore: validate graphName at runtime in RoamClient"
```

---

### Task 8: Build and test end-to-end

**Step 1: Build the project**

Run: `npm run build`
Expected: PASS with no errors

**Step 2: Test CLI without graph (auto-detection)**

Run: `npm run cli -- get-current-page`
Expected: Either returns current page UID, or error about multiple graphs/no graphs

**Step 3: Test CLI with explicit graph**

Run: `npm run cli -- search --query "test" --graph <your-graph-name>`
Expected: Returns search results from specified graph

**Step 4: Test MCP server starts**

Run: `echo '{}' | timeout 2 npm run mcp 2>&1 || true`
Expected: "Roam MCP server running"

**Step 5: Final commit if any changes**

```bash
git status
# If clean, no action needed
```

---

## Summary

After completing all tasks:

- `src/core/graph-resolver.ts` - NEW: Graph resolution logic with last-used memory
- `src/core/tools.ts` - All 13 tools have optional `graph` parameter, router resolves graph per call
- `src/core/types.ts` - `graphName` is optional in config
- `src/core/client.ts` - Validates `graphName` at runtime
- `src/mcp/index.ts` - Simplified, no startup config needed
- `src/cli/index.ts` - Simplified, `--graph` available on each command

Zero configuration needed to start. Auto-detects graph when one is open. Graceful error with numbered list when multiple graphs are open.
