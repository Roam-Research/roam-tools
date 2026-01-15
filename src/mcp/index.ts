import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { RoamClient } from "../core/client.js";
import {
  PageOperations,
  BlockOperations,
  SearchOperations,
  NavigationOperations,
} from "../core/operations/index.js";
import { tools, createRouter } from "../core/tools.js";

// Get graph name from env or args
const graphName = process.env.ROAM_GRAPH || process.argv[2];
if (!graphName) {
  console.error("Usage: roam-mcp <graph-name> or set ROAM_GRAPH env var");
  process.exit(1);
}

const client = new RoamClient({ graphName });
const operations = {
  pages: new PageOperations(client),
  blocks: new BlockOperations(client),
  search: new SearchOperations(client),
  navigation: new NavigationOperations(client),
};

const router = createRouter(operations);

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
    const result = await router(name, args as Record<string, unknown>);
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
  console.error(`Roam MCP server running for graph: ${graphName}`);
}

main().catch(console.error);
