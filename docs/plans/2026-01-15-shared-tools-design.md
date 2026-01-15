# Shared Tool Definitions Design

## Overview

Refactor the codebase to have a single tool list shared between the MCP server and CLI. This eliminates duplication and ensures both interfaces stay in sync.

## Tool Definition Structure

A new `src/core/tools.ts` file will contain all tool definitions:

```typescript
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
}

export const tools: ToolDefinition[] = [
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
  // ... all 13 tools
];
```

## Shared Router Utility

To avoid duplicating routing logic:

```typescript
export interface Operations {
  pages: PageOperations;
  blocks: BlockOperations;
  search: SearchOperations;
  navigation: NavigationOperations;
}

export function createRouter(operations: Operations) {
  return async (toolName: string, args: Record<string, unknown>) => {
    const tool = tools.find(t => t.name === toolName);
    if (!tool) {
      throw new Error(`Unknown tool: ${toolName}`);
    }

    const op = operations[tool.operation];
    return await (op as any)[tool.method](args);
  };
}
```

## MCP Consumption

The MCP server imports tools and uses the router:

```typescript
import { tools, createRouter } from "../core/tools.js";

// Tool registration
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: tools.map(({ name, description, inputSchema }) => ({
    name,
    description,
    inputSchema,
  })),
}));

// Generic router replaces switch statement
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const router = createRouter({ pages, blocks, search, navigation });

  try {
    const result = await router(name, args);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (error) {
    return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
  }
});
```

## CLI Consumption

The CLI dynamically builds commands from the tools array:

```typescript
import { Command } from "commander";
import { tools, createRouter } from "../core/tools.js";

const program = new Command();
program.name("roam").description("Roam Research CLI");

tools.forEach((tool) => {
  const cmd = program
    .command(tool.name.replace(/_/g, "-"))  // create_page -> create-page
    .description(tool.description);

  const { properties, required = [] } = tool.inputSchema;
  for (const [param, schema] of Object.entries(properties)) {
    const flag = required.includes(param)
      ? `--${param} <value>`
      : `--${param} [value]`;
    cmd.option(flag, schema.description);
  }

  cmd.action(async (opts) => {
    const router = createRouter({ pages, blocks, search, navigation });
    const result = await router(tool.name, opts);
    console.log(JSON.stringify(result, null, 2));
  });
});

program.parse();
```

## Files Changed

**Create:**
- `src/core/tools.ts` - Tool definitions, types, and router utility

**Modify:**
- `src/mcp/index.ts` - Remove inline tool definitions and switch statement
- `src/cli/index.ts` - Replace stub with dynamic command generation

**Dependencies:**
- Add `commander` for CLI argument parsing

## Benefits

- Single source of truth for tool names, descriptions, and schemas
- MCP and CLI guaranteed to stay in sync
- Adding a new tool requires updating only one file
- ~200 lines of code removed from MCP server
