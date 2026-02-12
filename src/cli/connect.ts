#!/usr/bin/env node

import { search, select, input } from "@inquirer/prompts";
import open from "open";
import {
  getPort,
  getConfiguredGraphsSafe,
  saveGraphToConfig,
  removeGraphFromConfig,
} from "../core/graph-resolver.js";
import type { GraphConfig, GraphType, AccessLevel } from "../core/types.js";

// ============================================================================
// Types
// ============================================================================

interface AvailableGraph {
  name: string;
  type: GraphType;
}

interface GraphsResponse {
  success: boolean;
  result?: AvailableGraph[];
  error?: string;
}

interface TokenExchangeResponse {
  success: boolean;
  token?: string;
  graphName?: string;
  graphType?: GraphType;
  grantedAccessLevel?: string;
  grantedScopes?: { read?: boolean; append?: boolean; edit?: boolean };
  error?: { code?: string; message?: string } | string;
}

interface GraphChoice extends AvailableGraph {
  isOpen: boolean;
  isConnected: boolean;
  existingNickname?: string;
  isCustomOption?: boolean;
  isPublicGraph?: boolean;
}

// ============================================================================
// API Functions
// ============================================================================

async function fetchAvailableGraphs(port: number): Promise<AvailableGraph[]> {
  const url = `http://localhost:${port}/api/graphs/available`;
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

async function fetchOpenGraphs(port: number): Promise<AvailableGraph[]> {
  const url = `http://localhost:${port}/api/graphs/open`;
  const response = await fetch(url, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });

  const data = (await response.json()) as GraphsResponse;

  if (!data.success) {
    // Open graphs failing is not critical, return empty
    return [];
  }

  return data.result || [];
}

async function requestToken(
  port: number,
  graph: string,
  graphType: GraphType,
  accessLevel: string
): Promise<TokenExchangeResponse> {
  const url = `http://localhost:${port}/api/graphs/tokens/request`;
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function openRoamApp(): Promise<void> {
  await open("roam://open");
}

function getErrorMessage(error: TokenExchangeResponse["error"]): string {
  if (!error) return "Unknown error";
  if (typeof error === "string") return error;
  return error.message || "Unknown error";
}

function getErrorCode(error: TokenExchangeResponse["error"]): string | undefined {
  if (!error || typeof error === "string") return undefined;
  return error.code;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .replace(/-{2,}/g, "-");
}

// ============================================================================
// Main Connect Function
// ============================================================================

export async function connect(): Promise<void> {
  let port: number;

  // 1. Get port and try to connect
  try {
    port = await getPort();
  } catch {
    port = 3333; // Default port
  }

  // 2. Fetch available graphs (with retry if Roam not running)
  let availableGraphs: AvailableGraph[];
  try {
    availableGraphs = await fetchAvailableGraphs(port);
  } catch (error) {
    const err = error as Error & { cause?: { code?: string } };
    if (err.cause?.code === "ECONNREFUSED" || err.message.includes("fetch failed")) {
      console.log("Roam Desktop is not running. Opening...");
      await openRoamApp();
      console.log("Waiting for Roam to start...");
      await sleep(3000);

      // Retry
      try {
        availableGraphs = await fetchAvailableGraphs(port);
      } catch (retryError) {
        const retryErr = retryError as Error;
        if (retryErr.message.includes("Local API is disabled")) {
          console.error("\nLocal API is disabled in Roam.");
          console.error("To enable it: Menu Bar > Settings > Enable Local API");
          process.exit(1);
        }
        console.error("\nCould not connect to Roam Desktop.");
        console.error("Please make sure Roam is running and try again.");
        process.exit(1);
      }
    } else if ((error as Error).message.includes("Local API is disabled")) {
      console.error("\nLocal API is disabled in Roam.");
      console.error("To enable it: Menu Bar > Settings > Enable Local API");
      process.exit(1);
    } else {
      throw error;
    }
  }

  if (availableGraphs.length === 0) {
    console.error("No graphs available. Please log in to Roam and try again.");
    process.exit(1);
  }

  // 3. Fetch open graphs (for highlighting)
  const openGraphs = await fetchOpenGraphs(port);

  // 4. Get currently configured graphs
  const configuredGraphs = await getConfiguredGraphsSafe();

  // 5. Build choices for selection
  const choices: GraphChoice[] = availableGraphs.map((g) => {
    const isOpen = openGraphs.some(
      (o) => o.name === g.name && o.type === g.type
    );
    const configured = configuredGraphs.find(
      (c) => c.name === g.name && c.type === g.type
    );
    return {
      ...g,
      isOpen,
      isConnected: !!configured,
      existingNickname: configured?.nickname,
    };
  });

  // Add configured graphs that aren't in available list (e.g., public graphs)
  for (const configured of configuredGraphs) {
    const alreadyInList = choices.some(
      (c) => c.name === configured.name && c.type === configured.type
    );
    if (!alreadyInList) {
      choices.push({
        name: configured.name,
        type: configured.type,
        isOpen: false,
        isConnected: true,
        existingNickname: configured.nickname,
        isPublicGraph: true,
      });
    }
  }

  // Sort: open first, then by name
  choices.sort((a, b) => {
    if (a.isOpen !== b.isOpen) return a.isOpen ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  // Add "Enter custom graph name" option at the end
  const customOption: GraphChoice = {
    name: "__custom__",
    type: "hosted",
    isOpen: false,
    isConnected: false,
    isCustomOption: true,
  };
  choices.push(customOption);

  // 6. Interactive graph selection with search
  const selectedGraph = await search<GraphChoice>({
    message: "Select a graph to connect:",
    source: async (input) => {

      // Filter available graphs (exclude custom option placeholder)
      const filtered = input
        ? choices.filter(
            (g) =>
              !g.isCustomOption &&
              g.name.toLowerCase().includes(input.toLowerCase())
          )
        : choices.filter((g) => !g.isCustomOption);

      // Build results with custom option
      const results = filtered.map((g) => {
        let label = `${g.name} (${g.type})`;
        if (g.isOpen) label += " [open]";
        if (g.isPublicGraph && g.isConnected) {
          label += ` [public, connected as "${g.existingNickname}"]`;
        } else if (g.isConnected) {
          label += ` [connected as "${g.existingNickname}"]`;
        }
        return {
          name: label,
          value: g,
        };
      });

      // Always show custom option at the end, with search term as hint
      const customLabel = input
        ? `── Enter a public graph name ("${input}")...`
        : "── Enter a public graph name...";
      results.push({
        name: customLabel,
        value: { ...customOption, name: input || "__custom__" },
      });

      return results;
    },
  });

  // 7. Handle custom graph name option
  let finalSelectedGraph: GraphChoice;

  if (selectedGraph.isCustomOption) {
    // Use the search term as default if provided
    const defaultName = selectedGraph.name !== "__custom__" ? selectedGraph.name : "";
    const customName = await input({
      message: "Enter the graph name:",
      default: defaultName,
      validate: (value) =>
        value.trim() ? true : "Graph name cannot be empty",
    });

    // Public graphs are always hosted
    const customType: GraphType = "hosted";

    // Check if already configured
    const configured = configuredGraphs.find(
      (c) => c.name === customName.trim() && c.type === customType
    );

    finalSelectedGraph = {
      name: customName.trim(),
      type: customType,
      isOpen: false,
      isConnected: !!configured,
      existingNickname: configured?.nickname,
      isPublicGraph: true,
    };
  } else {
    finalSelectedGraph = selectedGraph;
  }

  // 8. Handle already connected graph
  if (finalSelectedGraph.isConnected) {
    const action = await select({
      message: `This graph is already connected as "${finalSelectedGraph.existingNickname}". What would you like to do?`,
      choices: [
        {
          name: "Request new token with different permissions",
          value: "new-token",
        },
        {
          name: "Remove from config",
          value: "remove",
        },
        {
          name: "Cancel",
          value: "cancel",
        },
      ],
    });

    if (action === "cancel") {
      console.log("Cancelled.");
      return;
    }

    if (action === "remove") {
      await removeGraphFromConfig(finalSelectedGraph.existingNickname!);
      console.log(
        `Removed "${finalSelectedGraph.existingNickname}" from config.`
      );
      return;
    }

    // Continue with new-token flow
  }

  // 9. Select access level (skip for public graphs - always read-only)
  let accessLevel: string;
  if (finalSelectedGraph.isPublicGraph) {
    accessLevel = "read-only";
    console.log("\nPublic graphs only support read-only access.");
  } else {
    accessLevel = await select({
      message: "Select permissions:",
      choices: [
        {
          name: "Full (read, create, edit, delete)",
          value: "full",
        },
        {
          name: "Read + Append (read, create only)",
          value: "read-append",
        },
        {
          name: "Read Only",
          value: "read-only",
        },
      ],
    });
  }

  // 9. Request token (blocks until user approves in Roam)
  console.log("\nWaiting for approval in Roam Desktop...");
  console.log("(A dialog should appear in the Roam app - please approve it)");

  const result = await requestToken(
    port,
    finalSelectedGraph.name,
    finalSelectedGraph.type,
    accessLevel
  );

  if (!result.success) {
    const errorCode = getErrorCode(result.error);
    const errorMessage = getErrorMessage(result.error);

    switch (errorCode) {
      case "USER_REJECTED":
        console.error("\nToken request was denied in Roam.");
        break;
      case "GRAPH_BLOCKED":
        console.error(
          "\nThis graph has blocked token requests. Unblock it in Roam Settings > Graph > Local API Tokens."
        );
        break;
      case "TIMEOUT":
        console.error(
          "\nNo response after 5 minutes. Please try again."
        );
        break;
      case "REQUEST_IN_PROGRESS":
        console.error(
          "\nAnother token request is already pending for this graph."
        );
        break;
      default:
        console.error(`\nError: ${errorMessage}`);
    }
    process.exit(1);
  }

  // 11. Get nickname
  const suggestedNickname =
    finalSelectedGraph.existingNickname ||
    slugify(finalSelectedGraph.name.split("-")[0]);

  const rawNickname = await input({
    message: "Enter a nickname for this graph:",
    default: suggestedNickname,
    validate: (value) => {
      const slug = slugify(value.trim());
      if (!slug) return "Nickname cannot be empty";
      // Check for existing nickname (excluding the current graph if updating)
      const existing = configuredGraphs.find(
        (g) =>
          g.nickname === slug &&
          !(g.name === finalSelectedGraph.name && g.type === finalSelectedGraph.type)
      );
      if (existing) {
        return `Nickname "${slug}" is already used by "${existing.name}"`;
      }
      return true;
    },
  });

  const nickname = slugify(rawNickname.trim());
  console.log(`→ Using nickname: ${nickname}`);

  // 12. Save to config
  if (!result.token) {
    // should not happen but just in case
    console.error("\nError: Server returned success but no token was provided.");
    process.exit(1);
  }

  const graphConfig: GraphConfig = {
    name: finalSelectedGraph.name,
    type: finalSelectedGraph.type,
    token: result.token,
    nickname,
    accessLevel: result.grantedAccessLevel as AccessLevel,
  };

  await saveGraphToConfig(graphConfig);

  console.log(`\nConnected! Graph ${finalSelectedGraph.name} (nickname: ${nickname}) has been saved to ~/.roam-tools.json`);
  console.log(`\nGranted permissions: ${result.grantedAccessLevel}`);

  if (result.grantedAccessLevel !== accessLevel) {
    console.log(
      `(Note: You requested "${accessLevel}" but were granted "${result.grantedAccessLevel}" based on your permissions)`
    );
  }
}
