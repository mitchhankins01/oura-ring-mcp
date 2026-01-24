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
  // Other endpoints (add as needed)
  // ─────────────────────────────────────────────────────────────

  async getPersonalInfo() {
    return this.fetch<PersonalInfo>("personal_info");
  }
}
