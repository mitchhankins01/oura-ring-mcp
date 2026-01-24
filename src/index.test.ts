/**
 * Tests for MCP Server initialization
 *
 * Tests server setup, token validation, and startup behavior.
 * Note: Module-level side effects (like process.exit on missing token)
 * are tested via integration tests rather than unit tests due to
 * vitest module caching behavior.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Create mock class constructors
class MockMcpServer {
  static instances: MockMcpServer[] = [];
  static lastConfig: unknown;

  connect = vi.fn().mockResolvedValue(undefined);

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
        version: "0.1.0",
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
});
