import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { tools, routeToolCall } from "../core/tools.js";

const server = new McpServer({ name: "roam-mcp", version: "0.3.0" });

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
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Roam MCP server running");
}

main().catch(console.error);
