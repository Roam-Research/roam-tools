// src/core/graph-resolver.ts
import { readFile } from "fs/promises";
import { homedir } from "os";
import { join } from "path";

// In-memory state for last used graph
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
async function getPort(): Promise<number> {
  const config = await getConfig();
  return config.port;
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
export async function getOpenGraphs(): Promise<string[]> {
  const port = await getPort();
  const url = `http://localhost:${port}/api/graphs/open`;

  const response = await fetch(url, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });

  const data = (await response.json()) as GraphsResponse;

  if (!data.success) {
    throw new Error(data.error || "Failed to get open graphs");
  }

  // Extract graph names from the response
  return (data.result || []).map((g) => g.name);
}

// Resolve which graph to use
export async function resolveGraph(providedGraph?: string): Promise<string> {
  // If graph is explicitly provided, use it and remember it
  if (providedGraph) {
    lastUsedGraph = providedGraph;
    return providedGraph;
  }

  // Fetch open graphs
  const openGraphs = await getOpenGraphs();

  // No graphs open
  if (openGraphs.length === 0) {
    throw new Error(
      "No graphs are currently open in Roam. Please open a graph in the Roam desktop app."
    );
  }

  // If last used graph is still open, use it
  if (lastUsedGraph && openGraphs.includes(lastUsedGraph)) {
    return lastUsedGraph;
  }

  // Exactly one graph open - use it
  if (openGraphs.length === 1) {
    lastUsedGraph = openGraphs[0];
    return openGraphs[0];
  }

  // Multiple graphs open - error with numbered list
  const graphList = openGraphs
    .map((g, i) => `${i + 1}. ${g}`)
    .join("\n");

  throw new Error(
    `Multiple graphs are open. Please ask the user which graph to use:\n${graphList}\nThen include their choice as the 'graph' parameter in your next call.`
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
