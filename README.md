# Roam MCP

A Model Context Protocol (MCP) server and CLI for Roam Research.

## Setup

```bash
npm install
```

## Usage

### MCP Server

```bash
npm run mcp <graph-name>
# or
ROAM_GRAPH=my-graph npm run mcp
```

### CLI (coming soon)

```bash
npm run cli <graph-name> <command>
```

## Requirements

- Roam Desktop app with Local API enabled (Settings → Graph → Local API)
- Graph must be open in the desktop app

## Available Tools

**Content:**
- `create_page` - Create page with markdown content
- `create_block` - Add markdown content under a parent
- `update_block` - Update block content/properties
- `delete_block` - Delete a block
- `delete_page` - Delete a page

**Read:**
- `search` - Search pages/blocks
- `get_page` - Get page with children
- `get_block` - Get block with children
- `get_backlinks` - Get references to a page/block

**Navigation:**
- `get_focused_block` - Current focused block
- `get_main_window` - Current main window view (outline, log, graph, diagram, pdf, search, or custom)
- `get_sidebar_windows` - All open windows in the right sidebar
- `open` - Navigate to page/block
- `open_sidebar` - Open in right sidebar
