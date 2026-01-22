// src/core/tools.ts
import type { PageOperations } from "./operations/pages.js";
import type { BlockOperations } from "./operations/blocks.js";
import type { SearchOperations } from "./operations/search.js";
import type { NavigationOperations } from "./operations/navigation.js";
import type { FileOperations } from "./operations/files.js";
import { RoamClient } from "./client.js";
import {
  PageOperations as PageOpsClass,
  BlockOperations as BlockOpsClass,
  SearchOperations as SearchOpsClass,
  NavigationOperations as NavOpsClass,
  FileOperations as FileOpsClass,
} from "./operations/index.js";
import { resolveGraph } from "./graph-resolver.js";

// JSON Schema property type
export interface JsonSchemaProperty {
  type?: string;
  description?: string;
  enum?: string[];
  oneOf?: Array<{ type: string; enum?: string[] }>;
}

// Common graph property for all tools
const graphProperty: JsonSchemaProperty = {
  type: "string",
  description: "Graph name (optional - auto-detects if omitted)",
};

// Tool definition type
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, JsonSchemaProperty>;
    required?: string[];
  };
  operation: "pages" | "blocks" | "search" | "navigation" | "files";
  method: string;
  returnsSuccess?: boolean; // For void operations that should return { success: true }
}

// All tool definitions
export const tools: ToolDefinition[] = [
  // Graph-level operations
  {
    name: "get_graph_guidelines",
    description:
      "IMPORTANT: Call this tool first when starting to work with a graph. Returns user-defined instructions and preferences for AI agents operating on this graph. The user may have specified important context, naming conventions, or constraints that should guide your behavior.",
    inputSchema: {
      type: "object",
      properties: {
        graph: graphProperty,
      },
    },
    operation: "pages",
    method: "getGuidelines",
  },
  // Content operations
  {
    name: "create_page",
    description:
      "Create a new page in Roam, optionally with markdown content. Note: Call get_graph_guidelines first when starting to work with a graph.",
    inputSchema: {
      type: "object",
      properties: {
        graph: graphProperty,
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
    description:
      "Create a new block under a parent, using markdown content. Supports nested bulleted lists - pass a markdown string with `- ` list items and indentation to create an entire block hierarchy in a single call. Note: Call get_graph_guidelines first when starting to work with a graph.",
    inputSchema: {
      type: "object",
      properties: {
        graph: graphProperty,
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
    description:
      "Update an existing block's content or properties. Note: Call get_graph_guidelines first when starting to work with a graph.",
    inputSchema: {
      type: "object",
      properties: {
        graph: graphProperty,
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
    description:
      "Delete a block and all its children. Note: Call get_graph_guidelines first when starting to work with a graph.",
    inputSchema: {
      type: "object",
      properties: {
        graph: graphProperty,
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
    description:
      "Delete a page and all its contents. Note: Call get_graph_guidelines first when starting to work with a graph.",
    inputSchema: {
      type: "object",
      properties: {
        graph: graphProperty,
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
    description:
      "Search for pages and blocks by text. Returns paginated results with markdown content and optional breadcrumb paths. Note: Call get_graph_guidelines first when starting to work with a graph.",
    inputSchema: {
      type: "object",
      properties: {
        graph: graphProperty,
        query: { type: "string", description: "Search query" },
        offset: { type: "number", description: "Skip first N results (default: 0)" },
        limit: { type: "number", description: "Max results (default: 100)" },
        includePath: {
          type: "boolean",
          description: "Include breadcrumb path to each result (default: true)",
        },
        maxDepth: {
          type: "number",
          description: "Max depth of children to include in markdown (default: 2)",
        },
      },
      required: ["query"],
    },
    operation: "search",
    method: "search",
  },
  {
    name: "search_templates",
    description:
      "Search Roam templates by name. When the user mentions 'my X template' or 'the X template', use this tool to find it. Templates are user-created reusable content blocks tagged with [[roam/templates]]. Returns template name, uid, and content as markdown. Note: Call get_graph_guidelines first when starting to work with a graph.",
    inputSchema: {
      type: "object",
      properties: {
        graph: graphProperty,
        query: { type: "string", description: "Keywords to filter templates by name (case-insensitive). Try relevant keywords first before listing all." },
      },
    },
    operation: "search",
    method: "searchTemplates",
  },
  {
    name: "get_page",
    description:
      "Get a page's content as markdown. Returns content with <roam> metadata tags containing UIDs - use these for follow-up operations but strip them when showing content to the user. Show remaining content verbatim, never paraphrase. Use maxDepth for large pages. Note: Call get_graph_guidelines first when starting to work with a graph.",
    inputSchema: {
      type: "object",
      properties: {
        graph: graphProperty,
        uid: { type: "string", description: "Page UID" },
        title: { type: "string", description: "Page title (alternative to uid)" },
        maxDepth: {
          type: "number",
          description: "Max depth of children to include in markdown (omit for full tree)",
        },
      },
    },
    operation: "pages",
    method: "get",
  },
  {
    name: "get_block",
    description:
      "Get a block's content as markdown. Returns content with <roam> metadata tags containing UIDs - use these for follow-up operations but strip them when showing content to the user. Show remaining content verbatim, never paraphrase. Use maxDepth for large blocks. Note: Call get_graph_guidelines first when starting to work with a graph.",
    inputSchema: {
      type: "object",
      properties: {
        graph: graphProperty,
        uid: { type: "string", description: "Block UID" },
        maxDepth: {
          type: "number",
          description: "Max depth of children to include in markdown (omit for full tree)",
        },
      },
      required: ["uid"],
    },
    operation: "blocks",
    method: "get",
  },
  {
    name: "get_backlinks",
    description:
      "Get paginated backlinks (linked references) for a page or block, formatted as markdown. Returns total count and results with optional breadcrumb paths. Note: Call get_graph_guidelines first when starting to work with a graph.",
    inputSchema: {
      type: "object",
      properties: {
        graph: graphProperty,
        uid: { type: "string", description: "UID of page or block (required if no title)" },
        title: { type: "string", description: "Page title (required if no uid)" },
        offset: { type: "number", description: "Skip first N results (default: 0)" },
        limit: { type: "number", description: "Max results to return (default: 20)" },
        sort: {
          type: "string",
          enum: ["created-date", "edited-date", "daily-note-date"],
          description: "Sort order (default: created-date)",
        },
        sortOrder: {
          type: "string",
          enum: ["asc", "desc"],
          description: "Sort direction (default: desc)",
        },
        search: {
          type: "string",
          description: "Filter results by text match (searches block, parents, children, page title)",
        },
        includePath: {
          type: "boolean",
          description: "Include breadcrumb path to each result (default: true)",
        },
        maxDepth: {
          type: "number",
          description: "Max depth of children to include in markdown (default: 2)",
        },
      },
    },
    operation: "blocks",
    method: "getBacklinks",
  },
  // Navigation operations
  {
    name: "get_focused_block",
    description:
      "Get the currently focused block in Roam. Note: Call get_graph_guidelines first when starting to work with a graph.",
    inputSchema: {
      type: "object",
      properties: {
        graph: graphProperty,
      },
    },
    operation: "navigation",
    method: "getFocusedBlock",
  },
  {
    name: "get_main_window",
    description:
      "Get the current view in the main window (outline, log, graph, diagram, pdf, search, or custom). Note: Call get_graph_guidelines first when starting to work with a graph.",
    inputSchema: {
      type: "object",
      properties: {
        graph: graphProperty,
      },
    },
    operation: "navigation",
    method: "getMainWindow",
  },
  {
    name: "get_sidebar_windows",
    description:
      "Get all open windows in the right sidebar. Note: Call get_graph_guidelines first when starting to work with a graph.",
    inputSchema: {
      type: "object",
      properties: {
        graph: graphProperty,
      },
    },
    operation: "navigation",
    method: "getSidebarWindows",
  },
  {
    name: "open_main_window",
    description:
      "Navigate to a page or block in the main window. Note: Call get_graph_guidelines first when starting to work with a graph.",
    inputSchema: {
      type: "object",
      properties: {
        graph: graphProperty,
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
    description:
      "Open a page or block in the right sidebar. Note: Call get_graph_guidelines first when starting to work with a graph.",
    inputSchema: {
      type: "object",
      properties: {
        graph: graphProperty,
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
  // File operations
  {
    name: "file_get",
    description:
      "Fetch a file hosted on Roam (handles decryption for encrypted graphs). Note: Call get_graph_guidelines first when starting to work with a graph.",
    inputSchema: {
      type: "object",
      properties: {
        graph: graphProperty,
        url: { type: "string", description: "Firebase storage URL of the file" },
      },
      required: ["url"],
    },
    operation: "files",
    method: "get",
  },
];

// Operations interface for the router
export interface Operations {
  pages: PageOperations;
  blocks: BlockOperations;
  search: SearchOperations;
  navigation: NavigationOperations;
  files: FileOperations;
}

// Find a tool by name
export function findTool(name: string): ToolDefinition | undefined {
  return tools.find((t) => t.name === name);
}

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
    pages: new PageOpsClass(client),
    blocks: new BlockOpsClass(client),
    search: new SearchOpsClass(client),
    navigation: new NavOpsClass(client),
    files: new FileOpsClass(client),
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
