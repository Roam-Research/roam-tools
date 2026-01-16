# Optional Graph Parameter Design

## Overview

Make the `graph` parameter optional across all MCP tools and CLI commands. When not specified, the system auto-detects which graph to use based on what's currently open in Roam.

## Graph Resolution Logic

When a tool is called without a `graph` parameter:

1. Check in-memory `lastUsedGraph` state
2. Call `GET /api/graphs/open` to get list of open graphs
3. If `lastUsedGraph` is in the list → use it
4. If exactly 1 graph is open → use it, set as `lastUsedGraph`
5. If 0 graphs are open → error
6. If >1 graphs are open → error with numbered list for user selection

## Error Messages

**No graphs open:**
```
Error: No graphs are currently open in Roam. Please open a graph in the Roam desktop app.
```

**Multiple graphs open:**
```
Error: Multiple graphs are open. Please ask the user which graph to use:
1. my-notes
2. work-projects
3. personal-journal
Then include their choice as the 'graph' parameter in your next call.
```

## Architecture

### New Module: `src/core/graph-resolver.ts`

Standalone module for graph resolution:

```typescript
// In-memory state
let lastUsedGraph: string | null = null;

// Fetch open graphs from Roam API (no graph name needed)
async function getOpenGraphs(): Promise<string[]>

// Main resolution function
async function resolveGraph(providedGraph?: string): Promise<string>
```

### Tool Schema Changes

All 13 tools get an optional `graph` parameter added:

```typescript
graph: {
  type: "string",
  description: "Graph name (optional - auto-detects if omitted)"
}
```

### Router Changes

The `createRouter` function in `tools.ts`:

1. Extracts `graph` from args
2. Calls `resolveGraph(graph)` to determine actual graph
3. Creates `RoamClient` with resolved graph
4. Creates operations and dispatches to the correct method

### MCP Server Simplification

- Remove graph name requirement at startup
- Remove client/operations setup
- Server just creates handlers; router handles everything per-call

### CLI Simplification

- Remove global `-g, --graph` option
- Each command gets `--graph` from tool schema automatically
- Remove client/operations setup from handlers

## Files Changed

**Create:**
- `src/core/graph-resolver.ts` - graph resolution logic and state

**Modify:**
- `src/core/tools.ts` - add `graph` param to all tools, update router
- `src/core/types.ts` - make `graphName` optional in `RoamClientConfig`
- `src/mcp/index.ts` - simplify to just server setup
- `src/cli/index.ts` - simplify, remove global flag

## Benefits

- Zero configuration needed to start using the MCP server or CLI
- Works seamlessly when user has one graph open (most common case)
- Graceful handling of multiple graphs with clear user prompt
- Remembers last used graph within a session for convenience
- Can still explicitly specify graph when needed
