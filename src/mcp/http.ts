import { randomBytes, timingSafeEqual } from "crypto";
import { execSync } from "child_process";
import type { Request, Response, NextFunction } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { registerTools, tools } from "../core/tools.js";
import { getMcpConfig, getPort, getHttpConfig, saveHttpConfig } from "../core/graph-resolver.js";
import type { HttpConfig } from "../core/types.js";

// ============================================================================
// Tailscale hostname detection
// ============================================================================

function detectTailscaleHostname(): string | undefined {
  try {
    const output = execSync("tailscale status --self --json", {
      timeout: 5000,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const status = JSON.parse(output.toString());
    const dnsName: string | undefined = status?.Self?.DNSName;
    if (dnsName) {
      // Strip trailing dot (e.g., "device.tail1234.ts.net." → "device.tail1234.ts.net")
      return dnsName.replace(/\.$/, "");
    }
  } catch {
    // Tailscale not installed or not running — no-op
  }
  return undefined;
}

// ============================================================================
// Per-request MCP handler factory
// ============================================================================

function createMcpHandler() {
  return async (req: Request, res: Response) => {
    const server = new McpServer({ name: "roam-mcp", version: "0.3.0" });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

    registerTools(server, {
      onMutatingCall: (name) => {
        console.error(`[roam-mcp] WRITE ${new Date().toISOString()} ${name}`);
      },
    });

    res.on("close", () => {
      transport.close();
      server.close();
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
      transport.close();
      server.close();
    }
  };
}

// ============================================================================
// Auth middleware
// ============================================================================

function bearerAuth(token: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Missing or invalid Authorization header. Expected: Bearer <token>" },
        id: null,
      });
      return;
    }
    const provided = authHeader.slice(7);
    const providedBuf = Buffer.from(provided);
    const tokenBuf = Buffer.from(token);
    if (providedBuf.length !== tokenBuf.length || !timingSafeEqual(providedBuf, tokenBuf)) {
      res.status(401).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Invalid bearer token" },
        id: null,
      });
      return;
    }
    next();
  };
}

// ============================================================================
// Server startup
// ============================================================================

export interface HttpServerOptions {
  port?: number;
  regeneratePathSecret?: boolean;
}

export async function startHttpServer(options: HttpServerOptions = {}) {
  // 1. Validate at least one graph is configured
  try {
    await getMcpConfig();
  } catch (error) {
    console.error("[roam-mcp] Cannot start HTTP server: no graphs configured.");
    console.error("Run: npm run cli -- connect");
    process.exit(1);
  }

  // 2. Read or generate HTTP config
  let httpConfig = await getHttpConfig();
  const isNew = !httpConfig;

  if (!httpConfig) {
    httpConfig = {
      token: randomBytes(32).toString("hex"),
      port: 3939,
      pathSecret: randomBytes(16).toString("hex"),
    };
  }

  // Regenerate path secret if requested
  if (options.regeneratePathSecret) {
    httpConfig.pathSecret = randomBytes(16).toString("hex");
  }

  // Persist only token + pathSecret (not runtime overrides)
  if (isNew || options.regeneratePathSecret) {
    await saveHttpConfig(httpConfig);
  }

  // Apply runtime-only CLI overrides (after save)
  const portOverride = options.port !== undefined && options.port !== httpConfig.port;
  if (options.port !== undefined) httpConfig.port = options.port;

  const { token, pathSecret, port } = httpConfig;

  // 4. Build allowedHosts for DNS rebinding protection
  const allowedHosts = ["localhost", "127.0.0.1", "[::1]"];
  const tailscaleHostname = detectTailscaleHostname();
  if (tailscaleHostname) {
    allowedHosts.push(tailscaleHostname);
  }
  if (httpConfig.allowedHosts) {
    allowedHosts.push(...httpConfig.allowedHosts);
  }

  // 5. Create Express app with DNS rebinding protection
  const app = createMcpExpressApp({ allowedHosts });

  // 6. Referrer-Policy on all responses
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader("Referrer-Policy", "no-referrer");
    next();
  });

  // 7. Health endpoint (no auth)
  app.get("/health", async (_req: Request, res: Response) => {
    let localApiStatus = "unreachable";
    try {
      const roamPort = await getPort();
      const response = await fetch(`http://127.0.0.1:${roamPort}/api/graphs/open`, {
        method: "GET",
        signal: AbortSignal.timeout(3000),
      });
      if (response.ok) localApiStatus = "ok";
    } catch {
      // unreachable
    }
    res.json({
      status: "ok",
      localApi: localApiStatus,
      tools: tools.length,
    });
  });

  // 8-9. MCP routes — method guard for GET/DELETE
  const methodNotAllowed = (_req: Request, res: Response) => {
    res.status(405).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed. Use POST." },
      id: null,
    });
  };
  app.get("/mcp", methodNotAllowed);
  app.delete("/mcp", methodNotAllowed);

  // 10. POST /mcp — Bearer auth required
  const mcpHandler = createMcpHandler();
  app.post("/mcp", bearerAuth(token), mcpHandler);

  // 11. POST /<pathSecret>/mcp — no auth (secret is in the URL)
  if (pathSecret) {
    app.get(`/${pathSecret}/mcp`, methodNotAllowed);
    app.delete(`/${pathSecret}/mcp`, methodNotAllowed);
    app.post(`/${pathSecret}/mcp`, createMcpHandler());
  }

  // 12. Listen on localhost only
  const httpServer = app.listen(port, "127.0.0.1", () => {
    console.error(`[roam-mcp] HTTP server listening on http://127.0.0.1:${port}`);
    if (portOverride) console.error(`[roam-mcp] Port: ${port} (CLI override, not persisted)`);
    console.error(`[roam-mcp] Tools: ${tools.length} (mutations logged to stderr)`);
    console.error(`[roam-mcp] Bearer token: ${token.slice(0, 4)}...`);
    if (tailscaleHostname) {
      console.error(`[roam-mcp] Tailscale URL: https://${tailscaleHostname}/mcp`);
    }
    if (pathSecret) {
      console.error(`[roam-mcp] Path-secret URL: https://${tailscaleHostname || "<your-host>"}/${pathSecret}/mcp`);
    }
  });

  // 13. Graceful shutdown
  const shutdown = () => {
    console.error("\n[roam-mcp] Shutting down HTTP server...");
    httpServer.close(() => {
      console.error("[roam-mcp] Server stopped.");
      process.exit(0);
    });
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  return httpServer;
}

// Direct execution (npm run http)
const isDirectExecution = process.argv[1]?.endsWith("http.ts") || process.argv[1]?.endsWith("http.js");
if (isDirectExecution) {
  startHttpServer().catch((error) => {
    console.error("[roam-mcp] Failed to start HTTP server:", error);
    process.exit(1);
  });
}
