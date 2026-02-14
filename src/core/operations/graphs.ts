// src/core/operations/graphs.ts
// Graph management operations

import { z } from "zod";
import type { CallToolResult } from "../types.js";
import { textResult, RoamError } from "../types.js";
import { getConfiguredGraphs, PROJECT_ROOT } from "../graph-resolver.js";

// ============================================================================
// Schemas
// ============================================================================

export const ListGraphsSchema = z.object({});

// ============================================================================
// Types
// ============================================================================

export type ListGraphsParams = z.infer<typeof ListGraphsSchema>;

// ============================================================================
// Operations
// ============================================================================

/**
 * List all configured graphs with their nicknames.
 */
export async function listGraphs(): Promise<CallToolResult> {
  try {
    const graphs = await getConfiguredGraphs();
    return textResult({
      graphs,
      instruction: "Pass the 'nickname' value as the graph parameter. Before operating on a graph, call get_graph_guidelines to understand its conventions.",
      setup: `To connect additional graphs, the user should run:\n  cd ${PROJECT_ROOT} && npm run cli -- connect\nAfter connecting, try your request again.`,
    });
  } catch (error) {
    if (error instanceof RoamError) {
      return textResult({
        error: {
          code: error.code,
          message: error.message,
        },
      });
    }
    throw error;
  }
}
