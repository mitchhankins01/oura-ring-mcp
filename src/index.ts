#!/usr/bin/env node
/**
 * Oura MCP Server
 *
 * An MCP server that exposes Oura Ring data with smart analysis tools.
 * Designed to give LLMs human-readable summaries alongside raw data.
 */
import 'dotenv/config';
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { OuraClient } from "./client.js";
import { registerTools } from "./tools/index.js";

// ─────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────

const ACCESS_TOKEN = process.env.OURA_ACCESS_TOKEN || process.env.OURA_PERSONAL_ACCESS_TOKEN;

if (!ACCESS_TOKEN) {
  console.error(
    "Error: OURA_ACCESS_TOKEN environment variable is required.\n" +
      "Get your token at: https://cloud.ouraring.com/personal-access-tokens"
  );
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────
// Server Setup
// ─────────────────────────────────────────────────────────────

const server = new McpServer({
  name: "oura-mcp",
  version: "0.1.0",
});

const ouraClient = new OuraClient({ accessToken: ACCESS_TOKEN });

// Register all tools with the server
registerTools(server, ouraClient);

// ─────────────────────────────────────────────────────────────
// Start Server
// ─────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Oura MCP server running on stdio");
}

main().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
