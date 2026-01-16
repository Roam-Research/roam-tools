# Graph Resolution

How the MCP server determines which Roam graph to use.

## Resolution Order

When a tool is called, the graph is determined in this priority order:

1. **Explicit graph parameter** - If the tool call includes a `graph` param, use it
2. **In-memory state** - Last used graph from the current session
3. **Config file** - `last-graph` field from `~/.roam-local-api.json`
4. **Query open graphs** - Fallback: ask Roam which graphs are currently open

Once a graph is determined, it's stored in memory for subsequent calls in the same session.

## Request Execution

After resolving the graph name, the client simply makes the API request. Roam handles opening the graph if it's not already open.

## Connection Error Handling

If the Roam server isn't running (connection refused), the client:

1. Opens Roam via deep link: `roam://#/app/{graphName}`
2. Waits 3 seconds for Roam to start
3. Retries the request

This is the **only** case where the MCP server intervenes - when Roam itself isn't running.

## Config File

The config file `~/.roam-local-api.json` is written by Roam and contains:

```json
{
  "port": 3333,
  "last-graph": "my-graph-name"
}
```

## Error Cases

| Scenario | Result |
|----------|--------|
| No graph name available anywhere | Error: "Could not determine which graph to use" |
| Roam not running, no known graph | Error: "Roam is not running and no graph name is available" |
| Multiple graphs open, none specified | Error listing open graphs for user to choose |

## Design Principles

- **Keep it simple**: Just figure out the graph name and make the request
- **Let Roam do its job**: Roam handles opening graphs when you make API calls to them
- **Only intervene when necessary**: The only special case is when Roam isn't running at all
