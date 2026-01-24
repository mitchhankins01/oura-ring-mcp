/**
 * MCP Tools for Oura Ring data
 *
 * Phase 1: Basic sleep tool
 * Phase 2: Add readiness, activity
 * Phase 3: Add derived/smart tools (compare, correlate, trends)
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  OuraClient,
  SleepSession,
  DailySleep,
  DailyStress,
  HeartRate,
  Workout,
  DailySpo2,
  VO2Max,
} from "../client.js";
import {
  formatDuration,
  formatTime,
  formatScore,
  getToday,
  percentage,
} from "../utils/index.js";

// ─────────────────────────────────────────────────────────────
// Register Tools with McpServer
// ─────────────────────────────────────────────────────────────

export function registerTools(server: McpServer, client: OuraClient) {
  // ─────────────────────────────────────────────────────────────
  // get_sleep tool
  // ─────────────────────────────────────────────────────────────
  server.registerTool(
    "get_sleep",
    {
      description:
        "Get detailed sleep data for a date range. Returns sleep duration, stages (deep/REM/light), efficiency, heart rate, and HRV. Use this for analyzing sleep patterns and quality.",
      inputSchema: {
        start_date: z.string().optional().describe("Start date in YYYY-MM-DD format. Defaults to today if not specified."),
        end_date: z.string().optional().describe("End date in YYYY-MM-DD format. Defaults to start_date if not specified."),
      },
    },
    async ({ start_date, end_date }) => {
      try {
        const startDate = start_date || getToday();
        const endDate = end_date || startDate;

        const response = await client.getSleep(startDate, endDate);

        if (response.data.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No sleep data found for ${startDate}${startDate !== endDate ? ` to ${endDate}` : ""}. Make sure your Oura Ring has synced.`,
              },
            ],
          };
        }

        // Format each sleep session with human-readable summary + raw data
        const formatted = response.data.map((session) => formatSleepSession(session));

        return {
          content: [
            {
              type: "text" as const,
              text: formatted.join("\n\n---\n\n"),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error fetching sleep data: ${error instanceof Error ? error.message : "Unknown error"}`,
            },
          ],
        };
      }
    }
  );

  // ─────────────────────────────────────────────────────────────
  // get_readiness tool
  // ─────────────────────────────────────────────────────────────
  server.registerTool(
    "get_readiness",
    {
      description:
        "Get daily readiness scores and contributors (HRV balance, resting heart rate, body temperature, recovery). Use this to understand recovery and readiness to perform.",
      inputSchema: {
        start_date: z.string().optional().describe("Start date in YYYY-MM-DD format. Defaults to today."),
        end_date: z.string().optional().describe("End date in YYYY-MM-DD format. Defaults to start_date."),
      },
    },
    async ({ start_date, end_date }) => {
      try {
        const startDate = start_date || getToday();
        const endDate = end_date || startDate;

        const response = await client.getDailyReadiness(startDate, endDate);

        if (response.data.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No readiness data found for ${startDate}${startDate !== endDate ? ` to ${endDate}` : ""}.`,
              },
            ],
          };
        }

        const formatted = response.data.map((day) => {
          const c = day.contributors;
          return [
            `## Readiness: ${day.day}`,
            `**Score:** ${formatScore(day.score)}`,
            "",
            "**Contributors:**",
            `- HRV Balance: ${c.hrv_balance ?? "N/A"}`,
            `- Resting Heart Rate: ${c.resting_heart_rate ?? "N/A"}`,
            `- Recovery Index: ${c.recovery_index ?? "N/A"}`,
            `- Sleep Balance: ${c.sleep_balance ?? "N/A"}`,
            `- Previous Night: ${c.previous_night ?? "N/A"}`,
            `- Previous Day Activity: ${c.previous_day_activity ?? "N/A"}`,
            `- Activity Balance: ${c.activity_balance ?? "N/A"}`,
            `- Body Temperature: ${c.body_temperature ?? "N/A"}`,
            day.temperature_deviation !== null
              ? `\n**Temperature Deviation:** ${day.temperature_deviation}°C`
              : "",
          ].join("\n");
        });

        return {
          content: [
            {
              type: "text" as const,
              text: formatted.join("\n\n---\n\n"),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error fetching readiness data: ${error instanceof Error ? error.message : "Unknown error"}`,
            },
          ],
        };
      }
    }
  );

  // ─────────────────────────────────────────────────────────────
  // get_activity tool
  // ─────────────────────────────────────────────────────────────
  server.registerTool(
    "get_activity",
    {
      description:
        "Get daily activity data including steps, calories, and activity breakdown (high/medium/low intensity). Use this to analyze movement and exercise patterns.",
      inputSchema: {
        start_date: z.string().optional().describe("Start date in YYYY-MM-DD format. Defaults to today."),
        end_date: z.string().optional().describe("End date in YYYY-MM-DD format. Defaults to start_date."),
      },
    },
    async ({ start_date, end_date }) => {
      try {
        const startDate = start_date || getToday();
        const endDate = end_date || startDate;

        const response = await client.getDailyActivity(startDate, endDate);

        if (response.data.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No activity data found for ${startDate}${startDate !== endDate ? ` to ${endDate}` : ""}.`,
              },
            ],
          };
        }

        const formatted = response.data.map((day) => {
          return [
            `## Activity: ${day.day}`,
            `**Score:** ${formatScore(day.score)}`,
            `**Steps:** ${day.steps.toLocaleString()}`,
            `**Calories:** ${day.total_calories.toLocaleString()} total (${day.active_calories.toLocaleString()} active)`,
            `**Walking Equivalent:** ${(day.equivalent_walking_distance / 1000).toFixed(1)} km`,
            "",
            "**Activity Breakdown:**",
            `- High Intensity: ${formatDuration(day.high_activity_time)}`,
            `- Medium Intensity: ${formatDuration(day.medium_activity_time)}`,
            `- Low Intensity: ${formatDuration(day.low_activity_time)}`,
            `- Sedentary: ${formatDuration(day.sedentary_time)}`,
            `- Resting: ${formatDuration(day.resting_time)}`,
          ].join("\n");
        });

        return {
          content: [
            {
              type: "text" as const,
              text: formatted.join("\n\n---\n\n"),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error fetching activity data: ${error instanceof Error ? error.message : "Unknown error"}`,
            },
          ],
        };
      }
    }
  );

  // ─────────────────────────────────────────────────────────────
  // get_stress tool
  // ─────────────────────────────────────────────────────────────
  server.registerTool(
    "get_stress",
    {
      description:
        "Get daily stress levels and recovery time. Shows time spent in high stress vs high recovery zones, plus overall day summary (restored/normal/stressful). Use this to understand stress patterns and recovery balance.",
      inputSchema: {
        start_date: z.string().optional().describe("Start date in YYYY-MM-DD format. Defaults to today."),
        end_date: z.string().optional().describe("End date in YYYY-MM-DD format. Defaults to start_date."),
      },
    },
    async ({ start_date, end_date }) => {
      try {
        const startDate = start_date || getToday();
        const endDate = end_date || startDate;

        const response = await client.getDailyStress(startDate, endDate);

        if (response.data.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No stress data found for ${startDate}${startDate !== endDate ? ` to ${endDate}` : ""}.`,
              },
            ],
          };
        }

        const formatted = response.data.map((day) => formatStress(day));

        return {
          content: [
            {
              type: "text" as const,
              text: formatted.join("\n\n---\n\n"),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error fetching stress data: ${error instanceof Error ? error.message : "Unknown error"}`,
            },
          ],
        };
      }
    }
  );

  // ─────────────────────────────────────────────────────────────
  // get_daily_sleep tool
  // ─────────────────────────────────────────────────────────────
  server.registerTool(
    "get_daily_sleep",
    {
      description:
        "Get daily sleep scores and contributors (efficiency, deep sleep, REM sleep, latency, timing, etc.). Different from get_sleep - this provides a single daily score with breakdown of what contributed to it. Use this for understanding sleep quality scoring.",
      inputSchema: {
        start_date: z.string().optional().describe("Start date in YYYY-MM-DD format. Defaults to today."),
        end_date: z.string().optional().describe("End date in YYYY-MM-DD format. Defaults to start_date."),
      },
    },
    async ({ start_date, end_date }) => {
      try {
        const startDate = start_date || getToday();
        const endDate = end_date || startDate;

        const response = await client.getDailySleep(startDate, endDate);

        if (response.data.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No daily sleep data found for ${startDate}${startDate !== endDate ? ` to ${endDate}` : ""}.`,
              },
            ],
          };
        }

        const formatted = response.data.map((day) => formatDailySleep(day));

        return {
          content: [
            {
              type: "text" as const,
              text: formatted.join("\n\n---\n\n"),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error fetching daily sleep data: ${error instanceof Error ? error.message : "Unknown error"}`,
            },
          ],
        };
      }
    }
  );

  // ─────────────────────────────────────────────────────────────
  // get_heart_rate tool
  // ─────────────────────────────────────────────────────────────
  server.registerTool(
    "get_heart_rate",
    {
      description:
        "Get individual heart rate readings throughout the day with timestamps and source (awake, rest, sleep, workout, etc.). Returns detailed time-series data. Use this for analyzing heart rate patterns, variability throughout the day, or correlating HR with activities.",
      inputSchema: {
        start_date: z.string().optional().describe("Start date in YYYY-MM-DD format. Defaults to today."),
        end_date: z.string().optional().describe("End date in YYYY-MM-DD format. Defaults to start_date."),
      },
    },
    async ({ start_date, end_date }) => {
      try {
        const startDate = start_date || getToday();
        const endDate = end_date || startDate;

        const response = await client.getHeartRate(startDate, endDate);

        if (response.data.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No heart rate data found for ${startDate}${startDate !== endDate ? ` to ${endDate}` : ""}.`,
              },
            ],
          };
        }

        const formatted = formatHeartRateData(response.data);

        return {
          content: [
            {
              type: "text" as const,
              text: formatted,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error fetching heart rate data: ${error instanceof Error ? error.message : "Unknown error"}`,
            },
          ],
        };
      }
    }
  );

  // ─────────────────────────────────────────────────────────────
  // get_workouts tool
  // ─────────────────────────────────────────────────────────────
  server.registerTool(
    "get_workouts",
    {
      description:
        "Get workout sessions with activity type, duration, intensity, calories burned, and distance. Use this to analyze exercise patterns, workout frequency, and training load.",
      inputSchema: {
        start_date: z.string().optional().describe("Start date in YYYY-MM-DD format. Defaults to today."),
        end_date: z.string().optional().describe("End date in YYYY-MM-DD format. Defaults to start_date."),
      },
    },
    async ({ start_date, end_date }) => {
      try {
        const startDate = start_date || getToday();
        const endDate = end_date || startDate;

        const response = await client.getWorkouts(startDate, endDate);

        if (response.data.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No workout data found for ${startDate}${startDate !== endDate ? ` to ${endDate}` : ""}.`,
              },
            ],
          };
        }

        const formatted = response.data.map((workout) => formatWorkout(workout));

        return {
          content: [
            {
              type: "text" as const,
              text: formatted.join("\n\n---\n\n"),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error fetching workout data: ${error instanceof Error ? error.message : "Unknown error"}`,
            },
          ],
        };
      }
    }
  );

  // ─────────────────────────────────────────────────────────────
  // get_spo2 tool
  // ─────────────────────────────────────────────────────────────
  server.registerTool(
    "get_spo2",
    {
      description:
        "Get daily SpO2 (blood oxygen saturation) percentage and breathing disturbance index. Use this to monitor respiratory health, detect sleep apnea patterns, or understand overnight oxygen levels.",
      inputSchema: {
        start_date: z.string().optional().describe("Start date in YYYY-MM-DD format. Defaults to today."),
        end_date: z.string().optional().describe("End date in YYYY-MM-DD format. Defaults to start_date."),
      },
    },
    async ({ start_date, end_date }) => {
      try {
        const startDate = start_date || getToday();
        const endDate = end_date || startDate;

        const response = await client.getDailySpo2(startDate, endDate);

        if (response.data.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No SpO2 data found for ${startDate}${startDate !== endDate ? ` to ${endDate}` : ""}. Note: SpO2 tracking requires a compatible Oura Ring (Gen 3 or later).`,
              },
            ],
          };
        }

        const formatted = response.data.map((day) => formatSpo2(day));

        return {
          content: [
            {
              type: "text" as const,
              text: formatted.join("\n\n---\n\n"),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error fetching SpO2 data: ${error instanceof Error ? error.message : "Unknown error"}`,
            },
          ],
        };
      }
    }
  );

  // ─────────────────────────────────────────────────────────────
  // get_vo2_max tool
  // ─────────────────────────────────────────────────────────────
  server.registerTool(
    "get_vo2_max",
    {
      description:
        "Get VO2 max measurements (cardiorespiratory fitness). VO2 max indicates the maximum amount of oxygen your body can use during intense exercise. Higher values indicate better cardiovascular fitness. Use this to track fitness improvements over time.",
      inputSchema: {
        start_date: z.string().optional().describe("Start date in YYYY-MM-DD format. Defaults to today."),
        end_date: z.string().optional().describe("End date in YYYY-MM-DD format. Defaults to start_date."),
      },
    },
    async ({ start_date, end_date }) => {
      try {
        const startDate = start_date || getToday();
        const endDate = end_date || startDate;

        const response = await client.getVO2Max(startDate, endDate);

        if (response.data.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No VO2 max data found for ${startDate}${startDate !== endDate ? ` to ${endDate}` : ""}. Note: VO2 max estimates require regular activity and workout data.`,
              },
            ],
          };
        }

        const formatted = response.data.map((measurement) => formatVO2Max(measurement));

        return {
          content: [
            {
              type: "text" as const,
              text: formatted.join("\n\n---\n\n"),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error fetching VO2 max data: ${error instanceof Error ? error.message : "Unknown error"}`,
            },
          ],
        };
      }
    }
  );
}

// ─────────────────────────────────────────────────────────────
// Formatting helpers
// ─────────────────────────────────────────────────────────────

function formatSleepSession(session: SleepSession): string {
  // Handle null values with defaults
  const totalSleep = session.total_sleep_duration ?? 0;
  const timeInBed = session.time_in_bed ?? 0;
  const deepSleep = session.deep_sleep_duration ?? 0;
  const remSleep = session.rem_sleep_duration ?? 0;
  const lightSleep = session.light_sleep_duration ?? 0;
  const awakeTime = session.awake_time ?? 0;

  const efficiency = percentage(totalSleep, timeInBed);

  const lines = [
    `## Sleep: ${session.day}`,
    `**Bedtime:** ${formatTime(session.bedtime_start)} → ${formatTime(session.bedtime_end)}`,
    `**Total Sleep:** ${formatDuration(totalSleep)} (of ${formatDuration(timeInBed)} in bed)`,
    `**Efficiency:** ${efficiency}%`,
    "",
    "**Sleep Stages:**",
    `- Deep: ${formatDuration(deepSleep)} (${percentage(deepSleep, totalSleep)}%)`,
    `- REM: ${formatDuration(remSleep)} (${percentage(remSleep, totalSleep)}%)`,
    `- Light: ${formatDuration(lightSleep)} (${percentage(lightSleep, totalSleep)}%)`,
    `- Awake: ${formatDuration(awakeTime)}`,
  ];

  // Add biometrics if available
  if (session.average_heart_rate || session.average_hrv) {
    lines.push("");
    lines.push("**Biometrics:**");
    if (session.average_heart_rate) {
      lines.push(
        `- Avg Heart Rate: ${session.average_heart_rate} bpm (lowest: ${session.lowest_heart_rate})`
      );
    }
    if (session.average_hrv) {
      lines.push(`- Avg HRV: ${session.average_hrv} ms`);
    }
    if (session.average_breath) {
      lines.push(`- Avg Breathing Rate: ${session.average_breath} breaths/min`);
    }
  }

  if (session.latency) {
    lines.push(`\n**Sleep Latency:** ${formatDuration(session.latency)} to fall asleep`);
  }

  return lines.join("\n");
}

function formatStress(day: DailyStress): string {
  const lines = [
    `## Stress: ${day.day}`,
  ];

  if (day.day_summary) {
    const summaryLabel = day.day_summary.charAt(0).toUpperCase() + day.day_summary.slice(1);
    lines.push(`**Day Summary:** ${summaryLabel}`);
    lines.push("");
  }

  lines.push("**Time Breakdown:**");

  if (day.stress_high !== null) {
    lines.push(`- High Stress: ${formatDuration(day.stress_high)}`);
  } else {
    lines.push("- High Stress: N/A");
  }

  if (day.recovery_high !== null) {
    lines.push(`- High Recovery: ${formatDuration(day.recovery_high)}`);
  } else {
    lines.push("- High Recovery: N/A");
  }

  return lines.join("\n");
}

function formatDailySleep(day: DailySleep): string {
  const c = day.contributors;
  return [
    `## Daily Sleep Score: ${day.day}`,
    `**Score:** ${formatScore(day.score)}`,
    "",
    "**Contributors:**",
    `- Total Sleep: ${c.total_sleep ?? "N/A"}`,
    `- Efficiency: ${c.efficiency ?? "N/A"}`,
    `- Restfulness: ${c.restfulness ?? "N/A"}`,
    `- REM Sleep: ${c.rem_sleep ?? "N/A"}`,
    `- Deep Sleep: ${c.deep_sleep ?? "N/A"}`,
    `- Latency: ${c.latency ?? "N/A"}`,
    `- Timing: ${c.timing ?? "N/A"}`,
  ].join("\n");
}

function formatHeartRateData(readings: HeartRate[]): string {
  // Handle empty array edge case
  if (readings.length === 0) {
    return "## Heart Rate Data (0 readings)\n\nNo heart rate readings available.";
  }

  // Group readings by source for better readability
  const bySource: Record<string, HeartRate[]> = {};

  readings.forEach((reading) => {
    const source = reading.source;
    if (!bySource[source]) {
      bySource[source] = [];
    }
    bySource[source].push(reading);
  });

  const lines = [
    `## Heart Rate Data (${readings.length} readings)`,
    "",
  ];

  // Calculate overall stats
  const allBpms = readings.map((r) => r.bpm);
  const avgBpm = Math.round(allBpms.reduce((a, b) => a + b, 0) / allBpms.length);
  const minBpm = Math.min(...allBpms);
  const maxBpm = Math.max(...allBpms);

  lines.push("**Overall Statistics:**");
  lines.push(`- Average: ${avgBpm} bpm`);
  lines.push(`- Range: ${minBpm} - ${maxBpm} bpm`);
  lines.push("");

  lines.push("**Breakdown by Source:**");
  Object.entries(bySource).forEach(([source, sourceReadings]) => {
    const sourceBpms = sourceReadings.map((r) => r.bpm);
    const sourceAvg = Math.round(sourceBpms.reduce((a, b) => a + b, 0) / sourceBpms.length);
    const sourceLabel = source.charAt(0).toUpperCase() + source.slice(1);
    lines.push(`- ${sourceLabel}: ${sourceReadings.length} readings, avg ${sourceAvg} bpm`);
  });

  return lines.join("\n");
}

function formatWorkout(workout: Workout): string {
  const lines = [
    `## Workout: ${workout.day}`,
    `**Activity:** ${workout.activity}${workout.label ? ` (${workout.label})` : ""}`,
    `**Time:** ${formatTime(workout.start_datetime)} → ${formatTime(workout.end_datetime)}`,
    `**Intensity:** ${workout.intensity.charAt(0).toUpperCase() + workout.intensity.slice(1)}`,
  ];

  if (workout.calories !== null && workout.calories !== undefined) {
    lines.push(`**Calories:** ${workout.calories.toLocaleString()} kcal`);
  }

  if (workout.distance !== null && workout.distance !== undefined) {
    lines.push(`**Distance:** ${(workout.distance / 1000).toFixed(2)} km`);
  }

  lines.push(`**Source:** ${workout.source}`);

  return lines.join("\n");
}

function formatSpo2(day: DailySpo2): string {
  const lines = [
    `## SpO2: ${day.day}`,
  ];

  if (day.spo2_percentage?.average != null) {
    lines.push(`**Average SpO2:** ${day.spo2_percentage.average.toFixed(1)}%`);
  } else {
    lines.push("**Average SpO2:** N/A");
  }

  if (day.breathing_disturbance_index !== null) {
    lines.push(`**Breathing Disturbance Index:** ${day.breathing_disturbance_index.toFixed(1)}`);

    // Add context for BDI
    let bdiContext = "";
    if (day.breathing_disturbance_index < 5) {
      bdiContext = "(Normal)";
    } else if (day.breathing_disturbance_index < 15) {
      bdiContext = "(Mild disturbance)";
    } else if (day.breathing_disturbance_index < 30) {
      bdiContext = "(Moderate disturbance)";
    } else {
      bdiContext = "(Significant disturbance - consider consulting a doctor)";
    }
    lines.push(`  ${bdiContext}`);
  } else {
    lines.push("**Breathing Disturbance Index:** N/A");
  }

  return lines.join("\n");
}

function formatVO2Max(measurement: VO2Max): string {
  const lines = [
    `## VO2 Max: ${measurement.day}`,
  ];

  if (measurement.vo2_max !== null) {
    lines.push(`**VO2 Max:** ${measurement.vo2_max.toFixed(1)} ml/kg/min`);

    // Add fitness level context (approximate ranges for adults)
    let fitnessLevel = "";
    const vo2 = measurement.vo2_max;
    if (vo2 < 30) {
      fitnessLevel = "(Poor)";
    } else if (vo2 < 40) {
      fitnessLevel = "(Below average)";
    } else if (vo2 < 45) {
      fitnessLevel = "(Average)";
    } else if (vo2 < 50) {
      fitnessLevel = "(Good)";
    } else if (vo2 < 55) {
      fitnessLevel = "(Very good)";
    } else {
      fitnessLevel = "(Excellent)";
    }
    lines.push(`  ${fitnessLevel}`);
  } else {
    lines.push("**VO2 Max:** N/A");
  }

  lines.push(`**Measured:** ${formatTime(measurement.timestamp)}`);

  return lines.join("\n");
}
