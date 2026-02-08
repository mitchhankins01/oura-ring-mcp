#!/usr/bin/env node
/**
 * Oura MCP Server
 *
 * An MCP server that exposes Oura Ring data with smart analysis tools.
 * Designed to give LLMs human-readable summaries alongside raw data.
 *
 * CLI Commands:
 *   npx oura-ring-mcp          - Start the MCP server (stdio transport)
 *   npx oura-ring-mcp --http   - Start with HTTP transport (for remote deployment)
 *   npx oura-ring-mcp auth     - Authenticate with Oura via OAuth
 *   npx oura-ring-mcp logout   - Clear stored credentials
 *   npx oura-ring-mcp status   - Show authentication status
 */
import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { OuraClient } from "./client.js";
import { registerTools } from "./tools/index.js";
import { registerResources } from "./resources/index.js";
import { registerPrompts } from "./prompts/index.js";
import { loadCredentials, isExpired } from "./auth/store.js";
import { refreshAccessToken, getOAuthConfigFromEnv } from "./auth/oauth.js";

// Read version from package.json
const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(__dirname, "..", "package.json"), "utf-8"));
const VERSION: string = pkg.version;

// ─────────────────────────────────────────────────────────────
// CLI Command Handling
// ─────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const command = args[0];
const useHttpTransport = args.includes("--http") || args.includes("-H");

// Handle CLI subcommands
if (["auth", "logout", "status"].includes(command)) {
  // Dynamic import to avoid loading auth modules unless needed
  const { runAuthFlow, runLogout, showAuthStatus } = await import("./auth/cli.js");

  switch (command) {
    case "auth":
      await runAuthFlow();
      break;
    case "logout":
      await runLogout();
      break;
    case "status":
      await showAuthStatus();
      break;
  }
  process.exit(0);
}

// ─────────────────────────────────────────────────────────────
// Token Resolution
// ─────────────────────────────────────────────────────────────

/**
 * Get access token from environment or stored credentials
 * Handles token refresh if expired
 */
async function getAccessToken(): Promise<string> {
  // First priority: environment variable
  const envToken = process.env.OURA_ACCESS_TOKEN || process.env.OURA_PERSONAL_ACCESS_TOKEN;
  if (envToken) {
    return envToken;
  }

  // Second priority: stored OAuth credentials
  const credentials = await loadCredentials();
  if (!credentials) {
    console.error(
      "Error: No Oura credentials found.\n\n" +
        "Option 1: Set OURA_ACCESS_TOKEN environment variable\n" +
        "  Get your token at: https://cloud.ouraring.com/personal-access-tokens\n\n" +
        "Option 2: Authenticate via OAuth\n" +
        "  Run: npx oura-ring-mcp auth\n" +
        "  (Requires OURA_CLIENT_ID and OURA_CLIENT_SECRET)"
    );
    process.exit(1);
  }

  // Check if token needs refresh
  if (isExpired(credentials)) {
    const oauthConfig = getOAuthConfigFromEnv();
    if (!oauthConfig) {
      console.error(
        "Error: Token expired and cannot refresh without OAuth credentials.\n" +
          "Please set OURA_CLIENT_ID and OURA_CLIENT_SECRET, or run:\n" +
          "  npx oura-ring-mcp auth"
      );
      process.exit(1);
    }

    console.error("Access token expired, refreshing...");
    try {
      const refreshed = await refreshAccessToken(credentials.refresh_token, oauthConfig);
      console.error("Token refreshed successfully.");
      return refreshed.access_token;
    } catch (error) {
      console.error(
        `Token refresh failed: ${error instanceof Error ? error.message : error}\n` +
          "Please re-authenticate: npx oura-ring-mcp auth"
      );
      process.exit(1);
    }
  }

  return credentials.access_token;
}

// ─────────────────────────────────────────────────────────────
// Server Setup
// ─────────────────────────────────────────────────────────────

const accessToken = await getAccessToken();

const server = new McpServer({
  name: "oura-mcp",
  version: VERSION,
});

const ouraClient = new OuraClient({ accessToken });

// Register all tools, resources, and prompts with the server
registerTools(server, ouraClient);
registerResources(server, ouraClient);
registerPrompts(server);

// ─────────────────────────────────────────────────────────────
// Start Server
// ─────────────────────────────────────────────────────────────

async function main() {
  if (useHttpTransport) {
    // HTTP transport for remote deployment
    const { startHttpServer } = await import("./transports/http.js");
    await startHttpServer(server);
  } else {
    // Stdio transport for local use (Claude Desktop)
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Oura MCP server running on stdio");
  }
}

main().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
