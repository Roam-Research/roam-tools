// src/core/graph-resolver.ts
import { readFile } from "fs/promises";
import { homedir } from "os";
import { join } from "path";

// In-memory state for last used graph (persists within session)
let lastUsedGraph: string | null = null;

// Config file type
interface RoamLocalApiConfig {
  port: number;
  "last-graph"?: string;
}

// Get the API config from ~/.roam-local-api.json
async function getConfig(): Promise<RoamLocalApiConfig> {
  try {
    const configFile = join(homedir(), ".roam-local-api.json");
    const content = await readFile(configFile, "utf-8");
    return JSON.parse(content) as RoamLocalApiConfig;
  } catch {
    return { port: 3333 };
  }
}

// Get the API port
export async function getPort(): Promise<number> {
  const config = await getConfig();
  return config.port;
}

// Get the last graph from config file
async function getLastGraphFromConfig(): Promise<string | null> {
  const config = await getConfig();
  return config["last-graph"] || null;
}

// Graph info from Roam API
interface GraphInfo {
  name: string;
  type: string;
}

// Response type from Roam API
interface GraphsResponse {
  success: boolean;
  result?: GraphInfo[];
  error?: string;
}

// Fetch list of open graphs from Roam
async function fetchOpenGraphs(port: number): Promise<string[]> {
  const url = `http://localhost:${port}/api/graphs/open`;

  const response = await fetch(url, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });

  const data = (await response.json()) as GraphsResponse;

  if (!data.success) {
    throw new Error(data.error || "Failed to get open graphs");
  }

  return (data.result || []).map((g) => g.name);
}

// Fetch list of open graphs from Roam (exported for tools that need it)
export async function getOpenGraphs(): Promise<string[]> {
  const port = await getPort();
  return fetchOpenGraphs(port);
}

// Resolve which graph to use
// Priority: explicit param > in-memory state > config file > query open graphs
export async function resolveGraph(providedGraph?: string): Promise<string> {
  // 1. Explicit graph param - use it and remember it
  if (providedGraph) {
    lastUsedGraph = providedGraph;
    return providedGraph;
  }

  // 2. Last used graph in memory (within session)
  if (lastUsedGraph) {
    return lastUsedGraph;
  }

  // 3. Last graph from config file
  const configGraph = await getLastGraphFromConfig();
  if (configGraph) {
    lastUsedGraph = configGraph;
    return configGraph;
  }

  // 4. Fallback: query open graphs (requires Roam to be running)
  const port = await getPort();
  let openGraphs: string[];

  try {
    openGraphs = await fetchOpenGraphs(port);
  } catch {
    throw new Error(
      "Could not determine which graph to use. Roam is not running and no graph name is available. " +
        "Please provide a graph name or open Roam manually."
    );
  }

  if (openGraphs.length === 0) {
    throw new Error(
      "Could not determine which graph to use. No graphs are open and no last-used graph is configured."
    );
  }

  if (openGraphs.length === 1) {
    lastUsedGraph = openGraphs[0];
    return openGraphs[0];
  }

  // Multiple graphs open - ask user to specify
  const graphList = openGraphs.map((g, i) => `${i + 1}. ${g}`).join("\n");
  throw new Error(
    `Multiple graphs are open. Please specify which graph to use:\n${graphList}`
  );
}

// For testing: reset state
export function resetLastUsedGraph(): void {
  lastUsedGraph = null;
}

// For testing: get current state
export function getLastUsedGraph(): string | null {
  return lastUsedGraph;
}
