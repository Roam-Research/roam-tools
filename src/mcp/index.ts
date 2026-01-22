import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { tools, routeToolCall } from "../core/tools.js";

// Detect MIME type from base64 image data by checking magic bytes (fallback)
function detectImageMimeType(base64: string): string | null {
  if (base64.startsWith("/9j/")) return "image/jpeg";
  if (base64.startsWith("iVBOR")) return "image/png";
  if (base64.startsWith("R0lG")) return "image/gif";
  if (base64.startsWith("UklGR")) return "image/webp";
  if (base64.startsWith("Qk")) return "image/bmp";
  return null;
}

const server = new McpServer({ name: "roam-mcp", version: "0.1.0" });

// Register each tool with its Zod schema
for (const tool of tools) {
  server.tool(
    tool.name,
    tool.description,
    tool.schema.shape,
    async (args) => {
      try {
        const result = await routeToolCall(tool.name, args as Record<string, unknown>);

        // Handle file_get specially - return image content if it's an image
        if (
          tool.name === "file_get" &&
          result &&
          typeof result === "object" &&
          "base64" in result
        ) {
          const { base64, mimetype } = result as { base64: string; mimetype?: string };
          const mimeType = mimetype || detectImageMimeType(base64);

          if (mimeType?.startsWith("image/")) {
            return {
              content: [{ type: "image", data: base64, mimeType }],
            };
          }
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
    }
  );
}

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Roam MCP server running");
}

main().catch(console.error);
