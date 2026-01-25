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
  DailyResilience,
  DailyCardiovascularAge,
  Tag,
  EnhancedTag,
  Session,
} from "../client.js";
import {
  formatDuration,
  formatTime,
  formatScore,
  getToday,
  percentage,
  formatError,
  getNoDataMessage,
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

        // Fetch both detailed sessions AND daily scores in parallel
        const [sessionsResult, scoresResult] = await Promise.allSettled([
          client.getSleep(startDate, endDate),
          client.getDailySleep(startDate, endDate),
        ]);

        const sessions = sessionsResult.status === "fulfilled" ? sessionsResult.value.data : [];
        const scores = scoresResult.status === "fulfilled" ? scoresResult.value.data : [];

        if (sessions.length === 0 && scores.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: getNoDataMessage("sleep", startDate, endDate),
              },
            ],
          };
        }

        // Create a map of day -> score for easy lookup
        const scoresByDay = new Map(scores.map((s) => [s.day, s]));

        // Format each sleep session with its corresponding score
        const formatted = sessions.map((session) => {
          const dailyScore = scoresByDay.get(session.day);
          return formatSleepSession(session, dailyScore);
        });

        // If we have scores but no sessions (rare edge case), show scores only
        if (sessions.length === 0 && scores.length > 0) {
          const scoreOnlyFormatted = scores.map((day) => formatDailySleep(day));
          return {
            content: [
              {
                type: "text" as const,
                text: scoreOnlyFormatted.join("\n\n---\n\n"),
              },
            ],
          };
        }

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
              text: formatError(error),
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
            `- Sleep Regularity: ${(c as Record<string, unknown>).sleep_regularity ?? "N/A"}`,
            `- Previous Night: ${c.previous_night ?? "N/A"}`,
            `- Previous Day Activity: ${c.previous_day_activity ?? "N/A"}`,
            `- Activity Balance: ${c.activity_balance ?? "N/A"}`,
            `- Body Temperature: ${c.body_temperature ?? "N/A"}`,
            day.temperature_deviation !== null
              ? `\n**Temperature Deviation:** ${day.temperature_deviation}°C`
              : "",
            day.temperature_trend_deviation !== null
              ? `**Temperature Trend:** ${day.temperature_trend_deviation}°C`
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
              text: formatError(error),
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
              text: formatError(error),
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
              text: formatError(error),
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
              text: formatError(error),
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
              text: formatError(error),
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
              text: formatError(error),
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
              text: formatError(error),
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
              text: formatError(error),
            },
          ],
        };
      }
    }
  );

  // ─────────────────────────────────────────────────────────────
  // get_resilience tool
  // ─────────────────────────────────────────────────────────────
  server.registerTool(
    "get_resilience",
    {
      description:
        "Get daily resilience scores showing your body's capacity to recover from stress. Includes sleep recovery, daytime recovery, and stress contributors. Resilience levels range from limited to exceptional.",
      inputSchema: {
        start_date: z.string().optional().describe("Start date in YYYY-MM-DD format. Defaults to today."),
        end_date: z.string().optional().describe("End date in YYYY-MM-DD format. Defaults to start_date."),
      },
    },
    async ({ start_date, end_date }) => {
      try {
        const startDate = start_date || getToday();
        const endDate = end_date || startDate;

        const response = await client.getDailyResilience(startDate, endDate);

        if (response.data.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No resilience data found for ${startDate}${startDate !== endDate ? ` to ${endDate}` : ""}.`,
              },
            ],
          };
        }

        const formatted = response.data.map((day) => formatResilience(day));

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
              text: formatError(error),
            },
          ],
        };
      }
    }
  );

  // ─────────────────────────────────────────────────────────────
  // get_cardiovascular_age tool
  // ─────────────────────────────────────────────────────────────
  server.registerTool(
    "get_cardiovascular_age",
    {
      description:
        "Get your estimated cardiovascular (vascular) age based on heart health metrics. Compare your vascular age to your actual age to understand your cardiovascular health.",
      inputSchema: {
        start_date: z.string().optional().describe("Start date in YYYY-MM-DD format. Defaults to today."),
        end_date: z.string().optional().describe("End date in YYYY-MM-DD format. Defaults to start_date."),
      },
    },
    async ({ start_date, end_date }) => {
      try {
        const startDate = start_date || getToday();
        const endDate = end_date || startDate;

        const response = await client.getDailyCardiovascularAge(startDate, endDate);

        if (response.data.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No cardiovascular age data found for ${startDate}${startDate !== endDate ? ` to ${endDate}` : ""}. Note: This feature requires sufficient data and may not be available for all users.`,
              },
            ],
          };
        }

        const formatted = response.data.map((day) => formatCardiovascularAge(day));

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
              text: formatError(error),
            },
          ],
        };
      }
    }
  );

  // ─────────────────────────────────────────────────────────────
  // get_tags tool
  // ─────────────────────────────────────────────────────────────
  server.registerTool(
    "get_tags",
    {
      description:
        "Get user-created tags and notes. Tags help track lifestyle factors like caffeine, alcohol, meals, or custom notes that may affect sleep and recovery.",
      inputSchema: {
        start_date: z.string().optional().describe("Start date in YYYY-MM-DD format. Defaults to today."),
        end_date: z.string().optional().describe("End date in YYYY-MM-DD format. Defaults to start_date."),
      },
    },
    async ({ start_date, end_date }) => {
      try {
        const startDate = start_date || getToday();
        const endDate = end_date || startDate;

        const response = await client.getTags(startDate, endDate);

        if (response.data.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No tags found for ${startDate}${startDate !== endDate ? ` to ${endDate}` : ""}. Tags are user-created notes in the Oura app.`,
              },
            ],
          };
        }

        const formatted = response.data.map((tag) => formatTag(tag));

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
              text: formatError(error),
            },
          ],
        };
      }
    }
  );

  // ─────────────────────────────────────────────────────────────
  // get_enhanced_tags tool
  // ─────────────────────────────────────────────────────────────
  server.registerTool(
    "get_enhanced_tags",
    {
      description:
        "Get enhanced tags with rich data including custom tags, timestamps, and durations. Enhanced tags include predefined categories (sleep_aid, caffeine, alcohol, etc.) and custom user-created tags with names like medications, supplements, or lifestyle factors.",
      inputSchema: {
        start_date: z.string().optional().describe("Start date in YYYY-MM-DD format. Defaults to today."),
        end_date: z.string().optional().describe("End date in YYYY-MM-DD format. Defaults to start_date."),
      },
    },
    async ({ start_date, end_date }) => {
      try {
        const startDate = start_date || getToday();
        const endDate = end_date || startDate;

        const response = await client.getEnhancedTags(startDate, endDate);

        if (response.data.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No enhanced tags found for ${startDate}${startDate !== endDate ? ` to ${endDate}` : ""}. Enhanced tags are created in the Oura app and include both predefined categories and custom user tags.`,
              },
            ],
          };
        }

        const formatted = response.data.map((tag) => formatEnhancedTag(tag));

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
              text: formatError(error),
            },
          ],
        };
      }
    }
  );

  // ─────────────────────────────────────────────────────────────
  // get_sessions tool
  // ─────────────────────────────────────────────────────────────
  server.registerTool(
    "get_sessions",
    {
      description:
        "Get meditation, breathing, and relaxation sessions recorded with Oura. Includes session type, duration, and biometrics like heart rate and HRV during the session.",
      inputSchema: {
        start_date: z.string().optional().describe("Start date in YYYY-MM-DD format. Defaults to today."),
        end_date: z.string().optional().describe("End date in YYYY-MM-DD format. Defaults to start_date."),
      },
    },
    async ({ start_date, end_date }) => {
      try {
        const startDate = start_date || getToday();
        const endDate = end_date || startDate;

        const response = await client.getSessions(startDate, endDate);

        if (response.data.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No sessions found for ${startDate}${startDate !== endDate ? ` to ${endDate}` : ""}. Sessions include meditation and breathing exercises done through the Oura app.`,
              },
            ],
          };
        }

        const formatted = response.data.map((session) => formatSession(session));

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
              text: formatError(error),
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

function formatSleepSession(session: SleepSession, dailyScore?: DailySleep): string {
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
  ];

  // Include score from daily_sleep if available
  if (dailyScore?.score != null) {
    lines.push(`**Score:** ${formatScore(dailyScore.score)}`);
  }

  lines.push(
    `**Bedtime:** ${formatTime(session.bedtime_start)} → ${formatTime(session.bedtime_end)}`,
    `**Total Sleep:** ${formatDuration(totalSleep)} (of ${formatDuration(timeInBed)} in bed)`,
    `**Efficiency:** ${efficiency}%`,
    "",
    "**Sleep Stages:**",
    `- Deep: ${formatDuration(deepSleep)} (${percentage(deepSleep, totalSleep)}%)`,
    `- REM: ${formatDuration(remSleep)} (${percentage(remSleep, totalSleep)}%)`,
    `- Light: ${formatDuration(lightSleep)} (${percentage(lightSleep, totalSleep)}%)`,
    `- Awake: ${formatDuration(awakeTime)}`,
  );

  // Add restless periods if available
  if (session.restless_periods != null) {
    lines.push(`- Restless Periods: ${session.restless_periods}`);
  }

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

function formatResilience(day: DailyResilience): string {
  const c = day.contributors;
  const levelLabel = day.level.charAt(0).toUpperCase() + day.level.slice(1);

  return [
    `## Resilience: ${day.day}`,
    `**Level:** ${levelLabel}`,
    "",
    "**Contributors:**",
    `- Sleep Recovery: ${c.sleep_recovery}`,
    `- Daytime Recovery: ${c.daytime_recovery}`,
    `- Stress: ${c.stress}`,
  ].join("\n");
}

function formatCardiovascularAge(day: DailyCardiovascularAge): string {
  const lines = [
    `## Cardiovascular Age: ${day.day}`,
  ];

  if (day.vascular_age !== null) {
    lines.push(`**Vascular Age:** ${day.vascular_age} years`);
  } else {
    lines.push("**Vascular Age:** N/A");
  }

  return lines.join("\n");
}

function formatTag(tag: Tag): string {
  const lines = [
    `## Tag: ${tag.day}`,
    `**Time:** ${formatTime(tag.timestamp)}`,
  ];

  if (tag.tags && tag.tags.length > 0) {
    lines.push(`**Tags:** ${tag.tags.join(", ")}`);
  }

  if (tag.text) {
    lines.push(`**Note:** ${tag.text}`);
  }

  return lines.join("\n");
}

function formatEnhancedTag(tag: EnhancedTag): string {
  // Format the tag type - either custom name or predefined code
  const tagName = tag.custom_name || formatTagTypeCode(tag.tag_type_code);

  const lines = [
    `## ${tagName}`,
    `**Date:** ${tag.start_day}`,
    `**Time:** ${formatTime(tag.start_time)}`,
  ];

  // Add duration if there's an end time
  if (tag.end_time) {
    lines.push(`**End:** ${formatTime(tag.end_time)}`);
  }

  // Add comment if present
  if (tag.comment) {
    lines.push(`**Note:** ${tag.comment}`);
  }

  return lines.join("\n");
}

function formatTagTypeCode(code: string | null | undefined): string {
  if (!code) return "Tag";
  if (code === "custom") return "Custom Tag";

  // Convert tag_type_code like "tag_sleep_aid" to "Sleep Aid"
  return code
    .replace(/^tag_/, "")
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatSession(session: Session): string {
  const typeLabel = session.type.charAt(0).toUpperCase() + session.type.slice(1).replace(/_/g, " ");

  const lines = [
    `## ${typeLabel} Session: ${session.day}`,
    `**Time:** ${formatTime(session.start_datetime)} → ${formatTime(session.end_datetime)}`,
  ];

  if (session.mood) {
    const moodLabel = session.mood.charAt(0).toUpperCase() + session.mood.slice(1);
    lines.push(`**Mood:** ${moodLabel}`);
  }

  // Add biometrics if available
  if (session.heart_rate || session.heart_rate_variability) {
    lines.push("");
    lines.push("**Biometrics:**");

    if (session.heart_rate) {
      const hrItems = session.heart_rate.items || [];
      if (hrItems.length > 0) {
        const validHr = hrItems.filter((hr): hr is number => hr !== null);
        if (validHr.length > 0) {
          const avgHr = Math.round(validHr.reduce((a, b) => a + b, 0) / validHr.length);
          lines.push(`- Avg Heart Rate: ${avgHr} bpm`);
        }
      }
    }

    if (session.heart_rate_variability) {
      const hrvItems = session.heart_rate_variability.items || [];
      if (hrvItems.length > 0) {
        const validHrv = hrvItems.filter((hrv): hrv is number => hrv !== null);
        if (validHrv.length > 0) {
          const avgHrv = Math.round(validHrv.reduce((a, b) => a + b, 0) / validHrv.length);
          lines.push(`- Avg HRV: ${avgHrv} ms`);
        }
      }
    }
  }

  return lines.join("\n");
}
