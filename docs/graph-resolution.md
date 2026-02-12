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
      "nickname": "my-graph"
    }
  ]
}
```

Each graph requires:
- `name`: The actual graph name in Roam
- `type`: `"hosted"` (cloud) or `"offline"` (local-only)
- `token`: Local API token from Roam settings
- `nickname`: Slug identifier for the graph (lowercase, hyphens, no spaces). Must match `[a-z0-9]+(-[a-z0-9]+)*`

## Resolution Order

Graph resolution is stateless — every tool call resolves the graph independently:

1. **Explicit graph parameter** — If the tool call includes a `graph` param, look it up by nickname (or name as fallback)
2. **Auto-select** — If exactly one graph is configured, use it automatically
3. **Error** — If multiple graphs are configured and no `graph` param is provided, return error with `available_graphs` inline

## Nickname Resolution

Graphs are referenced by nickname (case-insensitive) with a fallback to the canonical name:

- `--graph "my-graph"` → matches nickname "my-graph"
- `--graph "my-actual-graph"` → matches by canonical name as fallback

Nicknames are constrained to slugs (`[a-z0-9]+(-[a-z0-9]+)*`). The `connect` CLI auto-slugifies user input.

## Response Format

All client tool responses are prefixed with `Roam graph: {nickname}` so the agent always knows which graph it's operating on.

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
| Multiple graphs, no `graph` param | Error with `available_graphs` inline — no extra `list_graphs` call needed |
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
