# Roam Local API: Reference for MCP Server Implementors

> **Audience:** An LLM (or developer) working on `roam-mcp`, the MCP server that connects AI tools to Roam Research via the Local API.
>
> **Purpose:** This is the authoritative reference for the HTTP API contract exposed by the Roam Desktop (Electron) app. Use this to verify that the MCP server's API calls, authentication handling, error handling, configuration, and graph management are correct.
>
> **Last Updated:** February 2026

---

## 1. Architecture Overview

The Roam Desktop app runs an HTTP server on localhost that allows external tools (like roam-mcp) to interact with Roam graphs programmatically.

```
roam-mcp (MCP Server)
    │
    │  HTTP POST to localhost:{port}/api/{graph-name}
    │  Authorization: Bearer roam-graph-local-token-...
    │
    ▼
Roam Desktop App (Electron)
    ├── Express Server (main process, 127.0.0.1 only)
    │   ├── Token validation middleware
    │   └── Forwards request via IProcess
        ├── Scope enforcement (2 levels)
        └── Executes roamAlphaAPI function against DataScript
```

Key facts:
- The server binds to `127.0.0.1` only (localhost). It is not accessible from the network.
- The server is **always running** when the Electron app is running (no enable/disable toggle — the old toggle was removed).
- **All API calls require a valid Bearer token** (this is a breaking change from the old unauthenticated API).
- The server port is **not hardcoded**. It defaults to 3333 but auto-increments if that port is in use.

---

## 2. Port Discovery

On startup, the Roam Desktop app writes:

```
~/.roam-local-api.json
```

Contents:
```json
{
  "port": 3333
}
```

**The MCP server MUST read this file to discover the port.** Do not hardcode 3333.

**Important change:** The `last-graph` field was removed from this file. It previously contained the name of the last-used graph. The file now only contains `port`. If your code reads `last-graph` from this file, remove that code.

---

## 3. Authentication: Token System

### 3.1 Token Format

Tokens follow this format:

**Secret token** (what the user gives you, what you send in the Authorization header):
```
roam-graph-local-token-{29-character-nanoid}
```
- Total length: **52 characters** (23-char prefix + 29-char secret)
- Prefix: `roam-graph-local-token-`
- ~174 bits of entropy

**Important:** The prefix is `roam-graph-local-token-` (with "local" in it). This is different from remote API tokens which use `roam-graph-token-` (no "local"). The Local API only accepts local tokens. If a remote token is sent, the server returns 401 with message "This endpoint requires a local API token".

### 3.2 Sending the Token

Include the token in the `Authorization` header as a Bearer token:

```
Authorization: Bearer roam-graph-local-token-R8KP2tPuxcUflAo_7tkc5lOPgo7ki
```

### 3.3 Token Properties

Tokens are:
- **Per-graph**: A token is valid for exactly one graph (identified by graph name + graph type)
- **Per-computer**: Tokens only work on the computer where they were created
- **Non-expiring**: Tokens do not expire; they must be manually revoked by the user
- **Scoped**: Each token has a set of permission scopes (see Section 6)

### 3.4 Authentication Error Responses

All error responses have this shape:
```json
{
  "success": false,
  "error": {
    "message": "Human-readable error description"
  }
}
```

| Scenario | HTTP Status | Error Message |
|----------|-------------|---------------|
| No Authorization header | 401 | "Authorization header with Bearer token is required" |
| Token doesn't start with any recognized prefix | 401 | "Invalid token format" |
| Token has remote prefix (`roam-graph-token-`) not local | 401 | "This endpoint requires a local API token" |
| Token is valid format but not found for this graph | 401 | "Invalid or expired token" |
| Token file on disk is corrupted | 500 | "Token file corrupted. Check local-api-tokens.edn" |

---

## 4. API Endpoints

### 4.1 Main API Endpoint (Authenticated)

```
POST /api/{graph-name}
```

This is the primary endpoint. All roamAlphaAPI operations go through here.

**URL Parameters:**
- `{graph-name}` — The Roam graph name (e.g., `my-work-notes`)

**Query Parameters:**
- `type` — Graph type. Values: `"hosted"` (default) or `"offline"`. If omitted or any value other than `"offline"`, defaults to `"hosted"`.

**Headers:**
- `Authorization: Bearer roam-graph-local-token-...` (required)
- `Content-Type: application/json` (required)

**Request Body:**
```json
{
  "action": "data.block.create",
  "args": [{"location": {"parent-uid": "abc123", "order": 0}, "block": {"string": "Hello"}}],
  "expectedApiVersion": 1
}
```

- `action` (string, required) — Dot-separated path under `window.roamAlphaAPI` (e.g., `data.q`, `data.pull`, `data.block.create`, `data.ai.getPage`)
- `args` (array, required) — Arguments to pass to the roamAlphaAPI function
- `expectedApiVersion` (number, optional) — If provided, the API checks compatibility and returns an error if mismatched

**Successful Response:**
```json
{
  "success": true,
  "result": "<whatever the roamAlphaAPI function returns>"
}
```

**Error Response (scope violation):**
```json
{
  "success": false,
  "error": {
    "code": "INSUFFICIENT_SCOPE",
    "message": "Token does not have permission for this action. Your token can only be used for read only."
  }
}
```

```json
{
  "success": false,
  "error": {
    "code": "SCOPE_EXCEEDS_PERMISSION",
    "message": "You do not have sufficient permission for this action. This requires higher permission than the logged in user has."
  }
}
```

**Examples:**

Hosted graph (default):
```bash
curl -X POST http://localhost:3333/api/my-graph \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer roam-graph-local-token-R8KP2tPuxcUflAo_7tkc5lOPgo7ki" \
  -d '{"action": "data.ai.getPage", "args": [{"title": "Test"}]}'
```

Offline graph:
```bash
curl -X POST "http://localhost:3333/api/my-graph?type=offline" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer roam-graph-local-token-AbCdEfGh..." \
  -d '{"action": "data.ai.getPage", "args": [{"title": "Test"}]}'
```

### 4.2 Discovery Endpoints (Unauthenticated)

These endpoints do **not** require a token. They exist for tool discovery but have security concerns noted (they expose graph names to any local process).

```
GET /api/graphs/open
```
Returns a list of currently open graph windows.

Response includes graph type information:
```json
[
  {"name": "my-work-graph", "type": "hosted"},
  {"name": "my-local-graph", "type": "offline"}
]
```

```
GET /api/graphs/available
```
Returns all graphs the user can access.

**Note for MCP implementors:** The architecture decision is that **the MCP server should NOT rely on these discovery endpoints for normal operation**. The graph name and token should come from user configuration (env vars or config file). These endpoints may be removed or authenticated in the future.

### 4.3 Token Exchange Endpoint (Unauthenticated)

```
POST /api/graphs/tokens/request
Content-Type: application/json
```

This endpoint allows external tools to **programmatically request a token** from the user. It opens a permission dialog in the Roam desktop app.

**Request Body:**
```json
{
  "graph": "my-graph-name",
  "description": "Claude MCP",
  "accessLevel": "read-append",
  "graphType": "hosted",
  "ai": true
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `graph` | string | Yes | Graph name |
| `description` | string | Yes | Human-readable description of what the token is for |
| `accessLevel` | string | Yes | One of: `"read-only"`, `"read-append"`, `"full"`. No default — must be explicit. |
| `graphType` | string | No | `"hosted"` (default) or `"offline"` |
| `ai` | boolean | No | Whether this token will be used by an AI agent |

**Note:** `deviceName` is NOT a parameter. Device name is auto-detected from the OS hostname or the user's saved preferred device name. The user can modify it in the permission dialog.

**Note:** `"read-edit-own"` is currently disabled as an access level.

**Flow:**
1. MCP server sends the request
2. Roam opens/focuses the graph window
3. A permission dialog appears to the user with three choices:
   - **Allow & Configure** — Opens a token creation dialog pre-filled with the request values. User can modify before saving.
   - **Deny** — Rejects this request.
   - **Never Allow** — Blocks ALL future token exchange requests for this graph permanently.
4. If the user allows and creates the token, the HTTP response returns the secret token.

**Responses:**

| Scenario | HTTP Status | Response |
|----------|-------------|----------|
| User approved | 200 | `{"success": true, "token": "roam-graph-local-token-...", "graphName": "...", "graphType": "hosted", "grantedAccessLevel": "read-append", "grantedScopes": {"read": true, "append": true}}` |
| User rejected | 403 | `{"success": false, "error": {"code": "USER_REJECTED", "message": "..."}}` |
| Graph permanently blocked | 403 | `{"success": false, "error": {"code": "GRAPH_BLOCKED", "message": "..."}}` |
| Another request already in progress | 409 | `{"success": false, "error": {"code": "REQUEST_IN_PROGRESS", "message": "..."}}` |
| User didn't respond within 5 minutes | 408 | `{"success": false, "error": {"code": "TIMEOUT", "message": "..."}}` |
| Invalid request body | 400 | `{"success": false, "error": {"code": "VALIDATION_ERROR", "message": "..."}}` |
| Client disconnected | N/A | `{"success": false, "error": {"code": "CANCELLED", "message": "..."}}` |

**Important behaviors:**
- **5-minute timeout**: The user has 5 minutes to respond. This is long because encrypted graphs may require a password before the dialog appears.
- **One at a time**: Only one token exchange request per `[graph-type, graph-name]` can be in progress. Concurrent requests get 409.
- **Scope downgrading**: If a reader gets a request for "full" access, it's automatically downgraded to "read-only". The `grantedAccessLevel` and `grantedScopes` in the response reflect what was actually granted, which may differ from what was requested.
- **Graph auto-open**: If the graph isn't open, Roam will open it automatically.
- **Never Allow is persistent**: If the user clicks "Never Allow", the graph is permanently blocked for token exchange. Future requests return 403 GRAPH_BLOCKED immediately without showing a dialog. The user must manually unblock via Roam settings.

---

## 5. Graph Types: Hosted vs Offline

Roam has two types of graphs:
- **Hosted** (default): Cloud-synced graphs stored in Firebase
- **Offline**: Local-only graphs stored only on the user's computer

**How this affects the MCP server:**

1. **Tokens are scoped to (graph-name, graph-type)**: A token for hosted graph "notes" does NOT work for offline graph "notes" (even if they have the same name).

2. **The `?type=` query parameter**: When calling `POST /api/{graph}`, pass `?type=offline` for offline graphs. Omitting it or passing `?type=hosted` targets the hosted graph.

3. **The MCP server should abstract this away from the AI agent**: The AI agent should only see graph names/nicknames. The MCP server should internally track each graph's type and include the correct `?type=` parameter.

4. **Config file format**: Each graph entry has a `type` field that defaults to `"hosted"`.

---

## 6. Token Scopes and Permissions

### 6.1 Scope Flags

Local API tokens use **composable capability flags** (not mutually exclusive roles):

| Flag | What it allows |
|------|---------------|
| `read` | Queries, pulls, property access, UI operations, `data.ai.*` methods |
| `append` | Create new blocks and pages (but not modify/delete existing ones) |
| `edit` | Modify or delete any existing content. **Implicitly includes `append`** — a token with only `{edit: true}` can also create. |

**Hierarchy**: `edit` implies `append` implies `read`. A token with `{read: true, edit: true}` can do everything.

### 6.2 Scope Presets

Tokens are created using presets (users pick from a dropdown, not individual checkboxes):

| Preset Key | Label | Scopes Map |
|------------|-------|------------|
| `read-only` | Read only | `{read: true}` |
| `read-append` | Read + Append | `{read: true, append: true}` |
| `full` | Full access | `{read: true, append: true, edit: true}` |

Note: `read-edit-own` is defined but currently **disabled**.

### 6.3 Action Classification

Every roamAlphaAPI action requires a minimum scope:

**Append-required actions** (need `append` scope):
`data.block.create`, `data.page.create`, `data.block.fromMarkdown`, `data.page.fromMarkdown`, `file.upload`, `data.user.upsert`, `createBlock`, `createPage`, `batchActions` (when containing creates)

**Edit-required actions** (need `edit` scope):
`data.block.update`, `data.block.delete`, `data.block.move`, `data.page.update`, `data.page.delete`, `data.undo`, `data.redo`, `file.delete`, `updateBlock`, `deleteBlock`, `moveBlock`, `updatePage`, `deletePage`

**Read actions** (need only `read` scope):
Everything else — `data.q`, `data.pull`, `data.ai.getPage`, `data.ai.getBlock`, `graph.name`, `ui.*`, etc.

### 6.4 Two-Level Enforcement

Scopes are enforced in the **renderer process** with two checks:

1. **Token scope check**: Does the token have the required scope for this action?
   - Failure: HTTP 403 with `code: "INSUFFICIENT_SCOPE"`

2. **User permission check**: Does the logged-in Roam user have permission for this action?
   - Failure: HTTP 403 with `code: "SCOPE_EXCEEDS_PERMISSION"`

**Why this matters for MCP:** If a user creates a full-access token as an editor and is later demoted to reader, the token still works for read operations. Only write attempts fail. The MCP server should handle `INSUFFICIENT_SCOPE` and `SCOPE_EXCEEDS_PERMISSION` errors gracefully and explain to the user what happened.

---

## 7. MCP Server Configuration

### 7.1 Environment Variables (Single-Graph — Most Common)

```json
{
  "mcpServers": {
    "roam": {
      "command": "npx",
      "args": ["roam-mcp"],
      "env": {
        "ROAM_API_TOKEN": "roam-graph-local-token-R8KP2tPuxcUflAo_7tkc5lOPgo7ki",
        "ROAM_GRAPH": "my-graph-name",
        "ROAM_GRAPH_TYPE": "hosted"
      }
    }
  }
}
```

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ROAM_API_TOKEN` | Yes | — | The secret token (52 chars, starts with `roam-graph-local-token-`) |
| `ROAM_GRAPH` | Yes | — | The graph name |
| `ROAM_GRAPH_TYPE` | No | `"hosted"` | `"hosted"` or `"offline"` |

### 7.2 Config File (Multi-Graph)

```json
{
  "mcpServers": {
    "roam": {
      "command": "npx",
      "args": ["roam-mcp", "--config", "~/.roam-tools.json"]
    }
  }
}
```

Config file (`~/.roam-tools.json`):
```json
{
  "graphs": [
    {
      "name": "jfb-work-notes-2024",
      "type": "hosted",
      "token": "roam-graph-local-token-abc...",
      "nickname": "Work",
      "description": "Work projects and meeting notes"
    },
    {
      "name": "personal-zettelkasten",
      "type": "offline",
      "token": "roam-graph-local-token-xyz...",
      "nickname": "Personal",
      "description": "Personal knowledge base"
    }
  ]
}
```

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `name` | Yes | — | Roam graph name (used in the URL path) |
| `type` | No | `"hosted"` | `"hosted"` or `"offline"` |
| `token` | Yes | — | Secret token for this graph |
| `nickname` | No | Uses `name` | Short human-friendly label |
| `description` | No | — | Longer description shown to the AI |

### 7.3 Nickname Uniqueness Constraint

**Nicknames (and graph names when no nickname is set) must be unique across all configured graphs.** This is because the AI agent identifies graphs by name/nickname only — it does not know about graph types. The MCP server must validate this on config load and return a clear error if duplicates are found.

**Note:** The MCP server does not support configuring both a hosted and offline graph with the same name. If duplicates are detected, the hosted graph takes precedence and the offline entry is ignored with a warning. Each graph name should appear only once in the config.

---

## 8. MCP Server Architecture Decisions

### 8.1 One Server, Multiple Graphs

A single MCP server instance handles all configured graphs. Do NOT require users to run separate MCP server processes per graph.

### 8.2 Session-Local Graph Selection

The MCP server maintains **in-memory session state** about which graph is "active". This is:
- Set via the `select_graph` tool
- Per-connection (not persisted to disk)
- Required before any graph operation can proceed (for multi-graph configs)

**Do NOT persist "last used graph" to disk.** This would cause cross-chat/cross-session bleed. Each MCP connection starts fresh.

### 8.3 Auto-Select for Single-Graph Users

If exactly one graph is configured (either via env vars or a config file with one entry):
- **Auto-select it on server startup** — no need for the AI to call `select_graph`
- This covers 90%+ of users

If multiple graphs are configured:
- Start with **no graph selected**
- Any tool that requires a graph returns a structured error until `select_graph` is called

### 8.4 Agent Simplicity: AI Does NOT Need to Know Graph Types

The AI agent should NEVER need to specify or think about graph types (hosted vs offline). It only uses graph names or nicknames. The MCP server internally maps each name/nickname to the correct `(name, type, token)` tuple and adds the `?type=` query parameter when calling the Local API.

### 8.5 Core Graph Management Tools

| Tool | Purpose |
|------|---------|
| `list_graphs` | Return all configured graphs with nicknames. No graph needs to be selected. |
| `select_graph` | Set active graph for the session. Should call the API to validate reachability and fetch guidelines. |
| `current_graph` | Return active graph name + metadata. Error if none selected. |

### 8.6 Guidelines on select_graph

When `select_graph` is called, the MCP server should:
1. Resolve graph by name or nickname
2. Call the Local API: `POST /api/{graph}` with `{"action": "data.ai.getGraphGuidelines", "args": [{}]}`
3. If the API call fails, `select_graph` should fail (graph unreachable or token invalid)
4. If the API call succeeds, return guidelines + metadata to the AI, set session state

This inherently validates that the graph is reachable, the token is valid, and the graph is loaded. No separate health check is needed.

### 8.7 Error Format for Graph Not Selected

When a tool is called without a selected graph (multi-graph mode):
```json
{
  "error": {
    "code": "GRAPH_NOT_SELECTED",
    "message": "No graph selected. Call select_graph(graph_name) first.",
    "available_graphs": [
      {"name": "jfb-work-notes-2024", "nickname": "Work"},
      {"name": "personal-zettelkasten", "nickname": "Personal"}
    ],
    "suggested_next_tool": "select_graph"
  }
}
```

---

## 9. Making API Calls from the MCP Server

### 9.1 Request Construction

For every API call, the MCP server must:

1. **Read the port** from `~/.roam-local-api.json`
2. **Look up the active graph's** name, type, and token
3. **Construct the URL**: `http://localhost:{port}/api/{graph-name}` with `?type=offline` if the graph type is offline (omit for hosted)
4. **Set headers**:
   - `Content-Type: application/json`
   - `Authorization: Bearer {token}`
5. **Send the POST body** with `action` and `args`

### 9.2 Response Handling

**Success:**
```json
{"success": true, "result": "..."}
```

**Errors to handle:**

| HTTP Status | Meaning | MCP Server Action |
|-------------|---------|-------------------|
| 401 | Invalid/missing token | Report auth error to user. Token may have been revoked. |
| 403 (INSUFFICIENT_SCOPE) | Token lacks permission for this action | Report scope error. User needs to create a token with broader scopes. |
| 403 (SCOPE_EXCEEDS_PERMISSION) | User's Roam permission was demoted | Report permission change. User needs to check their Roam graph access. |
| 500 | Server error (e.g., corrupted token file) | Report internal error. |
| 504 | Graph loading timeout (30 min expired) | Graph failed to load in time. May need password for encrypted graph. |
| Connection refused | Roam Desktop not running or API not available | Report that Roam Desktop needs to be running. |
| ECONNREFUSED on port | Port changed or Roam restarted | Re-read `~/.roam-local-api.json` and retry. |

### 9.3 Important: Graph Window May Need to Open

When an API call targets a graph that isn't currently open in Roam, the Local API will **automatically open a new window** for that graph. The HTTP request will block until the graph is loaded and ready.

**Server-side timeouts:**
- **30 minutes** for graph loading / API readiness (`api-ready-timeout-ms`). This is deliberately long because **encrypted graphs require the user to manually enter their decryption password** before the API becomes available. If the user isn't at their computer, the request will block for the full 30 minutes and then return HTTP 504.
- **1 hour** for actual API action execution (IPC timeout between main and renderer process).
- If the graph window is **closed or destroyed** during the wait, the request fails immediately with HTTP 500.

**For the MCP server, this means:**
- **Do not set client-side timeouts shorter than the server-side timeouts**, or the MCP will give up before the server does. For encrypted graphs, the user may genuinely need several minutes to notice the window, enter their password, and wait for the graph to load.
- The first request to a graph may be noticeably slower than subsequent ones.
- For encrypted graphs specifically, the user must be physically present to enter their password — there is no way to bypass this programmatically.

---

## 10. Token Exchange Flow (Programmatic Token Acquisition)

The MCP server can request tokens programmatically instead of requiring users to manually create them in Roam settings and copy-paste them.

### 10.1 When to Use Token Exchange

Use this when the user has NOT configured a token yet. The flow is:
1. MCP server detects missing token
2. MCP server calls `POST /api/graphs/tokens/request`
3. Roam shows a permission dialog to the user
4. User approves/rejects
5. If approved, MCP server receives the token in the HTTP response and stores it

### 10.2 Implementation Considerations

- **This is a long-polling request** (up to 5 minutes). Use appropriate timeout handling.
- **Handle 409 (REQUEST_IN_PROGRESS)**: If another tool already sent a request, wait or inform the user.
- **Handle 403 (GRAPH_BLOCKED)**: The user previously clicked "Never Allow" for this graph. Inform the user they need to unblock in Roam settings.
- **Handle 408 (TIMEOUT)**: The user didn't respond in 5 minutes. Allow retry.
- **The granted access level may differ from what was requested**: Always check `grantedAccessLevel` and `grantedScopes` in the response. A reader can only grant `read-only` even if you requested `full`.
- **Store the received token securely**: The token is shown only once.

---

## 11. CORS Notes

The Local API returns `Access-Control-Allow-Origin: *`. This is intentional — the token provides the security boundary, not CORS. The MCP server (running as a local process, not in a browser) is unaffected by CORS anyway, but this is noted for completeness.

---

## 12. Breaking Changes from the Old (Pre-Token) API

If the MCP server was built against the old unauthenticated API, these changes are required:

| Change | Old Behavior | New Behavior |
|--------|-------------|--------------|
| Authentication | None required | Bearer token required on all `/api/{graph}` calls |
| Enable toggle | User must enable API in Settings menu | API always runs; auth is the security boundary |
| `~/.roam-local-api.json` | Contains `port` and `last-graph` | Contains only `port` (`last-graph` removed) |
| Graph type | Not specified | Must specify `?type=offline` for offline graphs |
| Error format | Varied | Consistent `{success, error: {code, message}}` |
| Discovery endpoints | Primary way to find graphs | Still exist but deprecated for normal use; may require auth in future |

---

## 13. Common Pitfalls and Things to Watch For

1. **Don't hardcode port 3333.** Always read from `~/.roam-local-api.json`.

2. **Don't confuse local and remote token prefixes.** Local: `roam-graph-local-token-`. Remote: `roam-graph-token-`. The Local API rejects remote tokens.

3. **Don't forget `?type=offline` for offline graphs.** Without it, the server assumes hosted, and the token won't match.

4. **Don't send `deviceName` in token exchange requests.** It's auto-detected. Including it in the request body will be ignored.

5. **Don't assume requested access level = granted access level.** Always check `grantedAccessLevel` / `grantedScopes` in the token exchange response.

6. **Don't persist "last used graph" to disk.** Graph selection is session-local only.

7. **Don't expose graph types to the AI agent.** The agent should only see names/nicknames. The MCP server handles type internally.

8. **Don't rely on discovery endpoints.** They may be removed or authenticated. Use config-driven graph management.

9. **Handle ECONNREFUSED gracefully.** Roam Desktop may not be running. Re-read the port file and consider that Roam may have restarted on a different port.

10. **Handle scope errors distinctly from auth errors.** A 401 means the token is invalid/wrong. A 403 with `INSUFFICIENT_SCOPE` means the token is valid but lacks permission. A 403 with `SCOPE_EXCEEDS_PERMISSION` means the user's Roam permissions changed.

11. **The `accessLevel` field in token exchange must be explicit.** There is no default. You must send one of `"read-only"`, `"read-append"`, or `"full"`. Missing or invalid values return 400.

12. **Nickname matching should be case-insensitive.** When the AI calls `select_graph("work")`, it should match a graph with nickname `"Work"`.

13. **Token exchange only allows one concurrent request per graph.** If you send two requests for the same graph simultaneously, the second gets 409.

14. **The `result` field in successful responses can be any JSON type**: object, array, string, number, null, or boolean. It depends on which roamAlphaAPI function was called.

---

## 14. Quick Reference: All Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/api/{graph}` | Bearer token | Execute roamAlphaAPI action |
| POST | `/api/{graph}?type=offline` | Bearer token | Execute action on offline graph |
| GET | `/api/graphs/open` | None | List open graph windows |
| GET | `/api/graphs/available` | None | List all accessible graphs |
| POST | `/api/graphs/tokens/request` | None | Request a token (shows user dialog) |

---

## 15. Quick Reference: All Error Codes

| Code | HTTP Status | Meaning |
|------|-------------|---------|
| *(no code, just message)* | 401 | Authentication failure (missing/invalid/wrong token) |
| *(no code, just message)* | 500 | Token file corrupted |
| `INSUFFICIENT_SCOPE` | 403 | Token doesn't have required scope for this action |
| `SCOPE_EXCEEDS_PERMISSION` | 403 | Action exceeds user's current Roam permissions |
| `GRAPH_NOT_SELECTED` | *(MCP-level)* | No graph selected in multi-graph mode |
| `USER_REJECTED` | 403 | User denied token exchange request |
| `GRAPH_BLOCKED` | 403 | User previously clicked "Never Allow" for this graph |
| `REQUEST_IN_PROGRESS` | 409 | Another token exchange request is pending for this graph |
| `TIMEOUT` | 408 | Token exchange request timed out (5 min) |
| `VALIDATION_ERROR` | 400 | Invalid token exchange request body |
| `CANCELLED` | *(varies)* | Token exchange cancelled (client disconnected) |
