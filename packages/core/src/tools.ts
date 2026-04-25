import { z } from "zod";
import type {
  CallToolResult,
  TokenInfoResponse,
  AccessLevel,
  RoamActionClient,
  ToolGraph,
  ResolvedGraph,
} from "./types.js";
import { RoamError, ErrorCodes } from "./types.js";
import { RoamClient } from "./client.js";
import { resolveGraph, getPort, updateGraphTokenStatus } from "./graph-resolver.js";
import {
  CreatePageSchema,
  GetPageSchema,
  DeletePageSchema,
  UpdatePageSchema,
  GetGuidelinesSchema,
  createPage,
  getPage,
  deletePage,
  updatePage,
  getGuidelines,
} from "./operations/pages.js";
import {
  CreateBlockSchema,
  GetBlockSchema,
  UpdateBlockSchema,
  DeleteBlockSchema,
  MoveBlockSchema,
  GetBacklinksSchema,
  AddCommentSchema,
  GetCommentsSchema,
  createBlock,
  getBlock,
  updateBlock,
  deleteBlock,
  moveBlock,
  getBacklinks,
  addComment,
  getComments,
} from "./operations/blocks.js";
import {
  SearchSchema,
  SearchTemplatesSchema,
  search,
  searchTemplates,
} from "./operations/search.js";
import { QuerySchema, query } from "./operations/query.js";
import { DatalogQuerySchema, datalogQuery } from "./operations/datalog.js";
import {
  GetOpenWindowsSchema,
  GetSelectionSchema,
  OpenMainWindowSchema,
  OpenSidebarSchema,
  getOpenWindows,
  getSelection,
  openMainWindow,
  openSidebar,
} from "./operations/navigation.js";
import {
  FileGetSchema,
  FileUploadSchema,
  FileDeleteSchema,
  getFile,
  uploadFile,
  deleteFile,
} from "./operations/files.js";
import {
  ListGraphsSchema,
  SetupNewGraphSchema,
  listGraphs,
  setupNewGraph,
} from "./operations/graphs.js";

// Common schema for graph parameter (used by most tools)
const GraphSchema = z.object({
  graph: z
    .string()
    .optional()
    .describe("Graph nickname or name (optional - auto-selects if only one graph is configured)"),
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
  action: (client: RoamActionClient, args: unknown) => Promise<CallToolResult>;
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
  name: string,
  description: string,
  schema: z.ZodObject<T>,
  action: (client: RoamActionClient, args: z.infer<z.ZodObject<T>>) => Promise<CallToolResult>,
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
  name: string,
  description: string,
  schema: z.ZodObject<T>,
  action: (args: z.infer<z.ZodObject<T>>) => Promise<CallToolResult>,
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
export const graphManagementTools: StandaloneToolDefinition[] = [
  defineStandaloneTool(
    "list_graphs",
    "List all configured graphs with their nicknames. Also provides setup instructions for connecting additional graphs.",
    ListGraphsSchema,
    listGraphs,
  ),
  defineStandaloneTool(
    "setup_new_graph",
    "Set up a new Roam graph for access, or list available graphs. Call without arguments to see which graphs are available in Roam Desktop. Call with graph and nickname to connect a specific graph — ask the user what they'd like to call the graph before choosing a nickname. The user will see an approval dialog in Roam desktop app and must approve the token request. If the graph is already configured, returns the existing configuration without making changes.",
    SetupNewGraphSchema,
    setupNewGraph,
  ),
];

// Note appended to all client tool descriptions
const GUIDELINES_NOTE =
  "\n\nNote: Call get_graph_guidelines first when starting to work with a graph.";

// Data Tools (require graph/client; reusable across local + hosted MCP transports)
export const dataTools: ClientToolDefinition[] = [
  defineTool(
    "get_graph_guidelines",
    "IMPORTANT: Call this tool first when starting to work with a graph, before performing any other operations. Returns user-defined instructions and preferences for AI agents. The user may have specified naming conventions, preferred structures, or constraints that should guide your behavior. After receiving the response, follow the nextSteps field — it contains orientation actions you should take before proceeding.",
    GetGuidelinesSchema,
    getGuidelines,
  ),
  defineTool(
    "create_page",
    "Create a new page in Roam, optionally with markdown content." + GUIDELINES_NOTE,
    CreatePageSchema,
    createPage,
  ),
  defineTool(
    "create_block",
    "Create blocks from markdown content. Target by parentUid, pageTitle, or dailyNotePage (page created if needed). Use nestUnder to insert under a specific child block. Supports nested bulleted lists via markdown indentation." +
      GUIDELINES_NOTE,
    CreateBlockSchema,
    createBlock,
  ),
  defineTool(
    "update_block",
    "Update an existing block's content or properties." + GUIDELINES_NOTE,
    UpdateBlockSchema,
    updateBlock,
  ),
  defineTool(
    "delete_block",
    "Delete a block and all its children." + GUIDELINES_NOTE,
    DeleteBlockSchema,
    deleteBlock,
  ),
  defineTool(
    "move_block",
    "Move a block to a new location." + GUIDELINES_NOTE,
    MoveBlockSchema,
    moveBlock,
  ),
  defineTool(
    "add_comment",
    "Add a comment to a block (comment thread, NOT a child block). Prefer `comment` for simple text; use `commentMarkdown` for structured content. Same-day calls on the same block append to your existing comment." +
      GUIDELINES_NOTE,
    AddCommentSchema,
    addComment,
  ),
  defineTool(
    "get_comments",
    "Get comments on a block with author, timestamps, and edit info. If singleEditableUid is set, the comment can be edited with update_block. Only works for blocks, not pages." +
      GUIDELINES_NOTE,
    GetCommentsSchema,
    getComments,
  ),
  defineTool(
    "delete_page",
    "Delete a page and all its contents." + GUIDELINES_NOTE,
    DeletePageSchema,
    deletePage,
  ),
  defineTool(
    "update_page",
    "Update a page's title or children view type. Set mergePages to true if renaming to a title that already exists." +
      GUIDELINES_NOTE,
    UpdatePageSchema,
    updatePage,
  ),
  defineTool(
    "search",
    "Search for pages and blocks by text. Returns paginated results with markdown content and optional breadcrumb paths. Call with an empty query to get recently edited and viewed content — useful for understanding what the user is currently working on." +
      GUIDELINES_NOTE,
    SearchSchema,
    search,
  ),
  defineTool(
    "search_templates",
    "Search Roam templates by name. When the user mentions 'my X template' or 'the X template', use this tool to find it. Templates are user-created reusable content blocks tagged with [[roam/templates]]. Returns template name, uid, and content as markdown." +
      GUIDELINES_NOTE,
    SearchTemplatesSchema,
    searchTemplates,
  ),
  defineTool(
    "roam_query",
    'Execute a Roam query ({{query: }} or {{[[query]]: }} blocks, NOT Datalog). Two modes: (1) UID mode - pass a block UID containing a query component to run it with saved settings/filters; (2) Query mode - pass a raw query string like "{and: [[TODO]] {not: [[DONE]]}}". Returns paginated results with markdown content.' +
      GUIDELINES_NOTE,
    QuerySchema,
    query,
  ),
  defineTool(
    "datalog_query",
    "Execute a datomic-style datalog query against the graph's datascript database. Supported clauses: :find, :where, :in, and :timeout (ms). Inputs are positional parameters bound to :in variables after $. Write specific :where clauses to keep results bounded." +
      GUIDELINES_NOTE,
    DatalogQuerySchema,
    datalogQuery,
  ),
  defineTool(
    "get_page",
    "Get a page's content as markdown. Returns content with <roam> metadata tags containing UIDs - use these for follow-up operations but strip them when showing content to the user. Show remaining content verbatim, never paraphrase. Use maxDepth for large pages." +
      GUIDELINES_NOTE,
    GetPageSchema,
    getPage,
  ),
  defineTool(
    "get_block",
    "Get a block's content as markdown. Returns content with <roam> metadata tags containing UIDs - use these for follow-up operations but strip them when showing content to the user. Show remaining content verbatim, never paraphrase. Use maxDepth for large blocks." +
      GUIDELINES_NOTE,
    GetBlockSchema,
    getBlock,
  ),
  defineTool(
    "get_backlinks",
    "Get paginated backlinks (linked references) for a page or block, formatted as markdown. Returns total count and results with optional breadcrumb paths." +
      GUIDELINES_NOTE,
    GetBacklinksSchema,
    getBacklinks,
  ),
];

// Desktop UI Tools (require local Roam Desktop — file ops + window/selection introspection;
// hosted MCP omits these because the parameters/effects assume a local environment).
export const desktopUiTools: ClientToolDefinition[] = [
  defineTool(
    "get_open_windows",
    "Get the current view in the main window and all open sidebar windows." + GUIDELINES_NOTE,
    GetOpenWindowsSchema,
    getOpenWindows,
  ),
  defineTool(
    "get_selection",
    "Get the currently focused block and any multi-selected blocks." + GUIDELINES_NOTE,
    GetSelectionSchema,
    getSelection,
  ),
  defineTool(
    "open_main_window",
    "Navigate to a page or block in the main window." + GUIDELINES_NOTE,
    OpenMainWindowSchema,
    openMainWindow,
  ),
  defineTool(
    "open_sidebar",
    "Open a page or block in the right sidebar." + GUIDELINES_NOTE,
    OpenSidebarSchema,
    openSidebar,
  ),
  defineTool(
    "file_get",
    "Fetch a file hosted on Roam (handles decryption for encrypted graphs)." + GUIDELINES_NOTE,
    FileGetSchema,
    getFile,
  ),
  defineTool(
    "file_upload",
    "Upload a file to Roam. Returns the Firebase storage URL. Usually you'll want to create a new block with the file as markdown: `![](url)`. Provide ONE of: filePath (preferred - local file, server reads directly), url (remote URL, server fetches), or base64 (raw data, fallback for sandboxed clients)." +
      GUIDELINES_NOTE,
    FileUploadSchema,
    uploadFile,
  ),
  defineTool(
    "file_delete",
    "Delete a file hosted on Roam." + GUIDELINES_NOTE,
    FileDeleteSchema,
    deleteFile,
  ),
];

// Backwards-compatible aggregate of all client tools.
export const contentTools: ClientToolDefinition[] = [...dataTools, ...desktopUiTools];

export const tools: ToolDefinition[] = [...graphManagementTools, ...contentTools];

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
      content: [{ ...first, text: `${prefix}\n\n${first.text}` }, ...content.slice(1)],
    };
  }

  // For image or other content types, prepend a text block
  return {
    ...result,
    content: [{ type: "text", text: prefix }, ...content],
  };
}

/**
 * Enrich a JSON text result with token info (accessLevel + scopes).
 */
function enrichResultWithTokenInfo(
  result: CallToolResult,
  info: TokenInfoResponse,
): CallToolResult {
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
    `Call setup_new_graph with this graph's name to request a new token.\n`;

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

// ============================================================================
// Default injection points for routeToolCall. Overridable via RouteToolCallOptions
// to support hosted MCP transports (e.g., RoamCloudClient + WorkOS-backed resolver).
// ============================================================================

async function defaultResolveGraph(graph?: string): Promise<ResolvedGraph> {
  return resolveGraph(graph);
}

async function defaultCreateClient(graph: ToolGraph): Promise<RoamActionClient> {
  if (!graph.token) {
    throw new RoamError(
      "Local createClient requires graph.token. " +
        "If you injected a custom resolveGraph that omits token, also inject createClient.",
      ErrorCodes.INTERNAL_ERROR,
    );
  }
  const port = await getPort();
  return new RoamClient({
    graphName: graph.name,
    graphType: graph.type,
    token: graph.token,
    port,
  });
}

export interface RouteToolCallOptions {
  /** Override graph resolution. Default: read ~/.roam-tools.json. */
  resolveGraph?: (providedGraph?: string) => Promise<ToolGraph>;
  /**
   * Override client construction. Default: local RoamClient via getPort().
   * Should be paired with resolveGraph (the default createClient requires graph.token,
   * which a custom resolveGraph may omit).
   */
  createClient?: (graph: ToolGraph) => Promise<RoamActionClient> | RoamActionClient;
  /**
   * Override standalone tool handlers (e.g., hosted list_graphs reads grants from a
   * remote store instead of disk). Tools not present here fall back to local handlers.
   */
  standaloneHandlers?: Partial<Record<string, (args: unknown) => Promise<CallToolResult>>>;
  /**
   * "local-sync" (default) runs the desktop token-info side-flow on get_graph_guidelines:
   * parallel getTokenInfo, access-level validation, config writes, and result enrichment.
   * "skip" disables that side-flow entirely. Graph-name prefix (prependGraphInfo) is
   * unaffected by this mode and runs in both.
   */
  tokenInfoMode?: "local-sync" | "skip";
  /**
   * Only consulted in local-sync mode. Default: write to ~/.roam-tools.json via
   * updateGraphTokenStatus. Hosted callers can swap to write to their own store.
   */
  onTokenStatusUpdate?: (
    nickname: string,
    patch: { accessLevel?: AccessLevel; lastKnownTokenStatus?: "active" | "revoked" },
  ) => Promise<void>;
}

export async function routeToolCall(
  toolName: string,
  args: Record<string, unknown>,
  options: RouteToolCallOptions = {},
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

  // Handle standalone tools (graph management). Hosted callers can override
  // individual handlers via options.standaloneHandlers.
  if (tool.type === "standalone") {
    const handler = options.standaloneHandlers?.[tool.name] ?? tool.action;
    try {
      return await handler(parsed.data);
    } catch (error) {
      if (error instanceof RoamError) {
        return roamErrorResult(error);
      }
      throw error;
    }
  }

  // Resolve injection points (or fall back to defaults).
  const resolve = options.resolveGraph ?? defaultResolveGraph;
  const createClient = options.createClient ?? defaultCreateClient;
  const tokenInfoMode = options.tokenInfoMode ?? "local-sync";
  const updateTokenStatus = options.onTokenStatusUpdate ?? updateGraphTokenStatus;

  // Handle client tools (require graph + client)
  try {
    const { graph: graphArg, ...restArgs } = parsed.data;
    const graph = await resolve(graphArg as string | undefined);
    const client = await createClient(graph);

    // Special handling for get_graph_guidelines: sync token info in parallel.
    // Only fires in local-sync mode AND when the client implements getTokenInfo.
    // Bind early so TS narrows the optional method through the truthy check.
    const getTokenInfoFn = client.getTokenInfo?.bind(client);
    if (tool.name === "get_graph_guidelines" && tokenInfoMode === "local-sync" && getTokenInfoFn) {
      // In local-sync mode the default resolver returns ResolvedGraph (with
      // lastKnownTokenStatus). A custom resolver here is unusual; if it omits
      // the field, the read returns undefined and behavior is identical.
      const resolvedGraph = graph as ResolvedGraph;

      const [actionSettled, tokenInfoSettled] = await Promise.allSettled([
        tool.action(client, restArgs),
        getTokenInfoFn(),
      ]);

      // getTokenInfo() never throws, so always fulfilled
      const tokenInfoResult =
        tokenInfoSettled.status === "fulfilled"
          ? tokenInfoSettled.value
          : { status: "unknown" as const };

      // Handle revoked token FIRST (before examining action result)
      if (tokenInfoResult.status === "revoked") {
        if (resolvedGraph.lastKnownTokenStatus !== "revoked") {
          try {
            await updateTokenStatus(resolvedGraph.nickname, {
              lastKnownTokenStatus: "revoked",
            });
          } catch {
            // best-effort status update
          }
        }

        const baseResult: CallToolResult =
          actionSettled.status === "fulfilled"
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
        // Only write to config if something actually changed
        const accessLevelChanged = level && resolvedGraph.accessLevel !== level;
        const tokenStatusChanged = resolvedGraph.lastKnownTokenStatus !== "active";
        if (accessLevelChanged || tokenStatusChanged) {
          try {
            await updateTokenStatus(resolvedGraph.nickname, {
              ...(accessLevelChanged ? { accessLevel: level } : {}),
              lastKnownTokenStatus: "active",
            });
          } catch {
            // best-effort status update
          }
        }

        if (!result.isError) {
          const enriched = enrichResultWithTokenInfo(result, info);
          return prependGraphInfo(enriched, resolvedGraph.nickname);
        }
        return result;
      }

      // status === "unknown" — action succeeded, so token isn't revoked; clear stale status
      if (resolvedGraph.lastKnownTokenStatus !== "active") {
        try {
          await updateTokenStatus(resolvedGraph.nickname, { lastKnownTokenStatus: "active" });
        } catch {
          // best-effort status update
        }
      }
      if (!result.isError) {
        return prependGraphInfo(result, resolvedGraph.nickname);
      }
      return result;
    }

    // Normal flow for all other tools (and get_graph_guidelines when token-info
    // sync is skipped or unavailable). Graph-name prefix runs in both modes.
    const result = await tool.action(client, restArgs);
    if (!result.isError) {
      return prependGraphInfo(result, graph.nickname);
    }
    return result;
  } catch (error) {
    if (error instanceof RoamError) {
      return roamErrorResult(error);
    }
    throw error;
  }
}
