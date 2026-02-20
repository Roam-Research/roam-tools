# npm Packaging Design

## What This Repository Contains

This is a monorepo with three packages that share a common core:

1. **MCP Server** (`packages/mcp/`) — A Model Context Protocol server that communicates over stdio. MCP clients (Claude Desktop, Cursor, etc.) launch this process and talk to it via stdin/stdout. It exposes Roam Research operations as MCP tools.

2. **CLI** (`packages/cli/`) — A command-line interface (Commander.js). Used for setup (`connect` to authenticate with a Roam graph) and direct tool access (`search`, `get-page`, etc.). Auto-generated from the same tool definitions as the MCP server.

3. **Core** (`packages/core/`) — Shared layer: Roam API client, tool definitions, graph resolution, operations. Both MCP server and CLI import from here via `@roam-research/roam-tools-core`.

## Packages

| Package | Bin | Purpose | Used by |
|---------|-----|---------|---------|
| `@roam-research/roam-tools-core` | — | Shared core library | MCP, CLI (dependency) |
| `@roam-research/roam-mcp` | `roam-mcp` | MCP stdio server | MCP clients |
| `@roam-research/roam-cli` | `roam` | CLI with subcommands | Humans |

### Why three packages

- The MCP server doesn't need CLI-only dependencies (`commander`, `@inquirer/prompts`)
- The CLI doesn't need the MCP SDK for its binary
- Users who only want the MCP server don't need to download CLI dependencies
- The core library is shared and only installed once via npm deduplication

## Why `@roam-research/roam-mcp`

### npx resolution for scoped packages

When you run `npx @scope/name`, npm resolves the binary by matching the **unscoped portion** (`name`) against the package's `bin` entries. If it finds a match, it runs that binary.

- Package: `@roam-research/roam-mcp`
- npx looks for bin: `roam-mcp`
- Found → starts MCP server

This means MCP client configuration is clean and predictable:

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

No `-p` flag. No explicit binary selection. No ambiguity.

### Why `@roam-research/roam-cli`

Same npx resolution logic:

- Package: `@roam-research/roam-cli`
- npx looks for bin: `roam-cli`... no match
- But bin field has `roam` and it's the only bin, so npx resolves it

```bash
npx @roam-research/roam-cli connect
```

## Why Two Separate Binaries (Not a Unified Entry Point)

We considered a single binary where no-args starts the MCP server and subcommands run the CLI. We rejected this because:

- **`roam` with no arguments should not silently start an MCP server.** It should show help, a wizard, or usage info. The "default" behavior of a CLI tool should be helpful to humans.
- **Future CLI evolution.** The `roam` command may grow to include interactive features (TUI, background daemon, etc.) that would conflict with MCP server mode.
- **Explicit is better.** `roam-mcp` starts the server. `roam` is the CLI. No ambiguity about what each command does.

## Development Mode

The core package uses a `"development"` export condition:

```json
{
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "development": "./src/index.ts",
      "import": "./dist/index.js"
    }
  }
}
```

When running `tsx --conditions development`, imports resolve directly to TypeScript source. This means `npm run mcp` and `npm run cli` work without building core first.

## Usage

### MCP Client Configuration

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

### CLI

```bash
npx @roam-research/roam-cli connect
npx @roam-research/roam-cli search --query "my notes"
```

### Global Install

```bash
npm install -g @roam-research/roam-mcp    # MCP server
npm install -g @roam-research/roam-cli    # CLI
```

### From Source (development)

```bash
git clone https://github.com/Roam-Research/roam-tools.git
cd roam-tools
npm install
npm run build
npm run mcp                         # MCP server (dev mode)
npm run cli -- connect              # CLI (dev mode)
```

## Config Versioning

The `~/.roam-tools.json` config file includes a `version` field (default: 1). When a client reads a config with a higher version than it supports, it throws a clear "please update" error before Zod validation. This prevents confusing schema validation errors when a newer tool has changed the config format.

## Releasing a New Version

### 1. Bump the version

```bash
npm run version:bump 0.5.0    # Updates all 7 locations
npm install                    # Sync package-lock.json
```

### 2. Verify

```bash
npm run version:check    # Ensure all versions are consistent
npm run build            # Build all packages
npm run typecheck        # Type-check
```

### 3. Commit and publish

```bash
git add -A && git commit -m "bump version to X.Y.Z"
git push origin master
npm run publish:all
```

This runs version:check, builds, then publishes core → mcp → cli in order.
