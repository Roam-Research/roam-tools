// src/core/operations/graphs.ts
// Graph management operations for v2.0.0

import { z } from "zod";
import { createHash } from "crypto";
import type { CallToolResult } from "../types.js";
import { textResult, RoamError, ErrorCodes } from "../types.js";
import { RoamClient } from "../client.js";
import {
  getMcpConfig,
  findGraphConfig,
  getConfiguredGraphs,
  getSelectedGraph,
  setSelectedGraph,
  getPort,
} from "../graph-resolver.js";

// ============================================================================
// Schemas
// ============================================================================

export const ListGraphsSchema = z.object({});

export const SelectGraphSchema = z.object({
  graph: z.string().describe("Graph nickname or name to select"),
});

export const CurrentGraphSchema = z.object({});

// ============================================================================
// Types
// ============================================================================

export type ListGraphsParams = z.infer<typeof ListGraphsSchema>;
export type SelectGraphParams = z.infer<typeof SelectGraphSchema>;
export type CurrentGraphParams = z.infer<typeof CurrentGraphSchema>;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Compute a short hash of guidelines for caching purposes
 */
function computeGuidelinesHash(guidelines: string): string {
  const hash = createHash("sha256").update(guidelines).digest("hex");
  return `sha256:${hash.substring(0, 12)}`;
}

// ============================================================================
// Operations
// ============================================================================

/**
 * List all configured graphs with their nicknames.
 * Does not require a graph to be selected.
 */
export async function listGraphs(): Promise<CallToolResult> {
  try {
    const graphs = await getConfiguredGraphs();
    return textResult({ graphs });
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

/**
 * Select a graph for the current session.
 * Validates reachability by calling the API and returns graph guidelines.
 */
export async function selectGraph(
  params: SelectGraphParams
): Promise<CallToolResult> {
  // 1. Find graph config by nickname or name
  const graphConfig = await findGraphConfig(params.graph);

  if (!graphConfig) {
    const availableGraphs = await getConfiguredGraphs();
    return textResult({
      error: {
        code: ErrorCodes.GRAPH_NOT_CONFIGURED,
        message: `Graph "${params.graph}" not found in config.`,
        available_graphs: availableGraphs,
        suggested_next_tool: "list_graphs",
      },
    });
  }

  // 2. Create client and validate reachability by calling API
  const port = await getPort();
  const client = new RoamClient({
    graphName: graphConfig.name,
    graphType: graphConfig.type,
    token: graphConfig.token,
    port,
  });

  try {
    const response = await client.call<string | null>(
      "data.ai.getGraphGuidelines",
      []
    );

    // 3. Set session state on success
    const resolvedGraph = {
      name: graphConfig.name,
      type: graphConfig.type,
      token: graphConfig.token,
      nickname: graphConfig.nickname,
      accessLevel: graphConfig.accessLevel,
    };
    setSelectedGraph(resolvedGraph);

    // 4. Return success with metadata and guidelines
    const guidelines = response.result ?? null;
    return textResult({
      graph_name: graphConfig.name,
      nickname: graphConfig.nickname,
      accessLevel: graphConfig.accessLevel || "full",
      guidelines: guidelines,
      guidelines_hash: guidelines ? computeGuidelinesHash(guidelines) : null,
    });
  } catch (error) {
    // Graph unreachable or token invalid
    const message = error instanceof Error ? error.message : String(error);
    const code =
      error instanceof RoamError ? error.code : ErrorCodes.CONNECTION_FAILED;

    return textResult({
      error: {
        code,
        message: `Failed to select graph "${params.graph}": ${message}`,
      },
    });
  }
}

/**
 * Get the currently selected graph and its metadata.
 * Returns an error if no graph is selected.
 */
export async function currentGraph(): Promise<CallToolResult> {
  const selected = getSelectedGraph();

  if (selected) {
    return textResult({
      graph_name: selected.name,
      nickname: selected.nickname,
      accessLevel: selected.accessLevel || "full",
    });
  }

  // No graph selected - return structured error
  try {
    const availableGraphs = await getConfiguredGraphs();
    return textResult({
      error: {
        code: ErrorCodes.GRAPH_NOT_SELECTED,
        message: "No graph selected. Use select_graph or list_graphs first.",
        available_graphs: availableGraphs,
        suggested_next_tool: "select_graph",
      },
    });
  } catch (error) {
    // Config not found
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
