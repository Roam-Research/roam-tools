// Re-export MCP types for tool results
export type { CallToolResult, TextContent, ImageContent } from "@modelcontextprotocol/sdk/types.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

// Helper to create a text result
export function textResult(value: unknown): CallToolResult {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return { content: [{ type: "text", text }] };
}

// Helper to create an image result
export function imageResult(data: string, mimeType: string): CallToolResult {
  return { content: [{ type: "image", data, mimeType }] };
}

// Helper to create an error result
export function errorResult(message: string): CallToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

// ============================================================================
// v2.0.0 Configuration Types
// ============================================================================

// Graph type: hosted (cloud) or offline (local)
export type GraphType = "hosted" | "offline";

// Access level type
export type AccessLevel = "read-only" | "read-append" | "full";

// Config file schema for ~/.roam-mcp.json
export const GraphConfigSchema = z.object({
  name: z.string().describe("Actual graph name in Roam"),
  type: z.enum(["hosted", "offline"]).default("hosted").describe("Graph type"),
  token: z.string().startsWith("roam-graph-local-token-").describe("Local API token"),
  nickname: z.string().describe("Human-friendly name for the graph"),
  accessLevel: z.enum(["read-only", "read-append", "full"]).optional().describe("Token access level"),
});
export type GraphConfig = z.infer<typeof GraphConfigSchema>;

export const RoamMcpConfigSchema = z.object({
  graphs: z.array(GraphConfigSchema).min(1, "At least one graph must be configured"),
});
export type RoamMcpConfig = z.infer<typeof RoamMcpConfigSchema>;

// Resolved graph info (returned by resolveGraph)
export interface ResolvedGraph {
  name: string;
  type: GraphType;
  token: string;
  nickname: string;
  accessLevel?: AccessLevel;
}

// ============================================================================
// Error Codes and Custom Errors
// ============================================================================

// Error codes from Local API and MCP-specific errors
export const ErrorCodes = {
  // 400 errors
  VERSION_MISMATCH: "VERSION_MISMATCH",
  VALIDATION_ERROR: "VALIDATION_ERROR",

  // 401 errors
  MISSING_TOKEN: "MISSING_TOKEN",
  INVALID_TOKEN_FORMAT: "INVALID_TOKEN_FORMAT",
  WRONG_GRAPH_TYPE: "WRONG_GRAPH_TYPE",
  TOKEN_NOT_FOUND: "TOKEN_NOT_FOUND",

  // 403 errors
  INSUFFICIENT_SCOPE: "INSUFFICIENT_SCOPE",
  SCOPE_EXCEEDS_PERMISSION: "SCOPE_EXCEEDS_PERMISSION",
  LOCAL_API_DISABLED: "LOCAL_API_DISABLED",
  USER_REJECTED: "USER_REJECTED",
  GRAPH_BLOCKED: "GRAPH_BLOCKED",

  // 404 errors
  UNKNOWN_ACTION: "UNKNOWN_ACTION",

  // 500 errors
  TOKEN_FILE_CORRUPTED: "TOKEN_FILE_CORRUPTED",
  INTERNAL_ERROR: "INTERNAL_ERROR",

  // MCP-specific errors (not from Local API)
  CONFIG_NOT_FOUND: "CONFIG_NOT_FOUND",
  GRAPH_NOT_CONFIGURED: "GRAPH_NOT_CONFIGURED",
  GRAPH_NOT_SELECTED: "GRAPH_NOT_SELECTED",
  CONNECTION_FAILED: "CONNECTION_FAILED",
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

// Custom error class with error code and optional context
export class RoamError extends Error {
  constructor(
    message: string,
    public readonly code?: ErrorCode,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = "RoamError";
  }
}

// ============================================================================
// API Types
// ============================================================================

// API version this client expects (major.minor must match)
export const EXPECTED_API_VERSION = "1.2.0";

// Roam API error structure
export interface RoamApiError {
  message: string;
  code?: string;
}

// Helper to extract error message from RoamResponse
export function getErrorMessage(error: string | RoamApiError | undefined): string {
  if (!error) return "Unknown error";
  if (typeof error === "string") return error;
  return error.message;
}

// Roam API response types
export interface RoamResponse<T = unknown> {
  success: boolean;
  result?: T;
  error?: string | RoamApiError;
  apiVersion?: string;
  expectedApiVersion?: string;
}

// Block types
export interface Block {
  uid: string;
  string: string;
  children?: Block[];
  open?: boolean;
  heading?: number;
  "text-align"?: "left" | "center" | "right" | "justify";
  "children-view-type"?: "bullet" | "numbered" | "document";
}

// Page types
export interface Page {
  uid: string;
  title: string;
  children?: Block[];
  "children-view-type"?: "bullet" | "numbered" | "document";
}

// Location for block operations
export interface BlockLocation {
  "parent-uid": string;
  order: number | "first" | "last";
}

// Window types for sidebar
export type WindowType = "mentions" | "block" | "outline" | "graph" | "search-query";

export interface SidebarWindow {
  type: WindowType;
  "block-uid"?: string;
  "search-query-str"?: string;
  order?: number;
}

// Sidebar window as returned by getWindows
export interface SidebarWindowInfo {
  type: WindowType;
  "window-id": string;
  "block-uid"?: string;
  "mentions-uid"?: string;
  "search-query-str"?: string;
  order?: number;
  "pinned-to-top?"?: boolean;
  collapsed?: boolean;
}

// Focused block info
export interface FocusedBlock {
  "block-uid": string;
  "window-id": string;
}

// Selected block info (from multi-select)
export interface SelectedBlock {
  "block-uid": string;
}

// Main window view types
export type MainWindowViewType =
  | "outline"
  | "log"
  | "graph"
  | "diagram"
  | "pdf"
  | "search"
  | "custom";

export interface MainWindowView {
  type: MainWindowViewType;
  uid?: string;
  title?: string;
  "block-string"?: string;
  id?: string;
  args?: unknown[];
}

// Search result path item
export interface SearchResultPath {
  uid: string;
  title: string;
}

// Search result
export interface SearchResult {
  uid: string;
  markdown: string;
  path: SearchResultPath[];
  type?: "page"; // Only present for page results
}

// Search response with pagination
export interface SearchResponse {
  total: number;
  results: SearchResult[];
}

// Template result
export interface Template {
  name: string;
  uid: string;
  content: string;
}

// Query result (from roamQuery)
export interface QueryResult {
  uid: string;
  markdown: string;
  path?: string;  // Breadcrumb path as string (e.g., "Page > Parent > ...")
  type?: "page";  // Only present for page results
}

// Query response with pagination
export interface QueryResponse {
  total: number;
  results: QueryResult[];
}

// Client config (v2.0.0 - requires token and type)
export interface RoamClientConfig {
  graphName: string;
  graphType: GraphType;
  token: string;
  port?: number;
}
