// Barrel export for @roam-research/roam-tools-core

// Types, schemas, error handling, and constants
export type {
  CallToolResult,
  TextContent,
  ImageContent,
  GraphType,
  AccessLevel,
  GraphConfig,
  RoamMcpConfig,
  ResolvedGraph,
  ErrorCode,
  RoamApiError,
  RoamResponse,
  RoamClientConfig,
  Block,
  Page,
  BlockLocation,
  WindowType,
  SidebarWindow,
  SidebarWindowInfo,
  FocusedBlock,
  SelectedBlock,
  MainWindowViewType,
  MainWindowView,
  SearchResultPath,
  SearchResult,
  SearchResponse,
  Template,
  QueryResult,
  QueryResponse,
  TokenInfoResponse,
  TokenInfoResult,
} from "./types.js";
export {
  GraphConfigSchema,
  RoamMcpConfigSchema,
  ErrorCodes,
  RoamError,
  CONFIG_VERSION,
  EXPECTED_API_VERSION,
  textResult,
  imageResult,
  errorResult,
  getErrorMessage,
} from "./types.js";

// Client
export { RoamClient } from "./client.js";

// Graph resolution and config management
export {
  getPort,
  resolveGraph,
  saveGraphToConfig,
  removeGraphFromConfig,
  updateGraphTokenStatus,
  getConfiguredGraphsSafe,
  getConfiguredGraphs,
  findGraphConfig,
  getMcpConfig,
  getOpenGraphs,
} from "./graph-resolver.js";

// Shared Roam API functions
export { fetchAvailableGraphs, requestToken, sleep, openRoamApp, slugify } from "./roam-api.js";
export type { AvailableGraph, GraphsResponse, TokenExchangeResponse } from "./roam-api.js";

// Tool definitions and routing
export { tools, findTool, routeToolCall } from "./tools.js";
export type { ToolDefinition, ClientToolDefinition, StandaloneToolDefinition } from "./tools.js";
