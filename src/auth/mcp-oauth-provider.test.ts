/**
 * Tests for MCP OAuth Server Provider (Oura Proxy)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  OuraMcpOAuthProvider,
  type OuraMcpOAuthProviderOptions,
} from "./mcp-oauth-provider.js";
import type { OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";

// Suppress console.error from provider
vi.spyOn(console, "error").mockImplementation(() => {});

// Mock global fetch for Oura token exchange
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function createProvider(
  overrides?: Partial<OuraMcpOAuthProviderOptions>
): OuraMcpOAuthProvider {
  return new OuraMcpOAuthProvider({
    baseUrl: new URL("https://example.com"),
    ouraClientId: "test-oura-client-id",
    ouraClientSecret: "test-oura-client-secret",
    ...overrides,
  });
}

describe("OuraMcpOAuthProvider", () => {
  let provider: OuraMcpOAuthProvider;

  beforeEach(() => {
    provider = createProvider();
    mockFetch.mockReset();
  });

  // ── Client Registration ──────────────────────────────────

  describe("clientsStore", () => {
    it("should register a client and return it", () => {
      const store = provider.clientsStore;

      const metadata = {
        redirect_uris: [new URL("https://example.com/callback")],
        client_name: "Test Client",
      } as Omit<
        OAuthClientInformationFull,
        "client_id" | "client_id_issued_at"
      >;

      const registered = store.registerClient!(
        metadata
      ) as OAuthClientInformationFull;

      expect(registered.client_id).toBeDefined();
      expect(registered.client_secret).toBeDefined();
      expect(registered.client_id_issued_at).toBeDefined();
      expect(registered.client_name).toBe("Test Client");
    });

    it("should retrieve a registered client by ID", () => {
      const store = provider.clientsStore;

      const metadata = {
        redirect_uris: [new URL("https://example.com/callback")],
      } as Omit<
        OAuthClientInformationFull,
        "client_id" | "client_id_issued_at"
      >;

      const registered = store.registerClient!(
        metadata
      ) as OAuthClientInformationFull;
      const found = store.getClient(
        registered.client_id
      ) as OAuthClientInformationFull | undefined;

      expect(found).toBeDefined();
      expect(found!.client_id).toBe(registered.client_id);
    });

    it("should return undefined for unknown client", () => {
      const store = provider.clientsStore;
      const found = store.getClient("nonexistent");
      expect(found).toBeUndefined();
    });
  });

  // ── Authorization (redirects to Oura) ────────────────────

  describe("authorize", () => {
    it("should redirect to Oura OAuth with correct params", async () => {
      const client = registerTestClient(provider);

      const redirectUrl = { value: "", status: 0 };
      const mockRes = {
        redirect: (status: number, url: string) => {
          redirectUrl.status = status;
          redirectUrl.value = url;
        },
      } as unknown as import("express").Response;

      await provider.authorize(
        client,
        {
          codeChallenge: "test-challenge",
          redirectUri: "https://claude.ai/callback",
          state: "test-state",
          scopes: [],
        },
        mockRes
      );

      const url = new URL(redirectUrl.value);
      expect(url.origin).toBe("https://cloud.ouraring.com");
      expect(url.pathname).toBe("/oauth/authorize");
      expect(url.searchParams.get("response_type")).toBe("code");
      expect(url.searchParams.get("client_id")).toBe("test-oura-client-id");
      expect(url.searchParams.get("redirect_uri")).toBe(
        "https://example.com/oauth/callback"
      );
      expect(url.searchParams.get("state")).toBeDefined();
      expect(url.searchParams.get("scope")).toContain("daily");
      expect(redirectUrl.status).toBe(302);
    });
  });

  // ── Oura Callback + Full Flow ────────────────────────────

  describe("handleOuraCallback", () => {
    it("should exchange Oura code and return redirect to MCP client", async () => {
      const client = registerTestClient(provider);

      // Step 1: Start authorization (capture the Oura state)
      let ouraRedirectUrl = "";
      const mockRes = {
        redirect: (_status: number, url: string) => {
          ouraRedirectUrl = url;
        },
      } as unknown as import("express").Response;

      await provider.authorize(
        client,
        {
          codeChallenge: "test-challenge",
          redirectUri: "https://claude.ai/callback",
          state: "client-state",
          scopes: [],
        },
        mockRes
      );

      const ouraState = new URL(ouraRedirectUrl).searchParams.get("state")!;

      // Step 2: Mock Oura token exchange
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: "oura-access-token-123",
          refresh_token: "oura-refresh-token-456",
          token_type: "bearer",
          expires_in: 86400,
        }),
      });

      // Step 3: Handle Oura callback
      const redirectUrl = await provider.handleOuraCallback(
        "oura-auth-code",
        ouraState
      );

      const url = new URL(redirectUrl);
      expect(url.origin).toBe("https://claude.ai");
      expect(url.pathname).toBe("/callback");
      expect(url.searchParams.get("code")).toBeDefined();
      expect(url.searchParams.get("state")).toBe("client-state");
    });

    it("should call onOuraTokens callback with Oura tokens", async () => {
      const onOuraTokens = vi.fn();
      const providerWithCallback = createProvider({ onOuraTokens });
      const client = registerTestClient(providerWithCallback);

      // Authorize
      let ouraRedirectUrl = "";
      const mockRes = {
        redirect: (_status: number, url: string) => {
          ouraRedirectUrl = url;
        },
      } as unknown as import("express").Response;

      await providerWithCallback.authorize(
        client,
        {
          codeChallenge: "challenge",
          redirectUri: "https://claude.ai/callback",
        },
        mockRes
      );

      const ouraState = new URL(ouraRedirectUrl).searchParams.get("state")!;

      // Mock Oura token exchange
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: "oura-token",
          refresh_token: "oura-refresh",
          token_type: "bearer",
          expires_in: 86400,
        }),
      });

      await providerWithCallback.handleOuraCallback("code", ouraState);

      expect(onOuraTokens).toHaveBeenCalledWith("oura-token", "oura-refresh");
    });

    it("should throw for invalid state", async () => {
      await expect(
        provider.handleOuraCallback("code", "bad-state")
      ).rejects.toThrow("Invalid or expired OAuth state");
    });

    it("should throw when Oura token exchange fails", async () => {
      const client = registerTestClient(provider);

      let ouraRedirectUrl = "";
      const mockRes = {
        redirect: (_status: number, url: string) => {
          ouraRedirectUrl = url;
        },
      } as unknown as import("express").Response;

      await provider.authorize(
        client,
        {
          codeChallenge: "challenge",
          redirectUri: "https://claude.ai/callback",
        },
        mockRes
      );

      const ouraState = new URL(ouraRedirectUrl).searchParams.get("state")!;

      // Mock Oura token exchange failure
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => "invalid_grant",
      });

      await expect(
        provider.handleOuraCallback("bad-code", ouraState)
      ).rejects.toThrow("Oura token exchange failed");
    });
  });

  // ── Full Authorization Flow ──────────────────────────────

  describe("full flow: authorize → callback → exchange → verify", () => {
    it("should complete the entire OAuth flow", async () => {
      const client = registerTestClient(provider);

      // 1. Authorize (get Oura state)
      let ouraRedirectUrl = "";
      const mockRes = {
        redirect: (_status: number, url: string) => {
          ouraRedirectUrl = url;
        },
      } as unknown as import("express").Response;

      await provider.authorize(
        client,
        {
          codeChallenge: "challenge",
          redirectUri: "https://claude.ai/callback",
          state: "my-state",
        },
        mockRes
      );

      const ouraState = new URL(ouraRedirectUrl).searchParams.get("state")!;

      // 2. Mock Oura token exchange
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: "oura-token",
          refresh_token: "oura-refresh",
          token_type: "bearer",
          expires_in: 86400,
        }),
      });

      // 3. Handle callback (get our auth code)
      const clientRedirectUrl = await provider.handleOuraCallback(
        "oura-code",
        ouraState
      );
      const ourCode = new URL(clientRedirectUrl).searchParams.get("code")!;

      // 4. Exchange our code for tokens
      const tokens = await provider.exchangeAuthorizationCode(client, ourCode);
      expect(tokens.access_token).toBeDefined();
      expect(tokens.refresh_token).toBeDefined();

      // 5. Verify our access token
      const authInfo = await provider.verifyAccessToken(tokens.access_token);
      expect(authInfo.clientId).toBe(client.client_id);
    });
  });

  // ── Token Exchange ───────────────────────────────────────

  describe("exchangeAuthorizationCode", () => {
    it("should reject reuse of auth code", async () => {
      const client = registerTestClient(provider);
      const code = await getAuthCodeViaOuraCallback(provider, client);

      await provider.exchangeAuthorizationCode(client, code);

      await expect(
        provider.exchangeAuthorizationCode(client, code)
      ).rejects.toThrow("Invalid authorization code");
    });

    it("should reject invalid code", async () => {
      const client = registerTestClient(provider);

      await expect(
        provider.exchangeAuthorizationCode(client, "bad-code")
      ).rejects.toThrow("Invalid authorization code");
    });
  });

  // ── Refresh Token ────────────────────────────────────────

  describe("exchangeRefreshToken", () => {
    it("should exchange refresh token for new token pair", async () => {
      const client = registerTestClient(provider);
      const code = await getAuthCodeViaOuraCallback(provider, client);
      const tokens = await provider.exchangeAuthorizationCode(client, code);

      const newTokens = await provider.exchangeRefreshToken(
        client,
        tokens.refresh_token!
      );

      expect(newTokens.access_token).not.toBe(tokens.access_token);
      expect(newTokens.refresh_token).not.toBe(tokens.refresh_token);
    });

    it("should rotate refresh token (old one becomes invalid)", async () => {
      const client = registerTestClient(provider);
      const code = await getAuthCodeViaOuraCallback(provider, client);
      const tokens = await provider.exchangeAuthorizationCode(client, code);

      await provider.exchangeRefreshToken(client, tokens.refresh_token!);

      await expect(
        provider.exchangeRefreshToken(client, tokens.refresh_token!)
      ).rejects.toThrow("Invalid refresh token");
    });
  });

  // ── Token Verification ───────────────────────────────────

  describe("verifyAccessToken", () => {
    it("should verify a valid access token", async () => {
      const client = registerTestClient(provider);
      const code = await getAuthCodeViaOuraCallback(provider, client);
      const tokens = await provider.exchangeAuthorizationCode(client, code);

      const authInfo = await provider.verifyAccessToken(tokens.access_token);

      expect(authInfo.token).toBe(tokens.access_token);
      expect(authInfo.clientId).toBe(client.client_id);
    });

    it("should reject invalid token", async () => {
      await expect(
        provider.verifyAccessToken("bad-token")
      ).rejects.toThrow("Invalid access token");
    });

    it("should accept static secret when configured", async () => {
      const secretProvider = createProvider({
        staticSecret: "my-secret-123",
      });

      const authInfo =
        await secretProvider.verifyAccessToken("my-secret-123");

      expect(authInfo.token).toBe("my-secret-123");
      expect(authInfo.clientId).toBe("static-secret");
    });

    it("should not accept static secret when not configured", async () => {
      await expect(
        provider.verifyAccessToken("my-secret-123")
      ).rejects.toThrow("Invalid access token");
    });
  });

  // ── Token Revocation ─────────────────────────────────────

  describe("revokeToken", () => {
    it("should revoke an access token", async () => {
      const client = registerTestClient(provider);
      const code = await getAuthCodeViaOuraCallback(provider, client);
      const tokens = await provider.exchangeAuthorizationCode(client, code);

      await provider.revokeToken(client, { token: tokens.access_token });

      await expect(
        provider.verifyAccessToken(tokens.access_token)
      ).rejects.toThrow("Invalid access token");
    });

    it("should silently handle unknown tokens", async () => {
      const client = registerTestClient(provider);
      await provider.revokeToken(client, { token: "nonexistent" });
    });
  });
});

// ── Test Helpers ─────────────────────────────────────────────

function registerTestClient(
  provider: OuraMcpOAuthProvider
): OAuthClientInformationFull {
  const store = provider.clientsStore;
  return store.registerClient!({
    redirect_uris: [new URL("https://claude.ai/callback")],
    client_name: "Test Client",
  } as Omit<
    OAuthClientInformationFull,
    "client_id" | "client_id_issued_at"
  >) as OAuthClientInformationFull;
}

/**
 * Simulate the full Oura callback flow to get an auth code.
 * Mocks the Oura token exchange.
 */
async function getAuthCodeViaOuraCallback(
  provider: OuraMcpOAuthProvider,
  client: OAuthClientInformationFull
): Promise<string> {
  // Authorize (capture Oura redirect)
  let ouraRedirectUrl = "";
  const mockRes = {
    redirect: (_status: number, url: string) => {
      ouraRedirectUrl = url;
    },
  } as unknown as import("express").Response;

  await provider.authorize(
    client,
    {
      codeChallenge: "test-challenge",
      redirectUri: "https://claude.ai/callback",
      state: "state",
    },
    mockRes
  );

  const ouraState = new URL(ouraRedirectUrl).searchParams.get("state")!;

  // Mock Oura token exchange
  const mockFetchFn = vi.mocked(globalThis.fetch);
  mockFetchFn.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      access_token: "oura-token",
      refresh_token: "oura-refresh",
      token_type: "bearer",
      expires_in: 86400,
    }),
  } as globalThis.Response);

  // Handle callback
  const redirectUrl = await provider.handleOuraCallback("oura-code", ouraState);
  return new URL(redirectUrl).searchParams.get("code")!;
}
