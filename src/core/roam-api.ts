// src/core/roam-api.ts
// Shared API functions for interacting with Roam's local API.
// Used by both the CLI (connect command) and the MCP tool (setup_new_graph).

import open from "open";
import type { GraphType } from "./types.js";

// ============================================================================
// Types
// ============================================================================

export interface AvailableGraph {
  name: string;
  type: GraphType;
}

export interface GraphsResponse {
  success: boolean;
  result?: AvailableGraph[];
  error?: string;
}

export interface TokenExchangeResponse {
  success: boolean;
  token?: string;
  graphName?: string;
  graphType?: GraphType;
  grantedAccessLevel?: string;
  grantedScopes?: { read?: boolean; append?: boolean; edit?: boolean };
  error?: { code?: string; message?: string } | string;
}

// ============================================================================
// API Functions
// ============================================================================

export async function fetchAvailableGraphs(
  port: number
): Promise<AvailableGraph[]> {
  const url = `http://127.0.0.1:${port}/api/graphs/available`;
  const response = await fetch(url, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });

  const data = (await response.json()) as GraphsResponse;

  if (!data.success) {
    throw new Error(data.error || "Failed to get available graphs");
  }

  return data.result || [];
}

export async function requestToken(
  port: number,
  graph: string,
  graphType: GraphType,
  accessLevel: string
): Promise<TokenExchangeResponse> {
  const url = `http://127.0.0.1:${port}/api/graphs/tokens/request`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      graph,
      graphType,
      description: "roam-mcp CLI",
      accessLevel,
      ai: true,
    }),
  });

  return (await response.json()) as TokenExchangeResponse;
}

// ============================================================================
// Helpers
// ============================================================================

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function openRoamApp(): Promise<void> {
  await open("roam://open");
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .replace(/-{2,}/g, "-");
}
