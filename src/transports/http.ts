/**
 * HTTP Transport for Oura MCP Server
 *
 * Enables remote deployment via Streamable HTTP transport.
 * Supports two auth modes:
 *   1. OAuth 2.1 (for Claude.ai connector and other OAuth-capable clients)
 *   2. Static bearer token via MCP_SECRET (backward compat for Claude Desktop)
 *
 * OAuth endpoints (handled by MCP SDK's mcpAuthRouter):
 *   GET  /.well-known/oauth-authorization-server   — OAuth metadata discovery
 *   GET  /.well-known/oauth-protected-resource/mcp — Protected resource metadata
 *   POST /register                                  — Dynamic client registration
 *   GET  /authorize                                 — Authorization (auto-approves)
 *   POST /token                                     — Token exchange
 *   POST /revoke                                    — Token revocation
 */
import express, { Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { mcpAuthRouter } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { OuraMcpOAuthProvider } from "../auth/mcp-oauth-provider.js";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface HttpTransportOptions {
  /** Port to listen on (default: process.env.PORT || 3000) */
  port?: number;
  /** Secret for bearer token auth (backward compat with MCP_SECRET) */
  secret?: string;
  /** Enable stateless mode for horizontal scaling (default: true) */
  stateless?: boolean;
}

// ─────────────────────────────────────────────────────────────
// Base URL Resolution
// ─────────────────────────────────────────────────────────────

/**
 * Determine the public base URL for this server.
 * Checks (in order): BASE_URL env, RAILWAY_PUBLIC_DOMAIN, localhost fallback.
 */
function resolveBaseUrl(port: number): URL {
  if (process.env.BASE_URL) {
    return new URL(process.env.BASE_URL);
  }

  if (process.env.RAILWAY_PUBLIC_DOMAIN) {
    return new URL(`https://${process.env.RAILWAY_PUBLIC_DOMAIN}`);
  }

  return new URL(`http://localhost:${port}`);
}

// ─────────────────────────────────────────────────────────────
// HTTP Server
// ─────────────────────────────────────────────────────────────

/**
 * Start the MCP server with HTTP transport and OAuth 2.1 authentication
 */
export async function startHttpServer(
  server: McpServer,
  options: HttpTransportOptions = {}
): Promise<void> {
  const port = options.port ?? parseInt(process.env.PORT || "3000", 10);
  const secret = options.secret ?? process.env.MCP_SECRET;
  const stateless = options.stateless ?? true;

  const baseUrl = resolveBaseUrl(port);

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

  // ── OAuth Setup ──────────────────────────────────────────

  const oauthProvider = new OuraMcpOAuthProvider(secret);

  // Mount OAuth endpoints (metadata, authorize, token, register, revoke)
  app.use(
    mcpAuthRouter({
      provider: oauthProvider,
      issuerUrl: baseUrl,
      baseUrl: baseUrl,
      resourceServerUrl: new URL("/mcp", baseUrl),
      resourceName: "Oura MCP Server",
      scopesSupported: [],
    })
  );

  console.error("OAuth 2.1 authentication enabled");
  if (secret) {
    console.error("Static MCP_SECRET also accepted as bearer token");
  }

  // Protect MCP endpoint with bearer auth (validates OAuth tokens + static secret)
  const bearerAuth = requireBearerAuth({
    verifier: oauthProvider,
  });

  // ── MCP Endpoint ─────────────────────────────────────────

  // Track transports by session ID for stateful mode
  const transports = new Map<string, StreamableHTTPServerTransport>();

  // MCP endpoint — all methods handled
  app.all("/mcp", bearerAuth, async (req: Request, res: Response) => {
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
  app.delete("/mcp", bearerAuth, async (req: Request, res: Response) => {
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
    console.error(`Public URL: ${baseUrl.href}`);
    console.error(`MCP endpoint: POST ${baseUrl.href}mcp`);
    console.error(`Health check: GET /health`);
    console.error(`OAuth metadata: GET /.well-known/oauth-authorization-server`);
  });
}
