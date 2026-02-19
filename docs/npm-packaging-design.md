# npm Packaging Design

## What This Package Contains

This repo has two entry points that share a common core:

1. **MCP Server** (`src/mcp/index.ts`) — A Model Context Protocol server that communicates over stdio. MCP clients (Claude Desktop, Cursor, etc.) launch this process and talk to it via stdin/stdout. It exposes Roam Research operations as MCP tools.

2. **CLI** (`src/cli/index.ts`) — A command-line interface (Commander.js). Used for setup (`connect` to authenticate with a Roam graph) and direct tool access (`search`, `get-page`, etc.). Auto-generated from the same tool definitions as the MCP server.

3. **Core** (`src/core/`) — Shared layer: Roam API client, tool definitions, graph resolution, operations. Both MCP server and CLI import from here.

## Package

```
@roam-research/roam-mcp
```

Two binaries:

| Binary | Entry | Purpose | Used by |
|--------|-------|---------|---------|
| `roam-mcp` | `dist/mcp/index.js` | MCP stdio server | MCP clients |
| `roam` | `dist/cli/index.js` | CLI with subcommands | Humans |

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

### Why not `@roam-research/mcp`

With `@roam-research/mcp`, npx would look for a bin called `mcp`. Our bins are `roam-mcp` and `roam` — neither matches. With two bins and no name match, npx errors: "could not determine executable to run."

Workaround exists (`npx -p @roam-research/mcp roam-mcp`) but it's verbose and fragile for documentation.

### Why not unscoped `roam-mcp`

An unscoped name would make npx simpler (`npx roam-mcp`) but loses organizational ownership. Anyone could have registered `roam-mcp`. The `@roam-research` scope provides verified namespace ownership on npm.

## Why Two Separate Binaries (Not a Unified Entry Point)

We considered a single binary where no-args starts the MCP server and subcommands run the CLI. We rejected this because:

- **`roam` with no arguments should not silently start an MCP server.** It should show help, a wizard, or usage info. The "default" behavior of a CLI tool should be helpful to humans.
- **Future CLI evolution.** The `roam` command may grow to include interactive features (TUI, background daemon, etc.) that would conflict with MCP server mode.
- **Explicit is better.** `roam-mcp` starts the server. `roam` is the CLI. No ambiguity about what each command does.

## Why No Generic `mcp` Binary

We could have added a bin called `mcp` to make `npx @roam-research/mcp` resolve. We didn't because:

- `mcp` is extremely generic — other MCP servers may also want this name
- It pollutes the global PATH with a namespace-unsafe command
- It creates collision risk when multiple MCP packages are installed globally

`roam-mcp` is namespaced and unambiguous.

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

### Global Install

```bash
npm install -g @roam-research/roam-mcp
```

This adds both `roam-mcp` and `roam` to your PATH:

```bash
roam-mcp                            # starts MCP server (stdio)
roam connect                        # setup: connect a graph
roam search --query "my notes"      # CLI tool access
```

### From Source (development)

```bash
git clone https://github.com/Roam-Research/roam-mcp.git
cd roam-mcp
npm install
npm run build
npm run mcp                         # MCP server (dev mode)
npm run cli -- connect              # CLI (dev mode)
```

## Future: Splitting the CLI

If the CLI grows substantially, it can be split into its own package:

1. Publish `@roam-research/roam` with bin `roam`
2. Remove the `roam` bin from `@roam-research/roam-mcp` (keep only `roam-mcp`)
3. Communicate as a semver major version bump

When users update `@roam-research/roam-mcp`, npm removes bin shims that no longer exist in the `bin` field. The `roam` command disappears unless they install the new CLI package. This is clean and predictable — no ghost binaries.

The shared core code can be handled by having `@roam-research/roam` depend on `@roam-research/roam-mcp` and import its internals, or by extracting a `@roam-research/roam-core` package. This decision can be deferred until the split actually happens.
