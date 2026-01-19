import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { tools, routeToolCall } from "../core/tools.js";

// Detect MIME type from base64 image data by checking magic bytes
function detectImageMimeType(base64: string): string | null {
  // Check first few characters of base64 which encode the magic bytes
  if (base64.startsWith("/9j/")) return "image/jpeg";
  if (base64.startsWith("iVBOR")) return "image/png";
  if (base64.startsWith("R0lG")) return "image/gif";
  if (base64.startsWith("UklGR")) return "image/webp";
  if (base64.startsWith("Qk")) return "image/bmp";
  return null;
}

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
      "base64" in result
    ) {
      const { base64 } = result as { base64: string };
      const mimeType = detectImageMimeType(base64);

      if (mimeType) {
        return {
          content: [{ type: "image", data: base64, mimeType }],
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
