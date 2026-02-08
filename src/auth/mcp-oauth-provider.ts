/**
 * MCP OAuth Server Provider — Oura Proxy
 *
 * Proxies the MCP OAuth flow through Oura's OAuth2 authorization.
 * When Claude.ai (or any MCP client) connects:
 *
 *   1. Client discovers OAuth metadata → /.well-known/oauth-authorization-server
 *   2. Client registers dynamically    → POST /register
 *   3. Client redirects user to        → GET /authorize
 *   4. Server redirects to Oura OAuth  → cloud.ouraring.com/oauth/authorize
 *   5. User authorizes with Oura       → Oura redirects to /oauth/callback
 *   6. Server exchanges Oura code      → api.ouraring.com/oauth/token
 *   7. Server redirects to client      → redirect_uri?code=OUR_CODE
 *   8. Client exchanges our code       → POST /token
 *   9. Client uses our access token    → POST /mcp (Bearer token)
 *
 * The server stores the Oura token obtained in step 6 and uses it for
 * all Oura API calls. This eliminates the need for a PAT.
 *
 * For backward compatibility, MCP_SECRET is still accepted as a static
 * bearer token (requires OURA_ACCESS_TOKEN env var for API calls).
 */
import { randomUUID, randomBytes } from "node:crypto";
import { Response } from "express";
import type {
  OAuthServerProvider,
  AuthorizationParams,
} from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type {
  OAuthClientInformationFull,
  OAuthTokens,
  OAuthTokenRevocationRequest,
} from "@modelcontextprotocol/sdk/shared/auth.js";

// ─────────────────────────────────────────────────────────────
// Oura OAuth Constants
// ─────────────────────────────────────────────────────────────

const OURA_AUTHORIZE_URL = "https://cloud.ouraring.com/oauth/authorize";
const OURA_TOKEN_URL = "https://api.ouraring.com/oauth/token";
const OURA_SCOPES = [
  "email",
  "personal",
  "daily",
  "heartrate",
  "workout",
  "tag",
  "session",
  "spo2",
  "ring_configuration",
  "stress",
  "heart_health",
];

// ─────────────────────────────────────────────────────────────
// In-Memory Stores
// ─────────────────────────────────────────────────────────────

interface PendingAuth {
  clientId: string;
  codeChallenge: string;
  redirectUri: string;
  state?: string;
  scopes: string[];
  createdAt: number;
}

interface AuthCodeEntry {
  clientId: string;
  codeChallenge: string;
  redirectUri: string;
  scopes: string[];
  createdAt: number;
}

interface TokenEntry {
  clientId: string;
  scopes: string[];
  expiresAt: number;
}

interface RefreshTokenEntry {
  clientId: string;
  scopes: string[];
}

const AUTH_CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const ACCESS_TOKEN_TTL_S = 3600; // 1 hour

// ─────────────────────────────────────────────────────────────
// Provider Options
// ─────────────────────────────────────────────────────────────

export interface OuraMcpOAuthProviderOptions {
  /** Public base URL of this server (e.g., https://your-app.railway.app) */
  baseUrl: URL;
  /** Oura OAuth client ID */
  ouraClientId: string;
  /** Oura OAuth client secret */
  ouraClientSecret: string;
  /** Optional static secret for backward compat (MCP_SECRET) */
  staticSecret?: string;
  /** Called when new Oura tokens are obtained via OAuth */
  onOuraTokens?: (accessToken: string, refreshToken: string) => void;
}

// ─────────────────────────────────────────────────────────────
// OAuth Provider
// ─────────────────────────────────────────────────────────────

export class OuraMcpOAuthProvider implements OAuthServerProvider {
  private clients = new Map<string, OAuthClientInformationFull>();
  private pendingAuths = new Map<string, PendingAuth>();
  private authCodes = new Map<string, AuthCodeEntry>();
  private accessTokens = new Map<string, TokenEntry>();
  private refreshTokens = new Map<string, RefreshTokenEntry>();

  private ouraClientId: string;
  private ouraClientSecret: string;
  private callbackUrl: string;
  private staticSecret: string | undefined;
  private onOuraTokens?: (accessToken: string, refreshToken: string) => void;

  constructor(options: OuraMcpOAuthProviderOptions) {
    this.ouraClientId = options.ouraClientId;
    this.ouraClientSecret = options.ouraClientSecret;
    this.callbackUrl = new URL("/oauth/callback", options.baseUrl).toString();
    this.staticSecret = options.staticSecret;
    this.onOuraTokens = options.onOuraTokens;
  }

  // ── Client Registration Store ──────────────────────────────

  get clientsStore(): OAuthRegisteredClientsStore {
    const self = this;
    return {
      getClient(clientId: string) {
        return self.clients.get(clientId);
      },
      registerClient(
        clientMetadata: Omit<
          OAuthClientInformationFull,
          "client_id" | "client_id_issued_at"
        >
      ): OAuthClientInformationFull {
        const clientId = randomUUID();
        const clientSecret = randomBytes(32).toString("hex");
        const client: OAuthClientInformationFull = {
          ...clientMetadata,
          client_id: clientId,
          client_secret: clientSecret,
          client_id_issued_at: Math.floor(Date.now() / 1000),
        };
        self.clients.set(clientId, client);
        console.error(`OAuth client registered: ${clientId}`);
        return client;
      },
    };
  }

  // ── Authorization (redirects to Oura) ──────────────────────

  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response
  ): Promise<void> {
    // Generate a state token to track this pending authorization
    const ouraState = randomUUID();

    // Store the pending auth so we can complete it after Oura callback
    this.pendingAuths.set(ouraState, {
      clientId: client.client_id,
      codeChallenge: params.codeChallenge,
      redirectUri: params.redirectUri,
      state: params.state,
      scopes: params.scopes || [],
      createdAt: Date.now(),
    });

    // Redirect user to Oura's OAuth authorization page
    const ouraAuthUrl = new URL(OURA_AUTHORIZE_URL);
    ouraAuthUrl.searchParams.set("response_type", "code");
    ouraAuthUrl.searchParams.set("client_id", this.ouraClientId);
    ouraAuthUrl.searchParams.set("redirect_uri", this.callbackUrl);
    ouraAuthUrl.searchParams.set("scope", OURA_SCOPES.join(" "));
    ouraAuthUrl.searchParams.set("state", ouraState);

    res.redirect(302, ouraAuthUrl.toString());
  }

  // ── Oura Callback Handler ─────────────────────────────────
  // Called by the /oauth/callback route when Oura redirects back

  async handleOuraCallback(
    ouraCode: string,
    ouraState: string
  ): Promise<string> {
    // Look up the pending authorization
    const pending = this.pendingAuths.get(ouraState);
    if (!pending) {
      throw new Error("Invalid or expired OAuth state");
    }

    // Check expiry
    if (Date.now() - pending.createdAt > AUTH_CODE_TTL_MS) {
      this.pendingAuths.delete(ouraState);
      throw new Error("Authorization request expired");
    }

    this.pendingAuths.delete(ouraState);

    // Exchange Oura's auth code for Oura tokens
    const ouraTokens = await this.exchangeOuraCode(ouraCode);

    // Notify the server to update the OuraClient with the new token
    if (this.onOuraTokens) {
      this.onOuraTokens(ouraTokens.access_token, ouraTokens.refresh_token);
    }

    // Generate our own auth code for the MCP client (Claude.ai)
    const ourCode = randomUUID();
    this.authCodes.set(ourCode, {
      clientId: pending.clientId,
      codeChallenge: pending.codeChallenge,
      redirectUri: pending.redirectUri,
      scopes: pending.scopes,
      createdAt: Date.now(),
    });

    // Build redirect URL back to the MCP client
    const redirectUrl = new URL(pending.redirectUri);
    redirectUrl.searchParams.set("code", ourCode);
    if (pending.state) {
      redirectUrl.searchParams.set("state", pending.state);
    }

    return redirectUrl.toString();
  }

  // ── Code Challenge Retrieval ───────────────────────────────

  async challengeForAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string
  ): Promise<string> {
    const entry = this.authCodes.get(authorizationCode);
    if (!entry || entry.clientId !== client.client_id) {
      throw new Error("Invalid authorization code");
    }

    if (Date.now() - entry.createdAt > AUTH_CODE_TTL_MS) {
      this.authCodes.delete(authorizationCode);
      throw new Error("Authorization code expired");
    }

    return entry.codeChallenge;
  }

  // ── Token Exchange ─────────────────────────────────────────

  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
    _codeVerifier?: string,
    _redirectUri?: string,
    _resource?: URL
  ): Promise<OAuthTokens> {
    const entry = this.authCodes.get(authorizationCode);
    if (!entry || entry.clientId !== client.client_id) {
      throw new Error("Invalid authorization code");
    }

    if (Date.now() - entry.createdAt > AUTH_CODE_TTL_MS) {
      this.authCodes.delete(authorizationCode);
      throw new Error("Authorization code expired");
    }

    // Delete used code (one-time use per OAuth spec)
    this.authCodes.delete(authorizationCode);

    return this.issueTokenPair(client.client_id, entry.scopes);
  }

  async exchangeRefreshToken(
    client: OAuthClientInformationFull,
    refreshToken: string,
    scopes?: string[],
    _resource?: URL
  ): Promise<OAuthTokens> {
    const entry = this.refreshTokens.get(refreshToken);
    if (!entry || entry.clientId !== client.client_id) {
      throw new Error("Invalid refresh token");
    }

    // Rotate refresh token
    this.refreshTokens.delete(refreshToken);

    return this.issueTokenPair(client.client_id, scopes || entry.scopes);
  }

  // ── Token Verification ─────────────────────────────────────

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    // Check static secret first (backward compat with MCP_SECRET)
    if (this.staticSecret && token === this.staticSecret) {
      return {
        token,
        clientId: "static-secret",
        scopes: [],
      };
    }

    const entry = this.accessTokens.get(token);
    if (!entry) {
      throw new Error("Invalid access token");
    }

    if (entry.expiresAt < Math.floor(Date.now() / 1000)) {
      this.accessTokens.delete(token);
      throw new Error("Access token expired");
    }

    return {
      token,
      clientId: entry.clientId,
      scopes: entry.scopes,
      expiresAt: entry.expiresAt,
    };
  }

  // ── Token Revocation ───────────────────────────────────────

  async revokeToken(
    _client: OAuthClientInformationFull,
    request: OAuthTokenRevocationRequest
  ): Promise<void> {
    this.accessTokens.delete(request.token);
    this.refreshTokens.delete(request.token);
  }

  // ── Private Helpers ────────────────────────────────────────

  private issueTokenPair(clientId: string, scopes: string[]): OAuthTokens {
    const accessToken = randomBytes(32).toString("hex");
    const refreshToken = randomBytes(32).toString("hex");

    this.accessTokens.set(accessToken, {
      clientId,
      scopes,
      expiresAt: Math.floor(Date.now() / 1000) + ACCESS_TOKEN_TTL_S,
    });

    this.refreshTokens.set(refreshToken, {
      clientId,
      scopes,
    });

    return {
      access_token: accessToken,
      token_type: "bearer",
      expires_in: ACCESS_TOKEN_TTL_S,
      refresh_token: refreshToken,
    };
  }

  /**
   * Exchange an Oura authorization code for Oura access/refresh tokens
   */
  private async exchangeOuraCode(code: string): Promise<{
    access_token: string;
    refresh_token: string;
  }> {
    const response = await fetch(OURA_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: this.ouraClientId,
        client_secret: this.ouraClientSecret,
        redirect_uri: this.callbackUrl,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Oura token exchange failed: ${response.status} ${body}`
      );
    }

    const data = (await response.json()) as {
      access_token: string;
      refresh_token: string;
      token_type: string;
      expires_in: number;
    };

    console.error("Oura OAuth tokens obtained successfully");
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
    };
  }
}
