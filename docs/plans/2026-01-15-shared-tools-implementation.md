# Shared Tools Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refactor to a single tool list shared between MCP server and CLI.

**Architecture:** Create `src/core/tools.ts` with tool definitions and a router utility. MCP and CLI both import from this file. The router maps tool names to operation class methods using string-based lookup.

**Tech Stack:** TypeScript, commander (new dependency for CLI)

---

### Task 1: Create the shared tools file with type definitions

**Files:**
- Create: `src/core/tools.ts`

**Step 1: Create the tools.ts file with types and tool definitions**

```typescript
// src/core/tools.ts
import type { PageOperations } from "./operations/pages.js";
import type { BlockOperations } from "./operations/blocks.js";
import type { SearchOperations } from "./operations/search.js";
import type { NavigationOperations } from "./operations/navigation.js";

// JSON Schema property type
export interface JsonSchemaProperty {
  type?: string;
  description?: string;
  enum?: string[];
  oneOf?: Array<{ type: string; enum?: string[] }>;
}

// Tool definition type
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, JsonSchemaProperty>;
    required?: string[];
  };
  operation: "pages" | "blocks" | "search" | "navigation";
  method: string;
  returnsSuccess?: boolean; // For void operations that should return { success: true }
}

// All 13 tool definitions
export const tools: ToolDefinition[] = [
  // Content operations
  {
    name: "create_page",
    description: "Create a new page in Roam, optionally with markdown content",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Page title" },
        markdown: { type: "string", description: "Markdown content for the page" },
      },
      required: ["title"],
    },
    operation: "pages",
    method: "create",
  },
  {
    name: "create_block",
    description: "Create a new block under a parent, using markdown content",
    inputSchema: {
      type: "object",
      properties: {
        parentUid: { type: "string", description: "UID of parent block or page" },
        markdown: { type: "string", description: "Markdown content for the block" },
        order: {
          oneOf: [{ type: "number" }, { type: "string", enum: ["first", "last"] }],
          description: "Position (number, 'first', or 'last'). Defaults to 'last'",
        },
      },
      required: ["parentUid", "markdown"],
    },
    operation: "blocks",
    method: "create",
  },
  {
    name: "update_block",
    description: "Update an existing block's content or properties",
    inputSchema: {
      type: "object",
      properties: {
        uid: { type: "string", description: "Block UID" },
        string: { type: "string", description: "New text content" },
        open: { type: "boolean", description: "Collapse state" },
        heading: { type: "number", description: "Heading level (0-3)" },
      },
      required: ["uid"],
    },
    operation: "blocks",
    method: "update",
    returnsSuccess: true,
  },
  {
    name: "delete_block",
    description: "Delete a block and all its children",
    inputSchema: {
      type: "object",
      properties: {
        uid: { type: "string", description: "Block UID to delete" },
      },
      required: ["uid"],
    },
    operation: "blocks",
    method: "delete",
    returnsSuccess: true,
  },
  {
    name: "delete_page",
    description: "Delete a page and all its contents",
    inputSchema: {
      type: "object",
      properties: {
        uid: { type: "string", description: "Page UID to delete" },
      },
      required: ["uid"],
    },
    operation: "pages",
    method: "delete",
    returnsSuccess: true,
  },
  // Read operations
  {
    name: "search",
    description: "Search for pages and blocks by text",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        searchPages: { type: "boolean", description: "Include pages (default: true)" },
        searchBlocks: { type: "boolean", description: "Include blocks (default: true)" },
        limit: { type: "number", description: "Max results (default: 100)" },
      },
      required: ["query"],
    },
    operation: "search",
    method: "search",
  },
  {
    name: "get_page",
    description: "Get a page's content and children",
    inputSchema: {
      type: "object",
      properties: {
        uid: { type: "string", description: "Page UID" },
        title: { type: "string", description: "Page title (alternative to uid)" },
      },
    },
    operation: "pages",
    method: "get",
  },
  {
    name: "get_block",
    description: "Get a block's content and children",
    inputSchema: {
      type: "object",
      properties: {
        uid: { type: "string", description: "Block UID" },
      },
      required: ["uid"],
    },
    operation: "blocks",
    method: "get",
  },
  {
    name: "get_backlinks",
    description: "Get all blocks that reference a given page or block",
    inputSchema: {
      type: "object",
      properties: {
        uid: { type: "string", description: "UID of page or block to get backlinks for" },
      },
      required: ["uid"],
    },
    operation: "blocks",
    method: "getBacklinks",
  },
  // Navigation operations
  {
    name: "get_focused_block",
    description: "Get the currently focused block in Roam",
    inputSchema: {
      type: "object",
      properties: {},
    },
    operation: "navigation",
    method: "getFocusedBlock",
  },
  {
    name: "get_current_page",
    description: "Get the UID of the page currently open in the main window",
    inputSchema: {
      type: "object",
      properties: {},
    },
    operation: "navigation",
    method: "getCurrentPage",
  },
  {
    name: "open",
    description: "Navigate to a page or block in the main window",
    inputSchema: {
      type: "object",
      properties: {
        uid: { type: "string", description: "UID of page or block" },
        title: { type: "string", description: "Page title (alternative to uid)" },
      },
    },
    operation: "navigation",
    method: "open",
    returnsSuccess: true,
  },
  {
    name: "open_sidebar",
    description: "Open a page or block in the right sidebar",
    inputSchema: {
      type: "object",
      properties: {
        uid: { type: "string", description: "UID of page or block" },
        type: {
          type: "string",
          enum: ["block", "outline", "mentions"],
          description: "View type (default: outline)",
        },
      },
      required: ["uid"],
    },
    operation: "navigation",
    method: "openSidebar",
    returnsSuccess: true,
  },
];

// Operations interface for the router
export interface Operations {
  pages: PageOperations;
  blocks: BlockOperations;
  search: SearchOperations;
  navigation: NavigationOperations;
}

// Find a tool by name
export function findTool(name: string): ToolDefinition | undefined {
  return tools.find((t) => t.name === name);
}

// Create a router function that maps tool names to operation methods
export function createRouter(operations: Operations) {
  return async (toolName: string, args: Record<string, unknown>): Promise<unknown> => {
    const tool = findTool(toolName);
    if (!tool) {
      throw new Error(`Unknown tool: ${toolName}`);
    }

    const op = operations[tool.operation];
    const method = (op as Record<string, unknown>)[tool.method] as (
      args: Record<string, unknown>
    ) => Promise<unknown>;

    const result = await method.call(op, args);

    // For void operations, return { success: true }
    if (tool.returnsSuccess) {
      return { success: true };
    }

    return result;
  };
}
```

**Step 2: Run typecheck to verify the file**

Run: `npm run typecheck`
Expected: PASS with no errors

**Step 3: Commit**

```bash
git add src/core/tools.ts
git commit -m "feat: add shared tool definitions and router"
```

---

### Task 2: Update MCP server to use shared tools

**Files:**
- Modify: `src/mcp/index.ts`

**Step 1: Replace the MCP server implementation**

Replace the entire contents of `src/mcp/index.ts` with:

```typescript
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { RoamClient } from "../core/client.js";
import {
  PageOperations,
  BlockOperations,
  SearchOperations,
  NavigationOperations,
} from "../core/operations/index.js";
import { tools, createRouter } from "../core/tools.js";

// Get graph name from env or args
const graphName = process.env.ROAM_GRAPH || process.argv[2];
if (!graphName) {
  console.error("Usage: roam-mcp <graph-name> or set ROAM_GRAPH env var");
  process.exit(1);
}

const client = new RoamClient({ graphName });
const operations = {
  pages: new PageOperations(client),
  blocks: new BlockOperations(client),
  search: new SearchOperations(client),
  navigation: new NavigationOperations(client),
};

const router = createRouter(operations);

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
    const result = await router(name, args as Record<string, unknown>);
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
  console.error(`Roam MCP server running for graph: ${graphName}`);
}

main().catch(console.error);
```

**Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS with no errors

**Step 3: Test MCP server starts**

Run: `echo '{}' | timeout 2 npm run mcp -- test-graph 2>&1 || true`
Expected: Should see "Roam MCP server running for graph: test-graph"

**Step 4: Commit**

```bash
git add src/mcp/index.ts
git commit -m "refactor: use shared tools in MCP server"
```

---

### Task 3: Add commander dependency

**Files:**
- Modify: `package.json`

**Step 1: Install commander**

Run: `npm install commander`

**Step 2: Verify package.json updated**

Run: `grep commander package.json`
Expected: Should show commander in dependencies

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add commander dependency for CLI"
```

---

### Task 4: Implement the CLI using shared tools

**Files:**
- Modify: `src/cli/index.ts`

**Step 1: Replace CLI implementation**

Replace the entire contents of `src/cli/index.ts` with:

```typescript
#!/usr/bin/env node

import { Command } from "commander";
import { RoamClient } from "../core/client.js";
import {
  PageOperations,
  BlockOperations,
  SearchOperations,
  NavigationOperations,
} from "../core/operations/index.js";
import { tools, createRouter, type JsonSchemaProperty } from "../core/tools.js";

const program = new Command();

program
  .name("roam")
  .description("Roam Research CLI")
  .version("0.1.0")
  .option("-g, --graph <name>", "Graph name (or set ROAM_GRAPH env var)");

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
    const graphName = program.opts().graph || process.env.ROAM_GRAPH;
    if (!graphName) {
      console.error("Error: Graph name required. Use -g <name> or set ROAM_GRAPH env var");
      process.exit(1);
    }

    const client = new RoamClient({ graphName });
    const operations = {
      pages: new PageOperations(client),
      blocks: new BlockOperations(client),
      search: new SearchOperations(client),
      navigation: new NavigationOperations(client),
    };

    const router = createRouter(operations);

    // Convert CLI options back to tool args
    // parent-uid -> parentUid
    const args: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(options)) {
      if (value !== undefined) {
        const camelKey = key.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        args[camelKey] = value;
      }
    }

    try {
      const result = await router(tool.name, args);
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

**Step 3: Test CLI help**

Run: `npm run cli -- --help`
Expected: Should show "Roam Research CLI" and list all commands

**Step 4: Test a specific command help**

Run: `npm run cli -- create-page --help`
Expected: Should show "Create a new page in Roam" and options --title, --markdown

**Step 5: Commit**

```bash
git add src/cli/index.ts
git commit -m "feat: implement CLI using shared tools"
```

---

### Task 5: Export JsonSchemaProperty from tools.ts

**Files:**
- Modify: `src/core/tools.ts`

This was already done in Task 1 - verify the export is present.

**Step 1: Verify export**

Run: `grep "export interface JsonSchemaProperty" src/core/tools.ts`
Expected: Should find the export

**Step 2: Run full typecheck**

Run: `npm run typecheck`
Expected: PASS

---

### Task 6: Final verification and cleanup

**Step 1: Build the project**

Run: `npm run build`
Expected: PASS with no errors

**Step 2: Verify MCP still works**

Run: `echo '{}' | timeout 2 npm run mcp -- test-graph 2>&1 || true`
Expected: "Roam MCP server running for graph: test-graph"

**Step 3: Verify CLI lists all commands**

Run: `npm run cli -- --help`
Expected: All 13 commands listed (create-page, create-block, etc.)

**Step 4: Final commit if any remaining changes**

```bash
git status
# If clean, no action needed
```

---

## Summary

After completing all tasks:

- `src/core/tools.ts` - Single source of truth for 13 tool definitions + router
- `src/mcp/index.ts` - ~60 lines (down from ~280)
- `src/cli/index.ts` - ~80 lines (fully implemented, was stub)
- Added `commander` dependency

Both MCP and CLI now share the same tool names, descriptions, and schemas.
