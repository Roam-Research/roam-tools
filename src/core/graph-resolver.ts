// src/core/graph-resolver.ts
// Stateless config-based graph resolution with token authentication

import { readFile, writeFile, chmod, stat } from "fs/promises";
import { homedir } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  RoamMcpConfigSchema,
  RoamMcpConfig,
  HttpConfig,
  GraphConfig,
  ResolvedGraph,
  RoamError,
  ErrorCodes,
  AccessLevel,
} from "./types.js";

// Project root (up from dist/core/ or src/core/)
export const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

// Warning suppression flags (prevent spamming on every tool call)
let permissionCheckDone = false;
let dedupWarningShown = false;

// ============================================================================
// Port Discovery (from ~/.roam-local-api.json)
// ============================================================================

interface RoamLocalApiConfig {
  port: number;
  // Note: "last-graph" field is REMOVED in v2.0.0 - we no longer read it
}

async function getLocalApiConfig(): Promise<RoamLocalApiConfig> {
  try {
    const configFile = join(homedir(), ".roam-local-api.json");
    const content = await readFile(configFile, "utf-8");
    return JSON.parse(content) as RoamLocalApiConfig;
  } catch {
    return { port: 3333 }; // Default port
  }
}

export async function getPort(): Promise<number> {
  const config = await getLocalApiConfig();
  return config.port;
}

// ============================================================================
// MCP Config Loading (from ~/.roam-tools.json)
// ============================================================================

const CONFIG_PATH = join(homedir(), ".roam-tools.json");

/**
 * Write config file with restricted permissions (owner read/write only).
 */
async function writeConfigFile(path: string, data: string): Promise<void> {
  await writeFile(path, data, { mode: 0o600 });
  // Also chmod in case the file already existed with wrong permissions
  await chmod(path, 0o600);
}

export async function getMcpConfig(): Promise<RoamMcpConfig> {
  let content: string;
  try {
    content = await readFile(CONFIG_PATH, "utf-8");

    // Check file permissions (Unix only — skip on Windows)
    if (!permissionCheckDone) {
      permissionCheckDone = true;
      try {
        const fileStat = await stat(CONFIG_PATH);
        const mode = fileStat.mode & 0o777;
        if (mode & 0o077) {
          console.error(
            `[roam-mcp] WARNING: ${CONFIG_PATH} has overly permissive permissions (0${mode.toString(8)}). ` +
              `This file contains API tokens and should not be accessible by others. ` +
              `Run: chmod 600 ${CONFIG_PATH}`
          );
        }
      } catch {
        // Ignore permission check errors (e.g., Windows)
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new RoamError(
        `No graphs configured. Run the setup command:\n\n` +
          `  cd ${PROJECT_ROOT} && npm run cli -- connect\n\n` +
          `This will walk you through connecting a Roam graph.\n` +
          `After connecting, try your request again.`,
        ErrorCodes.CONFIG_NOT_FOUND
      );
    }
    throw error;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new RoamError(
      `Invalid JSON in ${CONFIG_PATH}. Please check the file format.`,
      ErrorCodes.VALIDATION_ERROR
    );
  }

  const validated = RoamMcpConfigSchema.safeParse(parsed);
  if (!validated.success) {
    const issues = validated.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new RoamError(
      `Invalid config in ${CONFIG_PATH}:\n${issues}`,
      ErrorCodes.VALIDATION_ERROR
    );
  }

  // Validate nickname uniqueness (case-insensitive)
  const nicknames = new Set<string>();
  for (const graph of validated.data.graphs) {
    const lowerNickname = graph.nickname.toLowerCase();
    if (nicknames.has(lowerNickname)) {
      throw new RoamError(
        `Duplicate nickname "${graph.nickname}" in config. Nicknames must be unique (case-insensitive).`,
        ErrorCodes.VALIDATION_ERROR
      );
    }
    nicknames.add(lowerNickname);
  }

  // Handle same-name collisions: if both hosted and offline exist with same name, keep hosted
  const graphsByName = new Map<string, GraphConfig>();
  for (const graph of validated.data.graphs) {
    const existing = graphsByName.get(graph.name);
    if (existing) {
      if (!dedupWarningShown) {
        dedupWarningShown = true;
        // If existing is hosted, skip the new one (regardless of type)
        // If existing is offline and new is hosted, replace with hosted
        if (existing.type === "hosted") {
          console.error(
            `[roam-mcp] Warning: Ignoring duplicate graph "${graph.name}" (${graph.type}), using hosted version`
          );
        } else if (graph.type === "hosted") {
          console.error(
            `[roam-mcp] Warning: Replacing offline graph "${graph.name}" with hosted version`
          );
        } else {
          console.error(
            `[roam-mcp] Warning: Ignoring duplicate offline graph "${graph.name}"`
          );
        }
      }
      // Apply dedup logic regardless of whether warning was shown
      if (existing.type === "hosted") {
        continue;
      } else if (graph.type === "hosted") {
        graphsByName.set(graph.name, graph);
      }
      // else: both offline, skip the duplicate (continue already handled hosted case)
    } else {
      graphsByName.set(graph.name, graph);
    }
  }

  // Rebuild graphs array with deduplication applied
  return { graphs: Array.from(graphsByName.values()) };
}

// ============================================================================
// Config Writing Functions
// ============================================================================

/**
 * Read the raw config file for write operations (no dedup, but validates with Zod).
 * Returns empty config if file doesn't exist (so saveGraphToConfig can create the initial file).
 */
async function readRawConfig(): Promise<RoamMcpConfig> {
  let content: string;
  try {
    content = await readFile(CONFIG_PATH, "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { graphs: [] };
    }
    throw error;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new RoamError(
      `Invalid JSON in ${CONFIG_PATH}. Please check the file format.`,
      ErrorCodes.VALIDATION_ERROR
    );
  }

  const validated = RoamMcpConfigSchema.safeParse(parsed);
  if (!validated.success) {
    const issues = validated.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new RoamError(
      `Invalid config in ${CONFIG_PATH}:\n${issues}`,
      ErrorCodes.VALIDATION_ERROR
    );
  }

  return validated.data;
}

/**
 * Save a graph configuration to ~/.roam-tools.json
 * If a graph with the same name+type exists, it will be updated.
 * Otherwise, the graph will be added.
 */
export async function saveGraphToConfig(newGraph: GraphConfig): Promise<void> {
  const config = await readRawConfig();

  // Check for nickname collision (case-insensitive)
  const existingNickname = config.graphs.find(
    (g) =>
      g.nickname.toLowerCase() === newGraph.nickname.toLowerCase() &&
      !(g.name === newGraph.name && g.type === newGraph.type)
  );
  if (existingNickname) {
    throw new RoamError(
      `Nickname "${newGraph.nickname}" is already used by graph "${existingNickname.name}". Please choose a different nickname.`,
      ErrorCodes.VALIDATION_ERROR
    );
  }

  // Check for existing graph with same name+type
  const existingIndex = config.graphs.findIndex(
    (g) => g.name === newGraph.name && g.type === newGraph.type
  );

  if (existingIndex >= 0) {
    config.graphs[existingIndex] = newGraph; // Update existing
  } else {
    config.graphs.push(newGraph); // Add new
  }

  await writeConfigFile(CONFIG_PATH, JSON.stringify(config, null, 2));
}

/**
 * Remove a graph from ~/.roam-tools.json by nickname
 */
export async function removeGraphFromConfig(nickname: string): Promise<boolean> {
  const config = await readRawConfig();
  const lowerNickname = nickname.toLowerCase();

  const initialLength = config.graphs.length;
  config.graphs = config.graphs.filter(
    (g) => g.nickname.toLowerCase() !== lowerNickname
  );

  if (config.graphs.length === initialLength) {
    return false; // Graph not found
  }

  await writeConfigFile(CONFIG_PATH, JSON.stringify(config, null, 2));
  return true;
}

/**
 * Update a graph's access level and/or token status in config.
 * No-ops if nothing changed (avoids unnecessary disk writes).
 */
export async function updateGraphTokenStatus(
  nickname: string,
  updates: { accessLevel?: AccessLevel; lastKnownTokenStatus?: "active" | "revoked" }
): Promise<void> {
  const config = await readRawConfig();
  const graph = config.graphs.find(
    (g) => g.nickname.toLowerCase() === nickname.toLowerCase()
  );
  if (!graph) return;

  let changed = false;
  if (updates.accessLevel !== undefined && graph.accessLevel !== updates.accessLevel) {
    graph.accessLevel = updates.accessLevel;
    changed = true;
  }
  if (updates.lastKnownTokenStatus !== undefined && graph.lastKnownTokenStatus !== updates.lastKnownTokenStatus) {
    graph.lastKnownTokenStatus = updates.lastKnownTokenStatus;
    changed = true;
  }
  if (!changed) return;

  await writeConfigFile(CONFIG_PATH, JSON.stringify(config, null, 2));
}

/**
 * Get HTTP config from ~/.roam-tools.json (or undefined if not set).
 */
export async function getHttpConfig(): Promise<HttpConfig | undefined> {
  try {
    const config = await readRawConfig();
    return config.http;
  } catch {
    return undefined;
  }
}

/**
 * Save HTTP config to ~/.roam-tools.json.
 * Follows the same read-modify-write pattern as saveGraphToConfig.
 */
export async function saveHttpConfig(httpConfig: HttpConfig): Promise<void> {
  const config = await readRawConfig();
  config.http = httpConfig;
  await writeConfigFile(CONFIG_PATH, JSON.stringify(config, null, 2));
}

/**
 * Get all configured graphs (returns empty array if config doesn't exist)
 * Unlike getMcpConfig(), this doesn't throw if config is missing.
 */
export async function getConfiguredGraphsSafe(): Promise<GraphConfig[]> {
  try {
    const config = await readRawConfig();
    return config.graphs;
  } catch {
    return [];
  }
}

// ============================================================================
// Graph Lookup Functions
// ============================================================================

/**
 * Find a graph config by nickname (case-insensitive) or name
 */
export async function findGraphConfig(
  nameOrNickname: string
): Promise<GraphConfig | undefined> {
  const config = await getMcpConfig();
  const lower = nameOrNickname.toLowerCase();

  // First try nickname (case-insensitive)
  const byNickname = config.graphs.find(
    (g) => g.nickname.toLowerCase() === lower
  );
  if (byNickname) return byNickname;

  // Fall back to exact name match
  return config.graphs.find((g) => g.name === nameOrNickname);
}

/**
 * Get list of all configured graphs (for list_graphs tool and error messages)
 */
export async function getConfiguredGraphs(): Promise<
  Array<{ nickname: string; name: string; accessLevel: string; lastKnownTokenStatus?: string }>
> {
  const config = await getMcpConfig();
  return config.graphs.map((g) => ({
    nickname: g.nickname,
    name: g.name,
    accessLevel: g.accessLevel || "full",
    ...(g.lastKnownTokenStatus ? { lastKnownTokenStatus: g.lastKnownTokenStatus } : {}),
  }));
}

// ============================================================================
// Graph Resolution
// ============================================================================

/**
 * Resolve which graph to use and return full config.
 * Stateless: explicit param → single configured graph → error
 */
export async function resolveGraph(
  providedGraph?: string
): Promise<ResolvedGraph> {
  const config = await getMcpConfig();

  // 1. Explicit graph parameter (by nickname or name)
  if (providedGraph) {
    const graphConfig = await findGraphConfig(providedGraph);
    if (!graphConfig) {
      throw new RoamError(
        `Graph "${providedGraph}" not found in config. Available graph nicknames are listed below.`,
        ErrorCodes.GRAPH_NOT_CONFIGURED,
        {
          available_graphs: await getConfiguredGraphs(),
          instruction: "Pass the 'nickname' value as the graph parameter. Before operating on a graph, call get_graph_guidelines to understand its conventions.",
        }
      );
    }
    return {
      name: graphConfig.name,
      type: graphConfig.type,
      token: graphConfig.token,
      nickname: graphConfig.nickname,
      accessLevel: graphConfig.accessLevel,
      lastKnownTokenStatus: graphConfig.lastKnownTokenStatus,
    };
  }

  // 2. Auto-select if exactly one graph configured
  if (config.graphs.length === 1) {
    const graphConfig = config.graphs[0];
    return {
      name: graphConfig.name,
      type: graphConfig.type,
      token: graphConfig.token,
      nickname: graphConfig.nickname,
      accessLevel: graphConfig.accessLevel,
      lastKnownTokenStatus: graphConfig.lastKnownTokenStatus,
    };
  }

  // 3. Multiple graphs - require explicit selection
  throw new RoamError(
    "Multiple graphs configured. Pass a graph nickname as the graph parameter to specify which graph to use.",
    ErrorCodes.GRAPH_NOT_SELECTED,
    {
      available_graphs: await getConfiguredGraphs(),
      instruction: "Pass the 'nickname' value as the graph parameter. Before operating on a graph, call get_graph_guidelines to understand its conventions.",
    }
  );
}

// ============================================================================
// Open Graphs (for reference - not used for resolution in v2.0.0)
// ============================================================================

interface GraphInfo {
  name: string;
  type: string;
}

interface GraphsResponse {
  success: boolean;
  result?: GraphInfo[];
  error?: string;
}

/**
 * Fetch list of open graphs from Roam's Local API.
 * Note: This is NOT used for graph resolution in v2.0.0.
 * It's kept for potential future use (e.g., showing which graphs are open).
 */
export async function getOpenGraphs(): Promise<
  Array<{ name: string; type: string }>
> {
  const port = await getPort();
  const url = `http://localhost:${port}/api/graphs/open`;

  const response = await fetch(url, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });

  const data = (await response.json()) as GraphsResponse;

  if (!data.success) {
    throw new RoamError(
      data.error || "Failed to get open graphs",
      ErrorCodes.CONNECTION_FAILED
    );
  }

  return (data.result || []).map((g) => ({ name: g.name, type: g.type }));
}

