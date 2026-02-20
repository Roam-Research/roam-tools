# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run Commands

```bash
npm run build        # Compile TypeScript (tsc --build, builds core → mcp + cli)
npm run typecheck    # Type-check (force rebuild, checks all packages)
npm run mcp          # Run MCP server in dev mode (tsx with development condition)
npm run cli -- <command> [options]  # Run CLI in dev mode
npm run cli -- connect              # Interactive setup for graph tokens
npm run cli -- connect --graph <name> --nickname <name>  # Non-interactive setup (for scripts/agents)
```

## Version Bumps

The version must be updated in 7 places across three packages. Use the automated script:

```bash
npm run version:bump 0.5.0    # Updates all 7 locations at once
npm install                    # Sync package-lock.json
```

The 7 locations:
1. `packages/core/package.json` — `"version"` field
2. `packages/mcp/package.json` — `"version"` field
3. `packages/mcp/package.json` — `@roam-research/roam-tools-core` dependency version
4. `packages/cli/package.json` — `"version"` field
5. `packages/cli/package.json` — `@roam-research/roam-tools-core` dependency version
6. `packages/mcp/src/index.ts` — `McpServer` constructor `version` string
7. `packages/cli/src/index.ts` — Commander `.version()` call

Run `npm run version:check` to verify all versions are consistent.

## Architecture

This is a monorepo with three npm packages for Roam Research tools:

| Package | Bin | Purpose |
|---------|-----|---------|
| `@roam-research/roam-tools-core` | none | Shared core (client, tools, operations, config, types) |
| `@roam-research/roam-mcp` | `roam-mcp` | MCP server only |
| `@roam-research/roam-cli` | `roam` | CLI only |

### Entry Points

- `packages/mcp/src/index.ts` - MCP server using stdio transport. Imports from `@roam-research/roam-tools-core`.
- `packages/cli/src/index.ts` - CLI using Commander.js. Dynamically generates commands from the same tool definitions.
- `packages/cli/src/connect.ts` - Setup command for token exchange with Roam. Has two modes: interactive (no flags, uses inquirer prompts) and non-interactive (`--graph` flag, uses CLI options). Both paths must be kept in sync when modifying the connect flow.

### Core Layer (`packages/core/src/`)

- `index.ts` - Barrel export. MCP and CLI import everything from `@roam-research/roam-tools-core` which resolves to this file.

- `tools.ts` - Central tool registry. Two types of tools:
  - **Standalone tools** (graph management): Handle their own resolution
  - **Client tools**: Require a RoamClient with resolved graph

- `client.ts` - `RoamClient` class for authenticated HTTP calls to Roam's local API. Requires token and graph type.

- `graph-resolver.ts` - Loads config from `~/.roam-tools.json`, resolves graphs by nickname or name (stateless, no session state).

- `roam-api.ts` - Shared API functions (fetch available graphs, request tokens, helpers) used by both CLI connect and the MCP `setup_new_graph` tool.

- `types.ts` - TypeScript types, Zod schemas for config validation, error codes and `RoamError` class.

### Operations

Operations in `packages/core/src/operations/` are organized by domain:
- `graphs.ts` - Graph management (list, setup new graph)
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
  "version": 1,
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

Config versioning: `CONFIG_VERSION` in `types.ts` defines the current version. If a client reads a config with a higher version number, it throws `CONFIG_TOO_NEW` before Zod validation (in case the schema changed).

**`~/.roam-local-api.json`** - Written by Roam, provides port (default: 3333)

### Key Patterns

- All client tools get an optional `graph` parameter via `withGraph()` helper
- Standalone tools (list_graphs, setup_new_graph) don't use withGraph
- Zod schemas drive both validation and CLI option generation
- `RoamError` class carries error codes and context for structured error responses
- API versioning: `EXPECTED_API_VERSION` in types.ts must match Roam's API version
- Config I/O (`~/.roam-tools.json`): No in-memory cache — config is read fresh from disk on every tool call. Write functions (`saveGraphToConfig`, `removeGraphFromConfig`, `updateGraphTokenStatus`) read the file at the last moment, apply the change, and write immediately. Invalid config errors are returned to the agent as `RoamError` (no `process.exit`), so the agent can tell the user what's wrong.
- Development mode: `tsx --conditions development` resolves core's `"development"` export condition to source TypeScript, so `npm run mcp` / `npm run cli` work without building core first.

### Workspace Structure

```
packages/
  core/     → @roam-research/roam-tools-core (shared library)
  mcp/      → @roam-research/roam-mcp (MCP server)
  cli/      → @roam-research/roam-cli (CLI)
scripts/
  bump-version.mjs   → Updates all 7 version locations
  check-versions.mjs → Verifies version consistency
```

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
