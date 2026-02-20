#!/usr/bin/env node

// ============================================================================
// CLI subcommand: roam-mcp connect
// Dynamically imports connect to avoid loading @inquirer/prompts during
// normal MCP server operation.
// ============================================================================

if (process.argv[2] === "connect") {
  const args = process.argv.slice(3);

  if (args.includes("--help") || args.includes("-h")) {
    console.log(`Usage: roam-mcp connect [options]

Connect to a Roam graph and obtain a token.

Options:
  --graph <name>          Graph name (enables non-interactive mode)
  --nickname <name>       Short name for this graph (required with --graph)
  --access-level <level>  Access level: full, read-append, or read-only
  --public                Public graph (read-only, hosted)
  --type <type>           Graph type: hosted or offline
  --remove                Remove a graph connection (use with --graph or --nickname)
  -h, --help              Show this help message

Examples:
  roam-mcp connect                                                              Interactive setup
  roam-mcp connect --graph my-graph --nickname "main graph"                     Connect with defaults
  roam-mcp connect --graph my-graph --nickname "main graph" --access-level full Connect with full access
  roam-mcp connect --graph help --public --nickname "Roam Help"                 Connect to a public graph
  roam-mcp connect --remove --graph help                                        Remove a connection`);
    process.exit(0);
  }

  // These flags must stay in sync with ConnectOptions in packages/core/src/connect.ts
  // and the Commander options in packages/cli/src/index.ts.
  function getFlag(flag: string): string | undefined {
    const idx = args.indexOf(flag);
    if (idx === -1 || idx + 1 >= args.length) return undefined;
    const value = args[idx + 1];
    if (value.startsWith("--")) return undefined;
    return value;
  }

  const options = {
    graph: getFlag("--graph"),
    nickname: getFlag("--nickname"),
    accessLevel: getFlag("--access-level"),
    public: args.includes("--public"),
    type: getFlag("--type"),
    remove: args.includes("--remove"),
  };

  const { connect } = await import("@roam-research/roam-tools-core/connect");
  await connect(options);
  process.exit(0);
}

// ============================================================================
// MCP Server (default mode)
// ============================================================================

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { tools, routeToolCall, getMcpConfig, RoamError, ErrorCodes } from "@roam-research/roam-tools-core";

const server = new McpServer({ name: "roam-mcp", version: "0.4.0" });

// Register each tool with its Zod schema
for (const tool of tools) {
  server.registerTool(
    tool.name,
    {
      description: tool.description,
      inputSchema: tool.schema,
    },
    async (args) => {
      try {
        return await routeToolCall(tool.name, args as Record<string, unknown>);
      } catch (error) {
        // Safety net for unexpected errors (RoamErrors are handled by routeToolCall)
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text", text: message }],
          isError: true,
        };
      }
    }
  );
}

async function main() {
  // Fail fast if config is from a newer version we can't understand.
  // CONFIG_NOT_FOUND is fine — user may connect later via setup_new_graph.
  try {
    await getMcpConfig();
  } catch (error) {
    if (error instanceof RoamError && error.code === ErrorCodes.CONFIG_TOO_NEW) {
      console.error(error.message);
      process.exit(1);
    }
    // All other errors (CONFIG_NOT_FOUND, etc.) are expected — continue startup
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Roam MCP server running");
}

main().catch(console.error);
