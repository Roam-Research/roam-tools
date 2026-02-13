# Roam MCP

A Model Context Protocol (MCP) server and CLI for Roam Research.

> **Alpha Software**: This project is in early development and subject to breaking changes.

> [!CAUTION]
> **Full Write Access**: This MCP server gives Claude full read and write access to your Roam graph. Claude can create, modify, and delete pages and blocks. **Changes may be difficult or impossible to undo.** Roam does not have a traditional undo history that can reverse bulk operations or deletions made through the API.
>
> **Recommendations:**
> - Back up your graph before use
> - Start with a test graph to understand Claude's behavior
> - Review what Claude plans to do before confirming write operations
> - Be specific in your instructions to avoid unintended changes

## Prerequisites

- **Node.js** v18 or later
- **Roam Research desktop app** (the local API is not available in the web version)

## How It Works

This MCP server connects to Roam's local HTTP API, which runs on your machine when the desktop app is open. If Roam isn't running when a tool is called, the server will automatically launch it via deep link and retry the connection.

## Getting Started

### 1. Enable the Local API in Roam

The local API is available in the desktop app.

In the menu bar, open settings and check "Enable Local API".

### 2. Install

```bash
git clone https://github.com/Roam-Research/roam-mcp.git
cd roam-mcp
npm install
npm run build
```

### 3. Connect a Graph

**Interactive** (recommended for first-time setup):

```bash
npm run cli -- connect
```

This will walk you through selecting a graph, choosing permissions, and approving the token in Roam.

**Non-interactive** (for scripts and LLM agents):

```bash
# example to connect to a your graph called "my-graph-name" which you generally refer to as "My Team Graph"
npm run cli -- connect --graph my-graph-name --nickname "My Team Graph" --access-level full

# example to connect to a public graph - our "help" graph
npm run cli -- connect --graph help --public --nickname "Roam official help graph" 
```

| Flag | Default | Description |
|------|---------|-------------|
| `--graph <name>` | — | Graph name (enables non-interactive mode) |
| `--nickname <name>` | Required with `--graph` | Short name you'll use to refer to this graph |
| `--access-level <level>` | `full` | `full`, `read-append`, or `read-only` |
| `--public` | — | Public graph (read-only, hosted) |
| `--type <type>` | `hosted` | `hosted` or `offline` |

**Note:** Both modes require a human to approve the token dialog in the Roam desktop app.

To remove a connection:

```bash
npm run cli -- connect --remove --graph my-graph-name
npm run cli -- connect --remove --graph help
npm run cli -- connect --remove --nickname "My Team Graph"
npm run cli -- connect --remove --nickname "Roam official help graph"
```

Run `connect` again to add more graphs or update permissions.

### 4. Connect to an MCP Client

**Option A: Configure your MCP client**

Point your MCP client to the server:

```
node /path/to/roam-mcp/dist/mcp/index.js
```

For Claude Desktop, add to your config (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "roam": {
      "command": "node",
      "args": ["/path/to/roam-mcp/dist/mcp/index.js"]
    }
  }
}
```

Replace `/path/to/roam-mcp` with the actual path.

**Option B: Claude Code**

Run Claude Code from the roam-mcp directory. The MCP server is configured in `.mcp.json` and will be available automatically.

### Multiple Graphs

Run `npm run cli -- connect` multiple times to add additional graphs. Each graph gets a nickname (a short name like "work" or "team acme") for easy selection.

**Graph Selection:**
- **Single graph configured**: Auto-selected, no action needed
- **Multiple graphs configured**: Pass the `graph` parameter on each tool call with the nickname

### Manual Configuration (Advanced)

Instead of using `connect`, you can manually create `~/.roam-tools.json`:

```json
{
  "graphs": [
    {
      "name": "your-graph-name",
      "type": "hosted",
      "token": "roam-graph-local-token-...",
      "nickname": "my-graph"
    }
  ]
}
```

To create a token manually: Roam Desktop → Settings → Graph → Local API Tokens → New Token.

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | The actual graph name in Roam (as shown in the URL) |
| `type` | No | `"hosted"` (default) for cloud graphs, `"offline"` for local-only |
| `token` | Yes | Local API token from Roam settings |
| `nickname` | Yes | Slug identifier for this graph (lowercase, hyphens, no spaces) |
| `accessLevel` | No | `"full"` (default), `"read-only"`, or `"read-append"` |

## Available Tools

**Graph Management:**
- `list_graphs` - List all configured graphs with their nicknames

**Graph Guidelines:**
- `get_graph_guidelines` - Returns user-defined instructions and preferences for AI agents

Graph guidelines let you store preferences and context directly in your Roam graph that AI agents will follow. Create a page called `[[agent guidelines]]` with your instructions. These might include naming conventions, preferred page structures, topics to focus on, or any other context that should guide how the AI interacts with your graph.

**Content:**
- `create_page` - Create page with markdown content
- `update_page` - Update page title or children view type
- `delete_page` - Delete a page
- `create_block` - Add markdown content under a parent
- `update_block` - Update block content/properties
- `move_block` - Move a block to a new location
- `delete_block` - Delete a block

**Read:**
- `search` - Search pages/blocks
- `search_templates` - Search Roam templates by name
- `roam_query` - Execute a Roam query (`{{query:}}` blocks, not Datalog)
- `get_page` - Get page content as markdown
- `get_block` - Get block content as markdown
- `get_backlinks` - Get references to a page/block

**Navigation:**
- `get_open_windows` - Main window view and all sidebar windows
- `get_selection` - Currently focused block and multi-selected blocks
- `open_main_window` - Navigate to page/block
- `open_sidebar` - Open in right sidebar

**Files:**
- `file_get` - Fetch a file hosted on Roam (handles decryption for encrypted graphs)
- `file_upload` - Upload a file to Roam (from local path, URL, or base64)
- `file_delete` - Delete a file hosted on Roam

## CLI

A command-line interface is available for setup and direct tool access:

```bash
# Setup
npm run cli -- connect                          # Interactive graph connection
npm run cli -- connect --graph <name> --nickname <name>  # Non-interactive connection

# Tools (same as MCP server)
npm run cli -- list-graphs
npm run cli -- search --query "my notes"
npm run cli -- get-page --title "My Page"
npm run cli -- create-block --parent-uid "abc123" --markdown "Hello world"
```

Run `npm run cli -- --help` to see all available commands.

## Contributing

This project is changing rapidly. At this time, we prefer suggestions and feedback over pull requests. Please open an issue or join the #ai-in-roam channel on slack to discuss ideas before submitting code.
