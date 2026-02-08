/**
 * Tests for MCP Server initialization
 *
 * Tests server setup, token validation, and startup behavior.
 * Note: Module-level side effects (like process.exit on missing token)
 * are tested via integration tests rather than unit tests due to
 * vitest module caching behavior.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(__dirname, "..", "package.json"), "utf-8"));

// Create mock class constructors
class MockMcpServer {
  static instances: MockMcpServer[] = [];
  static lastConfig: unknown;

  connect = vi.fn().mockResolvedValue(undefined);
  registerResource = vi.fn();
  registerPrompt = vi.fn();

  constructor(config: unknown) {
    MockMcpServer.lastConfig = config;
    MockMcpServer.instances.push(this);
  }

  static reset() {
    MockMcpServer.instances = [];
    MockMcpServer.lastConfig = undefined;
  }
}

class MockStdioServerTransport {
  static instances: MockStdioServerTransport[] = [];

  constructor() {
    MockStdioServerTransport.instances.push(this);
  }

  static reset() {
    MockStdioServerTransport.instances = [];
  }
}

class MockOuraClient {
  static instances: MockOuraClient[] = [];
  static lastConfig: unknown;

  constructor(config: unknown) {
    MockOuraClient.lastConfig = config;
    MockOuraClient.instances.push(this);
  }

  static reset() {
    MockOuraClient.instances = [];
    MockOuraClient.lastConfig = undefined;
  }
}

const mockRegisterTools = vi.fn();
const mockRegisterResources = vi.fn();
const mockRegisterPrompts = vi.fn();

// Mock the MCP SDK modules before importing index
vi.mock("@modelcontextprotocol/sdk/server/mcp.js", () => ({
  McpServer: MockMcpServer,
}));

vi.mock("@modelcontextprotocol/sdk/server/stdio.js", () => ({
  StdioServerTransport: MockStdioServerTransport,
}));

vi.mock("./client.js", () => ({
  OuraClient: MockOuraClient,
}));

vi.mock("./tools/index.js", () => ({
  registerTools: mockRegisterTools,
}));

vi.mock("./resources/index.js", () => ({
  registerResources: mockRegisterResources,
}));

vi.mock("./prompts/index.js", () => ({
  registerPrompts: mockRegisterPrompts,
}));

// Mock auth modules
const mockLoadCredentials = vi.fn();
const mockIsExpired = vi.fn();
const mockGetOAuthConfigFromEnv = vi.fn();
const mockRefreshAccessToken = vi.fn();

vi.mock("./auth/store.js", () => ({
  loadCredentials: mockLoadCredentials,
  isExpired: mockIsExpired,
}));

vi.mock("./auth/oauth.js", () => ({
  getOAuthConfigFromEnv: mockGetOAuthConfigFromEnv,
  refreshAccessToken: mockRefreshAccessToken,
}));

// Mock CLI module (for CLI command tests)
const mockRunAuthFlow = vi.fn();
const mockRunLogout = vi.fn();
const mockShowAuthStatus = vi.fn();

vi.mock("./auth/cli.js", () => ({
  runAuthFlow: mockRunAuthFlow,
  runLogout: mockRunLogout,
  showAuthStatus: mockShowAuthStatus,
}));

describe("MCP Server", () => {
  const originalEnv = process.env;
  const originalConsoleError = console.error;

  beforeEach(() => {
    // Reset modules to ensure fresh imports
    vi.resetModules();

    // Reset mock class state
    MockMcpServer.reset();
    MockStdioServerTransport.reset();
    MockOuraClient.reset();
    mockRegisterTools.mockClear();
    mockRegisterResources.mockClear();
    mockRegisterPrompts.mockClear();
    mockLoadCredentials.mockClear();
    mockIsExpired.mockClear();
    mockGetOAuthConfigFromEnv.mockClear();
    mockRefreshAccessToken.mockClear();
    mockRunAuthFlow.mockClear();
    mockRunLogout.mockClear();
    mockShowAuthStatus.mockClear();

    // Default: no stored credentials
    mockLoadCredentials.mockResolvedValue(null);

    // Reset environment - always set a token for these tests
    process.env = { ...originalEnv };

    // Suppress console.error from server startup
    console.error = vi.fn();
  });

  afterEach(() => {
    process.env = originalEnv;
    console.error = originalConsoleError;
  });

  describe("token handling", () => {
    it("should accept OURA_ACCESS_TOKEN", async () => {
      process.env.OURA_ACCESS_TOKEN = "test-token";
      delete process.env.OURA_PERSONAL_ACCESS_TOKEN;

      await import("./index.js");

      expect(MockOuraClient.lastConfig).toEqual({ accessToken: "test-token" });
    });

    it("should accept OURA_PERSONAL_ACCESS_TOKEN as fallback", async () => {
      delete process.env.OURA_ACCESS_TOKEN;
      process.env.OURA_PERSONAL_ACCESS_TOKEN = "personal-token";

      await import("./index.js");

      expect(MockOuraClient.lastConfig).toEqual({ accessToken: "personal-token" });
    });

    it("should prefer OURA_ACCESS_TOKEN over OURA_PERSONAL_ACCESS_TOKEN", async () => {
      process.env.OURA_ACCESS_TOKEN = "primary-token";
      process.env.OURA_PERSONAL_ACCESS_TOKEN = "fallback-token";

      await import("./index.js");

      expect(MockOuraClient.lastConfig).toEqual({ accessToken: "primary-token" });
    });
  });

  describe("server initialization", () => {
    it("should create McpServer with correct config", async () => {
      process.env.OURA_ACCESS_TOKEN = "test-token";

      await import("./index.js");

      expect(MockMcpServer.lastConfig).toEqual({
        name: "oura-mcp",
        version: pkg.version,
      });
    });

    it("should create OuraClient with access token", async () => {
      process.env.OURA_ACCESS_TOKEN = "my-oura-token";

      await import("./index.js");

      expect(MockOuraClient.instances.length).toBe(1);
      expect(MockOuraClient.lastConfig).toEqual({ accessToken: "my-oura-token" });
    });

    it("should register tools with server and client", async () => {
      process.env.OURA_ACCESS_TOKEN = "test-token";

      await import("./index.js");

      expect(mockRegisterTools).toHaveBeenCalled();
      expect(MockMcpServer.instances.length).toBe(1);
      expect(MockOuraClient.instances.length).toBe(1);
    });

    it("should create StdioServerTransport", async () => {
      process.env.OURA_ACCESS_TOKEN = "test-token";

      await import("./index.js");

      // Transport is created in main() which runs asynchronously
      // Give it a moment to complete
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(MockStdioServerTransport.instances.length).toBe(1);
    });

    it("should connect server to transport", async () => {
      process.env.OURA_ACCESS_TOKEN = "test-token";

      await import("./index.js");

      // Wait for main() to complete
      await new Promise((resolve) => setTimeout(resolve, 10));

      const serverInstance = MockMcpServer.instances[0];
      expect(serverInstance.connect).toHaveBeenCalled();
    });
  });

  describe("stored credentials", () => {
    it("should use stored credentials when no env token", async () => {
      delete process.env.OURA_ACCESS_TOKEN;
      delete process.env.OURA_PERSONAL_ACCESS_TOKEN;

      mockLoadCredentials.mockResolvedValue({
        access_token: "stored-token",
        refresh_token: "refresh-token",
        expires_at: Date.now() + 3600000,
      });
      mockIsExpired.mockReturnValue(false);

      await import("./index.js");

      expect(mockLoadCredentials).toHaveBeenCalled();
      expect(MockOuraClient.lastConfig).toEqual({ accessToken: "stored-token" });
    });

    it("should refresh expired token", async () => {
      delete process.env.OURA_ACCESS_TOKEN;
      delete process.env.OURA_PERSONAL_ACCESS_TOKEN;

      mockLoadCredentials.mockResolvedValue({
        access_token: "expired-token",
        refresh_token: "refresh-token",
        expires_at: Date.now() - 1000,
      });
      mockIsExpired.mockReturnValue(true);
      mockGetOAuthConfigFromEnv.mockReturnValue({
        clientId: "test-client",
        clientSecret: "test-secret",
        redirectUri: "http://localhost:3000/callback",
      });
      mockRefreshAccessToken.mockResolvedValue({
        access_token: "refreshed-token",
        refresh_token: "new-refresh-token",
        expires_at: Date.now() + 3600000,
      });

      await import("./index.js");

      expect(mockRefreshAccessToken).toHaveBeenCalledWith(
        "refresh-token",
        expect.objectContaining({ clientId: "test-client" })
      );
      expect(MockOuraClient.lastConfig).toEqual({ accessToken: "refreshed-token" });
    });
  });
});
