# Graph Resolution

How the MCP server determines which Roam graph to use.

## Configuration File

The MCP server reads graph configuration from `~/.roam-tools.json`:

```json
{
  "graphs": [
    {
      "name": "my-graph-name",
      "type": "hosted",
      "token": "roam-graph-local-token-...",
      "nickname": "MyGraph"
    }
  ]
}
```

Each graph requires:
- `name`: The actual graph name in Roam
- `type`: `"hosted"` (cloud) or `"offline"` (local-only)
- `token`: Local API token from Roam settings
- `nickname`: Friendly name for selection (case-insensitive)

## Resolution Order

When a tool is called, the graph is determined in this priority order:

1. **Explicit graph parameter** - If the tool call includes a `graph` param, use it
2. **Session state** - The graph selected via `select_graph` in this session
3. **Auto-select** - If exactly one graph is configured, use it automatically
4. **Error** - If multiple graphs are configured and none selected, return error with available graphs

## Nickname Resolution

Graphs can be referenced by nickname (case-insensitive) or actual name:

- `select_graph --graph "Work"` → matches nickname "Work"
- `select_graph --graph "work"` → also matches "Work"
- `select_graph --graph "my-actual-graph"` → matches by name as fallback

## Session State

Graph selection is stored per-connection (in memory, not persisted to disk):

- Auto-select happens when exactly one graph is configured
- `select_graph` updates the session state
- The explicit `graph` parameter on tools also updates session state
- Each new MCP connection starts fresh

## Port Discovery

The API port is read from `~/.roam-local-api.json` (written by Roam):

```json
{
  "port": 3333
}
```

If the file doesn't exist, defaults to port 3333.

## Error Cases

| Scenario | Result |
|----------|--------|
| Config file not found | Error: "Roam MCP config not found" with setup instructions |
| Graph not in config | Error listing available graphs |
| Multiple graphs, none selected | Error with `available_graphs` and `suggested_next_tool: "select_graph"` |
| Invalid token | Authentication error with guidance |
| Roam not running | Launches Roam via deep link and retries |

## Graph Type Handling

- **Hosted graphs** (default): Standard cloud-synced Roam graphs
- **Offline graphs**: Local-only graphs, requires `?type=offline` query param

The MCP server handles this automatically based on the `type` field in config.

## Same-Name Collision

If both a hosted and offline graph have the same name:
- The hosted graph takes precedence
- The offline graph is ignored
- A warning is logged

Use unique nicknames to avoid confusion.
