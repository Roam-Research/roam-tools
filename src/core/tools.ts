import { z } from "zod";
import type { CallToolResult } from "./types.js";
import { RoamClient } from "./client.js";
import { resolveGraph } from "./graph-resolver.js";
import {
  CreatePageSchema, GetPageSchema, DeletePageSchema, UpdatePageSchema, GetGuidelinesSchema,
  createPage, getPage, deletePage, updatePage, getGuidelines,
} from "./operations/pages.js";
import {
  CreateBlockSchema, GetBlockSchema, UpdateBlockSchema, DeleteBlockSchema, MoveBlockSchema, GetBacklinksSchema,
  createBlock, getBlock, updateBlock, deleteBlock, moveBlock, getBacklinks,
} from "./operations/blocks.js";
import {
  SearchSchema, SearchTemplatesSchema,
  search, searchTemplates,
} from "./operations/search.js";
import {
  QuerySchema,
  query,
} from "./operations/query.js";
import {
  GetOpenWindowsSchema, GetSelectionSchema, OpenMainWindowSchema, OpenSidebarSchema,
  getOpenWindows, getSelection, openMainWindow, openSidebar,
} from "./operations/navigation.js";
import {
  FileGetSchema, FileUploadSchema, FileDeleteSchema,
  getFile, uploadFile, deleteFile,
} from "./operations/files.js";

// Common schema for graph parameter (used by all tools)
const GraphSchema = z.object({
  graph: z.string().optional().describe("Graph name (optional - auto-detects if omitted)"),
});

// Helper to extend any schema with graph parameter
function withGraph<T extends z.ZodRawShape>(schema: z.ZodObject<T>) {
  return schema.extend(GraphSchema.shape);
}

// Tool definition with Zod schema
export interface ToolDefinition {
  name: string;
  description: string;
  schema: z.ZodObject<z.ZodRawShape>;
  action: (client: RoamClient, args: unknown) => Promise<CallToolResult>;
}

// Helper to create tool with graph parameter
function defineTool<T extends z.ZodRawShape>(
  name: string,
  description: string,
  schema: z.ZodObject<T>,
  action: (client: RoamClient, args: z.infer<z.ZodObject<T>>) => Promise<CallToolResult>
): ToolDefinition {
  return {
    name,
    description,
    schema: withGraph(schema),
    action: (client, args) => action(client, args as z.infer<z.ZodObject<T>>),
  };
}

export const tools: ToolDefinition[] = [
  defineTool(
    "get_graph_guidelines",
    "IMPORTANT: Call this tool first when starting to work with a graph. Returns user-defined instructions and preferences for AI agents operating on this graph. The user may have specified important context, naming conventions, or constraints that should guide your behavior.",
    GetGuidelinesSchema,
    getGuidelines
  ),
  defineTool(
    "create_page",
    "Create a new page in Roam, optionally with markdown content. Note: Call get_graph_guidelines first when starting to work with a graph.",
    CreatePageSchema,
    createPage
  ),
  defineTool(
    "create_block",
    "Create a new block under a parent, using markdown content. Supports nested bulleted lists - pass a markdown string with `- ` list items and indentation to create an entire block hierarchy in a single call. Note: Call get_graph_guidelines first when starting to work with a graph.",
    CreateBlockSchema,
    createBlock
  ),
  defineTool(
    "update_block",
    "Update an existing block's content or properties. Note: Call get_graph_guidelines first when starting to work with a graph.",
    UpdateBlockSchema,
    updateBlock
  ),
  defineTool(
    "delete_block",
    "Delete a block and all its children. Note: Call get_graph_guidelines first when starting to work with a graph.",
    DeleteBlockSchema,
    deleteBlock
  ),
  defineTool(
    "move_block",
    "Move a block to a new location. Note: Call get_graph_guidelines first when starting to work with a graph.",
    MoveBlockSchema,
    moveBlock
  ),
  defineTool(
    "delete_page",
    "Delete a page and all its contents. Note: Call get_graph_guidelines first when starting to work with a graph.",
    DeletePageSchema,
    deletePage
  ),
  defineTool(
    "update_page",
    "Update a page's title or children view type. Set mergePages to true if renaming to a title that already exists. Note: Call get_graph_guidelines first when starting to work with a graph.",
    UpdatePageSchema,
    updatePage
  ),
  defineTool(
    "search",
    "Search for pages and blocks by text. Returns paginated results with markdown content and optional breadcrumb paths. Note: Call get_graph_guidelines first when starting to work with a graph.",
    SearchSchema,
    search
  ),
  defineTool(
    "search_templates",
    "Search Roam templates by name. When the user mentions 'my X template' or 'the X template', use this tool to find it. Templates are user-created reusable content blocks tagged with [[roam/templates]]. Returns template name, uid, and content as markdown. Note: Call get_graph_guidelines first when starting to work with a graph.",
    SearchTemplatesSchema,
    searchTemplates
  ),
  defineTool(
    "roam_query",
    "Execute a Roam query ({{query: }} or {{[[query]]: }} blocks, NOT Datalog). Two modes: (1) UID mode - pass a block UID containing a query component to run it with saved settings/filters; (2) Query mode - pass a raw query string like \"{and: [[TODO]] {not: [[DONE]]}}\". Returns paginated results with markdown content. Note: Call get_graph_guidelines first when starting to work with a graph.",
    QuerySchema,
    query
  ),
  defineTool(
    "get_page",
    "Get a page's content as markdown. Returns content with <roam> metadata tags containing UIDs - use these for follow-up operations but strip them when showing content to the user. Show remaining content verbatim, never paraphrase. Use maxDepth for large pages. Note: Call get_graph_guidelines first when starting to work with a graph.",
    GetPageSchema,
    getPage
  ),
  defineTool(
    "get_block",
    "Get a block's content as markdown. Returns content with <roam> metadata tags containing UIDs - use these for follow-up operations but strip them when showing content to the user. Show remaining content verbatim, never paraphrase. Use maxDepth for large blocks. Note: Call get_graph_guidelines first when starting to work with a graph.",
    GetBlockSchema,
    getBlock
  ),
  defineTool(
    "get_backlinks",
    "Get paginated backlinks (linked references) for a page or block, formatted as markdown. Returns total count and results with optional breadcrumb paths. Note: Call get_graph_guidelines first when starting to work with a graph.",
    GetBacklinksSchema,
    getBacklinks
  ),
  defineTool(
    "get_open_windows",
    "Get the current view in the main window and all open sidebar windows. Note: Call get_graph_guidelines first when starting to work with a graph.",
    GetOpenWindowsSchema,
    getOpenWindows
  ),
  defineTool(
    "get_selection",
    "Get the currently focused block and any multi-selected blocks. Note: Call get_graph_guidelines first when starting to work with a graph.",
    GetSelectionSchema,
    getSelection
  ),
  defineTool(
    "open_main_window",
    "Navigate to a page or block in the main window. Note: Call get_graph_guidelines first when starting to work with a graph.",
    OpenMainWindowSchema,
    openMainWindow
  ),
  defineTool(
    "open_sidebar",
    "Open a page or block in the right sidebar. Note: Call get_graph_guidelines first when starting to work with a graph.",
    OpenSidebarSchema,
    openSidebar
  ),
  defineTool(
    "file_get",
    "Fetch a file hosted on Roam (handles decryption for encrypted graphs). Note: Call get_graph_guidelines first when starting to work with a graph.",
    FileGetSchema,
    getFile
  ),
  defineTool(
    "file_upload",
    "Upload an image to Roam. Returns the Firebase storage URL. Usually you'll want to create a new block with the image as markdown: `![](url)`. Provide ONE of: filePath (preferred - local file, server reads directly), url (remote URL, server fetches), or base64 (raw data, fallback for sandboxed clients). Note: Call get_graph_guidelines first when starting to work with a graph.",
    FileUploadSchema,
    uploadFile
  ),
  defineTool(
    "file_delete",
    "Delete a file hosted on Roam. Note: Call get_graph_guidelines first when starting to work with a graph.",
    FileDeleteSchema,
    deleteFile
  ),
];

// Find a tool by name
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

  // Extract graph from validated args and resolve it
  const { graph, ...restArgs } = parsed.data;
  const resolvedGraph = await resolveGraph(graph as string | undefined);

  // Create client for this call
  const client = new RoamClient({ graphName: resolvedGraph });

  return tool.action(client, restArgs);
}
