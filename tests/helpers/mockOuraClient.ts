/**
 * Mock OuraClient factory for testing tool handlers
 */
import { vi } from "vitest";
import type { OuraClient, OuraResponse } from "../../src/client.js";

// Import fixture data
import sleepResponse from "../fixtures/oura-sleep-response.json" with { type: "json" };
import readinessResponse from "../fixtures/oura-readiness-response.json" with { type: "json" };
import activityResponse from "../fixtures/oura-activity-response.json" with { type: "json" };
import stressResponse from "../fixtures/oura-stress-response.json" with { type: "json" };
import dailySleepResponse from "../fixtures/oura-daily-sleep-response.json" with { type: "json" };
import heartrateResponse from "../fixtures/oura-heartrate-response.json" with { type: "json" };
import workoutResponse from "../fixtures/oura-workout-response.json" with { type: "json" };
import spo2Response from "../fixtures/oura-spo2-response.json" with { type: "json" };
import vo2maxResponse from "../fixtures/oura-vo2max-response.json" with { type: "json" };
import personalInfoResponse from "../fixtures/oura-personal-info-response.json" with { type: "json" };

export type MockOuraClient = {
  [K in keyof OuraClient]: ReturnType<typeof vi.fn>;
};

/**
 * Creates a mock OuraClient with all methods stubbed
 * By default, returns fixture data for all methods
 */
export function createMockOuraClient(overrides?: Partial<MockOuraClient>): MockOuraClient {
  const mockClient: MockOuraClient = {
    getSleep: vi.fn().mockResolvedValue(sleepResponse),
    getDailySleep: vi.fn().mockResolvedValue(dailySleepResponse),
    getDailyReadiness: vi.fn().mockResolvedValue(readinessResponse),
    getDailyActivity: vi.fn().mockResolvedValue(activityResponse),
    getDailyStress: vi.fn().mockResolvedValue(stressResponse),
    getHeartRate: vi.fn().mockResolvedValue(heartrateResponse),
    getWorkouts: vi.fn().mockResolvedValue(workoutResponse),
    getDailySpo2: vi.fn().mockResolvedValue(spo2Response),
    getVO2Max: vi.fn().mockResolvedValue(vo2maxResponse),
    getPersonalInfo: vi.fn().mockResolvedValue(personalInfoResponse),
  };

  // Apply any overrides
  if (overrides) {
    Object.assign(mockClient, overrides);
  }

  return mockClient;
}

/**
 * Creates an empty response for testing "no data" scenarios
 */
export function emptyResponse<T>(): OuraResponse<T> {
  return { data: [], next_token: null };
}

/**
 * Creates an error-throwing mock for testing error handling
 */
export function createErrorClient(errorMessage: string): MockOuraClient {
  const error = new Error(errorMessage);
  return {
    getSleep: vi.fn().mockRejectedValue(error),
    getDailySleep: vi.fn().mockRejectedValue(error),
    getDailyReadiness: vi.fn().mockRejectedValue(error),
    getDailyActivity: vi.fn().mockRejectedValue(error),
    getDailyStress: vi.fn().mockRejectedValue(error),
    getHeartRate: vi.fn().mockRejectedValue(error),
    getWorkouts: vi.fn().mockRejectedValue(error),
    getDailySpo2: vi.fn().mockRejectedValue(error),
    getVO2Max: vi.fn().mockRejectedValue(error),
    getPersonalInfo: vi.fn().mockRejectedValue(error),
  };
}
