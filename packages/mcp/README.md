# @roam-research/roam-mcp

A [Model Context Protocol](https://modelcontextprotocol.io/) (MCP) server for [Roam Research](https://roamresearch.com/).

Connects Claude, Cursor, and other MCP clients to your Roam graphs for reading, writing, and searching.

## Setup

### 1. Connect a graph

```bash
npx @roam-research/roam-cli connect
```

### 2. Add to your MCP client

**Claude Desktop** — add to your config file:

```json
{
  "mcpServers": {
    "roam": {
      "command": "npx",
      "args": ["-y", "@roam-research/roam-mcp"]
    }
  }
}
```

**Claude Code:**

```bash
claude mcp add -s user roam-mcp -- npx -y @roam-research/roam-mcp
```

## Documentation

See the [main repository](https://github.com/Roam-Research/roam-tools) for full documentation, available tools, and CLI usage.
