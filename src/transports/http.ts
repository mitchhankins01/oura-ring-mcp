/**
 * HTTP Transport for Oura MCP Server
 *
 * Enables remote deployment via Streamable HTTP transport.
 * Includes bearer token authentication for security.
 */
import express, { Request, Response, NextFunction } from "express";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface HttpTransportOptions {
  /** Port to listen on (default: process.env.PORT || 3000) */
  port?: number;
  /** Secret for bearer token auth (required in production) */
  secret?: string;
  /** Enable stateless mode for horizontal scaling (default: true) */
  stateless?: boolean;
}

// ─────────────────────────────────────────────────────────────
// Authentication Middleware
// ─────────────────────────────────────────────────────────────

/**
 * Bearer token authentication middleware
 * Requires Authorization: Bearer <secret> header
 */
function createAuthMiddleware(secret: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Skip auth for health check
    if (req.path === "/health") {
      return next();
    }

    const authHeader = req.headers.authorization;
    if (!authHeader) {
      res.status(401).json({ error: "Missing Authorization header" });
      return;
    }

    const [scheme, token] = authHeader.split(" ");
    if (scheme !== "Bearer" || token !== secret) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    next();
  };
}

// ─────────────────────────────────────────────────────────────
// HTTP Server
// ─────────────────────────────────────────────────────────────

/**
 * Start the MCP server with HTTP transport
 */
export async function startHttpServer(
  server: McpServer,
  options: HttpTransportOptions = {}
): Promise<void> {
  const port = options.port ?? parseInt(process.env.PORT || "3000", 10);
  const secret = options.secret ?? process.env.MCP_SECRET;
  const stateless = options.stateless ?? true;

  // Require secret in production
  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error(
      "MCP_SECRET environment variable is required in production.\n" +
        "Generate one with: openssl rand -base64 32"
    );
  }

  const app = express();

  // Parse JSON bodies
  app.use(express.json());

  // CORS for remote clients
  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.header(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, Mcp-Session-Id"
    );

    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  });

  // Health check endpoint (no auth required)
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "oura-mcp" });
  });

  // Apply auth middleware if secret is configured
  if (secret) {
    app.use(createAuthMiddleware(secret));
    console.error("Bearer token authentication enabled");
  } else {
    console.error(
      "WARNING: No MCP_SECRET configured. Server is unprotected!\n" +
        "Set MCP_SECRET environment variable for production use."
    );
  }

  // Track transports by session ID for stateful mode
  const transports = new Map<string, StreamableHTTPServerTransport>();

  // MCP endpoint
  app.all("/mcp", async (req, res) => {
    try {
      // Get or create session ID
      const sessionId = req.headers["mcp-session-id"] as string | undefined;

      let transport: StreamableHTTPServerTransport;

      if (stateless) {
        // Stateless mode: create new transport per request
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined, // Explicitly stateless
        });
        await server.connect(transport);
      } else {
        // Stateful mode: reuse transport by session
        if (sessionId && transports.has(sessionId)) {
          transport = transports.get(sessionId)!;
        } else {
          const newSessionId = randomUUID();
          transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => newSessionId,
          });
          await server.connect(transport);
          transports.set(newSessionId, transport);

          // Clean up on close
          transport.onclose = () => {
            transports.delete(newSessionId);
          };
        }
      }

      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error("MCP request error:", error);
      if (!res.headersSent) {
        res.status(500).json({
          error: "Internal server error",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  });

  // Handle session cleanup for stateful mode
  app.delete("/mcp", async (req, res) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (sessionId && transports.has(sessionId)) {
      const transport = transports.get(sessionId)!;
      await transport.close();
      transports.delete(sessionId);
      res.status(200).json({ message: "Session closed" });
    } else {
      res.status(404).json({ error: "Session not found" });
    }
  });

  // Start listening
  app.listen(port, "0.0.0.0", () => {
    console.error(`Oura MCP server running on http://0.0.0.0:${port}`);
    console.error(`MCP endpoint: POST /mcp`);
    console.error(`Health check: GET /health`);
    if (secret) {
      console.error(`Auth: Bearer token required`);
    }
  });
}
