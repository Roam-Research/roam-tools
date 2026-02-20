#!/usr/bin/env node

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
