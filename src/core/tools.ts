import { z } from "zod";
import type { CallToolResult } from "./types.js";
import { RoamError, textResult } from "./types.js";
import { RoamClient } from "./client.js";
import { resolveGraph, getPort } from "./graph-resolver.js";
import {
  CreatePageSchema, GetPageSchema, DeletePageSchema, UpdatePageSchema, GetGuidelinesSchema,
  createPage, getPage, deletePage, updatePage, getGuidelines,
} from "./operations/pages.js";
import {
  CreateBlockSchema, GetBlockSchema, UpdateBlockSchema, DeleteBlockSchema, MoveBlockSchema, GetBacklinksSchema,
  createBlock, getBlock, updateBlock, deleteBlock, moveBlock, getBacklinks,
} from "./operations/blocks.js";
import { SearchSchema, SearchTemplatesSchema, search, searchTemplates } from "./operations/search.js";
import { QuerySchema, query } from "./operations/query.js";
import {
  GetOpenWindowsSchema, GetSelectionSchema, OpenMainWindowSchema, OpenSidebarSchema,
  getOpenWindows, getSelection, openMainWindow, openSidebar,
} from "./operations/navigation.js";
import { FileGetSchema, FileUploadSchema, FileDeleteSchema, getFile, uploadFile, deleteFile } from "./operations/files.js";
import { ListGraphsSchema, SelectGraphSchema, CurrentGraphSchema, listGraphs, selectGraph, currentGraph } from "./operations/graphs.js";

// Common schema for graph parameter (used by most tools)
const GraphSchema = z.object({
  graph: z.string().optional().describe("Graph nickname or name (optional - uses selected graph if omitted)"),
});

// Helper to extend any schema with graph parameter
function withGraph<T extends z.ZodRawShape>(schema: z.ZodObject<T>) {
  return schema.extend(GraphSchema.shape);
}

// Tool that requires a graph/client
export interface ClientToolDefinition {
  name: string;
  description: string;
  schema: z.ZodObject<z.ZodRawShape>;
  action: (client: RoamClient, args: unknown) => Promise<CallToolResult>;
  type: "client";
}

// Standalone tool that handles its own graph resolution
export interface StandaloneToolDefinition {
  name: string;
  description: string;
  schema: z.ZodObject<z.ZodRawShape>;
  action: (args: unknown) => Promise<CallToolResult>;
  type: "standalone";
}

export type ToolDefinition = ClientToolDefinition | StandaloneToolDefinition;

// Helper to create tool with graph parameter
function defineTool<T extends z.ZodRawShape>(
  name: string, description: string, schema: z.ZodObject<T>,
  action: (client: RoamClient, args: z.infer<z.ZodObject<T>>) => Promise<CallToolResult>
): ClientToolDefinition {
  return {
    name,
    description,
    schema: withGraph(schema),
    action: (client, args) => action(client, args as z.infer<z.ZodObject<T>>),
    type: "client",
  };
}

// Helper to create standalone tool (no graph parameter, handles its own resolution)
function defineStandaloneTool<T extends z.ZodRawShape>(
  name: string, description: string, schema: z.ZodObject<T>,
  action: (args: z.infer<z.ZodObject<T>>) => Promise<CallToolResult>
): StandaloneToolDefinition {
  return {
    name,
    description,
    schema: schema,
    action: (args) => action(args as z.infer<z.ZodObject<T>>),
    type: "standalone",
  };
}

// Graph Management Tools (standalone - handle their own resolution)
const graphManagementTools: StandaloneToolDefinition[] = [
  defineStandaloneTool(
    "list_graphs",
    "List all configured graphs with their nicknames. Use this to see available graphs before selecting one.",
    ListGraphsSchema,
    listGraphs
  ),
  defineStandaloneTool(
    "select_graph",
    "Set the active graph for this session and return its guidelines. Call this before using other tools when multiple graphs are configured, or to switch between graphs.",
    SelectGraphSchema,
    selectGraph
  ),
  defineStandaloneTool(
    "current_graph",
    "Return the currently active graph and its metadata. Returns an error with available graphs if no graph is selected.",
    CurrentGraphSchema,
    currentGraph
  ),
];

// Content Tools (require graph/client)
const contentTools: ClientToolDefinition[] = [
  defineTool(
    "get_graph_guidelines",
    "Get the agent guidelines for the current graph. Returns user-defined instructions for AI agents. Use select_graph to switch graphs or see guidelines on first connection.",
    GetGuidelinesSchema,
    getGuidelines
  ),
  defineTool(
    "create_page",
    "Create a new page in Roam, optionally with markdown content.",
    CreatePageSchema,
    createPage
  ),
  defineTool(
    "create_block",
    "Create a new block under a parent, using markdown content. Supports nested bulleted lists - pass a markdown string with `- ` list items and indentation to create an entire block hierarchy in a single call.",
    CreateBlockSchema,
    createBlock
  ),
  defineTool(
    "update_block",
    "Update an existing block's content or properties.",
    UpdateBlockSchema,
    updateBlock
  ),
  defineTool(
    "delete_block",
    "Delete a block and all its children.",
    DeleteBlockSchema,
    deleteBlock
  ),
  defineTool(
    "move_block",
    "Move a block to a new location.",
    MoveBlockSchema,
    moveBlock
  ),
  defineTool(
    "delete_page",
    "Delete a page and all its contents.",
    DeletePageSchema,
    deletePage
  ),
  defineTool(
    "update_page",
    "Update a page's title or children view type. Set mergePages to true if renaming to a title that already exists.",
    UpdatePageSchema,
    updatePage
  ),
  defineTool(
    "search",
    "Search for pages and blocks by text. Returns paginated results with markdown content and optional breadcrumb paths.",
    SearchSchema,
    search
  ),
  defineTool(
    "search_templates",
    "Search Roam templates by name. When the user mentions 'my X template' or 'the X template', use this tool to find it. Templates are user-created reusable content blocks tagged with [[roam/templates]]. Returns template name, uid, and content as markdown.",
    SearchTemplatesSchema,
    searchTemplates
  ),
  defineTool(
    "roam_query",
    'Execute a Roam query ({{query: }} or {{[[query]]: }} blocks, NOT Datalog). Two modes: (1) UID mode - pass a block UID containing a query component to run it with saved settings/filters; (2) Query mode - pass a raw query string like "{and: [[TODO]] {not: [[DONE]]}}". Returns paginated results with markdown content.',
    QuerySchema,
    query
  ),
  defineTool(
    "get_page",
    "Get a page's content as markdown. Returns content with <roam> metadata tags containing UIDs - use these for follow-up operations but strip them when showing content to the user. Show remaining content verbatim, never paraphrase. Use maxDepth for large pages.",
    GetPageSchema,
    getPage
  ),
  defineTool(
    "get_block",
    "Get a block's content as markdown. Returns content with <roam> metadata tags containing UIDs - use these for follow-up operations but strip them when showing content to the user. Show remaining content verbatim, never paraphrase. Use maxDepth for large blocks.",
    GetBlockSchema,
    getBlock
  ),
  defineTool(
    "get_backlinks",
    "Get paginated backlinks (linked references) for a page or block, formatted as markdown. Returns total count and results with optional breadcrumb paths.",
    GetBacklinksSchema,
    getBacklinks
  ),
  defineTool(
    "get_open_windows",
    "Get the current view in the main window and all open sidebar windows.",
    GetOpenWindowsSchema,
    getOpenWindows
  ),
  defineTool(
    "get_selection",
    "Get the currently focused block and any multi-selected blocks.",
    GetSelectionSchema,
    getSelection
  ),
  defineTool(
    "open_main_window",
    "Navigate to a page or block in the main window.",
    OpenMainWindowSchema,
    openMainWindow
  ),
  defineTool(
    "open_sidebar",
    "Open a page or block in the right sidebar.",
    OpenSidebarSchema,
    openSidebar
  ),
  defineTool(
    "file_get",
    "Fetch a file hosted on Roam (handles decryption for encrypted graphs).",
    FileGetSchema,
    getFile
  ),
  defineTool(
    "file_upload",
    "Upload an image to Roam. Returns the Firebase storage URL. Usually you'll want to create a new block with the image as markdown: `![](url)`. Provide ONE of: filePath (preferred - local file, server reads directly), url (remote URL, server fetches), or base64 (raw data, fallback for sandboxed clients).",
    FileUploadSchema,
    uploadFile
  ),
  defineTool(
    "file_delete",
    "Delete a file hosted on Roam.",
    FileDeleteSchema,
    deleteFile
  ),
];

export const tools: ToolDefinition[] = [
  ...graphManagementTools,
  ...contentTools,
];

export function findTool(name: string): ToolDefinition | undefined {
  return tools.find((t) => t.name === name);
}

export async function routeToolCall(
  toolName: string,
  args: Record<string, unknown>
): Promise<CallToolResult> {
  const tool = findTool(toolName);
  if (!tool) {
    throw new Error(`Unknown tool: ${toolName}`);
  }

  // Validate and parse args with Zod
  const parsed = tool.schema.safeParse(args);
  if (!parsed.success) {
    throw new Error(`Invalid arguments: ${parsed.error.message}`);
  }

  // Handle standalone tools (graph management)
  if (tool.type === "standalone") {
    try {
      return await tool.action(parsed.data);
    } catch (error) {
      if (error instanceof RoamError) {
        return textResult({
          error: {
            code: error.code,
            message: error.message,
            ...(error.context || {}),
          },
        });
      }
      throw error;
    }
  }

  // Handle client tools (require graph resolution)
  try {
    // Extract graph from validated args and resolve it
    const { graph, ...restArgs } = parsed.data;
    const resolvedGraph = await resolveGraph(graph as string | undefined);
    const port = await getPort();

    // Create client with full config
    const client = new RoamClient({
      graphName: resolvedGraph.name,
      graphType: resolvedGraph.type,
      token: resolvedGraph.token,
      port,
    });

    return await tool.action(client, restArgs);
  } catch (error) {
    if (error instanceof RoamError) {
      return textResult({
        error: {
          code: error.code,
          message: error.message,
          ...(error.context || {}),
        },
      });
    }
    throw error;
  }
}
