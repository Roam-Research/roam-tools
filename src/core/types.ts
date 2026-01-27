// Re-export MCP types for tool results
export type { CallToolResult, TextContent, ImageContent } from "@modelcontextprotocol/sdk/types.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

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

// API version this client expects (major.minor must match)
export const EXPECTED_API_VERSION = "1.0.0";

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

// Client config
export interface RoamClientConfig {
  graphName?: string;
  port?: number;
}
