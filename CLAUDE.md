# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run Commands

```bash
npm run build        # Compile TypeScript to dist/
npm run typecheck    # Type-check without emitting
npm run mcp          # Run MCP server in dev mode (tsx)
npm run cli -- <command> [options]  # Run CLI in dev mode
npm run cli -- connect              # Interactive setup for graph tokens
```

## Architecture

This is a Model Context Protocol (MCP) server and CLI for Roam Research. Both interfaces share the same core logic.

### Entry Points

- `src/mcp/index.ts` - MCP server using stdio transport. Registers tools from `core/tools.ts` with the MCP SDK.
- `src/cli/index.ts` - CLI using Commander.js. Dynamically generates commands from the same tool definitions.
- `src/cli/connect.ts` - Interactive setup command for token exchange with Roam.

### Core Layer

- `src/core/tools.ts` - Central tool registry. Two types of tools:
  - **Standalone tools** (graph management): Handle their own resolution
  - **Client tools**: Require a RoamClient with resolved graph

- `src/core/client.ts` - `RoamClient` class for authenticated HTTP calls to Roam's local API. Requires token and graph type.

- `src/core/graph-resolver.ts` - Loads config from `~/.roam-tools.json`, resolves graphs by nickname or name (stateless, no session state).

- `src/core/types.ts` - TypeScript types, Zod schemas for config validation, error codes and `RoamError` class.

### Operations

Operations in `src/core/operations/` are organized by domain:
- `graphs.ts` - Graph management (list)
- `pages.ts` - Create, get, update, delete pages; get graph guidelines
- `blocks.ts` - Create, get, update, delete, move blocks; get backlinks
- `search.ts` - Text search and template search
- `query.ts` - Execute Roam queries
- `navigation.ts` - Window management (main window, sidebar)
- `files.ts` - File upload, download, delete

### Configuration

**`~/.roam-tools.json`** - Required config file with graph tokens:
```json
{
  "graphs": [
    {
      "name": "actual-graph-name",
      "type": "hosted",
      "token": "roam-graph-local-token-...",
      "nickname": "my-graph",
      "accessLevel": "full"
    }
  ]
}
```

**`~/.roam-local-api.json`** - Written by Roam, provides port (default: 3333)

### Key Patterns

- All client tools get an optional `graph` parameter via `withGraph()` helper
- Standalone tools (list_graphs) don't use withGraph
- Zod schemas drive both validation and CLI option generation
- `RoamError` class carries error codes and context for structured error responses
- API versioning: `EXPECTED_API_VERSION` in types.ts must match Roam's API version

### Authentication Flow

1. Tool called → `routeToolCall()` checks tool type
2. For client tools: `resolveGraph()` finds graph config by nickname/name
3. `RoamClient` created with `graphName`, `graphType`, `token`
4. HTTP POST to `http://127.0.0.1:{port}/api/{graph}?type=offline` (if offline)
5. Request includes `Authorization: Bearer {token}` header
6. If connection refused: open `roam://#/app/{graph}` deep link, retry with backoff

### Graph Resolution Priority

Resolution is stateless — every tool call resolves the graph independently:

1. Explicit `graph` parameter on tool call
2. Auto-select if exactly one graph configured
3. Error with available_graphs if multiple graphs and no `graph` param
