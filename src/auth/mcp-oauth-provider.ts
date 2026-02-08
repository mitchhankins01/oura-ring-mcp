/**
 * MCP OAuth Server Provider
 *
 * Implements the OAuthServerProvider interface from the MCP SDK to enable
 * OAuth 2.1 authentication for remote MCP connections (e.g., Claude.ai connector).
 *
 * This is a self-contained OAuth server that:
 * - Supports dynamic client registration (RFC 7591)
 * - Auto-approves authorization (personal server — no consent page)
 * - Issues and verifies access/refresh tokens in-memory
 * - Supports PKCE (S256) for security
 * - Optionally accepts a static MCP_SECRET as a valid bearer token
 *
 * Tokens are stored in memory and reset on server restart.
 * Clients will re-authenticate automatically via refresh or re-authorization.
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
// In-Memory Stores
// ─────────────────────────────────────────────────────────────

interface AuthCodeEntry {
  clientId: string;
  codeChallenge: string;
  redirectUri: string;
  scopes: string[];
  resource?: URL;
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
// OAuth Provider
// ─────────────────────────────────────────────────────────────

export class OuraMcpOAuthProvider implements OAuthServerProvider {
  private clients = new Map<string, OAuthClientInformationFull>();
  private authCodes = new Map<string, AuthCodeEntry>();
  private accessTokens = new Map<string, TokenEntry>();
  private refreshTokens = new Map<string, RefreshTokenEntry>();
  private staticSecret: string | undefined;

  /**
   * @param staticSecret Optional MCP_SECRET for backward-compatible bearer auth.
   *                     If set, this token is always accepted as a valid bearer token.
   */
  constructor(staticSecret?: string) {
    this.staticSecret = staticSecret;
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

  // ── Authorization ──────────────────────────────────────────

  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response
  ): Promise<void> {
    // Auto-approve: generate auth code and redirect back immediately.
    // PKCE ensures only the original requester can exchange the code.
    const code = randomUUID();
    this.authCodes.set(code, {
      clientId: client.client_id,
      codeChallenge: params.codeChallenge,
      redirectUri: params.redirectUri,
      scopes: params.scopes || [],
      resource: params.resource,
      createdAt: Date.now(),
    });

    const redirectUrl = new URL(params.redirectUri);
    redirectUrl.searchParams.set("code", code);
    if (params.state) {
      redirectUrl.searchParams.set("state", params.state);
    }

    res.redirect(302, redirectUrl.toString());
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

    // Check expiry
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

    // Check expiry
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

    // Rotate refresh token (delete old one)
    this.refreshTokens.delete(refreshToken);

    return this.issueTokenPair(
      client.client_id,
      scopes || entry.scopes
    );
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
    // Try both stores — revocation should succeed silently per RFC 7009
    this.accessTokens.delete(request.token);
    this.refreshTokens.delete(request.token);
  }

  // ── Helpers ────────────────────────────────────────────────

  private issueTokenPair(
    clientId: string,
    scopes: string[]
  ): OAuthTokens {
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
}
