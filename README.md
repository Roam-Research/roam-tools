# Roam MCP

A Model Context Protocol (MCP) server and CLI for Roam Research.

> **Alpha Software**: This project is in early development and subject to breaking changes. The CLI is currently untested (coming soon).

## Getting Started

### 1. Enable the Local API in Roam

The local API is available in the desktop app.

In the menu bar, open settings and check "Enable Local API".

### 2. Install

```bash
git clone https://github.com/YOUR_USERNAME/roam-mcp.git
cd roam-mcp
npm install
npm run build
```

### 3. Add to Claude Desktop

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "roam": {
      "command": "node",
      "args": ["/path/to/roam-mcp/dist/mcp/index.js", "your-graph-name"]
    }
  }
}
```

Replace `/path/to/roam-mcp` with the actual path and `your-graph-name` with your Roam graph name.

## Available Tools

**Content:**
- `create_page` - Create page with markdown content
- `create_block` - Add markdown content under a parent
- `update_block` - Update block content/properties
- `delete_block` - Delete a block
- `delete_page` - Delete a page

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

## Contributing

This project is changing rapidly. At this time, we prefer suggestions and feedback over pull requests. Please open an issue to discuss ideas before submitting code.
