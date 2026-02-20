# @roam-research/roam-tools-core

Shared core library for Roam Research tools. Provides the Roam API client, tool definitions, graph resolution, and operations.

> **This package is not meant to be used directly.** It is an internal dependency of [`@roam-research/roam-mcp`](https://www.npmjs.com/package/@roam-research/roam-mcp) (MCP server) and [`@roam-research/roam-cli`](https://www.npmjs.com/package/@roam-research/roam-cli) (CLI). If you want to connect an AI assistant to Roam, install `@roam-research/roam-mcp`. If you want a command-line interface, install `@roam-research/roam-cli`.

## What's in here

- **RoamClient** — authenticated HTTP client for Roam's local API
- **Tool definitions** — Zod-validated tool schemas used by both MCP and CLI
- **Operations** — page, block, search, query, file, and navigation operations
- **Graph resolution** — config loading, graph lookup, and multi-graph support
- **Types** — shared TypeScript types, error codes, and schemas

## Documentation

See the [main repository](https://github.com/Roam-Research/roam-tools) for full documentation.
