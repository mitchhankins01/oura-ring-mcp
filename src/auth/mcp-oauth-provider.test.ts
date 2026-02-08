/**
 * Tests for MCP OAuth Server Provider
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { OuraMcpOAuthProvider } from "./mcp-oauth-provider.js";
import type { OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";

// Suppress console.error from provider
vi.spyOn(console, "error").mockImplementation(() => {});

describe("OuraMcpOAuthProvider", () => {
  let provider: OuraMcpOAuthProvider;

  beforeEach(() => {
    provider = new OuraMcpOAuthProvider();
  });

  // ── Client Registration ──────────────────────────────────

  describe("clientsStore", () => {
    it("should register a client and return it", () => {
      const store = provider.clientsStore;

      const metadata = {
        redirect_uris: [new URL("https://example.com/callback")],
        client_name: "Test Client",
      } as Omit<OAuthClientInformationFull, "client_id" | "client_id_issued_at">;

      const registered = store.registerClient!(metadata) as OAuthClientInformationFull;

      expect(registered.client_id).toBeDefined();
      expect(registered.client_secret).toBeDefined();
      expect(registered.client_id_issued_at).toBeDefined();
      expect(registered.client_name).toBe("Test Client");
    });

    it("should retrieve a registered client by ID", () => {
      const store = provider.clientsStore;

      const metadata = {
        redirect_uris: [new URL("https://example.com/callback")],
      } as Omit<OAuthClientInformationFull, "client_id" | "client_id_issued_at">;

      const registered = store.registerClient!(metadata) as OAuthClientInformationFull;
      const found = store.getClient(registered.client_id) as OAuthClientInformationFull | undefined;

      expect(found).toBeDefined();
      expect(found!.client_id).toBe(registered.client_id);
    });

    it("should return undefined for unknown client", () => {
      const store = provider.clientsStore;
      const found = store.getClient("nonexistent");
      expect(found).toBeUndefined();
    });
  });

  // ── Authorization Flow ───────────────────────────────────

  describe("authorize", () => {
    it("should redirect with auth code and state", async () => {
      const client = registerTestClient(provider);

      const redirectUrl = { value: "" };
      const mockRes = {
        redirect: (_status: number, url: string) => {
          redirectUrl.value = url;
        },
      } as unknown as import("express").Response;

      await provider.authorize(
        client,
        {
          codeChallenge: "test-challenge",
          redirectUri: "https://example.com/callback",
          state: "test-state",
          scopes: [],
        },
        mockRes
      );

      const url = new URL(redirectUrl.value);
      expect(url.searchParams.get("code")).toBeDefined();
      expect(url.searchParams.get("state")).toBe("test-state");
      expect(url.origin + url.pathname).toBe("https://example.com/callback");
    });

    it("should omit state if not provided", async () => {
      const client = registerTestClient(provider);

      const redirectUrl = { value: "" };
      const mockRes = {
        redirect: (_status: number, url: string) => {
          redirectUrl.value = url;
        },
      } as unknown as import("express").Response;

      await provider.authorize(
        client,
        {
          codeChallenge: "test-challenge",
          redirectUri: "https://example.com/callback",
        },
        mockRes
      );

      const url = new URL(redirectUrl.value);
      expect(url.searchParams.has("code")).toBe(true);
      expect(url.searchParams.has("state")).toBe(false);
    });
  });

  // ── Code Challenge ───────────────────────────────────────

  describe("challengeForAuthorizationCode", () => {
    it("should return the code challenge for a valid code", async () => {
      const client = registerTestClient(provider);
      const code = await authorizeAndGetCode(provider, client, "my-challenge");

      const challenge = await provider.challengeForAuthorizationCode(client, code);
      expect(challenge).toBe("my-challenge");
    });

    it("should throw for invalid code", async () => {
      const client = registerTestClient(provider);

      await expect(
        provider.challengeForAuthorizationCode(client, "bad-code")
      ).rejects.toThrow("Invalid authorization code");
    });

    it("should throw for wrong client", async () => {
      const client1 = registerTestClient(provider);
      const client2 = registerTestClient(provider);
      const code = await authorizeAndGetCode(provider, client1, "challenge");

      await expect(
        provider.challengeForAuthorizationCode(client2, code)
      ).rejects.toThrow("Invalid authorization code");
    });
  });

  // ── Token Exchange ───────────────────────────────────────

  describe("exchangeAuthorizationCode", () => {
    it("should exchange code for tokens", async () => {
      const client = registerTestClient(provider);
      const code = await authorizeAndGetCode(provider, client, "challenge");

      const tokens = await provider.exchangeAuthorizationCode(client, code);

      expect(tokens.access_token).toBeDefined();
      expect(tokens.refresh_token).toBeDefined();
      expect(tokens.token_type).toBe("bearer");
      expect(tokens.expires_in).toBeGreaterThan(0);
    });

    it("should reject reuse of auth code", async () => {
      const client = registerTestClient(provider);
      const code = await authorizeAndGetCode(provider, client, "challenge");

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
      const code = await authorizeAndGetCode(provider, client, "challenge");
      const tokens = await provider.exchangeAuthorizationCode(client, code);

      const newTokens = await provider.exchangeRefreshToken(
        client,
        tokens.refresh_token!
      );

      expect(newTokens.access_token).toBeDefined();
      expect(newTokens.refresh_token).toBeDefined();
      expect(newTokens.access_token).not.toBe(tokens.access_token);
      expect(newTokens.refresh_token).not.toBe(tokens.refresh_token);
    });

    it("should rotate refresh token (old one becomes invalid)", async () => {
      const client = registerTestClient(provider);
      const code = await authorizeAndGetCode(provider, client, "challenge");
      const tokens = await provider.exchangeAuthorizationCode(client, code);

      await provider.exchangeRefreshToken(client, tokens.refresh_token!);

      await expect(
        provider.exchangeRefreshToken(client, tokens.refresh_token!)
      ).rejects.toThrow("Invalid refresh token");
    });

    it("should reject invalid refresh token", async () => {
      const client = registerTestClient(provider);

      await expect(
        provider.exchangeRefreshToken(client, "bad-token")
      ).rejects.toThrow("Invalid refresh token");
    });
  });

  // ── Token Verification ───────────────────────────────────

  describe("verifyAccessToken", () => {
    it("should verify a valid access token", async () => {
      const client = registerTestClient(provider);
      const code = await authorizeAndGetCode(provider, client, "challenge");
      const tokens = await provider.exchangeAuthorizationCode(client, code);

      const authInfo = await provider.verifyAccessToken(tokens.access_token);

      expect(authInfo.token).toBe(tokens.access_token);
      expect(authInfo.clientId).toBe(client.client_id);
      expect(authInfo.expiresAt).toBeDefined();
    });

    it("should reject invalid token", async () => {
      await expect(
        provider.verifyAccessToken("bad-token")
      ).rejects.toThrow("Invalid access token");
    });

    it("should accept static secret when configured", async () => {
      const secretProvider = new OuraMcpOAuthProvider("my-secret-123");

      const authInfo = await secretProvider.verifyAccessToken("my-secret-123");

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
      const code = await authorizeAndGetCode(provider, client, "challenge");
      const tokens = await provider.exchangeAuthorizationCode(client, code);

      await provider.revokeToken(client, { token: tokens.access_token });

      await expect(
        provider.verifyAccessToken(tokens.access_token)
      ).rejects.toThrow("Invalid access token");
    });

    it("should silently handle unknown tokens", async () => {
      const client = registerTestClient(provider);

      // Should not throw
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
    redirect_uris: [new URL("https://example.com/callback")],
    client_name: "Test Client",
  } as Omit<OAuthClientInformationFull, "client_id" | "client_id_issued_at">) as OAuthClientInformationFull;
}

async function authorizeAndGetCode(
  provider: OuraMcpOAuthProvider,
  client: OAuthClientInformationFull,
  codeChallenge: string
): Promise<string> {
  let redirectUrl = "";
  const mockRes = {
    redirect: (_status: number, url: string) => {
      redirectUrl = url;
    },
  } as unknown as import("express").Response;

  await provider.authorize(
    client,
    {
      codeChallenge,
      redirectUri: "https://example.com/callback",
      state: "state-123",
    },
    mockRes
  );

  return new URL(redirectUrl).searchParams.get("code")!;
}
