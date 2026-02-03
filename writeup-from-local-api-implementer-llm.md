# Roam Local API Reference for roam-mcp

## TODO - Remaining Work for This PR

- [ ] **Connect CLI: disable graphs** - Add option to disable/remove graphs from config
- [ ] **Single graph simplification** - Better support when only one graph configured (simplified or no graph selection tools needed)
- [ ] **Verify select_graph returns guidelines** - Check if select_graph is actually returning the agent guidelines
- [ ] **Connect CLI: handle failed exchanges** - May have issues after failing to connect in current session (concept of "existing exchange attempt" blocking retries)
- [ ] **Graph tickets concept** - Multi-graph safety: ensure guidelines are read, prevent writing to wrong graph. See: https://www.loom.com/share/cb21cc43edfc42a1bf72eb89b5482e3d

---

> **Audience:** LLM agent updating roam-mcp to work with the new token-authenticated Local API
> **Key Change:** The Local API now requires Bearer token authentication. All existing code that makes unauthenticated requests will fail with 401.

---

## Critical Changes from Pre-Token API

### What Changed

| Aspect | Before (Old API) | After (New API) |
|--------|------------------|-----------------|
| **Authentication** | None required | Bearer token required |
| **Request header** | Just `Content-Type` | Must include `Authorization: Bearer roam-graph-local-token-...` |
| **Graph type** | Implicit | Explicit via `?type=offline` query param |
| **Token acquisition** | N/A | Manual creation OR programmatic via `/api/graphs/tokens/request` |
| **Scope restrictions** | None | Tokens have scopes (read/append/edit) |
| **Error responses** | Basic | Detailed with error codes |

### What Stayed the Same

- Port discovery via `~/.roam-local-api.json`
- Request body format (`action`, `args`, `expectedApiVersion`)
- Response format (`success`, `result`, `error`)
- The actual roamAlphaAPI actions available

---

## Port Discovery

**File:** `~/.roam-local-api.json`

```json
{
  "port": 3333
}
```

Read this file to get the current port. The port may change if 3333 is in use.

**Note:** The `last-graph` field was removed. Do not rely on it.

---

## Authentication

### Token Format

All tokens have the prefix: `roam-graph-local-token-`

Full format: `roam-graph-local-token-{29-character-secret}`

Example: `roam-graph-local-token-R8KP2tPuxcUflAo_7tkc5lOPgo7ki`

### Required Header

```
Authorization: Bearer roam-graph-local-token-...
```

### Token Scopes

Tokens have one of these scope combinations:

| Preset Name | Scopes | What It Can Do |
|-------------|--------|----------------|
| `read-only` | `{:read true}` | Queries, pulls, properties only |
| `read-append` | `{:read true :append true}` | Above + create blocks/pages |
| `full` | `{:read true :append true :edit true}` | Above + update/delete/move |

**Scope hierarchy:** `edit` > `append` > `read`

A token with `edit` scope can do everything.

---

## Intended User Flow

### Flow 1: User Creates Token Manually (Recommended for Most Users)

1. User opens Roam Desktop app
2. User navigates to **Graph Settings → Local API Tokens**
3. User clicks "New Token", enters description, selects scope
4. User copies the token (shown only once)
5. User configures roam-mcp with the token

### Flow 2: Programmatic Token Request (For Better UX)

1. MCP server calls `POST /api/graphs/tokens/request`
2. Roam opens the graph window and shows permission dialog
3. User approves/denies in the Roam UI
4. If approved, MCP receives the token in the response
5. MCP stores the token for future requests

---

## API Routes

### 1. Main API Endpoint

**`POST /api/:graph`**

Execute roamAlphaAPI actions against a graph.

#### Request

**URL:** `http://localhost:{port}/api/{graph-name}`

**Query Parameters:**
| Param | Required | Default | Description |
|-------|----------|---------|-------------|
| `type` | No | `hosted` | Graph type: `hosted` or `offline` |

**Headers:**
```
Content-Type: application/json
Authorization: Bearer roam-graph-local-token-...
```

**Body:**
```json
{
  "action": "data.block.create",
  "args": [{"location": {"parent-uid": "abc123", "order": 0}, "block": {"string": "Hello"}}],
  "expectedApiVersion": "0.0.9"
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `action` | Yes | Dot-separated path under `window.roamAlphaAPI` |
| `args` | No | Array of arguments to pass to the function |
| `expectedApiVersion` | No | If provided, validates API version compatibility |

#### Success Response

**Status:** 200

```json
{
  "success": true,
  "result": { ... },
  "apiVersion": "0.0.9"
}
```

#### Error Responses

**Local API Disabled**
- **Status:** 403
- **When:** User hasn't enabled Local API in Settings
```json
{
  "success": false,
  "error": "Local API is disabled. Enable it in Settings menu."
}
```

**Missing Token**
- **Status:** 401
```json
{
  "success": false,
  "error": {
    "message": "Authorization header with Bearer token is required"
  }
}
```

**Invalid Token Format**
- **Status:** 401
```json
{
  "success": false,
  "error": {
    "message": "Invalid token format"
  }
}
```

**Remote Token Used (Wrong Token Type)**
- **Status:** 401
```json
{
  "success": false,
  "error": {
    "message": "This endpoint requires a local API token"
  }
}
```

**Token Not Found - Wrong Graph Type**
- **Status:** 401
- **When:** Token exists for the other graph type (hosted vs offline)
```json
{
  "success": false,
  "error": {
    "message": "Token is valid for offline graph 'my-graph', not hosted. Add ?type=offline to your request URL."
  }
}
```

**Token Not Found - No Tokens for Graph**
- **Status:** 401
```json
{
  "success": false,
  "error": {
    "message": "Token not recognized for hosted graph 'my-graph'. Check that the graph name is correct and create a token in Settings > Graph > Local API Tokens."
  }
}
```

**Token Not Found - Wrong Graph**
- **Status:** 401
```json
{
  "success": false,
  "error": {
    "message": "Token not valid for this graph. Check that you're using the correct token for this graph."
  }
}
```

**Token File Corrupted**
- **Status:** 500
```json
{
  "success": false,
  "error": {
    "message": "Token file corrupted. Check local-api-tokens.edn"
  }
}
```

**Insufficient Token Scope**
- **Status:** 403
- **Code:** `INSUFFICIENT_SCOPE`
- **When:** Token doesn't have required scope for the action
```json
{
  "success": false,
  "error": {
    "code": "INSUFFICIENT_SCOPE",
    "message": "Token does not have permission for this action. Your token can only be used for read only."
  }
}
```

**User Permission Exceeded**
- **Status:** 403
- **Code:** `SCOPE_EXCEEDS_PERMISSION`
- **When:** User was demoted and token exceeds their current permission
```json
{
  "success": false,
  "error": {
    "code": "SCOPE_EXCEEDS_PERMISSION",
    "message": "You do not have sufficient permission for this action. This requires higher permission than the logged in user has."
  }
}
```

**API Version Mismatch**
- **Status:** 400
- **Code:** `VERSION_MISMATCH`
```json
{
  "success": false,
  "error": {
    "code": "VERSION_MISMATCH",
    "message": "API version mismatch"
  },
  "apiVersion": "0.0.9",
  "expectedApiVersion": "0.0.8"
}
```

**Unknown Action**
- **Status:** 404
- **Code:** `UNKNOWN_ACTION`
```json
{
  "success": false,
  "error": {
    "code": "UNKNOWN_ACTION",
    "message": "API action not found: data.nonexistent.action"
  }
}
```

**Internal Error**
- **Status:** 500
```json
{
  "success": false,
  "error": {
    "message": "Some error message"
  }
}
```

---

### 2. Token Exchange (Programmatic Token Request)

**`POST /api/graphs/tokens/request`**

Request a token programmatically. Opens a permission dialog in Roam for user approval.

#### Request

**URL:** `http://localhost:{port}/api/graphs/tokens/request`

**Headers:**
```
Content-Type: application/json
```

**Body:**
```json
{
  "graph": "my-graph-name",
  "graphType": "hosted",
  "description": "roam-mcp - Claude Desktop integration",
  "accessLevel": "full",
  "ai": true
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `graph` | Yes | Graph name |
| `graphType` | No | `hosted` (default) or `offline` |
| `description` | Yes | Human-readable description shown in permission dialog |
| `accessLevel` | Yes | `read-only`, `read-append`, or `full` |
| `ai` | No | `true` if this is an AI tool (shown in UI) |

#### Success Response (User Approved)

**Status:** 200

```json
{
  "success": true,
  "token": "roam-graph-local-token-R8KP2tPuxcUflAo_7tkc5lOPgo7ki",
  "graphName": "my-graph-name",
  "graphType": "hosted",
  "grantedAccessLevel": "full",
  "grantedScopes": {
    "read": true,
    "append": true,
    "edit": true
  }
}
```

**Note:** `grantedAccessLevel` may be lower than requested if user has limited permissions (e.g., reader can only grant `read-only`).

#### Error Responses

**Local API Disabled**
- **Status:** 403
```json
{
  "success": false,
  "error": "Local API is disabled. Enable it in Settings menu."
}
```

**Missing Required Field**
- **Status:** 400
- **Code:** `VALIDATION_ERROR`
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Graph name is required"
  }
}
```

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Description is required"
  }
}
```

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "accessLevel is required. Valid options: read-only, read-append, full"
  }
}
```

**User Rejected**
- **Status:** 403
- **Code:** `USER_REJECTED`
```json
{
  "success": false,
  "error": {
    "code": "USER_REJECTED",
    "message": "Token request was rejected by the user"
  }
}
```

**Graph Permanently Blocked**
- **Status:** 403
- **Code:** `GRAPH_BLOCKED`
- **When:** User previously clicked "Never Allow" for this graph
```json
{
  "success": false,
  "error": {
    "code": "GRAPH_BLOCKED",
    "message": "Token requests for this graph have been permanently blocked"
  }
}
```

**Concurrent Request**
- **Status:** 409
- **Code:** `REQUEST_IN_PROGRESS`
```json
{
  "success": false,
  "error": {
    "code": "REQUEST_IN_PROGRESS",
    "message": "A token request for this graph is already in progress"
  }
}
```

**Timeout (5 minutes)**
- **Status:** 408
- **Code:** `TIMEOUT`
```json
{
  "success": false,
  "error": {
    "code": "TIMEOUT",
    "message": "Request timed out waiting for user response"
  }
}
```

**Request Cancelled**
- **Status:** 500
- **Code:** `CANCELLED`
- **When:** Client disconnected or request was cancelled
```json
{
  "success": false,
  "error": {
    "code": "CANCELLED",
    "message": "Request was cancelled"
  }
}
```

**Internal Error**
- **Status:** 500
- **Code:** `INTERNAL_ERROR`
```json
{
  "success": false,
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "..."
  }
}
```

---

### 3. List Open Graphs

**`GET /api/graphs/open`**

List currently open graph windows.

**Note:** This endpoint does NOT require a token, only that Local API is enabled.

#### Request

**URL:** `http://localhost:{port}/api/graphs/open`

#### Success Response

**Status:** 200

```json
{
  "success": true,
  "result": [
    {"name": "my-graph", "type": "hosted"},
    {"name": "local-notes", "type": "offline"}
  ]
}
```

#### Error Responses

**Local API Disabled**
- **Status:** 403
```json
{
  "success": false,
  "error": "Local API is disabled. Enable it in Settings menu."
}
```

---

### 4. List Available Graphs

**`GET /api/graphs/available`**

List all graphs the user can access.

**Note:** This endpoint does NOT require a token, only that Local API is enabled.

#### Request

**URL:** `http://localhost:{port}/api/graphs/available`

#### Success Response

**Status:** 200

```json
{
  "success": true,
  "result": [
    {"name": "my-graph", "type": "hosted"},
    {"name": "work-notes", "type": "hosted"},
    {"name": "local-notes", "type": "offline"}
  ]
}
```

---

## AI-Optimized Endpoints

The Local API exposes AI-specific endpoints under `data.ai.*` that return markdown-formatted content optimized for LLM consumption. **These are the primary endpoints the MCP should use.**

### `data.ai.getPage`

Get a page's content as markdown.

**Input:**
```json
{
  "uid": "page-uid",
  "title": "Page Title",
  "maxDepth": 3
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `uid` | One of uid/title | Page UID |
| `title` | One of uid/title | Page title (alternative to uid) |
| `maxDepth` | No | Max depth of children to include (null = full tree) |

**Response:**
```json
{
  "markdown": "# Page Title\n\n- Block 1\n  - Child block\n- Block 2"
}
```

### `data.ai.getBlock`

Get a block's content as markdown with its path.

**Input:**
```json
{
  "uid": "block-uid",
  "maxDepth": 2
}
```

**Response:**
```json
{
  "markdown": "- Block content\n  - Child content",
  "path": "Page Title > Parent Block"
}
```

### `data.ai.getBacklinks`

Get backlinks (linked references) for a page or block with pagination.

**Input:**
```json
{
  "uid": "page-uid",
  "title": "Page Title",
  "offset": 0,
  "limit": 20,
  "sort": "created-date",
  "sortOrder": "desc",
  "search": "filter text",
  "includePath": true,
  "maxDepth": 1
}
```

| Field | Default | Description |
|-------|---------|-------------|
| `uid` / `title` | - | Target page/block |
| `offset` | 0 | Pagination offset |
| `limit` | 20 | Max results to return |
| `sort` | `"created-date"` | Sort by: `"created-date"`, `"edited-date"`, `"daily-note-date"` |
| `sortOrder` | `"desc"` | `"asc"` or `"desc"` |
| `search` | null | Filter results by text match |
| `includePath` | true | Include breadcrumb path |
| `maxDepth` | 1 | Depth of children in markdown |

**Response:**
```json
{
  "total": 42,
  "results": [
    {
      "uid": "ref-block-uid",
      "markdown": "- References [[Page Title]] here",
      "path": "Other Page > Section",
      "type": "page"
    }
  ]
}
```

### `data.ai.search`

Full-text search across the graph.

**Input:**
```json
{
  "query": "search terms",
  "offset": 0,
  "limit": 20,
  "includePath": true,
  "maxDepth": 0,
  "scope": "all"
}
```

| Field | Default | Description |
|-------|---------|-------------|
| `query` | **required** | Search string |
| `offset` | 0 | Pagination offset |
| `limit` | 20 | Max results |
| `includePath` | true | Include breadcrumb path |
| `maxDepth` | 0 | Depth of children (0 = just the matching block) |
| `scope` | `"all"` | `"all"`, `"pages"`, or `"blocks"` |

**Response:**
```json
{
  "total": 156,
  "results": [
    {
      "uid": "block-uid",
      "markdown": "- Matching content here",
      "path": "Page > Parent Block",
      "type": "page"
    }
  ]
}
```

### `data.ai.searchTemplates`

Search user-defined templates by name.

**Input:**
```json
{
  "query": "meeting"
}
```

**Response:**
```json
[
  {
    "name": "Meeting Notes",
    "uid": "template-uid",
    "content": "- Attendees:\n- Agenda:\n- Notes:"
  }
]
```

### `data.ai.getGraphGuidelines`

Get the content of the "agent guidelines" page (if it exists). This is used by `select_graph` to return user-defined instructions for AI agents.

**Input:** None (empty object or null)

**Response:** Markdown string, or `null` if the page doesn't exist.

```json
"## Agent Guidelines\n\n1. Use ISO dates (YYYY-MM-DD)\n2. Always include sources\n..."
```

**Important:** The page must be titled exactly `"agent guidelines"` (case-insensitive in Roam, but the lookup is case-sensitive in the API).

---

## AI Markdown Format

The `data.ai.*` endpoints return markdown with embedded `<roam>` metadata tags. Understanding this format is critical for the MCP.

### Syntax Reference

| Syntax | Meaning |
|--------|---------|
| `<roam uid="x"/>` | Block's unique ID - use this for follow-up operations |
| `<roam uid="x" refs="N"/>` | Block has N backlinks (referenced N times elsewhere) |
| `[text](((uid)))` | Block reference - text is the referenced block's content |
| `[[Page Name]]` | Page reference |
| `{{...}}` | Embed/widget (kept as-is) |
| `^^text^^` | Highlighted text |

### Example Output

```markdown
# Project Planning <roam uid="abc123" refs="5"/>

- Research phase <roam uid="def456"/>
  - Interview stakeholders <roam uid="ghi789"/>
  - Review [[Competitor Analysis]] <roam uid="jkl012"/>
- Implementation <roam uid="mno345" refs="2"/>
  - See [original spec](((xyz999))) for details <roam uid="pqr678"/>
```

### Key Points for MCP

1. **Extract UIDs for operations** - When creating/updating blocks, you need parent UIDs from the `<roam uid="..."/>` tags
2. **High refs = important** - Blocks with `refs="5"` or more are key concepts worth exploring
3. **Block references show content** - `[text](((uid)))` shows the referenced text inline; the uid lets you navigate to the source
4. **Page references are links** - `[[Page Name]]` can be fetched with `data.ai.getPage({title: "Page Name"})`

### Using UIDs

When you receive markdown with UIDs, you can:
- **Create a child block:** Use the parent's uid in `data.block.create({location: {parent-uid: "abc123", order: 0}, block: {string: "New content"}})`
- **Update a block:** Use the block's uid in `data.block.update({block: {uid: "def456", string: "Updated content"}})`
- **Get more context:** Use `data.ai.getBlock({uid: "ghi789", maxDepth: 3})` to expand a block

---

## Action Scope Requirements

When making API requests, the token must have sufficient scope for the action:

### Read Scope (Default)

All actions not listed below require only `:read` scope:
- `data.q`, `data.pull`, `data.pull_many`
- `data.async.q`
- `graph.name`, `graph.type`
- `ui.*` (navigation, sidebars)
- `util.generateUID`, `util.dateToPageTitle`
- All property reads

### Append Scope

These actions require `:append` scope (or `:edit`):
- `data.block.create`
- `data.block.fromMarkdown`
- `data.page.create`
- `data.page.fromMarkdown`
- `data.user.upsert`
- `file.upload`
- `util.uploadFile`
- `createBlock` (legacy)
- `createPage` (legacy)

### Edit Scope

These actions require `:edit` scope:
- `data.block.update`
- `data.block.delete`
- `data.block.move`
- `data.block.reorderBlocks`
- `data.page.update`
- `data.page.delete`
- `data.page.addShortcut`
- `data.page.removeShortcut`
- `data.undo`
- `data.redo`
- `file.delete`
- `updateBlock`, `deleteBlock`, `moveBlock` (legacy)
- `updatePage`, `deletePage` (legacy)

---

## MCP Server Architecture

### Design Principles

1. **One MCP server, multiple graphs** - A single MCP server handles all configured graphs
2. **Session-local graph selection** - MCP maintains state about which graph is "active" for the current connection
3. **Per-graph tokens** - Each graph has its own token
4. **Stateless Local API** - The Roam Local API is stateless; all graph selection logic lives in the MCP server
5. **Agent simplicity** - AI agents do NOT need to know about graph types; the MCP handles this internally

### Configuration File

**Location:** `~/.roam-mcp.json`

**MCP Server Config (claude_desktop_config.json):**
```json
{
  "mcpServers": {
    "roam": {
      "command": "npx",
      "args": ["roam-mcp", "--config", "~/.roam-mcp.json"]
    }
  }
}
```

**Graph Config File (`~/.roam-mcp.json`):**
```json
{
  "graphs": [
    {
      "name": "jfb-work-notes-2024",
      "type": "hosted",
      "token": "roam-graph-local-token-abc...",
      "nickname": "Work"
    },
    {
      "name": "personal-zettelkasten",
      "type": "offline",
      "token": "roam-graph-local-token-xyz...",
      "nickname": "Personal"
    }
  ]
}
```

**Config Fields:**

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `name` | Yes | - | The actual graph name in Roam |
| `type` | No | `"hosted"` | Graph type: `"hosted"` or `"offline"` |
| `token` | Yes | - | Local API token for this graph |
| `nickname` | Yes | - | Human-friendly name used by agents |

### Graph Nicknames

Graph names are often technical (e.g., `jfb-work-notes-2024`) or UUIDs. Nicknames provide human-friendly labels.

**Rules:**
- Nicknames MUST be unique across all configured graphs
- Case-insensitive matching (e.g., "Work" matches "work")
- Agents use nicknames, NOT raw graph names
- Validate uniqueness on config load

### Agent Simplicity: AI Does NOT Need Graph Types

**Critical design decision:** The AI agent calling MCP tools does NOT need to know about graph types.

When an agent calls `select_graph("Work")` or `get_page(title="My Page")`, it uses the **nickname only**. The MCP server internally maps this to the correct `(name, type, token)` tuple and includes the `?type=` parameter when calling the Local API.

**Why this matters:**
- Agents don't need to track or remember graph types
- Tool calls remain simple: just the nickname
- No risk of agent confusion between "hosted" and "offline" concepts
- Prompts and tool descriptions stay clean

### Handling Same-Named Hosted and Offline Graphs

If the config contains both a hosted graph and an offline graph with the **same name**, **ignore the offline graph**.

**Rationale:**
- This is a rare edge case
- Hosted graphs take precedence
- Keeps the mental model simple
- Avoids confusing nickname workarounds

**On config load:** If duplicate names detected (after type precedence), log a warning and skip the offline entry.

---

## Core MCP Tools for Graph Management

### `list_graphs`

Return all configured graphs with their nicknames.

**Response:**
```json
{
  "graphs": [
    { "nickname": "Work", "name": "jfb-work-notes-2024" },
    { "nickname": "Personal", "name": "personal-zettelkasten" }
  ]
}
```

### `select_graph`

Set the active graph for this session. Returns graph guidelines.

**Input:** `{ "graph": "Work" }` (nickname or name)

**What it does:**
1. Resolve graph by nickname (or name as fallback)
2. Call Local API: `POST /api/{graph}` with `{"action": "data.ai.getGraphGuidelines"}`
3. If API fails → `select_graph` fails (graph unreachable)
4. If API succeeds → set session state, return guidelines

**Success Response:**
```json
{
  "graph_name": "jfb-work-notes-2024",
  "nickname": "Work",
  "permissions": ["read", "append", "edit"],
  "guidelines": "## Agent Guidelines\n\n1. Use ISO dates...",
  "guidelines_hash": "sha256:abc123..."
}
```

| Field | Description |
|-------|-------------|
| `graph_name` | The actual graph name in Roam |
| `nickname` | The human-friendly nickname from config |
| `permissions` | Array of granted scopes from the token |
| `guidelines` | Content of the "agent guidelines" page, or null |
| `guidelines_hash` | Hash of guidelines for caching (optional) |

**This inherently validates graph reachability** - no separate health check needed.

### `current_graph`

Return the currently active graph and its metadata.

**Response (graph selected):**
```json
{
  "graph_name": "jfb-work-notes-2024",
  "nickname": "Work",
  "permissions": ["read", "append", "edit"]
}
```

**Response (no graph selected):**
```json
{
  "error": {
    "code": "GRAPH_NOT_SELECTED",
    "message": "No graph selected."
  }
}
```

---

## Auto-Select Behavior

**If exactly one graph is configured:**
- Auto-select it on MCP server startup
- No need to call `select_graph`
- 90%+ of users benefit from this simplification

**If multiple graphs are configured:**
- Start with NO graph selected
- Any "real" tool (get_page, create_block, etc.) returns `GRAPH_NOT_SELECTED` error
- Agent must call `select_graph` first

---

## MCP Error Format for Model Recovery

When a tool is called without a selected graph, return a structured error that enables AI models to self-correct:

```json
{
  "error": {
    "code": "GRAPH_NOT_SELECTED",
    "message": "No graph selected. Call select_graph first.",
    "available_graphs": [
      { "nickname": "Work", "name": "jfb-work-notes-2024" },
      { "nickname": "Personal", "name": "personal-zettelkasten" }
    ],
    "suggested_next_tool": "select_graph"
  }
}
```

This structured format helps the agent recover automatically.

---

## Integration Flow

```
MCP Server                          Local API (Roam Desktop)
    |                                      |
    |  POST /api/{graph}?type=offline      |
    |  Authorization: Bearer {token}       |
    |  {"action": "data.ai.getPage", ...}  |
    |------------------------------------->|
    |                                      |
    |                            Validates token for graph
    |                            Checks scopes
    |                            Executes roamAlphaAPI call
    |                                      |
    |<-------------------------------------|
    |  {"success": true, "result": {...}}  |
```

Each `(name, type, token)` tuple in the MCP config corresponds to a local API token created in Roam's Graph Settings.

---

## Session and Connection Lifecycle

**Important:** MCP connection ≠ chat. The server process may persist across multiple chats.

**Implications:**
1. Session state is **per-connection**, stored in memory
2. **Do NOT persist "last used graph" to disk** - this would cause cross-chat/cross-session bleed
3. Auto-select only happens on init when exactly 1 graph is configured
4. Each new connection starts fresh (no graph selected, unless auto-select applies)

### Why `last-graph` Was Removed from the API Info File

The Local API previously wrote `last-graph` to `~/.roam-local-api.json`. **This was removed** because:

1. **Graph selection is the MCP's responsibility**, not the Local API's
2. **The Local API should be stateless** - it validates tokens and executes requests
3. **Persisting "last used graph" causes cross-chat bleed** - if user switches graphs in one chat, it shouldn't affect another
4. **The token itself identifies the graph** - no ambient state needed

**Do NOT rely on or expect a `last-graph` field in `~/.roam-local-api.json`.**

---

## V2 Considerations (Out of Scope for V1)

These features may be added in future versions:

1. **Optional `graph` parameter on tools** - Allow tools to specify a graph without changing session state (for cross-graph operations)
2. **Rate limiting** - Rely on Local API rate limiting for now
3. **Resource-based guidelines** - Optimize large guidelines via MCP resources protocol

---

## Token Acquisition Flow

### Option A: User Creates Token Manually

1. User opens Roam Desktop → Graph Settings → Local API Tokens
2. User creates token with desired scope
3. User copies token and adds to `~/.roam-mcp.json`

### Option B: Programmatic Token Exchange

1. MCP detects graph has no token (or token is invalid)
2. Call `POST /api/graphs/tokens/request` with graph name and desired access level
3. Roam opens the graph window and shows permission dialog to user
4. User approves → MCP receives token in response
5. MCP stores token in config file for future use
6. Handle errors: `USER_REJECTED`, `GRAPH_BLOCKED`, `TIMEOUT`, etc.

**Recommendation:** Support both flows. Option A for initial setup, Option B for better UX when adding new graphs.

---

## Request Flow (Internal to MCP)

When the MCP receives a tool call:

```
1. Check if graph is selected
   - If not: return GRAPH_NOT_SELECTED error with available_graphs

2. Look up graph config by current selection
   - Get: name, type, token

3. Build Local API request:
   - URL: http://localhost:{port}/api/{name}
   - If type == "offline": append ?type=offline
   - Header: Authorization: Bearer {token}
   - Body: { action, args }

4. Send request, handle response

5. Map Local API errors to MCP errors:
   - INSUFFICIENT_SCOPE → inform about token permissions
   - SCOPE_EXCEEDS_PERMISSION → action not allowed
   - 401 → token invalid, may need re-auth
```

---

## Error Handling

### Local API Error → MCP Error Mapping

```
if error.code == "INSUFFICIENT_SCOPE":
    # Token doesn't have required scope for this action
    # Return error suggesting user create a more permissive token

elif error.code == "SCOPE_EXCEEDS_PERMISSION":
    # User's Roam permissions changed (e.g., demoted from editor to reader)
    # This action is genuinely not allowed for this user

elif error.code == "USER_REJECTED":
    # User declined token exchange request
    # Don't retry immediately; inform user

elif error.code == "GRAPH_BLOCKED":
    # User permanently blocked token requests for this graph
    # Inform user they need to unblock in Roam settings

elif error.code == "REQUEST_IN_PROGRESS":
    # Another token request is pending for this graph
    # Wait or fail gracefully

elif error.code == "TIMEOUT":
    # User didn't respond to token exchange in 5 minutes
    # Allow retry

elif status == 401:
    # Token invalid, expired, or wrong graph
    # May need to re-acquire token via exchange or manual creation

elif status == 403 and "Local API is disabled":
    # User needs to enable Local API in Roam settings
```

---

## Migration Checklist for roam-mcp

### Breaking Changes to Address

- [ ] **Remove env var config** - No more `ROAM_GRAPH`, `ROAM_GRAPH_TYPE`, `ROAM_API_TOKEN` env vars
- [ ] **Remove `last-graph` reliance** - Don't read `last-graph` from `~/.roam-local-api.json`
- [ ] **Add config file support** - Read from `~/.roam-mcp.json` (or `--config` path)

### New Features to Implement

- [ ] **Token authentication** - Add `Authorization: Bearer {token}` header to ALL API requests
- [ ] **Graph type support** - Add `?type=offline` query param for offline graphs
- [ ] **Multi-graph support** - Implement `list_graphs`, `select_graph`, `current_graph` tools
- [ ] **Session state** - Track currently selected graph per-connection
- [ ] **Auto-select** - Auto-select if exactly one graph configured
- [ ] **Nickname resolution** - Map nicknames to graph configs
- [ ] **Config validation** - Validate uniqueness, handle same-name collisions (ignore offline)

### Token Exchange (Optional but Recommended)

- [ ] **Implement token exchange** - Call `POST /api/graphs/tokens/request` when token missing/invalid
- [ ] **Store acquired tokens** - Write back to config file on successful exchange
- [ ] **Handle exchange errors** - USER_REJECTED, GRAPH_BLOCKED, TIMEOUT, etc.

### Error Handling

- [ ] **Handle new error codes** - INSUFFICIENT_SCOPE, SCOPE_EXCEEDS_PERMISSION, GRAPH_NOT_SELECTED
- [ ] **Structured errors** - Return errors with `code`, `message`, `available_graphs`, `suggested_next_tool`
- [ ] **401 handling** - Detect invalid tokens and guide toward re-authentication

### Documentation

- [ ] **Update user docs** - Explain new config file format
- [ ] **Explain token creation** - How to create tokens in Roam settings
- [ ] **Explain graph selection** - How multi-graph works with nicknames
