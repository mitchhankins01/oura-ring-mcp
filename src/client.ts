/**
 * Thin wrapper around the Oura API v2
 * https://cloud.ouraring.com/v2/docs
 */

const BASE_URL = "https://api.ouraring.com/v2/usercollection";

export interface OuraClientConfig {
  accessToken: string;
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

// ─────────────────────────────────────────────────────────────
// Types (minimal for Phase 1, will be replaced by OpenAPI types)
// ─────────────────────────────────────────────────────────────

export interface OuraResponse<T> {
  data: T[];
  next_token?: string;
}

export interface DailySleep {
  id: string;
  day: string;
  score: number | null;
  timestamp: string;
  contributors: {
    deep_sleep: number | null;
    efficiency: number | null;
    latency: number | null;
    rem_sleep: number | null;
    restfulness: number | null;
    timing: number | null;
    total_sleep: number | null;
  };
}

export interface SleepSession {
  id: string;
  day: string;
  bedtime_start: string;
  bedtime_end: string;
  total_sleep_duration: number; // seconds
  time_in_bed: number; // seconds
  awake_time: number; // seconds
  deep_sleep_duration: number; // seconds
  light_sleep_duration: number; // seconds
  rem_sleep_duration: number; // seconds
  efficiency: number;
  latency: number; // seconds
  average_heart_rate: number | null;
  lowest_heart_rate: number | null;
  average_hrv: number | null;
  average_breath: number | null;
  restless_periods: number | null;
}

export interface DailyReadiness {
  id: string;
  day: string;
  score: number | null;
  timestamp: string;
  temperature_deviation: number | null;
  temperature_trend_deviation: number | null;
  contributors: {
    activity_balance: number | null;
    body_temperature: number | null;
    hrv_balance: number | null;
    previous_day_activity: number | null;
    previous_night: number | null;
    recovery_index: number | null;
    resting_heart_rate: number | null;
    sleep_balance: number | null;
  };
}

export interface DailyActivity {
  id: string;
  day: string;
  score: number | null;
  timestamp: string;
  active_calories: number;
  steps: number;
  equivalent_walking_distance: number;
  total_calories: number;
  high_activity_time: number; // seconds
  medium_activity_time: number; // seconds
  low_activity_time: number; // seconds
  sedentary_time: number; // seconds
  resting_time: number; // seconds
  contributors: {
    meet_daily_targets: number | null;
    move_every_hour: number | null;
    recovery_time: number | null;
    stay_active: number | null;
    training_frequency: number | null;
    training_volume: number | null;
  };
}

export interface PersonalInfo {
  id: string;
  age: number | null;
  weight: number | null;
  height: number | null;
  biological_sex: string | null;
  email: string;
}
