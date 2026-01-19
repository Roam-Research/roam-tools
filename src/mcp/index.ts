import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { tools, routeToolCall } from "../core/tools.js";

const server = new Server(
  { name: "roam-mcp", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

// List tools - map to MCP format (exclude operation/method fields)
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: tools.map(({ name, description, inputSchema }) => ({
    name,
    description,
    inputSchema,
  })),
}));

// Handle tool calls via router
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    const result = await routeToolCall(name, args as Record<string, unknown>);

    // Handle file_get specially - return image content if it's an image
    if (
      name === "file_get" &&
      result &&
      typeof result === "object" &&
      "base64" in result &&
      "mimetype" in result
    ) {
      const { base64, mimetype } = result as { base64: string; mimetype: string };

      if (mimetype.startsWith("image/")) {
        return {
          content: [{ type: "image", data: base64, mimeType: mimetype }],
        };
      }
      // Non-image file - return as text with base64
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: `Error: ${message}` }],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Roam MCP server running");
}

main().catch(console.error);
