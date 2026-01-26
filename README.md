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

### 3. Connect to an MCP Client

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

### Graph Selection

The graph is selected automatically at runtime:

- **Single graph open**: Auto-detected, no configuration needed
- **Multiple graphs open**: Specify which graph on your first tool call using the `graph` parameter

Once a graph is selected (either automatically or explicitly), it's remembered for the rest of the session. You can switch to a different graph at any time by passing the `graph` parameter again.

> **Note**: Graph selection will change in the future once per-graph authentication is implemented.

## Available Tools

**Graph Guidelines:**
- `get_graph_guidelines` - Returns user-defined instructions for AI agents working with this graph

Graph guidelines let you store preferences and context directly in your Roam graph that AI agents will follow. Create a page called `[[roam/agent guidelines]]` with your instructions. These might include naming conventions, preferred page structures, topics to focus on, or any other context that should guide how the AI interacts with your graph. The AI is instructed to call this tool first when starting work on a graph.

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
- `get_page` - Get page content as markdown
- `get_block` - Get block content as markdown
- `get_backlinks` - Get references to a page/block

**Navigation:**
- `get_focused_block` - Current focused block
- `get_main_window` - Current main window view (outline, log, graph, diagram, pdf, search, or custom)
- `get_sidebar_windows` - All open windows in the right sidebar
- `open_main_window` - Navigate to page/block
- `open_sidebar` - Open in right sidebar

**Files:**
- `file_get` - Fetch a file hosted on Roam (handles decryption for encrypted graphs)
- `file_upload` - Upload a file to Roam (from local path, URL, or base64)
- `file_delete` - Delete a file hosted on Roam

## CLI

A command-line interface is also available with the same tools as the MCP server:

```bash
npm run cli -- <tool-name> [options]

# Examples
npm run cli -- search --query "my notes"
npm run cli -- get-page --title "My Page"
npm run cli -- create-block --parentUid "abc123" --markdown "Hello world"
```

Run `npm run cli -- --help` to see all available commands.

## Contributing

This project is changing rapidly. At this time, we prefer suggestions and feedback over pull requests. Please open an issue or join the #ai-in-roam channel on slack to discuss ideas before submitting code. 
