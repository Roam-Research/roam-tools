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

// Get graph name from env or args
const graphName = process.env.ROAM_GRAPH || process.argv[2];
if (!graphName) {
  console.error("Usage: roam-mcp <graph-name> or set ROAM_GRAPH env var");
  process.exit(1);
}

const client = new RoamClient({ graphName });
const pages = new PageOperations(client);
const blocks = new BlockOperations(client);
const search = new SearchOperations(client);
const navigation = new NavigationOperations(client);

const server = new Server(
  { name: "roam-mcp", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

// Define all 13 tools
const tools = [
  // Content operations
  {
    name: "create_page",
    description: "Create a new page in Roam, optionally with markdown content",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Page title" },
        markdown: { type: "string", description: "Markdown content for the page" },
      },
      required: ["title"],
    },
  },
  {
    name: "create_block",
    description: "Create a new block under a parent, using markdown content",
    inputSchema: {
      type: "object",
      properties: {
        parentUid: { type: "string", description: "UID of parent block or page" },
        markdown: { type: "string", description: "Markdown content for the block" },
        order: {
          oneOf: [{ type: "number" }, { type: "string", enum: ["first", "last"] }],
          description: "Position (number, 'first', or 'last'). Defaults to 'last'",
        },
      },
      required: ["parentUid", "markdown"],
    },
  },
  {
    name: "update_block",
    description: "Update an existing block's content or properties",
    inputSchema: {
      type: "object",
      properties: {
        uid: { type: "string", description: "Block UID" },
        string: { type: "string", description: "New text content" },
        open: { type: "boolean", description: "Collapse state" },
        heading: { type: "number", description: "Heading level (0-3)" },
      },
      required: ["uid"],
    },
  },
  {
    name: "delete_block",
    description: "Delete a block and all its children",
    inputSchema: {
      type: "object",
      properties: {
        uid: { type: "string", description: "Block UID to delete" },
      },
      required: ["uid"],
    },
  },
  {
    name: "delete_page",
    description: "Delete a page and all its contents",
    inputSchema: {
      type: "object",
      properties: {
        uid: { type: "string", description: "Page UID to delete" },
      },
      required: ["uid"],
    },
  },
  // Read operations
  {
    name: "search",
    description: "Search for pages and blocks by text",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        searchPages: { type: "boolean", description: "Include pages (default: true)" },
        searchBlocks: { type: "boolean", description: "Include blocks (default: true)" },
        limit: { type: "number", description: "Max results (default: 100)" },
      },
      required: ["query"],
    },
  },
  {
    name: "get_page",
    description: "Get a page's content and children",
    inputSchema: {
      type: "object",
      properties: {
        uid: { type: "string", description: "Page UID" },
        title: { type: "string", description: "Page title (alternative to uid)" },
      },
    },
  },
  {
    name: "get_block",
    description: "Get a block's content and children",
    inputSchema: {
      type: "object",
      properties: {
        uid: { type: "string", description: "Block UID" },
      },
      required: ["uid"],
    },
  },
  {
    name: "get_backlinks",
    description: "Get all blocks that reference a given page or block",
    inputSchema: {
      type: "object",
      properties: {
        uid: { type: "string", description: "UID of page or block to get backlinks for" },
      },
      required: ["uid"],
    },
  },
  // Navigation operations
  {
    name: "get_focused_block",
    description: "Get the currently focused block in Roam",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_current_page",
    description: "Get the UID of the page currently open in the main window",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "open",
    description: "Navigate to a page or block in the main window",
    inputSchema: {
      type: "object",
      properties: {
        uid: { type: "string", description: "UID of page or block" },
        title: { type: "string", description: "Page title (alternative to uid)" },
      },
    },
  },
  {
    name: "open_sidebar",
    description: "Open a page or block in the right sidebar",
    inputSchema: {
      type: "object",
      properties: {
        uid: { type: "string", description: "UID of page or block" },
        type: {
          type: "string",
          enum: ["block", "outline", "mentions"],
          description: "View type (default: outline)",
        },
      },
      required: ["uid"],
    },
  },
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let result: unknown;

    switch (name) {
      // Content operations
      case "create_page":
        result = await pages.create(args as { title: string; markdown?: string });
        break;
      case "create_block":
        result = await blocks.create(
          args as { parentUid: string; markdown: string; order?: number | "first" | "last" }
        );
        break;
      case "update_block":
        await blocks.update(args as { uid: string; string?: string; open?: boolean; heading?: number });
        result = { success: true };
        break;
      case "delete_block":
        await blocks.delete(args as { uid: string });
        result = { success: true };
        break;
      case "delete_page":
        await pages.delete(args as { uid: string });
        result = { success: true };
        break;

      // Read operations
      case "search":
        result = await search.search(args as { query: string; searchPages?: boolean; searchBlocks?: boolean; limit?: number });
        break;
      case "get_page":
        result = await pages.get(args as { uid?: string; title?: string });
        break;
      case "get_block":
        result = await blocks.get(args as { uid: string });
        break;
      case "get_backlinks":
        result = await blocks.getBacklinks(args as { uid: string });
        break;

      // Navigation operations
      case "get_focused_block":
        result = await navigation.getFocusedBlock();
        break;
      case "get_current_page":
        result = await navigation.getCurrentPage();
        break;
      case "open":
        await navigation.open(args as { uid?: string; title?: string });
        result = { success: true };
        break;
      case "open_sidebar":
        await navigation.openSidebar(args as { uid: string; type?: "block" | "outline" | "mentions" });
        result = { success: true };
        break;

      default:
        throw new Error(`Unknown tool: ${name}`);
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
  console.error(`Roam MCP server running for graph: ${graphName}`);
}

main().catch(console.error);
