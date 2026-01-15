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
    const method = (op as unknown as Record<string, unknown>)[tool.method] as (
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
