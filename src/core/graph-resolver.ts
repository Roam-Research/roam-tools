// src/core/graph-resolver.ts
// v2.0.0 - Config-based graph resolution with token authentication

import { readFile, writeFile } from "fs/promises";
import { homedir } from "os";
import { join } from "path";
import {
  RoamMcpConfigSchema,
  RoamMcpConfig,
  GraphConfig,
  ResolvedGraph,
  RoamError,
  ErrorCodes,
} from "./types.js";

// ============================================================================
// Session State
// ============================================================================

// Selected graph for current session (per-connection, not persisted)
let selectedGraph: ResolvedGraph | null = null;

// Cached config from ~/.roam-mcp.json
let cachedConfig: RoamMcpConfig | null = null;

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
// MCP Config Loading (from ~/.roam-mcp.json)
// ============================================================================

const CONFIG_PATH = join(homedir(), ".roam-mcp.json");

export async function getMcpConfig(): Promise<RoamMcpConfig> {
  if (cachedConfig) return cachedConfig;

  let content: string;
  try {
    content = await readFile(CONFIG_PATH, "utf-8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new RoamError(
        `Roam MCP config not found at ${CONFIG_PATH}\n\n` +
          "Please create the config file with your graph configuration:\n\n" +
          '{\n  "graphs": [\n    {\n' +
          '      "name": "your-graph-name",\n' +
          '      "type": "hosted",\n' +
          '      "token": "roam-graph-local-token-...",\n' +
          '      "nickname": "MyGraph"\n' +
          "    }\n  ]\n}\n\n" +
          "Create a token in Roam: Settings > Graph > Local API Tokens",
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
      // If existing is hosted, skip the new one (regardless of type)
      // If existing is offline and new is hosted, replace with hosted
      if (existing.type === "hosted") {
        console.error(
          `[roam-mcp] Warning: Ignoring duplicate graph "${graph.name}" (${graph.type}), using hosted version`
        );
        continue;
      } else if (graph.type === "hosted") {
        console.error(
          `[roam-mcp] Warning: Replacing offline graph "${graph.name}" with hosted version`
        );
        graphsByName.set(graph.name, graph);
      } else {
        console.error(
          `[roam-mcp] Warning: Ignoring duplicate offline graph "${graph.name}"`
        );
      }
    } else {
      graphsByName.set(graph.name, graph);
    }
  }

  // Rebuild graphs array with deduplication applied
  const deduplicatedGraphs = Array.from(graphsByName.values());
  cachedConfig = { graphs: deduplicatedGraphs };
  return cachedConfig;
}

// ============================================================================
// Config Writing Functions
// ============================================================================

/**
 * Clear the cached config (call after writing to config file)
 */
export function clearConfigCache(): void {
  cachedConfig = null;
}

/**
 * Read the raw config file without caching (for write operations)
 */
async function readRawConfig(): Promise<RoamMcpConfig> {
  try {
    const content = await readFile(CONFIG_PATH, "utf-8");
    return JSON.parse(content) as RoamMcpConfig;
  } catch {
    // Return empty config if file doesn't exist
    return { graphs: [] };
  }
}

/**
 * Save a graph configuration to ~/.roam-mcp.json
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

  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2));
  clearConfigCache();
}

/**
 * Remove a graph from ~/.roam-mcp.json by nickname
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

  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2));
  clearConfigCache();
  return true;
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
  Array<{ nickname: string; name: string; accessLevel: string }>
> {
  const config = await getMcpConfig();
  return config.graphs.map((g) => ({
    nickname: g.nickname,
    name: g.name,
    accessLevel: g.accessLevel || "full",
  }));
}

// ============================================================================
// Session State Management
// ============================================================================

export function setSelectedGraph(graph: ResolvedGraph): void {
  selectedGraph = graph;
}

export function getSelectedGraph(): ResolvedGraph | null {
  return selectedGraph;
}

// ============================================================================
// Graph Resolution
// ============================================================================

/**
 * Resolve which graph to use and return full config.
 * Priority: explicit param → session state → single configured graph → error
 */
export async function resolveGraph(
  providedGraph?: string
): Promise<ResolvedGraph> {
  const config = await getMcpConfig();

  // 1. Explicit graph parameter (by nickname or name)
  if (providedGraph) {
    const graphConfig = await findGraphConfig(providedGraph);
    if (!graphConfig) {
      const available = config.graphs.map((g) => g.nickname).join(", ");
      throw new RoamError(
        `Graph "${providedGraph}" not found in config. Available graphs: ${available}`,
        ErrorCodes.GRAPH_NOT_CONFIGURED,
        { available_graphs: await getConfiguredGraphs() }
      );
    }
    // Update session state
    const resolved: ResolvedGraph = {
      name: graphConfig.name,
      type: graphConfig.type,
      token: graphConfig.token,
      nickname: graphConfig.nickname,
      accessLevel: graphConfig.accessLevel,
    };
    selectedGraph = resolved;
    return resolved;
  }

  // 2. Use session-selected graph
  if (selectedGraph) {
    // Verify it's still in config (in case config was reloaded)
    const stillValid = config.graphs.some((g) => g.name === selectedGraph!.name);
    if (stillValid) {
      return selectedGraph;
    }
    // Graph was removed from config, clear selection
    selectedGraph = null;
  }

  // 3. Auto-select if exactly one graph configured
  if (config.graphs.length === 1) {
    const graphConfig = config.graphs[0];
    const resolved: ResolvedGraph = {
      name: graphConfig.name,
      type: graphConfig.type,
      token: graphConfig.token,
      nickname: graphConfig.nickname,
      accessLevel: graphConfig.accessLevel,
    };
    selectedGraph = resolved;
    return resolved;
  }

  // 4. Multiple graphs - require explicit selection
  const graphList = config.graphs
    .map((g) => `  - ${g.nickname} (${g.name})`)
    .join("\n");
  throw new RoamError(
    `Multiple graphs configured. Please specify which graph to use:\n${graphList}\n\n` +
      "Use select_graph or pass the graph parameter.",
    ErrorCodes.GRAPH_NOT_SELECTED,
    {
      available_graphs: await getConfiguredGraphs(),
      suggested_next_tool: "select_graph",
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

// ============================================================================
// Testing Utilities
// ============================================================================

export function resetState(): void {
  selectedGraph = null;
  cachedConfig = null;
}

// Legacy export for compatibility
export function resetLastUsedGraph(): void {
  resetState();
}
