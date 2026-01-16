// Roam API response types
export interface RoamResponse<T = unknown> {
  success: boolean;
  result?: T;
  error?: string;
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

// Focused block info
export interface FocusedBlock {
  "block-uid": string;
  "window-id": string;
}

// Search result
export interface SearchResult {
  uid: string;
  string?: string;
  title?: string;
}

// Client config
export interface RoamClientConfig {
  graphName?: string;
  port?: number;
}
