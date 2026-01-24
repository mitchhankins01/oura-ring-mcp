/**
 * Thin wrapper around the Oura API v2
 * https://cloud.ouraring.com/v2/docs
 */

import type { components } from "./types/oura-api.js";

const BASE_URL = "https://api.ouraring.com/v2/usercollection";

// Re-export commonly used types for convenience
export type SleepSession = components["schemas"]["SleepModel"];
export type DailySleep = components["schemas"]["DailySleepModel"];
export type DailyReadiness = components["schemas"]["DailyReadinessModel"];
export type DailyActivity = components["schemas"]["DailyActivityModel"];
export type DailyStress = components["schemas"]["DailyStressModel"];
export type HeartRate = components["schemas"]["HeartRateModel"];
export type Workout = components["schemas"]["PublicWorkout"];
export type DailySpo2 = components["schemas"]["DailySpO2Model"];
export type VO2Max = components["schemas"]["VO2MaxModel"];
export type PersonalInfo = components["schemas"]["PersonalInfoResponse"];

export interface OuraClientConfig {
  accessToken: string;
}

// Generic response wrapper from Oura API
export interface OuraResponse<T> {
  data: T[];
  next_token?: string | null;
}

export class OuraClient {
  private accessToken: string;

  constructor(config: OuraClientConfig) {
    this.accessToken = config.accessToken;
  }

  private async fetch<T>(
    endpoint: string,
    params?: Record<string, string>
  ): Promise<T> {
    const url = new URL(`${BASE_URL}/${endpoint}`);

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.append(key, value);
      });
    }

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Oura API error (${response.status}): ${error}`);
    }

    return response.json() as Promise<T>;
  }

  // ─────────────────────────────────────────────────────────────
  // Sleep endpoints
  // ─────────────────────────────────────────────────────────────

  async getDailySleep(startDate: string, endDate: string) {
    return this.fetch<OuraResponse<DailySleep>>("daily_sleep", {
      start_date: startDate,
      end_date: endDate,
    });
  }

  async getSleep(startDate: string, endDate: string) {
    return this.fetch<OuraResponse<SleepSession>>("sleep", {
      start_date: startDate,
      end_date: endDate,
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Readiness endpoints
  // ─────────────────────────────────────────────────────────────

  async getDailyReadiness(startDate: string, endDate: string) {
    return this.fetch<OuraResponse<DailyReadiness>>("daily_readiness", {
      start_date: startDate,
      end_date: endDate,
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Activity endpoints
  // ─────────────────────────────────────────────────────────────

  async getDailyActivity(startDate: string, endDate: string) {
    return this.fetch<OuraResponse<DailyActivity>>("daily_activity", {
      start_date: startDate,
      end_date: endDate,
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Stress endpoints
  // ─────────────────────────────────────────────────────────────

  async getDailyStress(startDate: string, endDate: string) {
    return this.fetch<OuraResponse<DailyStress>>("daily_stress", {
      start_date: startDate,
      end_date: endDate,
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Heart rate endpoints
  // ─────────────────────────────────────────────────────────────

  async getHeartRate(startDate: string, endDate: string) {
    return this.fetch<OuraResponse<HeartRate>>("heartrate", {
      start_date: startDate,
      end_date: endDate,
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Workout endpoints
  // ─────────────────────────────────────────────────────────────

  async getWorkouts(startDate: string, endDate: string) {
    return this.fetch<OuraResponse<Workout>>("workout", {
      start_date: startDate,
      end_date: endDate,
    });
  }

  // ─────────────────────────────────────────────────────────────
  // SpO2 endpoints
  // ─────────────────────────────────────────────────────────────

  async getDailySpo2(startDate: string, endDate: string) {
    return this.fetch<OuraResponse<DailySpo2>>("daily_spo2", {
      start_date: startDate,
      end_date: endDate,
    });
  }

  // ─────────────────────────────────────────────────────────────
  // VO2 Max endpoints
  // ─────────────────────────────────────────────────────────────

  async getVO2Max(startDate: string, endDate: string) {
    return this.fetch<OuraResponse<VO2Max>>("vO2_max", {
      start_date: startDate,
      end_date: endDate,
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Other endpoints (add as needed)
  // ─────────────────────────────────────────────────────────────

  async getPersonalInfo() {
    return this.fetch<PersonalInfo>("personal_info");
  }
}
