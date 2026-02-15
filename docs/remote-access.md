# Remote Access (v1)

Access your local Roam MCP server from cloud-hosted clients like Claude.ai or ChatGPT, using an HTTP transport exposed via Tailscale Funnel.

## How It Works

```
Claude.ai / ChatGPT (cloud)
    │
    │ HTTPS
    ▼
Tailscale Funnel (auto-HTTPS, stable URL)
    │
    │ HTTP (localhost:3939)
    ▼
roam-mcp HTTP server (your machine)
    │
    │ HTTP (localhost:3333)
    ▼
Roam Desktop Local API
```

The MCP server runs on the same machine as Roam Desktop. Tailscale Funnel gives it a public HTTPS URL. Remote clients never see your Roam local API tokens — they authenticate to the MCP server with a separate Bearer token.

## Prerequisites

1. Roam Desktop running with local API enabled (and at least one graph connected via `npm run cli -- connect`)
2. [Tailscale](https://tailscale.com/download) installed and signed in, with [Funnel enabled](https://tailscale.com/kb/1223/funnel#setup) on your tailnet (requires HTTPS certificates to be turned on in admin console)

## Quick Start

```bash
# 1. Start the HTTP server
npm run http
# or: npm run cli -- http

# First run auto-generates a Bearer token and path secret, saves to ~/.roam-tools.json.
# Output includes:
#   [roam-mcp] HTTP server listening on http://127.0.0.1:3939
#   [roam-mcp] Bearer token: a1b2...
#   [roam-mcp] Tailscale URL: https://your-device.tail1234.ts.net/mcp
#   [roam-mcp] Path-secret URL: https://your-device.tail1234.ts.net/<pathSecret>/mcp

# 2. Expose via Tailscale Funnel
tailscale funnel 3939

# 3. Add to your AI client
#    URL:  https://your-device.tail1234.ts.net/<pathSecret>/mcp  (no auth header needed)
#    Or:   https://your-device.tail1234.ts.net/mcp + Authorization: Bearer <token>
```

The Bearer token and path secret are in `~/.roam-tools.json` under the `http` field.

## Configuration

All HTTP config lives in `~/.roam-tools.json` alongside graph configs:

```json
{
  "graphs": [ ... ],
  "http": {
    "token": "a1b2c3...64-char-hex...",
    "port": 3939,
    "pathSecret": "d4e5f6...32-char-hex...",
    "allowedHosts": ["my-custom-domain.com"]
  }
}
```

| Field | Default | Description |
|---|---|---|
| `token` | Auto-generated | Bearer token for `Authorization` header |
| `port` | `3939` | Local HTTP listen port |
| `pathSecret` | Auto-generated | URL path secret for clients that don't support custom auth headers |
| `allowedHosts` | Not set | Additional hostnames for DNS rebinding protection (for ngrok, Cloudflare, etc.) |

### CLI Flags

```bash
npm run cli -- http                              # Start with config defaults
npm run cli -- http --port 4000                  # Override port (not persisted)
npm run cli -- http --regenerate-path-secret     # Rotate the path secret
```

`--port` is a runtime override — it applies for the session but doesn't modify `~/.roam-tools.json`. To change defaults permanently, edit the config file directly.

## Authentication

### Primary: Bearer Token

Every request to `/mcp` requires an `Authorization: Bearer <token>` header. The token is auto-generated on first run (64 hex chars, 256 bits of entropy) and stored in `~/.roam-tools.json`.

### Path Secret

Many AI clients (Claude.ai, ChatGPT) don't support custom auth headers. For these, a URL-based secret is auto-generated on first run:

```
https://your-device.tail1234.ts.net/<pathSecret>/mcp
```

No `Authorization` header needed — the secret is the URL itself. URLs can appear in logs, screenshots, and referrer headers, so the server sets `Referrer-Policy: no-referrer` to mitigate leakage. Rotate it with `npm run cli -- http --regenerate-path-secret`.

## Mutation Logging

All tools (read and write) are available to remote clients. When a mutating tool is called (`create_page`, `update_block`, `delete_page`, etc.), it's logged to stderr:

```
[roam-mcp] WRITE 2026-02-15T10:30:00.000Z create_block
[roam-mcp] WRITE 2026-02-15T10:30:05.000Z update_page
```

Read-only calls are not logged (they're high-frequency and noisy). The Bearer token is the access control — if a client has it, they have full access.

## Health Check

```bash
curl http://127.0.0.1:3939/health
```

Returns:
```json
{
  "status": "ok",
  "localApi": "ok",
  "tools": 22
}
```

`localApi` is `"ok"` when the server can reach Roam Desktop's local API, `"unreachable"` otherwise. The health endpoint requires no authentication.

## Tunnel Setup

### Tailscale Funnel (Recommended)

```bash
tailscale funnel 3939
```

The server auto-detects your Tailscale hostname at startup and adds it to the allowed hosts list. Your public URL is printed in the startup output.

Funnel provides: stable URL (persists across restarts), automatic HTTPS (Let's Encrypt), works behind NAT/CGNAT, TLS terminated on your device (Tailscale never sees plaintext).

### Other Tunnels

For ngrok, Cloudflare Tunnel, or other tunnels, add your tunnel's hostname to `allowedHosts` in config:

```json
{
  "http": {
    "allowedHosts": ["abc123.ngrok-free.dev"]
  }
}
```

This is needed because the server validates the `Host` header for DNS rebinding protection. Without your tunnel hostname in the list, requests will be rejected with a 403.

## Security Model

Three layers of protection:

| Layer | What It Does |
|---|---|
| **Tailscale Funnel** | WireGuard encryption, auto-HTTPS, TLS terminated on your device |
| **DNS rebinding protection** | SDK middleware validates Host header against allowlist |
| **Bearer token** | Timing-safe token comparison on every request |

Additional hardening:
- Server binds to `127.0.0.1` only (not `0.0.0.0`) — no direct LAN exposure
- Mutating tool calls logged to stderr for auditability
- Remote clients never see Roam local API tokens
- Config file (`~/.roam-tools.json`) is `chmod 600`
- `Referrer-Policy: no-referrer` on all responses

### What to Keep Secret

- **Bearer token** (`http.token` in config) — anyone with this and your Funnel URL has access
- **Path secret** (`http.pathSecret` in config) — same risk as the token but in the URL

Rotate the token by deleting the `http` section from `~/.roam-tools.json` and restarting the server — a new token will be auto-generated.

## Design Decisions

### Why Tailscale Funnel over ngrok/Cloudflare?

Tailscale Funnel is the simplest path: one command, stable URL on free tier, auto-HTTPS, works behind any NAT. Importantly, TLS is terminated on your device — Tailscale's infrastructure never sees your plaintext traffic. With Cloudflare Tunnel, TLS terminates at Cloudflare's edge (they can see your traffic). ngrok's free tier has bandwidth limits. Other tunnels work fine via `allowedHosts`.

### Why a new McpServer per request?

The MCP SDK's `StreamableHTTPServerTransport` in stateless mode cannot be reused across requests (the SDK throws an error). And `McpServer.connect()` is exclusive — it throws if already connected to a transport. For concurrent HTTP requests, this means each request needs its own server+transport pair. This is the [official SDK pattern](https://github.com/modelcontextprotocol/typescript-sdk) (see `examples/server/simpleStatelessStreamableHttp.ts`). Tool registration per request is fast — just property assignment, no I/O.

### Why stateless mode?

Claude.ai sends each MCP request independently without maintaining persistent sessions. Stateless mode (`sessionIdGenerator: undefined`) disables session tracking, so each request is self-contained. Only POST is accepted; GET and DELETE return 405.

### Why Bearer header instead of query parameter?

Query string tokens (`?api_key=...`) appear in server logs, browser history, and referrer headers. `Authorization: Bearer` headers are the MCP-standard mechanism and are not logged by default. Since many AI clients (Claude.ai, ChatGPT) don't support custom headers, a path secret is also auto-generated as a URL-based alternative, with `Referrer-Policy: no-referrer` to mitigate leakage.

### Why `createMcpExpressApp` instead of plain Express?

The SDK's `createMcpExpressApp()` includes DNS rebinding protection middleware (added after a DNS rebinding vulnerability was discovered in MCP servers). Dropping to plain `express()` would remove this protection. Instead, we pass `allowedHosts` with the Tailscale hostname (auto-detected at startup) plus localhost variants. The middleware is port-agnostic — it normalizes `Host: device.ts.net:443` to `device.ts.net` before matching.

## Future Enhancements

These are explicitly out of scope for v1:

- **Private mode via Tailscale Serve** — tailnet-only access for on-device clients
- **Multi-user OAuth** — for shared/team deployments
- **Fine-grained authorization** — per-graph allowlist, per-tool permissions, read vs write scopes
- **REST actions layer** — for clients that don't support MCP (e.g., ChatGPT Actions)
- **Auto-start** — launchd/systemd templates for keeping the server running across reboots
