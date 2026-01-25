/**
 * CLI auth flow for Oura OAuth
 * Usage: npx oura-ring-mcp auth
 *
 * Opens browser for OAuth authorization, captures callback,
 * and saves credentials to ~/.oura-mcp/credentials.json
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
import { exec } from "node:child_process";
import { platform } from "node:os";
import {
  buildAuthorizationUrl,
  exchangeCodeForTokens,
  getOAuthConfigFromEnv,
  type OAuthConfig,
} from "./oauth.js";
import { saveCredentials, clearCredentials, getCredentialsPath } from "./store.js";

const DEFAULT_PORT = 3000;

/**
 * Open a URL in the default browser (cross-platform)
 */
function openBrowser(url: string): void {
  const plat = platform();
  let cmd: string;

  switch (plat) {
    case "darwin":
      cmd = `open "${url}"`;
      break;
    case "win32":
      cmd = `start "" "${url}"`;
      break;
    default:
      // Linux and others
      cmd = `xdg-open "${url}"`;
  }

  exec(cmd, (error) => {
    if (error) {
      console.error(`Failed to open browser: ${error.message}`);
      console.log(`\nPlease manually open this URL:\n${url}`);
    }
  });
}

/**
 * Start local server to receive OAuth callback
 */
function startCallbackServer(
  port: number,
  expectedState: string,
  config: OAuthConfig
): Promise<void> {
  return new Promise((resolve, reject) => {
    const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url ?? "/", `http://localhost:${port}`);

      if (url.pathname !== "/callback") {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const error = url.searchParams.get("error");

      // Handle OAuth errors
      if (error) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end(`
          <html><body style="font-family: system-ui; padding: 40px; text-align: center;">
            <h1>❌ Authorization Failed</h1>
            <p>Error: ${error}</p>
            <p>You can close this window.</p>
          </body></html>
        `);
        server.close();
        reject(new Error(`OAuth error: ${error}`));
        return;
      }

      // Validate state to prevent CSRF
      if (state !== expectedState) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end(`
          <html><body style="font-family: system-ui; padding: 40px; text-align: center;">
            <h1>❌ Security Error</h1>
            <p>State mismatch - possible CSRF attack.</p>
            <p>You can close this window and try again.</p>
          </body></html>
        `);
        server.close();
        reject(new Error("State mismatch"));
        return;
      }

      if (!code) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end(`
          <html><body style="font-family: system-ui; padding: 40px; text-align: center;">
            <h1>❌ Missing Code</h1>
            <p>No authorization code received.</p>
            <p>You can close this window and try again.</p>
          </body></html>
        `);
        server.close();
        reject(new Error("No authorization code"));
        return;
      }

      try {
        // Exchange code for tokens
        const credentials = await exchangeCodeForTokens(code, config);
        await saveCredentials(credentials);

        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(`
          <html><body style="font-family: system-ui; padding: 40px; text-align: center;">
            <h1>✅ Authorization Successful!</h1>
            <p>Your Oura credentials have been saved.</p>
            <p>You can close this window and return to the terminal.</p>
          </body></html>
        `);

        server.close();
        resolve();
      } catch (err) {
        res.writeHead(500, { "Content-Type": "text/html" });
        res.end(`
          <html><body style="font-family: system-ui; padding: 40px; text-align: center;">
            <h1>❌ Token Exchange Failed</h1>
            <p>${err instanceof Error ? err.message : "Unknown error"}</p>
            <p>You can close this window and try again.</p>
          </body></html>
        `);
        server.close();
        reject(err);
      }
    });

    server.on("error", (err) => {
      reject(err);
    });

    server.listen(port, () => {
      console.log(`\nCallback server listening on http://localhost:${port}`);
    });

    // Timeout after 5 minutes
    setTimeout(() => {
      server.close();
      reject(new Error("Authorization timed out after 5 minutes"));
    }, 5 * 60 * 1000);
  });
}

/**
 * Run the OAuth authorization flow
 */
export async function runAuthFlow(): Promise<void> {
  console.log("🔐 Oura MCP - OAuth Authorization\n");

  // Get OAuth config from environment
  const config = getOAuthConfigFromEnv();
  if (!config) {
    console.error("❌ Missing OAuth credentials.");
    console.error("\nPlease set these environment variables:");
    console.error("  OURA_CLIENT_ID     - Your Oura OAuth client ID");
    console.error("  OURA_CLIENT_SECRET - Your Oura OAuth client secret");
    console.error("\nYou can create an OAuth application at:");
    console.error("  https://developer.ouraring.com/applications");
    process.exit(1);
  }

  // Parse port from redirect URI
  const redirectUrl = new URL(config.redirectUri);
  const port = parseInt(redirectUrl.port, 10) || DEFAULT_PORT;

  // Generate random state for CSRF protection
  const state = randomBytes(16).toString("hex");

  // Build authorization URL
  const authUrl = buildAuthorizationUrl(config, state);

  console.log("Opening browser for Oura authorization...\n");
  console.log(`If the browser doesn't open, visit:\n${authUrl}\n`);

  // Open browser
  openBrowser(authUrl);

  try {
    // Wait for callback
    await startCallbackServer(port, state, config);

    console.log("\n✅ Authorization successful!");
    console.log(`\nCredentials saved to: ${getCredentialsPath()}`);
    console.log("\nYou can now use the Oura MCP server without OURA_ACCESS_TOKEN.");
    console.log("The server will automatically refresh tokens when needed.");
  } catch (error) {
    console.error(`\n❌ Authorization failed: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}

/**
 * Log out by clearing stored credentials
 */
export async function runLogout(): Promise<void> {
  await clearCredentials();
  console.log("✅ Logged out. Credentials cleared.");
}

/**
 * Show auth status
 */
export async function showAuthStatus(): Promise<void> {
  const { loadCredentials, isExpired } = await import("./store.js");
  const credentials = await loadCredentials();

  if (!credentials) {
    console.log("❌ Not authenticated.");
    console.log("\nRun `npx oura-ring-mcp auth` to authenticate.");
    return;
  }

  const expired = isExpired(credentials);
  const expiresAt = new Date(credentials.expires_at).toLocaleString();

  console.log("🔐 Authentication Status\n");
  console.log(`Status: ${expired ? "❌ Expired" : "✅ Authenticated"}`);
  console.log(`Expires: ${expiresAt}`);
  console.log(`Credentials: ${getCredentialsPath()}`);

  if (expired) {
    console.log("\nToken expired. The server will auto-refresh on next request.");
  }
}
