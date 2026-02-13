import { z } from "zod";
import type { CallToolResult, TokenInfoResponse, AccessLevel } from "./types.js";
import { RoamError, textResult } from "./types.js";
import { RoamClient } from "./client.js";
import { resolveGraph, getPort, updateGraphTokenStatus, PROJECT_ROOT } from "./graph-resolver.js";
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
import { ListGraphsSchema, listGraphs } from "./operations/graphs.js";

// Common schema for graph parameter (used by most tools)
const GraphSchema = z.object({
  graph: z.string().optional().describe("Graph nickname (optional - auto-selects if only one graph is configured)"),
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
    "List all configured graphs with their nicknames. Also provides setup instructions for connecting additional graphs.",
    ListGraphsSchema,
    listGraphs
  ),
];

// Note appended to all client tool descriptions
const GUIDELINES_NOTE = "\n\nNote: Call get_graph_guidelines first when starting to work with a graph.";

// Content Tools (require graph/client)
const contentTools: ClientToolDefinition[] = [
  defineTool(
    "get_graph_guidelines",
    "IMPORTANT: Call this tool first when starting to work with a graph, before performing any other operations. Returns user-defined instructions and preferences for AI agents. The user may have specified naming conventions, preferred structures, or constraints that should guide your behavior.",
    GetGuidelinesSchema,
    getGuidelines
  ),
  defineTool(
    "create_page",
    "Create a new page in Roam, optionally with markdown content." + GUIDELINES_NOTE,
    CreatePageSchema,
    createPage
  ),
  defineTool(
    "create_block",
    "Create a new block under a parent, using markdown content. Supports nested bulleted lists - pass a markdown string with `- ` list items and indentation to create an entire block hierarchy in a single call." + GUIDELINES_NOTE,
    CreateBlockSchema,
    createBlock
  ),
  defineTool(
    "update_block",
    "Update an existing block's content or properties." + GUIDELINES_NOTE,
    UpdateBlockSchema,
    updateBlock
  ),
  defineTool(
    "delete_block",
    "Delete a block and all its children." + GUIDELINES_NOTE,
    DeleteBlockSchema,
    deleteBlock
  ),
  defineTool(
    "move_block",
    "Move a block to a new location." + GUIDELINES_NOTE,
    MoveBlockSchema,
    moveBlock
  ),
  defineTool(
    "delete_page",
    "Delete a page and all its contents." + GUIDELINES_NOTE,
    DeletePageSchema,
    deletePage
  ),
  defineTool(
    "update_page",
    "Update a page's title or children view type. Set mergePages to true if renaming to a title that already exists." + GUIDELINES_NOTE,
    UpdatePageSchema,
    updatePage
  ),
  defineTool(
    "search",
    "Search for pages and blocks by text. Returns paginated results with markdown content and optional breadcrumb paths." + GUIDELINES_NOTE,
    SearchSchema,
    search
  ),
  defineTool(
    "search_templates",
    "Search Roam templates by name. When the user mentions 'my X template' or 'the X template', use this tool to find it. Templates are user-created reusable content blocks tagged with [[roam/templates]]. Returns template name, uid, and content as markdown." + GUIDELINES_NOTE,
    SearchTemplatesSchema,
    searchTemplates
  ),
  defineTool(
    "roam_query",
    'Execute a Roam query ({{query: }} or {{[[query]]: }} blocks, NOT Datalog). Two modes: (1) UID mode - pass a block UID containing a query component to run it with saved settings/filters; (2) Query mode - pass a raw query string like "{and: [[TODO]] {not: [[DONE]]}}". Returns paginated results with markdown content.' + GUIDELINES_NOTE,
    QuerySchema,
    query
  ),
  defineTool(
    "get_page",
    "Get a page's content as markdown. Returns content with <roam> metadata tags containing UIDs - use these for follow-up operations but strip them when showing content to the user. Show remaining content verbatim, never paraphrase. Use maxDepth for large pages." + GUIDELINES_NOTE,
    GetPageSchema,
    getPage
  ),
  defineTool(
    "get_block",
    "Get a block's content as markdown. Returns content with <roam> metadata tags containing UIDs - use these for follow-up operations but strip them when showing content to the user. Show remaining content verbatim, never paraphrase. Use maxDepth for large blocks." + GUIDELINES_NOTE,
    GetBlockSchema,
    getBlock
  ),
  defineTool(
    "get_backlinks",
    "Get paginated backlinks (linked references) for a page or block, formatted as markdown. Returns total count and results with optional breadcrumb paths." + GUIDELINES_NOTE,
    GetBacklinksSchema,
    getBacklinks
  ),
  defineTool(
    "get_open_windows",
    "Get the current view in the main window and all open sidebar windows." + GUIDELINES_NOTE,
    GetOpenWindowsSchema,
    getOpenWindows
  ),
  defineTool(
    "get_selection",
    "Get the currently focused block and any multi-selected blocks." + GUIDELINES_NOTE,
    GetSelectionSchema,
    getSelection
  ),
  defineTool(
    "open_main_window",
    "Navigate to a page or block in the main window." + GUIDELINES_NOTE,
    OpenMainWindowSchema,
    openMainWindow
  ),
  defineTool(
    "open_sidebar",
    "Open a page or block in the right sidebar." + GUIDELINES_NOTE,
    OpenSidebarSchema,
    openSidebar
  ),
  defineTool(
    "file_get",
    "Fetch a file hosted on Roam (handles decryption for encrypted graphs)." + GUIDELINES_NOTE,
    FileGetSchema,
    getFile
  ),
  defineTool(
    "file_upload",
    "Upload an image to Roam. Returns the Firebase storage URL. Usually you'll want to create a new block with the image as markdown: `![](url)`. Provide ONE of: filePath (preferred - local file, server reads directly), url (remote URL, server fetches), or base64 (raw data, fallback for sandboxed clients)." + GUIDELINES_NOTE,
    FileUploadSchema,
    uploadFile
  ),
  defineTool(
    "file_delete",
    "Delete a file hosted on Roam." + GUIDELINES_NOTE,
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

/**
 * Prepend graph nickname to a tool result.
 */
function prependGraphInfo(result: CallToolResult, nickname: string): CallToolResult {
  const prefix = `Roam graph: ${nickname}`;
  const content = result.content;

  if (!content || content.length === 0) return result;

  const first = content[0];
  if (first.type === "text") {
    return {
      ...result,
      content: [
        { ...first, text: `${prefix}\n\n${first.text}` },
        ...content.slice(1),
      ],
    };
  }

  // For image or other content types, prepend a text block
  return {
    ...result,
    content: [
      { type: "text", text: prefix },
      ...content,
    ],
  };
}

/**
 * Enrich a JSON text result with token info (accessLevel + scopes).
 */
function enrichResultWithTokenInfo(result: CallToolResult, info: TokenInfoResponse): CallToolResult {
  const first = result.content?.[0];
  if (!first || first.type !== "text") return result;
  try {
    const parsed = JSON.parse(first.text);
    parsed.accessLevel = info.grantedAccessLevel;
    parsed.scopes = info.grantedScopes;
    return {
      ...result,
      content: [{ ...first, text: JSON.stringify(parsed, null, 2) }, ...result.content.slice(1)],
    };
  } catch {
    return result;
  }
}

/**
 * Prepend a token revocation warning to the result.
 */
function enrichResultWithTokenStatus(result: CallToolResult, nickname: string): CallToolResult {
  const warning =
    `Roam graph: ${nickname}\n\n` +
    `WARNING: The token for this graph has been revoked.\n` +
    `Run the connect command to set up a new token:\n` +
    `  cd ${PROJECT_ROOT}\n` +
    `  npm run cli -- connect\n`;

  const first = result.content?.[0];
  if (first?.type === "text") {
    return {
      ...result,
      content: [{ ...first, text: warning + "\n" + first.text }, ...result.content.slice(1)],
    };
  }
  return {
    ...result,
    content: [{ type: "text", text: warning }, ...(result.content || [])],
  };
}

/**
 * Convert a RoamError into a structured error result with isError: true.
 */
function roamErrorResult(error: RoamError): CallToolResult {
  const errorPayload = {
    error: {
      code: error.code,
      message: error.message,
      ...(error.context || {}),
    },
  };
  return {
    content: [{ type: "text", text: JSON.stringify(errorPayload, null, 2) }],
    isError: true,
  };
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
        return roamErrorResult(error);
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

    // Special handling for get_graph_guidelines: sync token info in parallel
    if (tool.name === "get_graph_guidelines") {
      const [actionSettled, tokenInfoSettled] = await Promise.allSettled([
        tool.action(client, restArgs),
        client.getTokenInfo(),
      ]);

      // getTokenInfo() never throws, so always fulfilled
      const tokenInfoResult = tokenInfoSettled.status === "fulfilled"
        ? tokenInfoSettled.value
        : { status: "unknown" as const };

      // Handle revoked token FIRST (before examining action result)
      if (tokenInfoResult.status === "revoked") {
        try {
          await updateGraphTokenStatus(resolvedGraph.nickname, { tokenStatus: "revoked" });
        } catch {}

        const baseResult: CallToolResult = actionSettled.status === "fulfilled"
          ? actionSettled.value
          : actionSettled.reason instanceof RoamError
            ? roamErrorResult(actionSettled.reason)
            : { content: [{ type: "text", text: String(actionSettled.reason) }], isError: true };

        return enrichResultWithTokenStatus(baseResult, resolvedGraph.nickname);
      }

      // Not revoked — if action failed, propagate the original error
      if (actionSettled.status === "rejected") {
        throw actionSettled.reason;
      }

      const result = actionSettled.value;

      if (tokenInfoResult.status === "active") {
        const info = tokenInfoResult.info;
        // Validate access level before writing to prevent config corruption
        const validLevels: AccessLevel[] = ["read-only", "read-append", "full"];
        const level = validLevels.includes(info.grantedAccessLevel as AccessLevel)
          ? (info.grantedAccessLevel as AccessLevel)
          : undefined;
        try {
          await updateGraphTokenStatus(resolvedGraph.nickname, {
            ...(level ? { accessLevel: level } : {}),
            tokenStatus: "active",
          });
        } catch {}

        if (!result.isError) {
          const enriched = enrichResultWithTokenInfo(result, info);
          return prependGraphInfo(enriched, resolvedGraph.nickname);
        }
        return result;
      }

      // status === "unknown" — proceed without enrichment
      if (!result.isError) {
        return prependGraphInfo(result, resolvedGraph.nickname);
      }
      return result;
    }

    // Normal flow for all other tools
    const result = await tool.action(client, restArgs);

    // Prepend graph info to successful responses
    if (!result.isError) {
      return prependGraphInfo(result, resolvedGraph.nickname);
    }
    return result;
  } catch (error) {
    if (error instanceof RoamError) {
      return roamErrorResult(error);
    }
    throw error;
  }
}
