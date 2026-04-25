# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run Commands

```bash
npm run build        # Compile TypeScript (tsc --build, builds core → local → mcp + cli)
npm run clean        # Remove build artifacts (dist/ and tsbuildinfo)
npm run typecheck    # Type-check (force rebuild, checks all packages)
npm run lint         # Lint with ESLint
npm run lint:fix     # Lint and auto-fix
npm run format       # Format with Prettier
npm run format:check # Check formatting without writing
npm run mcp          # Run MCP server in dev mode (tsx with development condition)
npm run mcp -- connect              # Interactive setup for graph tokens (via MCP binary)
npm run cli -- <command> [options]  # Run CLI in dev mode
npm run cli -- connect              # Interactive setup for graph tokens (via CLI)
npm run cli -- connect --graph <name> --nickname <name>  # Non-interactive setup (for scripts/agents)
npm test --workspace @roam-research/roam-tools-core   # Run core's vitest suite
npm test --workspace @roam-research/roam-tools-local  # Run local's vitest suite
```

## Version Bumps

The version must be updated in 9 places across four packages. Use the automated script:

```bash
npm run version:bump 0.6.1    # Updates all 9 locations at once
npm install                    # Sync package-lock.json
```

The 9 locations:

1. `packages/core/package.json` — `"version"` field
2. `packages/local/package.json` — `"version"` field
3. `packages/local/package.json` — `@roam-research/roam-tools-core` dependency version
4. `packages/mcp/package.json` — `"version"` field
5. `packages/mcp/package.json` — `@roam-research/roam-tools-local` dependency version
6. `packages/cli/package.json` — `"version"` field
7. `packages/cli/package.json` — `@roam-research/roam-tools-local` dependency version
8. `packages/mcp/src/index.ts` — `McpServer` constructor `version` string
9. `packages/cli/src/index.ts` — Commander `.version()` call

Run `npm run version:check` to verify all versions are consistent.

## Architecture

This is a monorepo with four npm packages for Roam Research tools:

| Package                           | Bin        | Purpose                                                               |
| --------------------------------- | ---------- | --------------------------------------------------------------------- |
| `@roam-research/roam-tools-core`  | none       | Transport-agnostic core: types, schemas, tool registry, dispatch      |
| `@roam-research/roam-tools-local` | none       | Local Roam Desktop API transport (RoamClient, config reader, connect) |
| `@roam-research/roam-mcp`         | `roam-mcp` | MCP server (consumes local)                                           |
| `@roam-research/roam-cli`         | `roam`     | CLI (consumes local)                                                  |

The split exists so a hosted MCP transport (in a separate repo, `relemma/functions_v2`) can depend on `roam-tools-core` directly and inject its own graph resolver + WorkOS-authenticated client without dragging the local-Desktop-API code along.

### Entry Points

- `packages/mcp/src/index.ts` - MCP server using stdio transport. Also handles `roam-mcp connect` subcommand (detects `process.argv[2] === "connect"` and dynamically imports the connect module from `@roam-research/roam-tools-local/connect`).
- `packages/cli/src/index.ts` - CLI using Commander.js. Dynamically generates commands from the same tool definitions.
- `packages/local/src/connect.ts` - Setup command for token exchange with Roam, shared by both MCP and CLI. Has two modes: interactive (no flags, uses inquirer prompts) and non-interactive (`--graph` flag, uses CLI options). Exposed as a separate export entry point (`@roam-research/roam-tools-local/connect`) to avoid loading `@inquirer/prompts` during normal MCP server operation.

### Core Layer (`packages/core/src/`)

Transport-agnostic. Knows nothing about local files, ports, or Roam Desktop. Hosted consumers can depend on this package alone.

- `index.ts` - Barrel export. Exposes types, schemas, tool registry, helpers, and `routeToolCall`. Does NOT export `RoamClient`, the `~/.roam-tools.json` reader, or `connect` — those live in `roam-tools-local`.

- `tools.ts` - Central tool registry. After the split, core only registers **client tools** (require a graph + RoamActionClient). Standalone tools (`list_graphs`, `setup_new_graph`) live in `roam-tools-local` since they touch local config and the Desktop API. Exports:
  - `dataTools` (graph content — reusable across local + hosted MCP)
  - `desktopUiTools` (file ops, window/selection — local Desktop only)
  - `contentTools = [...dataTools, ...desktopUiTools]` for back-compat
  - `tools = [...dataTools, ...desktopUiTools]` (alias of contentTools at this layer)
  - `findTool`, `routeToolCall` (REQUIRES `resolveGraph` + `createClient` in options)
  - `defineTool`, `defineStandaloneTool` (helpers for downstream consumers)

- `types.ts` - TypeScript types, Zod schemas for config validation, error codes and `RoamError` class. Notably defines:
  - `RoamActionClient` — structural client interface (`call()` + optional `getTokenInfo()`); both `RoamClient` (in local) and a hosted `RoamCloudClient` (out-of-repo) satisfy it.
  - `ToolGraph` — cross-transport graph identity (`name, type, nickname, optional accessLevel + token`).
  - `ResolvedGraph extends ToolGraph` — adds required `token` and the local-only `lastKnownTokenStatus`.

### Local Layer (`packages/local/src/`)

Wraps core with the Roam Desktop transport.

- `index.ts` - Barrel export. Re-exports core's full surface (so MCP and CLI need only one import) and adds local-only symbols. Notably **shadows** core's `tools`, `findTool`, and `routeToolCall` with versions that include the local standalone tools and bake in defaults.

- `connect.ts` - Graph connection/setup logic. Exported separately as `@roam-research/roam-tools-local/connect` (not part of the main barrel) to isolate the `@inquirer/prompts` dependency.

- `tools.ts` - Local-defaults wrapper. Exports:
  - `graphManagementTools` (the two standalone tools: `list_graphs`, `setup_new_graph`)
  - `tools` (combined: graphManagementTools + core's tools)
  - `findTool` (searches the combined tools array)
  - `defaultResolveGraph` (delegates to `resolveGraph`)
  - `defaultCreateClient` (constructs `RoamClient` from `graph.token` + `getPort()`)
  - `routeToolCall` wrapper that fills in those defaults, defaults `tokenInfoMode` to `"local-sync"`, and dispatches local standalone tools directly (since core no longer knows about them)

- `client.ts` - `RoamClient` class for authenticated HTTP calls to Roam's local API. Requires token and graph type.

- `graph-resolver.ts` - Loads config from `~/.roam-tools.json`, resolves graphs by nickname or name (stateless, no session state).

- `roam-api.ts` - Shared API functions (fetch available graphs, request tokens, helpers) used by both `connect` and the `setup_new_graph` tool.

- `types.ts` - `RoamClientConfig` (constructor config for the local `RoamClient`).

### Operations

Core operations in `packages/core/src/operations/` are organized by domain:

- `pages.ts` - Create, get, update, delete pages; get graph guidelines
- `blocks.ts` - Create, get, update, delete, move blocks; get backlinks; comments
- `search.ts` - Text search and template search
- `query.ts` - Execute Roam queries
- `datalog.ts` - Raw datalog queries
- `navigation.ts` - Window management (main window, sidebar)
- `files.ts` - File upload, download, delete

Local-only operations in `packages/local/src/operations/`:

- `graphs.ts` - Graph management (list, setup new graph)

### Configuration

**`~/.roam-tools.json`** - Required config file with graph tokens (read by `roam-tools-local`):

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

Config versioning: `CONFIG_VERSION` in `core/types.ts` defines the current version. If a client reads a config with a higher version number, it throws `CONFIG_TOO_NEW` before Zod validation (in case the schema changed).

**`~/.roam-local-api.json`** - Written by Roam, provides port (default: 3333)

### Key Patterns

- **Transport-agnostic dispatch**: `core/routeToolCall(name, args, options)` requires `options.resolveGraph` and `options.createClient`. Local consumers go through `local/routeToolCall(name, args)` which fills those in. Hosted consumers (out-of-repo) supply their own.
- All client tools get an optional `graph` parameter via `withGraph()` helper (in `core/tools.ts`)
- Standalone tools (`list_graphs`, `setup_new_graph`) don't use withGraph and live in `local/tools.ts`
- Zod schemas drive both validation and CLI option generation
- `RoamError` class carries error codes and context for structured error responses
- API versioning: `EXPECTED_API_VERSION` in `core/types.ts` is sent as `expectedApiVersion` in every request body (`local/client.ts`). Roam checks that major.minor match exactly — **patch is ignored**. So `1.1.0` and `1.1.2` are compatible, but `1.1.x` and `1.2.x` are not. On mismatch, `handleVersionMismatch()` in `local/client.ts` compares server vs expected versions and throws a `RoamError` with advice on which side to update. This is completely independent of the npm package version (`0.x.y`).
- Config I/O (`~/.roam-tools.json`): No in-memory cache — config is read fresh from disk on every tool call. Write functions (`saveGraphToConfig`, `removeGraphFromConfig`, `updateGraphTokenStatus` — all in `local/graph-resolver.ts`) read the file at the last moment, apply the change, and write immediately. Invalid config errors are returned to the agent as `RoamError` (no `process.exit`), so the agent can tell the user what's wrong.
- `tokenInfoMode`: core's default is `"skip"` (transport-agnostic — local concerns are opt-in). Local's wrapper passes `"local-sync"` explicitly to preserve the desktop token-info side flow on `get_graph_guidelines`.
- Development mode: `tsx --conditions development` resolves the `"development"` export condition to source TypeScript, so `npm run mcp` / `npm run cli` work without building first.
- README maintenance: The package READMEs (`packages/mcp/README.md`, `packages/cli/README.md`) are self-contained docs that npm users see first — often the only docs they read. When adding tools, changing setup steps, or modifying behavior, update these READMEs alongside the root `README.md`. The MCP README uses underscore tool names (`list_graphs`), the CLI README uses hyphenated command names (`list-graphs`).

### Workspace Structure

```
packages/
  core/     → @roam-research/roam-tools-core   (transport-agnostic library; what hosted MCP imports)
  local/    → @roam-research/roam-tools-local  (local Desktop transport; depends on core)
  mcp/      → @roam-research/roam-mcp          (MCP server; depends on local)
  cli/      → @roam-research/roam-cli          (CLI; depends on local)
scripts/
  bump-version.mjs   → Updates all 9 version locations
  check-versions.mjs → Verifies version consistency
```

Build order is enforced via TypeScript project references (`tsconfig.build.json` references core → local → mcp + cli).

### Authentication Flow

1. Tool called → `routeToolCall()` checks tool type
2. For client tools: `options.resolveGraph()` finds graph config (local default reads `~/.roam-tools.json` by nickname/name)
3. `options.createClient(graph)` constructs the transport (local default builds a `RoamClient`)
4. HTTP POST to `http://127.0.0.1:{port}/api/{graph}?type=offline` (if offline)
5. Request includes `Authorization: Bearer {token}` header
6. If connection refused: open `roam://#/app/{graph}` deep link, retry with backoff

### Graph Resolution Priority (local resolver)

Resolution is stateless — every tool call resolves the graph independently:

1. Explicit `graph` parameter on tool call
2. Auto-select if exactly one graph configured
3. Error with available_graphs if multiple graphs and no `graph` param
