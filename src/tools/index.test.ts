/**
 * Tests for MCP Tool handlers
 *
 * Tests each tool's handler with mocked OuraClient
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { registerTools } from "./index.js";
import type { OuraClient } from "../client.js";

// Import fixture data
import sleepResponse from "../../tests/fixtures/oura-sleep-response.json" with { type: "json" };
import readinessResponse from "../../tests/fixtures/oura-readiness-response.json" with { type: "json" };
import activityResponse from "../../tests/fixtures/oura-activity-response.json" with { type: "json" };
import stressResponse from "../../tests/fixtures/oura-stress-response.json" with { type: "json" };
import dailySleepResponse from "../../tests/fixtures/oura-daily-sleep-response.json" with { type: "json" };
import heartrateResponse from "../../tests/fixtures/oura-heartrate-response.json" with { type: "json" };
import workoutResponse from "../../tests/fixtures/oura-workout-response.json" with { type: "json" };
import spo2Response from "../../tests/fixtures/oura-spo2-response.json" with { type: "json" };
import vo2maxResponse from "../../tests/fixtures/oura-vo2max-response.json" with { type: "json" };

// Type for captured tool handlers
type ToolHandler = (args: Record<string, unknown>) => Promise<{
  content: Array<{ type: string; text: string }>;
}>;

// Mock McpServer that captures registered tools
function createMockServer() {
  const tools: Map<string, { config: unknown; handler: ToolHandler }> = new Map();

  return {
    registerTool: vi.fn((name: string, config: unknown, handler: ToolHandler) => {
      tools.set(name, { config, handler });
    }),
    getToolHandler: (name: string): ToolHandler | undefined => {
      return tools.get(name)?.handler;
    },
    getToolCount: () => tools.size,
  };
}

// Create mock OuraClient
function createMockClient(overrides: Partial<Record<keyof OuraClient, unknown>> = {}) {
  return {
    getSleep: vi.fn().mockResolvedValue(sleepResponse),
    getDailySleep: vi.fn().mockResolvedValue(dailySleepResponse),
    getDailyReadiness: vi.fn().mockResolvedValue(readinessResponse),
    getDailyActivity: vi.fn().mockResolvedValue(activityResponse),
    getDailyStress: vi.fn().mockResolvedValue(stressResponse),
    getHeartRate: vi.fn().mockResolvedValue(heartrateResponse),
    getWorkouts: vi.fn().mockResolvedValue(workoutResponse),
    getDailySpo2: vi.fn().mockResolvedValue(spo2Response),
    getVO2Max: vi.fn().mockResolvedValue(vo2maxResponse),
    getPersonalInfo: vi.fn().mockResolvedValue({}),
    ...overrides,
  } as unknown as OuraClient;
}

const emptyResponse = { data: [], next_token: null };

describe("Tool Handlers", () => {
  let mockServer: ReturnType<typeof createMockServer>;
  let mockClient: OuraClient;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));

    mockServer = createMockServer();
    mockClient = createMockClient();
    registerTools(mockServer as unknown as Parameters<typeof registerTools>[0], mockClient);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // ─────────────────────────────────────────────────────────────
  // Tool Registration
  // ─────────────────────────────────────────────────────────────

  describe("registerTools", () => {
    it("should register all 9 tools", () => {
      expect(mockServer.getToolCount()).toBe(9);
    });

    it("should register expected tool names", () => {
      const expectedTools = [
        "get_sleep",
        "get_readiness",
        "get_activity",
        "get_stress",
        "get_daily_sleep",
        "get_heart_rate",
        "get_workouts",
        "get_spo2",
        "get_vo2_max",
      ];

      expectedTools.forEach((toolName) => {
        expect(mockServer.getToolHandler(toolName)).toBeDefined();
      });
    });
  });

  // ─────────────────────────────────────────────────────────────
  // get_sleep tool
  // ─────────────────────────────────────────────────────────────

  describe("get_sleep", () => {
    it("should return formatted sleep data", async () => {
      const handler = mockServer.getToolHandler("get_sleep")!;
      const result = await handler({ start_date: "2024-01-15" });

      expect(result.content[0].type).toBe("text");
      expect(result.content[0].text).toContain("## Sleep: 2024-01-15");
      expect(result.content[0].text).toContain("**Total Sleep:**");
      expect(result.content[0].text).toContain("**Sleep Stages:**");
      expect(result.content[0].text).toContain("Deep:");
      expect(result.content[0].text).toContain("REM:");
    });

    it("should use today as default date", async () => {
      const handler = mockServer.getToolHandler("get_sleep")!;
      await handler({});

      expect(mockClient.getSleep).toHaveBeenCalledWith("2024-01-15", "2024-01-15");
    });

    it("should handle empty response", async () => {
      mockClient = createMockClient({ getSleep: vi.fn().mockResolvedValue(emptyResponse) });
      registerTools(mockServer as unknown as Parameters<typeof registerTools>[0], mockClient);

      const handler = mockServer.getToolHandler("get_sleep")!;
      const result = await handler({ start_date: "2024-01-15" });

      expect(result.content[0].text).toContain("No sleep data found");
    });

    it("should handle API errors", async () => {
      mockClient = createMockClient({
        getSleep: vi.fn().mockRejectedValue(new Error("API connection failed")),
      });
      registerTools(mockServer as unknown as Parameters<typeof registerTools>[0], mockClient);

      const handler = mockServer.getToolHandler("get_sleep")!;
      const result = await handler({ start_date: "2024-01-15" });

      expect(result.content[0].text).toContain("Error fetching sleep data");
      expect(result.content[0].text).toContain("API connection failed");
    });

    it("should include biometrics when available", async () => {
      const handler = mockServer.getToolHandler("get_sleep")!;
      const result = await handler({ start_date: "2024-01-15" });

      expect(result.content[0].text).toContain("**Biometrics:**");
      expect(result.content[0].text).toContain("Avg Heart Rate: 55 bpm");
      expect(result.content[0].text).toContain("Avg HRV: 65 ms");
    });

    it("should show sleep latency when available", async () => {
      const handler = mockServer.getToolHandler("get_sleep")!;
      const result = await handler({ start_date: "2024-01-15" });

      expect(result.content[0].text).toContain("**Sleep Latency:**");
    });
  });

  // ─────────────────────────────────────────────────────────────
  // get_readiness tool
  // ─────────────────────────────────────────────────────────────

  describe("get_readiness", () => {
    it("should return formatted readiness data", async () => {
      const handler = mockServer.getToolHandler("get_readiness")!;
      const result = await handler({ start_date: "2024-01-15" });

      expect(result.content[0].text).toContain("## Readiness: 2024-01-15");
      expect(result.content[0].text).toContain("**Score:**");
      expect(result.content[0].text).toContain("**Contributors:**");
      expect(result.content[0].text).toContain("HRV Balance:");
    });

    it("should show temperature deviation", async () => {
      const handler = mockServer.getToolHandler("get_readiness")!;
      const result = await handler({ start_date: "2024-01-15" });

      expect(result.content[0].text).toContain("**Temperature Deviation:**");
    });

    it("should handle empty response", async () => {
      mockClient = createMockClient({ getDailyReadiness: vi.fn().mockResolvedValue(emptyResponse) });
      registerTools(mockServer as unknown as Parameters<typeof registerTools>[0], mockClient);

      const handler = mockServer.getToolHandler("get_readiness")!;
      const result = await handler({ start_date: "2024-01-15" });

      expect(result.content[0].text).toContain("No readiness data found");
    });

    it("should handle errors", async () => {
      mockClient = createMockClient({
        getDailyReadiness: vi.fn().mockRejectedValue(new Error("Network error")),
      });
      registerTools(mockServer as unknown as Parameters<typeof registerTools>[0], mockClient);

      const handler = mockServer.getToolHandler("get_readiness")!;
      const result = await handler({});

      expect(result.content[0].text).toContain("Error fetching readiness data");
    });
  });

  // ─────────────────────────────────────────────────────────────
  // get_activity tool
  // ─────────────────────────────────────────────────────────────

  describe("get_activity", () => {
    it("should return formatted activity data", async () => {
      const handler = mockServer.getToolHandler("get_activity")!;
      const result = await handler({ start_date: "2024-01-15" });

      expect(result.content[0].text).toContain("## Activity: 2024-01-15");
      expect(result.content[0].text).toMatch(/\*\*Steps:\*\* 8,?500/); // locale may or may not add comma
      expect(result.content[0].text).toContain("**Calories:**");
      expect(result.content[0].text).toContain("**Activity Breakdown:**");
    });

    it("should show activity time breakdown", async () => {
      const handler = mockServer.getToolHandler("get_activity")!;
      const result = await handler({});

      expect(result.content[0].text).toContain("High Intensity:");
      expect(result.content[0].text).toContain("Medium Intensity:");
      expect(result.content[0].text).toContain("Low Intensity:");
      expect(result.content[0].text).toContain("Sedentary:");
    });

    it("should handle empty response", async () => {
      mockClient = createMockClient({ getDailyActivity: vi.fn().mockResolvedValue(emptyResponse) });
      registerTools(mockServer as unknown as Parameters<typeof registerTools>[0], mockClient);

      const handler = mockServer.getToolHandler("get_activity")!;
      const result = await handler({});

      expect(result.content[0].text).toContain("No activity data found");
    });

    it("should handle errors", async () => {
      mockClient = createMockClient({
        getDailyActivity: vi.fn().mockRejectedValue(new Error("Activity API error")),
      });
      registerTools(mockServer as unknown as Parameters<typeof registerTools>[0], mockClient);

      const handler = mockServer.getToolHandler("get_activity")!;
      const result = await handler({});

      expect(result.content[0].text).toContain("Error fetching activity data");
      expect(result.content[0].text).toContain("Activity API error");
    });
  });

  // ─────────────────────────────────────────────────────────────
  // get_stress tool
  // ─────────────────────────────────────────────────────────────

  describe("get_stress", () => {
    it("should return formatted stress data", async () => {
      const handler = mockServer.getToolHandler("get_stress")!;
      const result = await handler({ start_date: "2024-01-15" });

      expect(result.content[0].text).toContain("## Stress: 2024-01-15");
      expect(result.content[0].text).toContain("**Day Summary:** Restored");
      expect(result.content[0].text).toContain("**Time Breakdown:**");
    });

    it("should show stress and recovery times", async () => {
      const handler = mockServer.getToolHandler("get_stress")!;
      const result = await handler({});

      expect(result.content[0].text).toContain("High Stress:");
      expect(result.content[0].text).toContain("High Recovery:");
    });

    it("should handle null stress values", async () => {
      mockClient = createMockClient({
        getDailyStress: vi.fn().mockResolvedValue({
          data: [{ day: "2024-01-15", day_summary: "normal", stress_high: null, recovery_high: null }],
          next_token: null,
        }),
      });
      registerTools(mockServer as unknown as Parameters<typeof registerTools>[0], mockClient);

      const handler = mockServer.getToolHandler("get_stress")!;
      const result = await handler({});

      expect(result.content[0].text).toContain("High Stress: N/A");
      expect(result.content[0].text).toContain("High Recovery: N/A");
    });

    it("should handle empty response", async () => {
      mockClient = createMockClient({ getDailyStress: vi.fn().mockResolvedValue(emptyResponse) });
      registerTools(mockServer as unknown as Parameters<typeof registerTools>[0], mockClient);

      const handler = mockServer.getToolHandler("get_stress")!;
      const result = await handler({});

      expect(result.content[0].text).toContain("No stress data found");
    });

    it("should handle errors", async () => {
      mockClient = createMockClient({
        getDailyStress: vi.fn().mockRejectedValue(new Error("Stress API error")),
      });
      registerTools(mockServer as unknown as Parameters<typeof registerTools>[0], mockClient);

      const handler = mockServer.getToolHandler("get_stress")!;
      const result = await handler({});

      expect(result.content[0].text).toContain("Error fetching stress data");
    });
  });

  // ─────────────────────────────────────────────────────────────
  // get_daily_sleep tool
  // ─────────────────────────────────────────────────────────────

  describe("get_daily_sleep", () => {
    it("should return formatted daily sleep scores", async () => {
      const handler = mockServer.getToolHandler("get_daily_sleep")!;
      const result = await handler({ start_date: "2024-01-15" });

      expect(result.content[0].text).toContain("## Daily Sleep Score: 2024-01-15");
      expect(result.content[0].text).toContain("**Score:**");
      expect(result.content[0].text).toContain("**Contributors:**");
    });

    it("should show all sleep contributors", async () => {
      const handler = mockServer.getToolHandler("get_daily_sleep")!;
      const result = await handler({});

      expect(result.content[0].text).toContain("Total Sleep:");
      expect(result.content[0].text).toContain("Efficiency:");
      expect(result.content[0].text).toContain("Restfulness:");
      expect(result.content[0].text).toContain("REM Sleep:");
      expect(result.content[0].text).toContain("Deep Sleep:");
      expect(result.content[0].text).toContain("Latency:");
      expect(result.content[0].text).toContain("Timing:");
    });

    it("should handle empty response", async () => {
      mockClient = createMockClient({ getDailySleep: vi.fn().mockResolvedValue(emptyResponse) });
      registerTools(mockServer as unknown as Parameters<typeof registerTools>[0], mockClient);

      const handler = mockServer.getToolHandler("get_daily_sleep")!;
      const result = await handler({});

      expect(result.content[0].text).toContain("No daily sleep data found");
    });

    it("should handle errors", async () => {
      mockClient = createMockClient({
        getDailySleep: vi.fn().mockRejectedValue(new Error("Daily sleep API error")),
      });
      registerTools(mockServer as unknown as Parameters<typeof registerTools>[0], mockClient);

      const handler = mockServer.getToolHandler("get_daily_sleep")!;
      const result = await handler({});

      expect(result.content[0].text).toContain("Error fetching daily sleep data");
    });
  });

  // ─────────────────────────────────────────────────────────────
  // get_heart_rate tool
  // ─────────────────────────────────────────────────────────────

  describe("get_heart_rate", () => {
    it("should return formatted heart rate data", async () => {
      const handler = mockServer.getToolHandler("get_heart_rate")!;
      const result = await handler({ start_date: "2024-01-15" });

      expect(result.content[0].text).toContain("## Heart Rate Data");
      expect(result.content[0].text).toContain("**Overall Statistics:**");
      expect(result.content[0].text).toContain("Average:");
      expect(result.content[0].text).toContain("Range:");
    });

    it("should group readings by source", async () => {
      const handler = mockServer.getToolHandler("get_heart_rate")!;
      const result = await handler({});

      expect(result.content[0].text).toContain("**Breakdown by Source:**");
      expect(result.content[0].text).toContain("Sleep:");
      expect(result.content[0].text).toContain("Awake:");
      expect(result.content[0].text).toContain("Workout:");
    });

    it("should handle empty response", async () => {
      mockClient = createMockClient({ getHeartRate: vi.fn().mockResolvedValue(emptyResponse) });
      registerTools(mockServer as unknown as Parameters<typeof registerTools>[0], mockClient);

      const handler = mockServer.getToolHandler("get_heart_rate")!;
      const result = await handler({});

      expect(result.content[0].text).toContain("No heart rate data found");
    });

    it("should handle errors", async () => {
      mockClient = createMockClient({
        getHeartRate: vi.fn().mockRejectedValue(new Error("Heart rate API error")),
      });
      registerTools(mockServer as unknown as Parameters<typeof registerTools>[0], mockClient);

      const handler = mockServer.getToolHandler("get_heart_rate")!;
      const result = await handler({});

      expect(result.content[0].text).toContain("Error fetching heart rate data");
    });
  });

  // ─────────────────────────────────────────────────────────────
  // get_workouts tool
  // ─────────────────────────────────────────────────────────────

  describe("get_workouts", () => {
    it("should return formatted workout data", async () => {
      const handler = mockServer.getToolHandler("get_workouts")!;
      const result = await handler({ start_date: "2024-01-15" });

      expect(result.content[0].text).toContain("## Workout: 2024-01-15");
      expect(result.content[0].text).toContain("**Activity:** running");
      expect(result.content[0].text).toContain("**Intensity:** Moderate");
    });

    it("should show calories and distance when available", async () => {
      const handler = mockServer.getToolHandler("get_workouts")!;
      const result = await handler({});

      expect(result.content[0].text).toContain("**Calories:** 350 kcal");
      expect(result.content[0].text).toContain("**Distance:**");
    });

    it("should show workout label when available", async () => {
      const handler = mockServer.getToolHandler("get_workouts")!;
      const result = await handler({});

      expect(result.content[0].text).toContain("Morning Run");
    });

    it("should handle workout without optional fields", async () => {
      mockClient = createMockClient({
        getWorkouts: vi.fn().mockResolvedValue({
          data: [{
            id: "workout-456",
            day: "2024-01-15",
            activity: "walking",
            start_datetime: "2024-01-15T08:00:00+00:00",
            end_datetime: "2024-01-15T08:30:00+00:00",
            intensity: "low",
            calories: null,
            distance: null,
            source: "automatic",
          }],
          next_token: null,
        }),
      });
      registerTools(mockServer as unknown as Parameters<typeof registerTools>[0], mockClient);

      const handler = mockServer.getToolHandler("get_workouts")!;
      const result = await handler({});

      expect(result.content[0].text).toContain("**Activity:** walking");
      expect(result.content[0].text).not.toContain("**Calories:**");
      expect(result.content[0].text).not.toContain("**Distance:**");
    });

    it("should handle empty response", async () => {
      mockClient = createMockClient({ getWorkouts: vi.fn().mockResolvedValue(emptyResponse) });
      registerTools(mockServer as unknown as Parameters<typeof registerTools>[0], mockClient);

      const handler = mockServer.getToolHandler("get_workouts")!;
      const result = await handler({});

      expect(result.content[0].text).toContain("No workout data found");
    });

    it("should handle errors", async () => {
      mockClient = createMockClient({
        getWorkouts: vi.fn().mockRejectedValue(new Error("Workout API error")),
      });
      registerTools(mockServer as unknown as Parameters<typeof registerTools>[0], mockClient);

      const handler = mockServer.getToolHandler("get_workouts")!;
      const result = await handler({});

      expect(result.content[0].text).toContain("Error fetching workout data");
    });
  });

  // ─────────────────────────────────────────────────────────────
  // get_spo2 tool
  // ─────────────────────────────────────────────────────────────

  describe("get_spo2", () => {
    it("should return formatted SpO2 data", async () => {
      const handler = mockServer.getToolHandler("get_spo2")!;
      const result = await handler({ start_date: "2024-01-15" });

      expect(result.content[0].text).toContain("## SpO2: 2024-01-15");
      expect(result.content[0].text).toContain("**Average SpO2:** 97.5%");
    });

    it("should show breathing disturbance index with context", async () => {
      const handler = mockServer.getToolHandler("get_spo2")!;
      const result = await handler({});

      expect(result.content[0].text).toContain("**Breathing Disturbance Index:** 3.2");
      expect(result.content[0].text).toContain("(Normal)");
    });

    it("should show mild disturbance context", async () => {
      mockClient = createMockClient({
        getDailySpo2: vi.fn().mockResolvedValue({
          data: [{ day: "2024-01-15", spo2_percentage: { average: 96.0 }, breathing_disturbance_index: 8.5 }],
          next_token: null,
        }),
      });
      registerTools(mockServer as unknown as Parameters<typeof registerTools>[0], mockClient);

      const handler = mockServer.getToolHandler("get_spo2")!;
      const result = await handler({});

      expect(result.content[0].text).toContain("(Mild disturbance)");
    });

    it("should show moderate disturbance context", async () => {
      mockClient = createMockClient({
        getDailySpo2: vi.fn().mockResolvedValue({
          data: [{ day: "2024-01-15", spo2_percentage: { average: 95.0 }, breathing_disturbance_index: 20.0 }],
          next_token: null,
        }),
      });
      registerTools(mockServer as unknown as Parameters<typeof registerTools>[0], mockClient);

      const handler = mockServer.getToolHandler("get_spo2")!;
      const result = await handler({});

      expect(result.content[0].text).toContain("(Moderate disturbance)");
    });

    it("should show significant disturbance warning", async () => {
      mockClient = createMockClient({
        getDailySpo2: vi.fn().mockResolvedValue({
          data: [{ day: "2024-01-15", spo2_percentage: { average: 94.0 }, breathing_disturbance_index: 35.0 }],
          next_token: null,
        }),
      });
      registerTools(mockServer as unknown as Parameters<typeof registerTools>[0], mockClient);

      const handler = mockServer.getToolHandler("get_spo2")!;
      const result = await handler({});

      expect(result.content[0].text).toContain("(Significant disturbance - consider consulting a doctor)");
    });

    it("should handle null SpO2 values", async () => {
      mockClient = createMockClient({
        getDailySpo2: vi.fn().mockResolvedValue({
          data: [{ day: "2024-01-15", spo2_percentage: null, breathing_disturbance_index: null }],
          next_token: null,
        }),
      });
      registerTools(mockServer as unknown as Parameters<typeof registerTools>[0], mockClient);

      const handler = mockServer.getToolHandler("get_spo2")!;
      const result = await handler({});

      expect(result.content[0].text).toContain("**Average SpO2:** N/A");
      expect(result.content[0].text).toContain("**Breathing Disturbance Index:** N/A");
    });

    it("should handle empty response with Gen 3 note", async () => {
      mockClient = createMockClient({ getDailySpo2: vi.fn().mockResolvedValue(emptyResponse) });
      registerTools(mockServer as unknown as Parameters<typeof registerTools>[0], mockClient);

      const handler = mockServer.getToolHandler("get_spo2")!;
      const result = await handler({});

      expect(result.content[0].text).toContain("No SpO2 data found");
      expect(result.content[0].text).toContain("Gen 3");
    });

    it("should handle errors", async () => {
      mockClient = createMockClient({
        getDailySpo2: vi.fn().mockRejectedValue(new Error("SpO2 API error")),
      });
      registerTools(mockServer as unknown as Parameters<typeof registerTools>[0], mockClient);

      const handler = mockServer.getToolHandler("get_spo2")!;
      const result = await handler({});

      expect(result.content[0].text).toContain("Error fetching SpO2 data");
    });
  });

  // ─────────────────────────────────────────────────────────────
  // get_vo2_max tool
  // ─────────────────────────────────────────────────────────────

  describe("get_vo2_max", () => {
    it("should return formatted VO2 max data", async () => {
      const handler = mockServer.getToolHandler("get_vo2_max")!;
      const result = await handler({ start_date: "2024-01-15" });

      expect(result.content[0].text).toContain("## VO2 Max: 2024-01-15");
      expect(result.content[0].text).toContain("**VO2 Max:** 42.5 ml/kg/min");
    });

    it("should show fitness level classification", async () => {
      const handler = mockServer.getToolHandler("get_vo2_max")!;
      const result = await handler({});

      expect(result.content[0].text).toContain("(Average)");
    });

    it("should show poor fitness level", async () => {
      mockClient = createMockClient({
        getVO2Max: vi.fn().mockResolvedValue({
          data: [{ day: "2024-01-15", vo2_max: 25.0, timestamp: "2024-01-15T12:00:00Z" }],
          next_token: null,
        }),
      });
      registerTools(mockServer as unknown as Parameters<typeof registerTools>[0], mockClient);

      const handler = mockServer.getToolHandler("get_vo2_max")!;
      const result = await handler({});

      expect(result.content[0].text).toContain("(Poor)");
    });

    it("should show below average fitness level", async () => {
      mockClient = createMockClient({
        getVO2Max: vi.fn().mockResolvedValue({
          data: [{ day: "2024-01-15", vo2_max: 35.0, timestamp: "2024-01-15T12:00:00Z" }],
          next_token: null,
        }),
      });
      registerTools(mockServer as unknown as Parameters<typeof registerTools>[0], mockClient);

      const handler = mockServer.getToolHandler("get_vo2_max")!;
      const result = await handler({});

      expect(result.content[0].text).toContain("(Below average)");
    });

    it("should show good fitness level", async () => {
      mockClient = createMockClient({
        getVO2Max: vi.fn().mockResolvedValue({
          data: [{ day: "2024-01-15", vo2_max: 47.0, timestamp: "2024-01-15T12:00:00Z" }],
          next_token: null,
        }),
      });
      registerTools(mockServer as unknown as Parameters<typeof registerTools>[0], mockClient);

      const handler = mockServer.getToolHandler("get_vo2_max")!;
      const result = await handler({});

      expect(result.content[0].text).toContain("(Good)");
    });

    it("should show very good fitness level", async () => {
      mockClient = createMockClient({
        getVO2Max: vi.fn().mockResolvedValue({
          data: [{ day: "2024-01-15", vo2_max: 52.0, timestamp: "2024-01-15T12:00:00Z" }],
          next_token: null,
        }),
      });
      registerTools(mockServer as unknown as Parameters<typeof registerTools>[0], mockClient);

      const handler = mockServer.getToolHandler("get_vo2_max")!;
      const result = await handler({});

      expect(result.content[0].text).toContain("(Very good)");
    });

    it("should show excellent fitness level", async () => {
      mockClient = createMockClient({
        getVO2Max: vi.fn().mockResolvedValue({
          data: [{ day: "2024-01-15", vo2_max: 58.0, timestamp: "2024-01-15T12:00:00Z" }],
          next_token: null,
        }),
      });
      registerTools(mockServer as unknown as Parameters<typeof registerTools>[0], mockClient);

      const handler = mockServer.getToolHandler("get_vo2_max")!;
      const result = await handler({});

      expect(result.content[0].text).toContain("(Excellent)");
    });

    it("should handle null VO2 max value", async () => {
      mockClient = createMockClient({
        getVO2Max: vi.fn().mockResolvedValue({
          data: [{ day: "2024-01-15", vo2_max: null, timestamp: "2024-01-15T12:00:00Z" }],
          next_token: null,
        }),
      });
      registerTools(mockServer as unknown as Parameters<typeof registerTools>[0], mockClient);

      const handler = mockServer.getToolHandler("get_vo2_max")!;
      const result = await handler({});

      expect(result.content[0].text).toContain("**VO2 Max:** N/A");
    });

    it("should handle empty response with activity note", async () => {
      mockClient = createMockClient({ getVO2Max: vi.fn().mockResolvedValue(emptyResponse) });
      registerTools(mockServer as unknown as Parameters<typeof registerTools>[0], mockClient);

      const handler = mockServer.getToolHandler("get_vo2_max")!;
      const result = await handler({});

      expect(result.content[0].text).toContain("No VO2 max data found");
      expect(result.content[0].text).toContain("workout data");
    });

    it("should handle errors", async () => {
      mockClient = createMockClient({
        getVO2Max: vi.fn().mockRejectedValue(new Error("VO2 max API error")),
      });
      registerTools(mockServer as unknown as Parameters<typeof registerTools>[0], mockClient);

      const handler = mockServer.getToolHandler("get_vo2_max")!;
      const result = await handler({});

      expect(result.content[0].text).toContain("Error fetching VO2 max data");
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Date range handling
  // ─────────────────────────────────────────────────────────────

  describe("date range handling", () => {
    it("should use end_date when provided", async () => {
      const handler = mockServer.getToolHandler("get_sleep")!;
      await handler({ start_date: "2024-01-10", end_date: "2024-01-15" });

      expect(mockClient.getSleep).toHaveBeenCalledWith("2024-01-10", "2024-01-15");
    });

    it("should show date range in empty message", async () => {
      mockClient = createMockClient({ getSleep: vi.fn().mockResolvedValue(emptyResponse) });
      registerTools(mockServer as unknown as Parameters<typeof registerTools>[0], mockClient);

      const handler = mockServer.getToolHandler("get_sleep")!;
      const result = await handler({ start_date: "2024-01-10", end_date: "2024-01-15" });

      expect(result.content[0].text).toContain("2024-01-10 to 2024-01-15");
    });
  });
});
