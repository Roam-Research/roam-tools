// src/core/operations/graphs.ts
// Graph management operations

import { z } from "zod";
import type { CallToolResult } from "../types.js";
import { textResult, RoamError, ErrorCodes } from "../types.js";
import {
  getConfiguredGraphs,
  getConfiguredGraphsSafe,
  getPort,
  saveGraphToConfig,
} from "../graph-resolver.js";
import type { GraphConfig } from "../types.js";
import type { AvailableGraph } from "../roam-api.js";
import {
  fetchAvailableGraphs,
  requestToken,
  sleep,
  openRoamApp,
  slugify,
} from "../roam-api.js";

// ============================================================================
// Schemas
// ============================================================================

export const ListGraphsSchema = z.object({});

export const SetupNewGraphSchema = z.object({
  graph: z
    .string()
    .regex(
      /^[A-Za-z0-9_-]+$/,
      "Graph name must contain only letters, numbers, hyphens, and underscores"
    )
    .optional()
    .describe(
      "The canonical Roam graph name. Omit graph and nickname to list available graphs."
    ),
  nickname: z
    .string()
    .min(1, "Nickname must not be empty")
    .optional()
    .describe(
      "A short, memorable label describing what this graph is for (e.g. 'my personal graph', 'work notes', 'book club'). " +
        "Ask the user what they call this graph — use their natural language, not hyphenated format. " +
        "Do not just copy the graph name. Required when graph is provided."
    ),
});

// ============================================================================
// Types
// ============================================================================

export type ListGraphsParams = z.infer<typeof ListGraphsSchema>;
export type SetupNewGraphParams = z.infer<typeof SetupNewGraphSchema>;

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
      setup: "To connect additional graphs, use the setup_new_graph tool (call it without arguments to see available graphs).",
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

/**
 * Dedup available graphs: if same name exists as both hosted and offline, keep hosted.
 * Consistent with getMcpConfig() dedup behavior in graph-resolver.ts.
 */
function dedupAvailableGraphs(graphs: AvailableGraph[]): AvailableGraph[] {
  const byName = new Map<string, AvailableGraph>();
  for (const g of graphs) {
    const existing = byName.get(g.name);
    if (existing) {
      if (g.type === "hosted") byName.set(g.name, g);
    } else {
      byName.set(g.name, g);
    }
  }
  return Array.from(byName.values());
}

/**
 * Fetch available graphs from Roam Desktop, retrying once if Roam isn't running.
 * Deduplicates by name (hosted takes priority over offline).
 */
async function fetchAvailableGraphsWithRetry(
  port: number
): Promise<AvailableGraph[]> {
  let raw: AvailableGraph[];
  try {
    raw = await fetchAvailableGraphs(port);
  } catch (error: unknown) {
    const err = error as Error & { cause?: { code?: string } };
    const isConnectionError =
      err.cause?.code === "ECONNREFUSED" ||
      err.message?.includes("fetch failed");

    if (!isConnectionError) {
      throw error;
    }

    await openRoamApp();
    await sleep(5000);
    try {
      raw = await fetchAvailableGraphs(port);
    } catch {
      throw new RoamError(
        "Could not connect to Roam Desktop. Make sure it is running and the Local API is enabled in Settings > Local API.",
        ErrorCodes.CONNECTION_FAILED
      );
    }
  }
  return dedupAvailableGraphs(raw);
}

/**
 * Set up a new Roam graph connection, or list available graphs.
 * Call without arguments to list available graphs from Roam Desktop.
 * Call with graph + nickname to request a token and save the configuration.
 */
export async function setupNewGraph(
  args: SetupNewGraphParams
): Promise<CallToolResult> {
  const { graph, nickname: rawNickname } = args;

  // List mode: no args → return available graphs from Roam Desktop
  if (!graph) {
    const port = await getPort();
    const availableGraphs = await fetchAvailableGraphsWithRetry(port);
    const configuredGraphs = await getConfiguredGraphsSafe();
    return textResult({
      available_graphs: availableGraphs.map((g) => ({
        name: g.name,
        type: g.type,
      })),
      already_configured: configuredGraphs.map((g) => ({
        name: g.name,
        nickname: g.nickname,
        type: g.type,
        accessLevel: g.accessLevel,
        lastKnownTokenStatus: g.lastKnownTokenStatus,
      })),
      instruction:
        "Call setup_new_graph with graph and nickname to connect one of the available graphs.",
    });
  }

  // Setup mode: graph provided, nickname required
  if (!rawNickname) {
    throw new RoamError(
      "nickname is required when graph is provided.",
      ErrorCodes.VALIDATION_ERROR
    );
  }

  // 1. Slugify nickname
  const nickname = slugify(rawNickname);
  if (!nickname) {
    throw new RoamError(
      `Nickname "${rawNickname}" produces an empty result after converting to kebab-case. Use a nickname with at least one letter or number.`,
      ErrorCodes.VALIDATION_ERROR
    );
  }

  // 2. Check if graph is already configured
  const existingGraphs = await getConfiguredGraphsSafe();
  const matchingConfigs = existingGraphs.filter((g) => g.name === graph);
  if (matchingConfigs.length > 0) {
    const allRevoked = matchingConfigs.every(
      (g) => g.lastKnownTokenStatus === "revoked"
    );
    if (!allRevoked) {
      // At least one active config — return as already configured
      return textResult({
        status: "already_configured",
        graphs: matchingConfigs.map((g) => ({
          name: g.name,
          nickname: g.nickname,
          type: g.type,
          accessLevel: g.accessLevel,
          lastKnownTokenStatus: g.lastKnownTokenStatus,
        })),
        instruction:
          "This graph is already configured. Pass the 'nickname' value as the graph parameter. Call get_graph_guidelines before operating on it.",
      });
    }
    // All revoked — fall through to re-request a new token
  }

  // 3. Check nickname collision
  const nicknameCollision = existingGraphs.find(
    (g) => g.nickname.toLowerCase() === nickname.toLowerCase() && g.name !== graph
  );
  if (nicknameCollision) {
    throw new RoamError(
      `Nickname "${nickname}" is already used by graph "${nicknameCollision.name}". Please choose a different nickname.`,
      ErrorCodes.VALIDATION_ERROR
    );
  }

  // 4. Get port and fetch available graphs
  const port = await getPort();
  const availableGraphs = await fetchAvailableGraphsWithRetry(port);

  // 5. Find graph type
  const graphInfo = availableGraphs.find((g) => g.name === graph);
  if (!graphInfo) {
    throw new RoamError(
      `Graph "${graph}" was not found in Roam Desktop. Make sure the graph name is correct and that it is available in the app.`,
      ErrorCodes.VALIDATION_ERROR,
      {
        available_graphs: availableGraphs.map((g) => g.name),
      }
    );
  }

  // 6. Request token (blocks until user approves/denies in Roam)
  const result = await requestToken(port, graph, graphInfo.type, "full");

  // 7. Handle errors
  if (!result.success || !result.token) {
    const error = result.error;
    const errorCode =
      error && typeof error === "object" ? error.code : undefined;
    const errorMessage =
      error
        ? typeof error === "string"
          ? error
          : error.message || "Unknown error"
        : "Unknown error";

    switch (errorCode) {
      case "USER_REJECTED":
        throw new RoamError(
          "Token request was denied in Roam. The user must approve the request in the Roam desktop app.",
          ErrorCodes.USER_REJECTED
        );
      case "GRAPH_BLOCKED":
        throw new RoamError(
          "This graph has blocked token requests. Unblock it in Roam Settings > Graph > Local API Tokens.",
          ErrorCodes.GRAPH_BLOCKED
        );
      case "TIMEOUT":
        throw new RoamError(
          "No response after 5 minutes. Please try again — the user needs to approve the request in the Roam desktop app.",
          ErrorCodes.TIMEOUT
        );
      case "REQUEST_IN_PROGRESS":
        throw new RoamError(
          "Another token request is already pending for this graph. The user should respond to the existing request in Roam first.",
          ErrorCodes.REQUEST_IN_PROGRESS
        );
      default:
        throw new RoamError(
          `Token request failed: ${errorMessage}`,
          ErrorCodes.INTERNAL_ERROR
        );
    }
  }

  // 8. Save to config
  const accessLevel = (result.grantedAccessLevel || "full") as GraphConfig["accessLevel"];
  const graphConfig: GraphConfig = {
    name: graph,
    type: graphInfo.type,
    token: result.token,
    nickname,
    accessLevel,
  };
  await saveGraphToConfig(graphConfig);

  // 9. Return success
  return textResult({
    status: "connected",
    graph: {
      name: graph,
      nickname,
      type: graphInfo.type,
      accessLevel,
    },
    instruction:
      "Graph connected successfully. Call get_graph_guidelines next to understand the graph's conventions before making any changes.",
  });
}
