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
import resilienceResponse from "../../tests/fixtures/oura-resilience-response.json" with { type: "json" };
import cardiovascularAgeResponse from "../../tests/fixtures/oura-cardiovascular-age-response.json" with { type: "json" };
import tagsResponse from "../../tests/fixtures/oura-tags-response.json" with { type: "json" };
import sessionsResponse from "../../tests/fixtures/oura-sessions-response.json" with { type: "json" };
import enhancedTagsResponse from "../../tests/fixtures/oura-enhanced-tags-response.json" with { type: "json" };

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
    getDailyResilience: vi.fn().mockResolvedValue(resilienceResponse),
    getDailyCardiovascularAge: vi.fn().mockResolvedValue(cardiovascularAgeResponse),
    getTags: vi.fn().mockResolvedValue(tagsResponse),
    getSessions: vi.fn().mockResolvedValue(sessionsResponse),
    getEnhancedTags: vi.fn().mockResolvedValue(enhancedTagsResponse),
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
    it("should register all 21 tools", () => {
      expect(mockServer.getToolCount()).toBe(21);
    });

    it("should register expected tool names", () => {
      const expectedTools = [
        // Data retrieval tools
        "get_sleep",
        "get_readiness",
        "get_activity",
        "get_stress",
        "get_daily_sleep",
        "get_heart_rate",
        "get_workouts",
        "get_spo2",
        "get_vo2_max",
        "get_resilience",
        "get_cardiovascular_age",
        "get_tags",
        "get_enhanced_tags",
        "get_sessions",
        // Smart analysis tools
        "detect_anomalies",
        "analyze_sleep_quality",
        "correlate_metrics",
        "compare_periods",
        "compare_conditions",
        "best_sleep_conditions",
        "analyze_hrv_trend",
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
      // get_sleep now fetches both endpoints, so mock both as empty
      mockClient = createMockClient({
        getSleep: vi.fn().mockResolvedValue(emptyResponse),
        getDailySleep: vi.fn().mockResolvedValue(emptyResponse),
      });
      registerTools(mockServer as unknown as Parameters<typeof registerTools>[0], mockClient);

      const handler = mockServer.getToolHandler("get_sleep")!;
      const result = await handler({ start_date: "2024-01-15" });

      expect(result.content[0].text).toContain("No sleep data found");
    });

    it("should handle API errors gracefully with fallback to scores", async () => {
      // If sessions fail but scores succeed, we should show scores
      mockClient = createMockClient({
        getSleep: vi.fn().mockRejectedValue(new Error("API connection failed")),
      });
      registerTools(mockServer as unknown as Parameters<typeof registerTools>[0], mockClient);

      const handler = mockServer.getToolHandler("get_sleep")!;
      const result = await handler({ start_date: "2024-01-15" });

      // Should fall back to daily sleep scores
      expect(result.content[0].text).toContain("Daily Sleep Score");
    });

    it("should handle both endpoints failing", async () => {
      mockClient = createMockClient({
        getSleep: vi.fn().mockRejectedValue(new Error("API connection failed")),
        getDailySleep: vi.fn().mockRejectedValue(new Error("API connection failed")),
      });
      registerTools(mockServer as unknown as Parameters<typeof registerTools>[0], mockClient);

      const handler = mockServer.getToolHandler("get_sleep")!;
      const result = await handler({ start_date: "2024-01-15" });

      expect(result.content[0].text).toContain("No sleep data found");
    });

    it("should include score from daily sleep endpoint", async () => {
      const handler = mockServer.getToolHandler("get_sleep")!;
      const result = await handler({ start_date: "2024-01-15" });

      // Score should be included from the daily_sleep endpoint
      expect(result.content[0].text).toContain("**Score:**");
      expect(result.content[0].text).toContain("85");
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

      expect(result.content[0].text).toContain("Network error");
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

      expect(result.content[0].text).toContain("Activity API error");
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

      expect(result.content[0].text).toContain("Stress API error");
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

      expect(result.content[0].text).toContain("Daily sleep API error");
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

      expect(result.content[0].text).toContain("Heart rate API error");
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

      expect(result.content[0].text).toContain("Workout API error");
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

      expect(result.content[0].text).toContain("SpO2 API error");
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

      expect(result.content[0].text).toContain("VO2 max API error");
    });
  });

  // ─────────────────────────────────────────────────────────────
  // get_resilience tool
  // ─────────────────────────────────────────────────────────────

  describe("get_resilience", () => {
    it("should return formatted resilience data", async () => {
      const handler = mockServer.getToolHandler("get_resilience")!;
      const result = await handler({ start_date: "2024-01-15" });

      expect(result.content[0].text).toContain("## Resilience: 2024-01-15");
      expect(result.content[0].text).toContain("**Level:** Solid");
    });

    it("should show all contributors", async () => {
      const handler = mockServer.getToolHandler("get_resilience")!;
      const result = await handler({});

      expect(result.content[0].text).toContain("- Sleep Recovery: 85");
      expect(result.content[0].text).toContain("- Daytime Recovery: 72");
      expect(result.content[0].text).toContain("- Stress: 68");
    });

    it("should handle empty response", async () => {
      mockClient = createMockClient({ getDailyResilience: vi.fn().mockResolvedValue(emptyResponse) });
      registerTools(mockServer as unknown as Parameters<typeof registerTools>[0], mockClient);

      const handler = mockServer.getToolHandler("get_resilience")!;
      const result = await handler({});

      expect(result.content[0].text).toContain("No resilience data found");
    });

    it("should handle errors", async () => {
      mockClient = createMockClient({
        getDailyResilience: vi.fn().mockRejectedValue(new Error("Resilience API error")),
      });
      registerTools(mockServer as unknown as Parameters<typeof registerTools>[0], mockClient);

      const handler = mockServer.getToolHandler("get_resilience")!;
      const result = await handler({});

      expect(result.content[0].text).toContain("Resilience API error");
    });
  });

  // ─────────────────────────────────────────────────────────────
  // get_cardiovascular_age tool
  // ─────────────────────────────────────────────────────────────

  describe("get_cardiovascular_age", () => {
    it("should return formatted cardiovascular age data", async () => {
      const handler = mockServer.getToolHandler("get_cardiovascular_age")!;
      const result = await handler({ start_date: "2024-01-15" });

      expect(result.content[0].text).toContain("## Cardiovascular Age: 2024-01-15");
      expect(result.content[0].text).toContain("**Vascular Age:** 35 years");
    });

    it("should handle null vascular age", async () => {
      mockClient = createMockClient({
        getDailyCardiovascularAge: vi.fn().mockResolvedValue({
          data: [{ day: "2024-01-15", vascular_age: null }],
          next_token: null,
        }),
      });
      registerTools(mockServer as unknown as Parameters<typeof registerTools>[0], mockClient);

      const handler = mockServer.getToolHandler("get_cardiovascular_age")!;
      const result = await handler({});

      expect(result.content[0].text).toContain("**Vascular Age:** N/A");
    });

    it("should handle empty response", async () => {
      mockClient = createMockClient({ getDailyCardiovascularAge: vi.fn().mockResolvedValue(emptyResponse) });
      registerTools(mockServer as unknown as Parameters<typeof registerTools>[0], mockClient);

      const handler = mockServer.getToolHandler("get_cardiovascular_age")!;
      const result = await handler({});

      expect(result.content[0].text).toContain("No cardiovascular age data found");
    });

    it("should handle errors", async () => {
      mockClient = createMockClient({
        getDailyCardiovascularAge: vi.fn().mockRejectedValue(new Error("Cardiovascular age API error")),
      });
      registerTools(mockServer as unknown as Parameters<typeof registerTools>[0], mockClient);

      const handler = mockServer.getToolHandler("get_cardiovascular_age")!;
      const result = await handler({});

      expect(result.content[0].text).toContain("Cardiovascular age API error");
    });
  });

  // ─────────────────────────────────────────────────────────────
  // get_tags tool
  // ─────────────────────────────────────────────────────────────

  describe("get_tags", () => {
    it("should return formatted tag data", async () => {
      const handler = mockServer.getToolHandler("get_tags")!;
      const result = await handler({ start_date: "2024-01-15" });

      expect(result.content[0].text).toContain("## Tag: 2024-01-15");
      expect(result.content[0].text).toContain("**Time:**");
    });

    it("should show tags and notes", async () => {
      const handler = mockServer.getToolHandler("get_tags")!;
      const result = await handler({});

      expect(result.content[0].text).toContain("**Tags:** caffeine, afternoon");
      expect(result.content[0].text).toContain("**Note:** Had coffee after 2pm");
    });

    it("should handle tag without text", async () => {
      mockClient = createMockClient({
        getTags: vi.fn().mockResolvedValue({
          data: [{
            id: "tag-002",
            day: "2024-01-15",
            text: null,
            timestamp: "2024-01-15T10:00:00+00:00",
            tags: ["exercise"],
          }],
          next_token: null,
        }),
      });
      registerTools(mockServer as unknown as Parameters<typeof registerTools>[0], mockClient);

      const handler = mockServer.getToolHandler("get_tags")!;
      const result = await handler({});

      expect(result.content[0].text).toContain("**Tags:** exercise");
      expect(result.content[0].text).not.toContain("**Note:**");
    });

    it("should handle empty response", async () => {
      mockClient = createMockClient({ getTags: vi.fn().mockResolvedValue(emptyResponse) });
      registerTools(mockServer as unknown as Parameters<typeof registerTools>[0], mockClient);

      const handler = mockServer.getToolHandler("get_tags")!;
      const result = await handler({});

      expect(result.content[0].text).toContain("No tags found");
    });

    it("should handle errors", async () => {
      mockClient = createMockClient({
        getTags: vi.fn().mockRejectedValue(new Error("Tags API error")),
      });
      registerTools(mockServer as unknown as Parameters<typeof registerTools>[0], mockClient);

      const handler = mockServer.getToolHandler("get_tags")!;
      const result = await handler({});

      expect(result.content[0].text).toContain("Tags API error");
    });
  });

  // ─────────────────────────────────────────────────────────────
  // get_enhanced_tags tool
  // ─────────────────────────────────────────────────────────────

  describe("get_enhanced_tags", () => {
    it("should return formatted enhanced tag data", async () => {
      const handler = mockServer.getToolHandler("get_enhanced_tags")!;
      const result = await handler({ start_date: "2024-01-15" });

      expect(result.content[0].text).toContain("## Sleep Aid");
      expect(result.content[0].text).toContain("**Date:** 2024-01-15");
    });

    it("should show custom tag names", async () => {
      const handler = mockServer.getToolHandler("get_enhanced_tags")!;
      const result = await handler({});

      expect(result.content[0].text).toContain("## Caffeine");
    });

    it("should format tag type codes as readable names", async () => {
      const handler = mockServer.getToolHandler("get_enhanced_tags")!;
      const result = await handler({});

      // tag_sleep_aid should become "Sleep Aid"
      expect(result.content[0].text).toContain("Sleep Aid");
    });

    it("should handle tag with comment", async () => {
      mockClient = createMockClient({
        getEnhancedTags: vi.fn().mockResolvedValue({
          data: [{
            id: "tag-123",
            tag_type_code: "tag_generic_caffeine",
            start_time: "2024-01-15T10:00:00-07:00",
            end_time: null,
            start_day: "2024-01-15",
            end_day: null,
            comment: "Morning espresso",
            custom_name: null,
          }],
          next_token: null,
        }),
      });
      registerTools(mockServer as unknown as Parameters<typeof registerTools>[0], mockClient);

      const handler = mockServer.getToolHandler("get_enhanced_tags")!;
      const result = await handler({});

      expect(result.content[0].text).toContain("**Note:** Morning espresso");
    });

    it("should show end time when available", async () => {
      mockClient = createMockClient({
        getEnhancedTags: vi.fn().mockResolvedValue({
          data: [{
            id: "tag-123",
            tag_type_code: "tag_generic_nap",
            start_time: "2024-01-15T14:00:00-07:00",
            end_time: "2024-01-15T15:00:00-07:00",
            start_day: "2024-01-15",
            end_day: "2024-01-15",
            comment: null,
            custom_name: null,
          }],
          next_token: null,
        }),
      });
      registerTools(mockServer as unknown as Parameters<typeof registerTools>[0], mockClient);

      const handler = mockServer.getToolHandler("get_enhanced_tags")!;
      const result = await handler({});

      expect(result.content[0].text).toContain("**End:**");
    });

    it("should handle empty response", async () => {
      mockClient = createMockClient({ getEnhancedTags: vi.fn().mockResolvedValue(emptyResponse) });
      registerTools(mockServer as unknown as Parameters<typeof registerTools>[0], mockClient);

      const handler = mockServer.getToolHandler("get_enhanced_tags")!;
      const result = await handler({});

      expect(result.content[0].text).toContain("No enhanced tags found");
    });

    it("should handle errors", async () => {
      mockClient = createMockClient({
        getEnhancedTags: vi.fn().mockRejectedValue(new Error("Enhanced tags API error")),
      });
      registerTools(mockServer as unknown as Parameters<typeof registerTools>[0], mockClient);

      const handler = mockServer.getToolHandler("get_enhanced_tags")!;
      const result = await handler({});

      expect(result.content[0].text).toContain("Enhanced tags API error");
    });
  });

  // ─────────────────────────────────────────────────────────────
  // get_sessions tool
  // ─────────────────────────────────────────────────────────────

  describe("get_sessions", () => {
    it("should return formatted session data", async () => {
      const handler = mockServer.getToolHandler("get_sessions")!;
      const result = await handler({ start_date: "2024-01-15" });

      expect(result.content[0].text).toContain("## Meditation Session: 2024-01-15");
      expect(result.content[0].text).toContain("**Time:**");
    });

    it("should show mood when available", async () => {
      const handler = mockServer.getToolHandler("get_sessions")!;
      const result = await handler({});

      expect(result.content[0].text).toContain("**Mood:** Good");
    });

    it("should show biometrics when available", async () => {
      const handler = mockServer.getToolHandler("get_sessions")!;
      const result = await handler({});

      expect(result.content[0].text).toContain("**Biometrics:**");
      expect(result.content[0].text).toContain("- Avg Heart Rate:");
      expect(result.content[0].text).toContain("- Avg HRV:");
    });

    it("should handle session without biometrics", async () => {
      mockClient = createMockClient({
        getSessions: vi.fn().mockResolvedValue({
          data: [{
            id: "session-002",
            day: "2024-01-15",
            start_datetime: "2024-01-15T12:00:00+00:00",
            end_datetime: "2024-01-15T12:10:00+00:00",
            type: "breathing",
            heart_rate: null,
            heart_rate_variability: null,
            mood: null,
            motion_count: null,
          }],
          next_token: null,
        }),
      });
      registerTools(mockServer as unknown as Parameters<typeof registerTools>[0], mockClient);

      const handler = mockServer.getToolHandler("get_sessions")!;
      const result = await handler({});

      expect(result.content[0].text).toContain("## Breathing Session: 2024-01-15");
      expect(result.content[0].text).not.toContain("**Mood:**");
      expect(result.content[0].text).not.toContain("**Biometrics:**");
    });

    it("should handle empty response", async () => {
      mockClient = createMockClient({ getSessions: vi.fn().mockResolvedValue(emptyResponse) });
      registerTools(mockServer as unknown as Parameters<typeof registerTools>[0], mockClient);

      const handler = mockServer.getToolHandler("get_sessions")!;
      const result = await handler({});

      expect(result.content[0].text).toContain("No sessions found");
    });

    it("should handle errors", async () => {
      mockClient = createMockClient({
        getSessions: vi.fn().mockRejectedValue(new Error("Sessions API error")),
      });
      registerTools(mockServer as unknown as Parameters<typeof registerTools>[0], mockClient);

      const handler = mockServer.getToolHandler("get_sessions")!;
      const result = await handler({});

      expect(result.content[0].text).toContain("Sessions API error");
    });
  });

  // ─────────────────────────────────────────────────────────────
  // detect_anomalies tool
  // ─────────────────────────────────────────────────────────────

  describe("detect_anomalies", () => {
    it("should detect HRV anomalies", async () => {
      // Create data with an obvious outlier
      const sleepDataWithOutlier = {
        data: [
          { day: "2024-01-01", average_hrv: 45, total_sleep_duration: 25200, type: "long_sleep" },
          { day: "2024-01-02", average_hrv: 48, total_sleep_duration: 26100, type: "long_sleep" },
          { day: "2024-01-03", average_hrv: 44, total_sleep_duration: 25500, type: "long_sleep" },
          { day: "2024-01-04", average_hrv: 46, total_sleep_duration: 25800, type: "long_sleep" },
          { day: "2024-01-05", average_hrv: 47, total_sleep_duration: 26400, type: "long_sleep" },
          { day: "2024-01-06", average_hrv: 45, total_sleep_duration: 25200, type: "long_sleep" },
          { day: "2024-01-07", average_hrv: 15, total_sleep_duration: 21600, type: "long_sleep" }, // outlier
          { day: "2024-01-08", average_hrv: 46, total_sleep_duration: 25800, type: "long_sleep" },
          { day: "2024-01-09", average_hrv: 48, total_sleep_duration: 26100, type: "long_sleep" },
          { day: "2024-01-10", average_hrv: 44, total_sleep_duration: 25500, type: "long_sleep" },
        ],
        next_token: null,
      };

      mockClient = createMockClient({
        getSleep: vi.fn().mockResolvedValue(sleepDataWithOutlier),
      });
      registerTools(mockServer as unknown as Parameters<typeof registerTools>[0], mockClient);

      const handler = mockServer.getToolHandler("detect_anomalies")!;
      const result = await handler({ metric: "hrv", days: 30 });

      expect(result.content[0].text).toContain("Anomaly Detection");
      expect(result.content[0].text).toContain("unusual reading");
      expect(result.content[0].text).toContain("HRV");
    });

    it("should handle insufficient data gracefully", async () => {
      // With only 1 data point, detectOutliers returns no anomalies
      mockClient = createMockClient({
        getSleep: vi.fn().mockResolvedValue({
          data: [{ day: "2024-01-01", average_hrv: 45, type: "long_sleep" }],
          next_token: null,
        }),
      });
      registerTools(mockServer as unknown as Parameters<typeof registerTools>[0], mockClient);

      const handler = mockServer.getToolHandler("detect_anomalies")!;
      const result = await handler({ metric: "hrv" });

      // With insufficient data, no anomalies are detected
      expect(result.content[0].text).toContain("Anomaly Detection");
    });

    it("should detect readiness score anomalies", async () => {
      const readinessDataWithOutlier = {
        data: [
          { day: "2024-01-01", score: 85 },
          { day: "2024-01-02", score: 82 },
          { day: "2024-01-03", score: 88 },
          { day: "2024-01-04", score: 84 },
          { day: "2024-01-05", score: 86 },
          { day: "2024-01-06", score: 45 }, // outlier
          { day: "2024-01-07", score: 83 },
          { day: "2024-01-08", score: 85 },
          { day: "2024-01-09", score: 87 },
          { day: "2024-01-10", score: 84 },
        ],
        next_token: null,
      };

      mockClient = createMockClient({
        getDailyReadiness: vi.fn().mockResolvedValue(readinessDataWithOutlier),
      });
      registerTools(mockServer as unknown as Parameters<typeof registerTools>[0], mockClient);

      const handler = mockServer.getToolHandler("detect_anomalies")!;
      const result = await handler({ metric: "readiness" });

      expect(result.content[0].text).toContain("Anomaly Detection");
      expect(result.content[0].text).toContain("Readiness");
    });

    it("should handle API errors gracefully", async () => {
      mockClient = createMockClient({
        getSleep: vi.fn().mockRejectedValue(new Error("API error")),
      });
      registerTools(mockServer as unknown as Parameters<typeof registerTools>[0], mockClient);

      const handler = mockServer.getToolHandler("detect_anomalies")!;
      const result = await handler({ metric: "hrv" });

      // When API fails, it returns "no anomalies" since there's no data
      expect(result.content[0].text).toContain("Anomaly Detection");
    });
  });

  // ─────────────────────────────────────────────────────────────
  // analyze_sleep_quality tool
  // ─────────────────────────────────────────────────────────────

  describe("analyze_sleep_quality", () => {
    it("should analyze sleep quality with sufficient data", async () => {
      const sleepData = {
        data: Array.from({ length: 14 }, (_, i) => ({
          day: `2024-01-${String(i + 1).padStart(2, "0")}`,
          total_sleep_duration: 25200 + (i % 3) * 1800, // 7h to 8h
          efficiency: 85 + (i % 5),
          average_hrv: 40 + (i % 10),
          deep_sleep_duration: 5400 + (i % 3) * 600,
          rem_sleep_duration: 6000 + (i % 3) * 600,
          bedtime_start: `2024-01-${String(i + 1).padStart(2, "0")}T22:30:00+00:00`,
          bedtime_end: `2024-01-${String(i + 2).padStart(2, "0")}T06:30:00+00:00`,
          type: "long_sleep" as const,
        })),
        next_token: null,
      };

      mockClient = createMockClient({
        getSleep: vi.fn().mockResolvedValue(sleepData),
      });
      registerTools(mockServer as unknown as Parameters<typeof registerTools>[0], mockClient);

      const handler = mockServer.getToolHandler("analyze_sleep_quality")!;
      const result = await handler({ days: 14 });

      expect(result.content[0].text).toContain("Sleep Quality Analysis");
      expect(result.content[0].text).toContain("Overview");
      expect(result.content[0].text).toContain("sleep debt");
    });

    it("should handle insufficient data", async () => {
      mockClient = createMockClient({
        getSleep: vi.fn().mockResolvedValue({
          data: [{ day: "2024-01-01", total_sleep_duration: 25200, type: "long_sleep" }],
          next_token: null,
        }),
      });
      registerTools(mockServer as unknown as Parameters<typeof registerTools>[0], mockClient);

      const handler = mockServer.getToolHandler("analyze_sleep_quality")!;
      const result = await handler({});

      expect(result.content[0].text).toContain("Need at least");
      expect(result.content[0].text).toContain("nights");
    });

    it("should handle errors gracefully", async () => {
      mockClient = createMockClient({
        getSleep: vi.fn().mockRejectedValue(new Error("Sleep API error")),
      });
      registerTools(mockServer as unknown as Parameters<typeof registerTools>[0], mockClient);

      const handler = mockServer.getToolHandler("analyze_sleep_quality")!;
      const result = await handler({});

      // When API fails, it returns insufficient data message (0 nights found)
      expect(result.content[0].text).toContain("Need at least");
    });
  });

  // ─────────────────────────────────────────────────────────────
  // correlate_metrics tool
  // ─────────────────────────────────────────────────────────────

  describe("correlate_metrics", () => {
    it("should correlate HRV with sleep duration", async () => {
      const sleepData = {
        data: Array.from({ length: 10 }, (_, i) => ({
          day: `2024-01-${String(i + 1).padStart(2, "0")}`,
          total_sleep_duration: 25200 + i * 1800, // increasing sleep
          average_hrv: 40 + i * 2, // increasing HRV
          type: "long_sleep" as const,
        })),
        next_token: null,
      };

      mockClient = createMockClient({
        getSleep: vi.fn().mockResolvedValue(sleepData),
      });
      registerTools(mockServer as unknown as Parameters<typeof registerTools>[0], mockClient);

      const handler = mockServer.getToolHandler("correlate_metrics")!;
      const result = await handler({ metric1: "hrv", metric2: "sleep_duration" });

      expect(result.content[0].text).toContain("Correlation Analysis");
      expect(result.content[0].text).toContain("HRV");
      expect(result.content[0].text).toContain("Sleep Duration");
    });

    it("should correlate readiness with steps", async () => {
      const readinessData = {
        data: Array.from({ length: 10 }, (_, i) => ({
          day: `2024-01-${String(i + 1).padStart(2, "0")}`,
          score: 80 + i,
        })),
        next_token: null,
      };
      const activityData = {
        data: Array.from({ length: 10 }, (_, i) => ({
          day: `2024-01-${String(i + 1).padStart(2, "0")}`,
          steps: 8000 + i * 500,
        })),
        next_token: null,
      };

      mockClient = createMockClient({
        getDailyReadiness: vi.fn().mockResolvedValue(readinessData),
        getDailyActivity: vi.fn().mockResolvedValue(activityData),
      });
      registerTools(mockServer as unknown as Parameters<typeof registerTools>[0], mockClient);

      const handler = mockServer.getToolHandler("correlate_metrics")!;
      const result = await handler({ metric1: "readiness", metric2: "steps" });

      expect(result.content[0].text).toContain("Correlation Analysis");
    });

    it("should handle insufficient data", async () => {
      mockClient = createMockClient({
        getSleep: vi.fn().mockResolvedValue({
          data: [{ day: "2024-01-01", average_hrv: 45, total_sleep_duration: 25200, type: "long_sleep" }],
          next_token: null,
        }),
      });
      registerTools(mockServer as unknown as Parameters<typeof registerTools>[0], mockClient);

      const handler = mockServer.getToolHandler("correlate_metrics")!;
      const result = await handler({ metric1: "hrv", metric2: "sleep_duration" });

      expect(result.content[0].text).toContain("Need at least");
      expect(result.content[0].text).toContain("days");
    });

    it("should handle errors gracefully", async () => {
      mockClient = createMockClient({
        getSleep: vi.fn().mockRejectedValue(new Error("Correlation API error")),
      });
      registerTools(mockServer as unknown as Parameters<typeof registerTools>[0], mockClient);

      const handler = mockServer.getToolHandler("correlate_metrics")!;
      const result = await handler({ metric1: "hrv", metric2: "sleep_duration" });

      // When API fails, it returns insufficient data message (0 days found)
      expect(result.content[0].text).toContain("Need at least");
    });
  });

  // ─────────────────────────────────────────────────────────────
  // compare_periods tool
  // ─────────────────────────────────────────────────────────────

  describe("compare_periods", () => {
    it("should compare sleep duration between two periods", async () => {
      const period1Data = {
        data: Array.from({ length: 7 }, (_, i) => ({
          day: `2024-01-${String(i + 1).padStart(2, "0")}`,
          total_sleep_duration: 25200 + i * 600, // 7h base + increasing
          average_hrv: 45 + i,
          type: "long_sleep" as const,
        })),
        next_token: null,
      };
      const period2Data = {
        data: Array.from({ length: 7 }, (_, i) => ({
          day: `2024-01-${String(i + 8).padStart(2, "0")}`,
          total_sleep_duration: 21600 + i * 600, // 6h base + increasing
          average_hrv: 40 + i,
          type: "long_sleep" as const,
        })),
        next_token: null,
      };

      mockClient = createMockClient({
        getSleep: vi.fn()
          .mockResolvedValueOnce(period1Data)
          .mockResolvedValueOnce(period2Data),
        getDailySleep: vi.fn()
          .mockResolvedValueOnce({ data: [], next_token: null })
          .mockResolvedValueOnce({ data: [], next_token: null }),
      });
      registerTools(mockServer as unknown as Parameters<typeof registerTools>[0], mockClient);

      const handler = mockServer.getToolHandler("compare_periods")!;
      const result = await handler({
        period1_start: "2024-01-01",
        period1_end: "2024-01-07",
        period2_start: "2024-01-08",
        period2_end: "2024-01-14",
      });

      expect(result.content[0].text).toContain("Period Comparison");
      expect(result.content[0].text).toContain("Period 1");
      expect(result.content[0].text).toContain("Period 2");
      expect(result.content[0].text).toContain("Sleep Duration");
    });

    it("should show percentage changes", async () => {
      const period1Data = {
        data: [{ day: "2024-01-01", total_sleep_duration: 28800, average_hrv: 50, type: "long_sleep" as const }],
        next_token: null,
      };
      const period2Data = {
        data: [{ day: "2024-01-08", total_sleep_duration: 25200, average_hrv: 45, type: "long_sleep" as const }],
        next_token: null,
      };

      mockClient = createMockClient({
        getSleep: vi.fn()
          .mockResolvedValueOnce(period1Data)
          .mockResolvedValueOnce(period2Data),
        getDailySleep: vi.fn().mockResolvedValue({ data: [], next_token: null }),
      });
      registerTools(mockServer as unknown as Parameters<typeof registerTools>[0], mockClient);

      const handler = mockServer.getToolHandler("compare_periods")!;
      const result = await handler({
        period1_start: "2024-01-01",
        period1_end: "2024-01-01",
        period2_start: "2024-01-08",
        period2_end: "2024-01-08",
      });

      expect(result.content[0].text).toContain("%");
    });

    it("should handle empty periods", async () => {
      mockClient = createMockClient({
        getSleep: vi.fn().mockResolvedValue({ data: [], next_token: null }),
        getDailySleep: vi.fn().mockResolvedValue({ data: [], next_token: null }),
        getDailyReadiness: vi.fn().mockResolvedValue({ data: [], next_token: null }),
        getDailyActivity: vi.fn().mockResolvedValue({ data: [], next_token: null }),
      });
      registerTools(mockServer as unknown as Parameters<typeof registerTools>[0], mockClient);

      const handler = mockServer.getToolHandler("compare_periods")!;
      const result = await handler({
        period1_start: "2024-01-01",
        period1_end: "2024-01-07",
        period2_start: "2024-01-08",
        period2_end: "2024-01-14",
      });

      expect(result.content[0].text).toContain("No data available");
    });

    it("should handle errors gracefully", async () => {
      mockClient = createMockClient({
        getSleep: vi.fn().mockRejectedValue(new Error("API error")),
      });
      registerTools(mockServer as unknown as Parameters<typeof registerTools>[0], mockClient);

      const handler = mockServer.getToolHandler("compare_periods")!;
      const result = await handler({
        period1_start: "2024-01-01",
        period1_end: "2024-01-07",
        period2_start: "2024-01-08",
        period2_end: "2024-01-14",
      });

      expect(result.content[0].text).toContain("API error");
    });
  });

  // ─────────────────────────────────────────────────────────────
  // compare_conditions tool
  // ─────────────────────────────────────────────────────────────

  describe("compare_conditions", () => {
    it("should compare sleep with and without a tag", async () => {
      const tagsData = {
        data: [
          { id: "1", tag_type_code: "tag_generic_alcohol", custom_name: null, start_day: "2024-01-01", start_time: "2024-01-01T20:00:00Z" },
          { id: "2", tag_type_code: "tag_generic_alcohol", custom_name: null, start_day: "2024-01-03", start_time: "2024-01-03T20:00:00Z" },
        ],
        next_token: null,
      };
      const sleepData = {
        data: [
          { day: "2024-01-01", total_sleep_duration: 21600, type: "long_sleep" }, // 6h with alcohol
          { day: "2024-01-02", total_sleep_duration: 28800, type: "long_sleep" }, // 8h no alcohol
          { day: "2024-01-03", total_sleep_duration: 23400, type: "long_sleep" }, // 6.5h with alcohol
          { day: "2024-01-04", total_sleep_duration: 27000, type: "long_sleep" }, // 7.5h no alcohol
        ],
        next_token: null,
      };

      mockClient = createMockClient({
        getEnhancedTags: vi.fn().mockResolvedValue(tagsData),
        getSleep: vi.fn().mockResolvedValue(sleepData),
        getDailySleep: vi.fn().mockResolvedValue({ data: [], next_token: null }),
      });
      registerTools(mockServer as unknown as Parameters<typeof registerTools>[0], mockClient);

      const handler = mockServer.getToolHandler("compare_conditions")!;
      const result = await handler({ tag: "alcohol", metric: "sleep_duration", days: 30 });

      expect(result.content[0].text).toContain("Condition Comparison");
      expect(result.content[0].text).toContain("alcohol");
      expect(result.content[0].text).toContain("With");
      expect(result.content[0].text).toContain("Without");
    });

    it("should show impact interpretation", async () => {
      const tagsData = {
        data: [
          { id: "1", tag_type_code: "tag_generic_caffeine", custom_name: null, start_day: "2024-01-01", start_time: "2024-01-01T14:00:00Z" },
          { id: "2", tag_type_code: "tag_generic_caffeine", custom_name: null, start_day: "2024-01-02", start_time: "2024-01-02T14:00:00Z" },
        ],
        next_token: null,
      };
      const sleepData = {
        data: [
          { day: "2024-01-01", total_sleep_duration: 21600, type: "long_sleep" },
          { day: "2024-01-02", total_sleep_duration: 21600, type: "long_sleep" },
          { day: "2024-01-03", total_sleep_duration: 28800, type: "long_sleep" },
          { day: "2024-01-04", total_sleep_duration: 28800, type: "long_sleep" },
        ],
        next_token: null,
      };

      mockClient = createMockClient({
        getEnhancedTags: vi.fn().mockResolvedValue(tagsData),
        getSleep: vi.fn().mockResolvedValue(sleepData),
      });
      registerTools(mockServer as unknown as Parameters<typeof registerTools>[0], mockClient);

      const handler = mockServer.getToolHandler("compare_conditions")!;
      const result = await handler({ tag: "caffeine", metric: "sleep_duration" });

      expect(result.content[0].text).toContain("impact");
    });

    it("should handle no matching tags", async () => {
      mockClient = createMockClient({
        getEnhancedTags: vi.fn().mockResolvedValue({
          data: [{ id: "1", tag_type_code: "tag_other", custom_name: null, start_day: "2024-01-01" }],
          next_token: null,
        }),
      });
      registerTools(mockServer as unknown as Parameters<typeof registerTools>[0], mockClient);

      const handler = mockServer.getToolHandler("compare_conditions")!;
      const result = await handler({ tag: "alcohol", metric: "sleep_duration" });

      expect(result.content[0].text).toContain("No \"alcohol\" tags found");
    });

    it("should handle no tags at all", async () => {
      mockClient = createMockClient({
        getEnhancedTags: vi.fn().mockResolvedValue({ data: [], next_token: null }),
      });
      registerTools(mockServer as unknown as Parameters<typeof registerTools>[0], mockClient);

      const handler = mockServer.getToolHandler("compare_conditions")!;
      const result = await handler({ tag: "alcohol", metric: "sleep_duration" });

      expect(result.content[0].text).toContain("No tags found");
    });
  });

  // ─────────────────────────────────────────────────────────────
  // best_sleep_conditions tool
  // ─────────────────────────────────────────────────────────────

  describe("best_sleep_conditions", () => {
    it("should analyze conditions for good vs poor sleep", async () => {
      const sleepData = {
        data: Array.from({ length: 15 }, (_, i) => ({
          day: `2024-01-${String(i + 1).padStart(2, "0")}`,
          total_sleep_duration: 25200,
          type: "long_sleep" as const,
        })),
        next_token: null,
      };
      const scoresData = {
        data: Array.from({ length: 15 }, (_, i) => ({
          day: `2024-01-${String(i + 1).padStart(2, "0")}`,
          score: i < 4 ? 90 : i > 11 ? 60 : 75, // first 4 good, last 3 poor
        })),
        next_token: null,
      };
      const activityData = {
        data: Array.from({ length: 15 }, (_, i) => ({
          day: `2024-01-${String(i + 1).padStart(2, "0")}`,
          steps: i < 4 ? 10000 : 5000,
          active_calories: i < 4 ? 500 : 200,
        })),
        next_token: null,
      };

      mockClient = createMockClient({
        getSleep: vi.fn().mockResolvedValue(sleepData),
        getDailySleep: vi.fn().mockResolvedValue(scoresData),
        getDailyActivity: vi.fn().mockResolvedValue(activityData),
        getEnhancedTags: vi.fn().mockResolvedValue({ data: [], next_token: null }),
      });
      registerTools(mockServer as unknown as Parameters<typeof registerTools>[0], mockClient);

      const handler = mockServer.getToolHandler("best_sleep_conditions")!;
      const result = await handler({ days: 30 });

      expect(result.content[0].text).toContain("Best Sleep Conditions");
      expect(result.content[0].text).toContain("Activity Patterns");
      expect(result.content[0].text).toContain("Good Nights");
      expect(result.content[0].text).toContain("Poor Nights");
    });

    it("should show day of week patterns", async () => {
      const sleepData = {
        data: Array.from({ length: 14 }, (_, i) => ({
          day: `2024-01-${String(i + 1).padStart(2, "0")}`,
          total_sleep_duration: 25200,
          type: "long_sleep" as const,
        })),
        next_token: null,
      };
      const scoresData = {
        data: Array.from({ length: 14 }, (_, i) => ({
          day: `2024-01-${String(i + 1).padStart(2, "0")}`,
          score: 70 + (i % 7) * 5, // varies by day of week
        })),
        next_token: null,
      };

      mockClient = createMockClient({
        getSleep: vi.fn().mockResolvedValue(sleepData),
        getDailySleep: vi.fn().mockResolvedValue(scoresData),
        getDailyActivity: vi.fn().mockResolvedValue({ data: [], next_token: null }),
        getEnhancedTags: vi.fn().mockResolvedValue({ data: [], next_token: null }),
      });
      registerTools(mockServer as unknown as Parameters<typeof registerTools>[0], mockClient);

      const handler = mockServer.getToolHandler("best_sleep_conditions")!;
      const result = await handler({});

      expect(result.content[0].text).toContain("Day of Week");
    });

    it("should handle insufficient data", async () => {
      mockClient = createMockClient({
        getSleep: vi.fn().mockResolvedValue({
          data: Array.from({ length: 5 }, (_, i) => ({
            day: `2024-01-${String(i + 1).padStart(2, "0")}`,
            total_sleep_duration: 25200,
            type: "long_sleep",
          })),
          next_token: null,
        }),
      });
      registerTools(mockServer as unknown as Parameters<typeof registerTools>[0], mockClient);

      const handler = mockServer.getToolHandler("best_sleep_conditions")!;
      const result = await handler({});

      expect(result.content[0].text).toContain("Need at least 10 nights");
    });

    it("should show tag impact with good and poor sleep indicators", async () => {
      const sleepData = {
        data: Array.from({ length: 20 }, (_, i) => ({
          day: `2024-01-${String(i + 1).padStart(2, "0")}`,
          total_sleep_duration: 25200,
          type: "long_sleep" as const,
        })),
        next_token: null,
      };
      // Sleep scores: first 5 good (90), days 6-10 poor (55), rest mixed
      const scoresData = {
        data: Array.from({ length: 20 }, (_, i) => ({
          day: `2024-01-${String(i + 1).padStart(2, "0")}`,
          score: i < 5 ? 90 : i < 10 ? 55 : 75,
        })),
        next_token: null,
      };
      // Tags: "meditation" on good days, "alcohol" on poor days
      const tagsData = {
        data: [
          // Meditation on good sleep days (3 uses, 100% good rate)
          { id: "1", tag_type_code: "meditation", start_day: "2024-01-01" },
          { id: "2", tag_type_code: "meditation", start_day: "2024-01-02" },
          { id: "3", tag_type_code: "meditation", start_day: "2024-01-03" },
          // Alcohol on poor sleep days (3 uses, 0% good rate)
          { id: "4", tag_type_code: "alcohol", start_day: "2024-01-06" },
          { id: "5", tag_type_code: "alcohol", start_day: "2024-01-07" },
          { id: "6", tag_type_code: "alcohol", start_day: "2024-01-08" },
        ],
        next_token: null,
      };

      mockClient = createMockClient({
        getSleep: vi.fn().mockResolvedValue(sleepData),
        getDailySleep: vi.fn().mockResolvedValue(scoresData),
        getDailyActivity: vi.fn().mockResolvedValue({ data: [], next_token: null }),
        getEnhancedTags: vi.fn().mockResolvedValue(tagsData),
      });
      registerTools(mockServer as unknown as Parameters<typeof registerTools>[0], mockClient);

      const handler = mockServer.getToolHandler("best_sleep_conditions")!;
      const result = await handler({ days: 30 });

      expect(result.content[0].text).toContain("Tag Impact");
      expect(result.content[0].text).toContain("meditation");
      expect(result.content[0].text).toContain("alcohol");
      expect(result.content[0].text).toContain("associated with good sleep");
      expect(result.content[0].text).toContain("associated with poor sleep");
    });

  });

  // ─────────────────────────────────────────────────────────────
  // analyze_hrv_trend tool
  // ─────────────────────────────────────────────────────────────

  describe("analyze_hrv_trend", () => {
    it("should analyze HRV trend with sufficient data", async () => {
      const sleepData = {
        data: Array.from({ length: 14 }, (_, i) => ({
          day: `2024-01-${String(i + 1).padStart(2, "0")}`,
          average_hrv: 40 + i, // increasing trend
          total_sleep_duration: 25200,
          type: "long_sleep" as const,
        })),
        next_token: null,
      };

      mockClient = createMockClient({
        getSleep: vi.fn().mockResolvedValue(sleepData),
      });
      registerTools(mockServer as unknown as Parameters<typeof registerTools>[0], mockClient);

      const handler = mockServer.getToolHandler("analyze_hrv_trend")!;
      const result = await handler({ days: 30 });

      expect(result.content[0].text).toContain("HRV Trend Analysis");
      expect(result.content[0].text).toContain("Overview");
      expect(result.content[0].text).toContain("Average:");
      expect(result.content[0].text).toContain("Trend");
    });

    it("should show rolling averages", async () => {
      const sleepData = {
        data: Array.from({ length: 14 }, (_, i) => ({
          day: `2024-01-${String(i + 1).padStart(2, "0")}`,
          average_hrv: 45 + (i % 5),
          type: "long_sleep" as const,
        })),
        next_token: null,
      };

      mockClient = createMockClient({
        getSleep: vi.fn().mockResolvedValue(sleepData),
      });
      registerTools(mockServer as unknown as Parameters<typeof registerTools>[0], mockClient);

      const handler = mockServer.getToolHandler("analyze_hrv_trend")!;
      const result = await handler({});

      expect(result.content[0].text).toContain("Rolling Averages");
      expect(result.content[0].text).toContain("Last 7 days:");
    });

    it("should show weekly patterns", async () => {
      const sleepData = {
        data: Array.from({ length: 14 }, (_, i) => ({
          day: `2024-01-${String(i + 1).padStart(2, "0")}`,
          average_hrv: 40 + (i % 7) * 3, // varies by day of week
          type: "long_sleep" as const,
        })),
        next_token: null,
      };

      mockClient = createMockClient({
        getSleep: vi.fn().mockResolvedValue(sleepData),
      });
      registerTools(mockServer as unknown as Parameters<typeof registerTools>[0], mockClient);

      const handler = mockServer.getToolHandler("analyze_hrv_trend")!;
      const result = await handler({});

      expect(result.content[0].text).toContain("Weekly Pattern");
      expect(result.content[0].text).toContain("Best HRV:");
      expect(result.content[0].text).toContain("Lowest HRV:");
    });

    it("should handle insufficient data", async () => {
      mockClient = createMockClient({
        getSleep: vi.fn().mockResolvedValue({
          data: [
            { day: "2024-01-01", average_hrv: 45, type: "long_sleep" },
            { day: "2024-01-02", average_hrv: 47, type: "long_sleep" },
          ],
          next_token: null,
        }),
      });
      registerTools(mockServer as unknown as Parameters<typeof registerTools>[0], mockClient);

      const handler = mockServer.getToolHandler("analyze_hrv_trend")!;
      const result = await handler({});

      expect(result.content[0].text).toContain("Need at least 5 nights");
    });

    it("should handle errors gracefully", async () => {
      mockClient = createMockClient({
        getSleep: vi.fn().mockRejectedValue(new Error("HRV API error")),
      });
      registerTools(mockServer as unknown as Parameters<typeof registerTools>[0], mockClient);

      const handler = mockServer.getToolHandler("analyze_hrv_trend")!;
      const result = await handler({});

      expect(result.content[0].text).toContain("HRV API error");
    });

    it("should show unusual nights when outliers detected", async () => {
      // Create data with clear outliers (one very low, one very high)
      const sleepData = {
        data: [
          { day: "2024-01-01", average_hrv: 45, type: "long_sleep" as const },
          { day: "2024-01-02", average_hrv: 46, type: "long_sleep" as const },
          { day: "2024-01-03", average_hrv: 44, type: "long_sleep" as const },
          { day: "2024-01-04", average_hrv: 47, type: "long_sleep" as const },
          { day: "2024-01-05", average_hrv: 45, type: "long_sleep" as const },
          { day: "2024-01-06", average_hrv: 46, type: "long_sleep" as const },
          { day: "2024-01-07", average_hrv: 15, type: "long_sleep" as const }, // Very low outlier
          { day: "2024-01-08", average_hrv: 44, type: "long_sleep" as const },
          { day: "2024-01-09", average_hrv: 45, type: "long_sleep" as const },
          { day: "2024-01-10", average_hrv: 90, type: "long_sleep" as const }, // Very high outlier
        ],
        next_token: null,
      };

      mockClient = createMockClient({
        getSleep: vi.fn().mockResolvedValue(sleepData),
      });
      registerTools(mockServer as unknown as Parameters<typeof registerTools>[0], mockClient);

      const handler = mockServer.getToolHandler("analyze_hrv_trend")!;
      const result = await handler({});

      expect(result.content[0].text).toContain("Unusual Nights");
      expect(result.content[0].text).toMatch(/unusually (low|high)/);
    });

    it("should show 30-day rolling average with sufficient data", async () => {
      // Create 35 days of data spanning Jan and Feb
      const sleepData = {
        data: [
          ...Array.from({ length: 31 }, (_, i) => ({
            day: `2024-01-${String(i + 1).padStart(2, "0")}`,
            average_hrv: 45 + (i % 5),
            type: "long_sleep" as const,
          })),
          ...Array.from({ length: 4 }, (_, i) => ({
            day: `2024-02-${String(i + 1).padStart(2, "0")}`,
            average_hrv: 45 + (i % 5),
            type: "long_sleep" as const,
          })),
        ],
        next_token: null,
      };

      mockClient = createMockClient({
        getSleep: vi.fn().mockResolvedValue(sleepData),
      });
      registerTools(mockServer as unknown as Parameters<typeof registerTools>[0], mockClient);

      const handler = mockServer.getToolHandler("analyze_hrv_trend")!;
      const result = await handler({ days: 60 });

      expect(result.content[0].text).toContain("Last 30 days:");
    });

    it("should warn when recent HRV is below baseline", async () => {
      // Create data where recent values are significantly lower
      const sleepData = {
        data: [
          // First 14 days with higher HRV (establishing baseline)
          ...Array.from({ length: 14 }, (_, i) => ({
            day: `2024-01-${String(i + 1).padStart(2, "0")}`,
            average_hrv: 55,
            type: "long_sleep" as const,
          })),
          // Last 7 days with much lower HRV
          ...Array.from({ length: 7 }, (_, i) => ({
            day: `2024-01-${String(i + 15).padStart(2, "0")}`,
            average_hrv: 40,
            type: "long_sleep" as const,
          })),
        ],
        next_token: null,
      };

      mockClient = createMockClient({
        getSleep: vi.fn().mockResolvedValue(sleepData),
      });
      registerTools(mockServer as unknown as Parameters<typeof registerTools>[0], mockClient);

      const handler = mockServer.getToolHandler("analyze_hrv_trend")!;
      const result = await handler({});

      expect(result.content[0].text).toContain("below baseline");
      expect(result.content[0].text).toContain("may need more recovery");
    });
  });

  // ─────────────────────────────────────────────────────────────
  // get_heart_rate edge cases
  // ─────────────────────────────────────────────────────────────

  describe("date range handling", () => {
    it("should use end_date when provided", async () => {
      const handler = mockServer.getToolHandler("get_sleep")!;
      await handler({ start_date: "2024-01-10", end_date: "2024-01-15" });

      expect(mockClient.getSleep).toHaveBeenCalledWith("2024-01-10", "2024-01-15");
    });

    it("should show date range in empty message", async () => {
      // get_sleep now fetches both endpoints, so mock both as empty
      mockClient = createMockClient({
        getSleep: vi.fn().mockResolvedValue(emptyResponse),
        getDailySleep: vi.fn().mockResolvedValue(emptyResponse),
      });
      registerTools(mockServer as unknown as Parameters<typeof registerTools>[0], mockClient);

      const handler = mockServer.getToolHandler("get_sleep")!;
      const result = await handler({ start_date: "2024-01-10", end_date: "2024-01-15" });

      expect(result.content[0].text).toContain("2024-01-10 to 2024-01-15");
    });
  });
});
