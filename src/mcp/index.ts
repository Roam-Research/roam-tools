import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { tools, routeToolCall } from "../core/tools.js";
import { RoamError } from "../core/types.js";

const server = new McpServer({ name: "roam-mcp", version: "0.2.0" });

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
        // Format RoamError with structured error info
        if (error instanceof RoamError) {
          const errorResponse = {
            error: {
              code: error.code,
              message: error.message,
              ...(error.context || {}),
            },
          };
          return {
            content: [{ type: "text", text: JSON.stringify(errorResponse, null, 2) }],
            isError: true,
          };
        }

        // Generic errors
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
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Roam MCP server running");
}

main().catch(console.error);
