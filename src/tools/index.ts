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
  DailyReadiness,
  DailyActivity,
  RestModePeriod,
  RingConfiguration,
  SleepTime,
  PersonalInfo,
} from "../client.js";
import {
  formatDuration,
  formatTime,
  formatScore,
  getToday,
  getDaysAgo,
  percentage,
  formatError,
  getNoDataMessage,
  // Analysis utilities
  mean,
  trend,
  detectOutliers,
  dispersion,
  rollingAverages,
  dayOfWeekAnalysis,
  sleepDebt,
  sleepRegularity,
  correlate,
  hrvRecoveryPattern,
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
                text: `No tags found for ${startDate}${startDate !== endDate ? ` to ${endDate}` : ""}. Tags are manual lifestyle notes you add in the Oura app (like caffeine, alcohol, or custom notes) to track how habits affect your health. Workouts are tracked automatically via get_workouts.`,
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
                text: `No enhanced tags found for ${startDate}${startDate !== endDate ? ` to ${endDate}` : ""}. Tags are manual lifestyle notes you add in the Oura app (like caffeine, alcohol, stress, or custom notes). Workouts and sleep are tracked automatically—use get_workouts or get_sleep instead.`,
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

  // ═══════════════════════════════════════════════════════════════
  // SMART TOOLS (Phase 3)
  // ═══════════════════════════════════════════════════════════════

  // ─────────────────────────────────────────────────────────────
  // detect_anomalies tool
  // ─────────────────────────────────────────────────────────────
  server.registerTool(
    "detect_anomalies",
    {
      description:
        "Detect unusual readings in your health data over a time period. Uses statistical methods (IQR and Z-score) to flag outliers in sleep, HRV, heart rate, and activity. Useful for identifying nights with unusually poor sleep, stress spikes, or other anomalies.",
      inputSchema: {
        days: z.number().optional().describe("Number of days to analyze (default: 30)"),
        metrics: z
          .array(z.enum(["sleep_score", "hrv", "heart_rate", "deep_sleep", "efficiency", "readiness", "activity"]))
          .optional()
          .describe("Which metrics to check for anomalies (default: all)"),
      },
    },
    async ({ days = 30, metrics }) => {
      try {
        const endDate = getToday();
        const startDate = getDaysAgo(days);

        // Fetch data in parallel
        const [sleepResult, readinessResult, activityResult] = await Promise.allSettled([
          client.getSleep(startDate, endDate),
          client.getDailyReadiness(startDate, endDate),
          client.getDailyActivity(startDate, endDate),
        ]);

        // Filter to only main sleep sessions (exclude naps, rest periods)
        const allSleep = sleepResult.status === "fulfilled" ? sleepResult.value.data : [];
        const sleepSessions: SleepSession[] = allSleep.filter((s) => s.type === "long_sleep");
        const readinessData: DailyReadiness[] = readinessResult.status === "fulfilled" ? readinessResult.value.data : [];
        const activityData: DailyActivity[] = activityResult.status === "fulfilled" ? activityResult.value.data : [];

        if (sleepSessions.length === 0 && readinessData.length === 0 && activityData.length === 0) {
          return {
            content: [{ type: "text" as const, text: `No data found for the past ${days} days.` }],
          };
        }

        const allMetrics = ["sleep_score", "hrv", "heart_rate", "deep_sleep", "efficiency", "readiness", "activity"];
        const metricsToCheck = metrics || allMetrics;
        const anomalies: Array<{ metric: string; date: string; value: number; expected: string }> = [];

        // Extract and check each metric
        if (metricsToCheck.includes("hrv") && sleepSessions.length >= 5) {
          const hrvData = sleepSessions
            .filter((s) => s.average_hrv != null)
            .map((s) => ({ day: s.day, value: s.average_hrv! }));
          const hrvValues = hrvData.map((d) => d.value);
          const hrvOutliers = detectOutliers(hrvValues);
          hrvOutliers.outliers.forEach((o) => {
            const dataPoint = hrvData[o.index];
            anomalies.push({
              metric: "HRV",
              date: dataPoint.day,
              value: Math.round(o.value),
              expected: `${Math.round(hrvOutliers.lowerBound)}-${Math.round(hrvOutliers.upperBound)} ms`,
            });
          });
        }

        if (metricsToCheck.includes("heart_rate") && sleepSessions.length >= 5) {
          const hrData = sleepSessions
            .filter((s) => s.average_heart_rate != null)
            .map((s) => ({ day: s.day, value: s.average_heart_rate! }));
          const hrValues = hrData.map((d) => d.value);
          const hrOutliers = detectOutliers(hrValues);
          hrOutliers.outliers.forEach((o) => {
            const dataPoint = hrData[o.index];
            anomalies.push({
              metric: "Resting HR",
              date: dataPoint.day,
              value: Math.round(o.value),
              expected: `${Math.round(hrOutliers.lowerBound)}-${Math.round(hrOutliers.upperBound)} bpm`,
            });
          });
        }

        if (metricsToCheck.includes("deep_sleep") && sleepSessions.length >= 5) {
          const deepData = sleepSessions
            .filter((s) => s.deep_sleep_duration != null)
            .map((s) => ({ day: s.day, value: s.deep_sleep_duration! / 3600 })); // Convert to hours
          const deepValues = deepData.map((d) => d.value);
          const deepOutliers = detectOutliers(deepValues);
          deepOutliers.outliers.forEach((o) => {
            const dataPoint = deepData[o.index];
            anomalies.push({
              metric: "Deep Sleep",
              date: dataPoint.day,
              value: Math.round(o.value * 10) / 10,
              expected: `${(deepOutliers.lowerBound).toFixed(1)}-${(deepOutliers.upperBound).toFixed(1)} hours`,
            });
          });
        }

        if (metricsToCheck.includes("efficiency") && sleepSessions.length >= 5) {
          const effData = sleepSessions
            .filter((s) => s.efficiency != null)
            .map((s) => ({ day: s.day, value: s.efficiency! }));
          const effValues = effData.map((d) => d.value);
          const effOutliers = detectOutliers(effValues);
          effOutliers.outliers.forEach((o) => {
            const dataPoint = effData[o.index];
            anomalies.push({
              metric: "Sleep Efficiency",
              date: dataPoint.day,
              value: Math.round(o.value),
              expected: `${Math.round(effOutliers.lowerBound)}-${Math.round(effOutliers.upperBound)}%`,
            });
          });
        }

        if (metricsToCheck.includes("readiness") && readinessData.length >= 5) {
          const readData = readinessData
            .filter((r) => r.score != null)
            .map((r) => ({ day: r.day, value: r.score! }));
          const readValues = readData.map((d) => d.value);
          const readOutliers = detectOutliers(readValues);
          readOutliers.outliers.forEach((o) => {
            const dataPoint = readData[o.index];
            anomalies.push({
              metric: "Readiness Score",
              date: dataPoint.day,
              value: Math.round(o.value),
              expected: `${Math.round(readOutliers.lowerBound)}-${Math.round(readOutliers.upperBound)}`,
            });
          });
        }

        if (metricsToCheck.includes("activity") && activityData.length >= 5) {
          const actData = activityData
            .filter((a) => a.score != null)
            .map((a) => ({ day: a.day, value: a.score! }));
          const actValues = actData.map((d) => d.value);
          const actOutliers = detectOutliers(actValues);
          actOutliers.outliers.forEach((o) => {
            const dataPoint = actData[o.index];
            anomalies.push({
              metric: "Activity Score",
              date: dataPoint.day,
              value: Math.round(o.value),
              expected: `${Math.round(actOutliers.lowerBound)}-${Math.round(actOutliers.upperBound)}`,
            });
          });
        }

        // Sort anomalies by date (most recent first)
        anomalies.sort((a, b) => b.date.localeCompare(a.date));

        if (anomalies.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `## Anomaly Detection (${days} days)\n\n✓ No anomalies detected. All metrics are within normal ranges for your baseline.`,
              },
            ],
          };
        }

        const lines = [
          `## Anomaly Detection (${days} days)`,
          "",
          `Found ${anomalies.length} unusual reading${anomalies.length > 1 ? "s" : ""}:`,
          "",
        ];

        anomalies.forEach((a) => {
          const isLow = a.value < parseFloat(a.expected.split("-")[0]);
          const arrow = isLow ? "↓" : "↑";
          lines.push(`- **${a.date}** - ${a.metric}: ${a.value} ${arrow} (expected: ${a.expected})`);
        });

        lines.push("");
        lines.push("*Anomalies are flagged when values fall outside both IQR and Z-score bounds.*");

        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
        };
      } catch (error) {
        return {
          content: [{ type: "text" as const, text: formatError(error) }],
        };
      }
    }
  );

  // ─────────────────────────────────────────────────────────────
  // analyze_sleep_quality tool
  // ─────────────────────────────────────────────────────────────
  server.registerTool(
    "analyze_sleep_quality",
    {
      description:
        "Comprehensive sleep quality analysis over a time period. Shows trends, patterns by day of week, sleep debt, regularity score, and identifies your best/worst sleep days. Great for understanding what affects your sleep.",
      inputSchema: {
        days: z.number().optional().describe("Number of days to analyze (default: 30)"),
      },
    },
    async ({ days = 30 }) => {
      try {
        const endDate = getToday();
        const startDate = getDaysAgo(days);

        const [sleepResult, scoresResult] = await Promise.allSettled([
          client.getSleep(startDate, endDate),
          client.getDailySleep(startDate, endDate),
        ]);

        // Filter to only main sleep sessions (exclude naps, rest periods)
        const allSleep = sleepResult.status === "fulfilled" ? sleepResult.value.data : [];
        const sessions = allSleep.filter((s) => s.type === "long_sleep");
        const scores = scoresResult.status === "fulfilled" ? scoresResult.value.data : [];

        if (sessions.length < 3) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Need at least 3 nights of sleep data for analysis. Found ${sessions.length} night(s) in the past ${days} days.`,
              },
            ],
          };
        }

        const lines = [`## Sleep Quality Analysis (${days} days)`, ""];

        // Overall stats
        const durations = sessions.map((s) => s.total_sleep_duration ?? 0);
        const hrvValues = sessions.filter((s) => s.average_hrv != null).map((s) => s.average_hrv!);
        const efficiencies = sessions.filter((s) => s.efficiency != null).map((s) => s.efficiency!);

        const avgDuration = mean(durations);
        const avgHrv = hrvValues.length > 0 ? mean(hrvValues) : null;
        const avgEfficiency = efficiencies.length > 0 ? mean(efficiencies) : null;

        lines.push("### Overview");
        lines.push(`- **Nights analyzed:** ${sessions.length}`);
        lines.push(`- **Avg sleep:** ${formatDuration(avgDuration)}`);
        if (avgEfficiency) lines.push(`- **Avg efficiency:** ${Math.round(avgEfficiency)}%`);
        if (avgHrv) lines.push(`- **Avg HRV:** ${Math.round(avgHrv)} ms`);

        // Sleep debt
        const debt = sleepDebt(durations, 8);
        lines.push("");
        if (debt.status === "surplus") {
          lines.push(`✓ **Sleep surplus:** Getting ${Math.abs(debt.debtHours).toFixed(1)}h more than 8h target`);
        } else if (debt.status === "balanced") {
          lines.push(`✓ **On target:** Meeting 8h sleep goal`);
        } else if (debt.status === "mild_debt") {
          lines.push(`⚠ **Mild sleep debt:** ${debt.debtHours.toFixed(1)}h short of 8h target`);
        } else {
          lines.push(`⚠ **Significant sleep debt:** ${debt.debtHours.toFixed(1)}h short of 8h target`);
        }

        // Sleep regularity
        const bedtimes = sessions.map((s) => s.bedtime_start);
        const waketimes = sessions.map((s) => s.bedtime_end);
        const regularity = sleepRegularity(bedtimes, waketimes);
        lines.push(`- **Regularity score:** ${Math.round(regularity.regularityScore)}/100 (${regularity.status.replace(/_/g, " ")})`);

        // Trend analysis
        if (scores.length >= 5) {
          const scoreValues = scores.map((s) => s.score ?? 0);
          const scoreTrend = trend(scoreValues);
          lines.push("");
          lines.push("### Trend");
          if (scoreTrend.direction === "improving") {
            lines.push(`↑ Sleep scores are **improving** (${scoreTrend.significant ? "statistically significant" : "not yet significant"})`);
          } else if (scoreTrend.direction === "declining") {
            lines.push(`↓ Sleep scores are **declining** (${scoreTrend.significant ? "statistically significant" : "not yet significant"})`);
          } else {
            lines.push(`→ Sleep scores are **stable**`);
          }
        }

        // Rolling averages
        if (durations.length >= 7) {
          const rolling = rollingAverages(durations);
          lines.push("");
          lines.push("### Rolling Averages");
          lines.push(`- Last 7 days: ${formatDuration(rolling.day7.value)}`);
          if (durations.length >= 14) {
            lines.push(`- Last 14 days: ${formatDuration(rolling.day14.value)}`);
          }
          if (durations.length >= 30) {
            lines.push(`- Last 30 days: ${formatDuration(rolling.day30.value)}`);
          }
        }

        // Day of week patterns
        const dowData = sessions.map((s) => ({
          date: s.day,
          value: (s.total_sleep_duration ?? 0) / 3600, // hours
        }));
        const dowAnalysis = dayOfWeekAnalysis(dowData);
        lines.push("");
        lines.push("### Day of Week Patterns");
        lines.push(`- **Best night:** ${dowAnalysis.bestDay.day} (${dowAnalysis.bestDay.average.toFixed(1)}h avg)`);
        lines.push(`- **Worst night:** ${dowAnalysis.worstDay.day} (${dowAnalysis.worstDay.average.toFixed(1)}h avg)`);
        lines.push(`- **Weekday avg:** ${dowAnalysis.weekdayAverage.toFixed(1)}h`);
        lines.push(`- **Weekend avg:** ${dowAnalysis.weekendAverage.toFixed(1)}h`);

        // Variability
        const durationDispersion = dispersion(durations.map((d) => d / 3600));
        lines.push("");
        lines.push("### Variability");
        lines.push(`- **Range:** ${durationDispersion.min.toFixed(1)}h - ${durationDispersion.max.toFixed(1)}h`);
        lines.push(`- **Coefficient of variation:** ${durationDispersion.coefficientOfVariation.toFixed(0)}%`);
        if (durationDispersion.coefficientOfVariation > 20) {
          lines.push("  *(High variability - consider more consistent bedtimes)*");
        }

        // Best and worst nights
        const sortedByDuration = [...sessions].sort(
          (a, b) => (b.total_sleep_duration ?? 0) - (a.total_sleep_duration ?? 0)
        );
        lines.push("");
        lines.push("### Notable Nights");
        const best = sortedByDuration[0];
        const worst = sortedByDuration[sortedByDuration.length - 1];
        lines.push(`- **Best:** ${best.day} - ${formatDuration(best.total_sleep_duration ?? 0)}`);
        lines.push(`- **Worst:** ${worst.day} - ${formatDuration(worst.total_sleep_duration ?? 0)}`);

        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
        };
      } catch (error) {
        return {
          content: [{ type: "text" as const, text: formatError(error) }],
        };
      }
    }
  );

  // ─────────────────────────────────────────────────────────────
  // correlate_metrics tool
  // ─────────────────────────────────────────────────────────────
  server.registerTool(
    "correlate_metrics",
    {
      description:
        "Find correlations between two health metrics. For example, see if your HRV correlates with sleep duration, or if activity affects your readiness. Returns correlation strength, direction, and statistical significance.",
      inputSchema: {
        metric1: z.enum(["sleep_duration", "deep_sleep", "rem_sleep", "hrv", "heart_rate", "efficiency", "readiness", "activity", "steps"]).describe("First metric to correlate"),
        metric2: z.enum(["sleep_duration", "deep_sleep", "rem_sleep", "hrv", "heart_rate", "efficiency", "readiness", "activity", "steps"]).describe("Second metric to correlate"),
        days: z.number().optional().describe("Number of days to analyze (default: 30)"),
      },
    },
    async ({ metric1, metric2, days = 30 }) => {
      try {
        const endDate = getToday();
        const startDate = getDaysAgo(days);

        // Fetch all data we might need
        const [sleepResult, readinessResult, activityResult] = await Promise.allSettled([
          client.getSleep(startDate, endDate),
          client.getDailyReadiness(startDate, endDate),
          client.getDailyActivity(startDate, endDate),
        ]);

        // Filter to only main sleep sessions (exclude naps, rest periods)
        const allSleep = sleepResult.status === "fulfilled" ? sleepResult.value.data : [];
        const sleepSessions: SleepSession[] = allSleep.filter((s) => s.type === "long_sleep");
        const readinessData: DailyReadiness[] = readinessResult.status === "fulfilled" ? readinessResult.value.data : [];
        const activityData: DailyActivity[] = activityResult.status === "fulfilled" ? activityResult.value.data : [];

        // Create lookup maps by day
        const sleepByDay = new Map<string, SleepSession>(sleepSessions.map((s) => [s.day, s]));
        const readinessByDay = new Map<string, DailyReadiness>(readinessData.map((r) => [r.day, r]));
        const activityByDay = new Map<string, DailyActivity>(activityData.map((a) => [a.day, a]));

        // Helper to extract metric value
        const getMetricValue = (day: string, metric: string): number | null => {
          const sleep = sleepByDay.get(day);
          const readiness = readinessByDay.get(day);
          const activity = activityByDay.get(day);

          switch (metric) {
            case "sleep_duration":
              return sleep?.total_sleep_duration ? sleep.total_sleep_duration / 3600 : null;
            case "deep_sleep":
              return sleep?.deep_sleep_duration ? sleep.deep_sleep_duration / 3600 : null;
            case "rem_sleep":
              return sleep?.rem_sleep_duration ? sleep.rem_sleep_duration / 3600 : null;
            case "hrv":
              return sleep?.average_hrv ?? null;
            case "heart_rate":
              return sleep?.average_heart_rate ?? null;
            case "efficiency":
              return sleep?.efficiency ?? null;
            case "readiness":
              return readiness?.score ?? null;
            case "activity":
              return activity?.score ?? null;
            case "steps":
              return activity?.steps ?? null;
            default:
              return null;
          }
        };

        // Get all unique days
        const allDays = new Set([
          ...sleepSessions.map((s) => s.day),
          ...readinessData.map((r) => r.day),
          ...activityData.map((a) => a.day),
        ]);

        // Build paired data points
        const values1: number[] = [];
        const values2: number[] = [];

        for (const day of allDays) {
          const v1 = getMetricValue(day, metric1);
          const v2 = getMetricValue(day, metric2);
          if (v1 !== null && v2 !== null) {
            values1.push(v1);
            values2.push(v2);
          }
        }

        if (values1.length < 5) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Need at least 5 days with both metrics available. Found ${values1.length} matching days.`,
              },
            ],
          };
        }

        const result = correlate(values1, values2);
        const metricLabels: Record<string, string> = {
          sleep_duration: "Sleep Duration",
          deep_sleep: "Deep Sleep",
          rem_sleep: "REM Sleep",
          hrv: "HRV",
          heart_rate: "Heart Rate",
          efficiency: "Sleep Efficiency",
          readiness: "Readiness Score",
          activity: "Activity Score",
          steps: "Steps",
        };

        const lines = [
          `## Correlation Analysis`,
          "",
          `**${metricLabels[metric1]}** vs **${metricLabels[metric2]}**`,
          "",
          `- **Correlation:** ${result.correlation.toFixed(2)} (${result.strength} ${result.direction})`,
          `- **Statistical significance:** ${result.significant ? "Yes" : "No"} (p = ${result.pValue.toFixed(3)})`,
          `- **Sample size:** ${result.n} days`,
          "",
        ];

        // Interpretation
        if (result.strength === "none") {
          lines.push(`→ No meaningful relationship between these metrics.`);
        } else if (result.direction === "positive") {
          lines.push(`→ When ${metricLabels[metric1].toLowerCase()} increases, ${metricLabels[metric2].toLowerCase()} tends to increase.`);
        } else {
          lines.push(`→ When ${metricLabels[metric1].toLowerCase()} increases, ${metricLabels[metric2].toLowerCase()} tends to decrease.`);
        }

        if (!result.significant) {
          lines.push("");
          lines.push("*Note: This correlation is not statistically significant. More data may be needed.*");
        }

        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
        };
      } catch (error) {
        return {
          content: [{ type: "text" as const, text: formatError(error) }],
        };
      }
    }
  );

  // ─────────────────────────────────────────────────────────────
  // compare_periods tool
  // ─────────────────────────────────────────────────────────────
  server.registerTool(
    "compare_periods",
    {
      description:
        "Compare health metrics between two time periods. Great for answering questions like 'How did I sleep this week vs last week?' or 'Was my HRV better last month?'. Returns side-by-side comparison with percentage changes.",
      inputSchema: {
        period1_start: z.string().describe("Start date of first period (YYYY-MM-DD)"),
        period1_end: z.string().describe("End date of first period (YYYY-MM-DD)"),
        period2_start: z.string().describe("Start date of second period (YYYY-MM-DD)"),
        period2_end: z.string().describe("End date of second period (YYYY-MM-DD)"),
        metrics: z
          .array(z.enum(["sleep_duration", "sleep_score", "deep_sleep", "rem_sleep", "hrv", "heart_rate", "efficiency", "readiness", "activity", "steps"]))
          .optional()
          .describe("Which metrics to compare (default: all available)"),
      },
    },
    async ({ period1_start, period1_end, period2_start, period2_end, metrics }) => {
      try {
        // Fetch data for both periods in parallel
        const [sleep1, sleep2, readiness1, readiness2, activity1, activity2, scores1, scores2] = await Promise.all([
          client.getSleep(period1_start, period1_end),
          client.getSleep(period2_start, period2_end),
          client.getDailyReadiness(period1_start, period1_end),
          client.getDailyReadiness(period2_start, period2_end),
          client.getDailyActivity(period1_start, period1_end),
          client.getDailyActivity(period2_start, period2_end),
          client.getDailySleep(period1_start, period1_end),
          client.getDailySleep(period2_start, period2_end),
        ]);

        // Filter to main sleep sessions only
        const sessions1 = sleep1.data.filter((s) => s.type === "long_sleep");
        const sessions2 = sleep2.data.filter((s) => s.type === "long_sleep");

        const allMetrics = ["sleep_duration", "sleep_score", "deep_sleep", "rem_sleep", "hrv", "heart_rate", "efficiency", "readiness", "activity", "steps"];
        const metricsToCompare = metrics || allMetrics;

        type ComparisonRow = { metric: string; period1: string; period2: string; change: string; arrow: string };
        const comparisons: ComparisonRow[] = [];

        // Helper to calculate comparison
        const addComparison = (name: string, values1: number[], values2: number[], unit: string, decimals = 0) => {
          if (values1.length === 0 || values2.length === 0) return;
          const avg1 = mean(values1);
          const avg2 = mean(values2);
          const change = avg2 !== 0 ? ((avg1 - avg2) / avg2) * 100 : 0;
          const arrow = change > 2 ? "↑" : change < -2 ? "↓" : "→";
          comparisons.push({
            metric: name,
            period1: decimals > 0 ? `${avg1.toFixed(decimals)}${unit}` : `${Math.round(avg1)}${unit}`,
            period2: decimals > 0 ? `${avg2.toFixed(decimals)}${unit}` : `${Math.round(avg2)}${unit}`,
            change: `${change >= 0 ? "+" : ""}${change.toFixed(0)}%`,
            arrow,
          });
        };

        if (metricsToCompare.includes("sleep_duration")) {
          const durations1 = sessions1.map((s) => (s.total_sleep_duration ?? 0) / 3600);
          const durations2 = sessions2.map((s) => (s.total_sleep_duration ?? 0) / 3600);
          addComparison("Sleep Duration", durations1, durations2, "h", 1);
        }

        if (metricsToCompare.includes("sleep_score")) {
          const scores1Vals = scores1.data.filter((s) => s.score != null).map((s) => s.score!);
          const scores2Vals = scores2.data.filter((s) => s.score != null).map((s) => s.score!);
          addComparison("Sleep Score", scores1Vals, scores2Vals, "");
        }

        if (metricsToCompare.includes("deep_sleep")) {
          const deep1 = sessions1.filter((s) => s.deep_sleep_duration != null).map((s) => s.deep_sleep_duration! / 3600);
          const deep2 = sessions2.filter((s) => s.deep_sleep_duration != null).map((s) => s.deep_sleep_duration! / 3600);
          addComparison("Deep Sleep", deep1, deep2, "h", 1);
        }

        if (metricsToCompare.includes("rem_sleep")) {
          const rem1 = sessions1.filter((s) => s.rem_sleep_duration != null).map((s) => s.rem_sleep_duration! / 3600);
          const rem2 = sessions2.filter((s) => s.rem_sleep_duration != null).map((s) => s.rem_sleep_duration! / 3600);
          addComparison("REM Sleep", rem1, rem2, "h", 1);
        }

        if (metricsToCompare.includes("hrv")) {
          const hrv1 = sessions1.filter((s) => s.average_hrv != null).map((s) => s.average_hrv!);
          const hrv2 = sessions2.filter((s) => s.average_hrv != null).map((s) => s.average_hrv!);
          addComparison("HRV", hrv1, hrv2, " ms");
        }

        if (metricsToCompare.includes("heart_rate")) {
          const hr1 = sessions1.filter((s) => s.average_heart_rate != null).map((s) => s.average_heart_rate!);
          const hr2 = sessions2.filter((s) => s.average_heart_rate != null).map((s) => s.average_heart_rate!);
          addComparison("Resting HR", hr1, hr2, " bpm");
        }

        if (metricsToCompare.includes("efficiency")) {
          const eff1 = sessions1.filter((s) => s.efficiency != null).map((s) => s.efficiency!);
          const eff2 = sessions2.filter((s) => s.efficiency != null).map((s) => s.efficiency!);
          addComparison("Efficiency", eff1, eff2, "%");
        }

        if (metricsToCompare.includes("readiness")) {
          const read1 = readiness1.data.filter((r) => r.score != null).map((r) => r.score!);
          const read2 = readiness2.data.filter((r) => r.score != null).map((r) => r.score!);
          addComparison("Readiness", read1, read2, "");
        }

        if (metricsToCompare.includes("activity")) {
          const act1 = activity1.data.filter((a) => a.score != null).map((a) => a.score!);
          const act2 = activity2.data.filter((a) => a.score != null).map((a) => a.score!);
          addComparison("Activity", act1, act2, "");
        }

        if (metricsToCompare.includes("steps")) {
          const steps1 = activity1.data.map((a) => a.steps);
          const steps2 = activity2.data.map((a) => a.steps);
          addComparison("Steps", steps1, steps2, "");
        }

        if (comparisons.length === 0) {
          return {
            content: [{ type: "text" as const, text: "No data available for comparison in the specified periods." }],
          };
        }

        const lines = [
          `## Period Comparison`,
          "",
          `**Period 1:** ${period1_start} to ${period1_end}`,
          `**Period 2:** ${period2_start} to ${period2_end}`,
          "",
          "| Metric | Period 1 | Period 2 | Change |",
          "|--------|----------|----------|--------|",
        ];

        comparisons.forEach((c) => {
          lines.push(`| ${c.metric} | ${c.period1} | ${c.period2} | ${c.arrow} ${c.change} |`);
        });

        // Summary
        const improvements = comparisons.filter((c) => c.arrow === "↑").length;
        const declines = comparisons.filter((c) => c.arrow === "↓").length;
        lines.push("");
        if (improvements > declines) {
          lines.push(`→ Period 1 shows overall improvement (${improvements} metrics up, ${declines} down)`);
        } else if (declines > improvements) {
          lines.push(`→ Period 1 shows some decline (${improvements} metrics up, ${declines} down)`);
        } else {
          lines.push(`→ Periods are relatively similar`);
        }

        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
        };
      } catch (error) {
        return {
          content: [{ type: "text" as const, text: formatError(error) }],
        };
      }
    }
  );

  // ─────────────────────────────────────────────────────────────
  // compare_conditions tool
  // ─────────────────────────────────────────────────────────────

  // Auto-tracked conditions that don't require manual tags
  const AUTO_CONDITIONS = ["workout", "high_activity", "low_activity", "meditation", "session"] as const;
  type AutoCondition = typeof AUTO_CONDITIONS[number];

  server.registerTool(
    "compare_conditions",
    {
      description:
        "Compare a health metric across different conditions. Supports manual tags (alcohol, caffeine) AND auto-tracked conditions: 'workout' (workout days vs rest days), 'high_activity' (high step days), 'meditation' (session days).",
      inputSchema: {
        tag: z.string().describe("Condition to compare. Manual tags: 'alcohol', 'caffeine', 'late_meal'. Auto-tracked: 'workout', 'high_activity', 'meditation'."),
        metric: z.enum(["sleep_duration", "sleep_score", "deep_sleep", "rem_sleep", "hrv", "heart_rate", "efficiency", "readiness"]).describe("Metric to compare"),
        days: z.number().optional().describe("Number of days to analyze (default: 90)"),
      },
    },
    async ({ tag, metric, days = 90 }) => {
      try {
        const endDate = getToday();
        const startDate = getDaysAgo(days);
        const tagLower = tag.toLowerCase() as AutoCondition;
        const isAutoCondition = AUTO_CONDITIONS.includes(tagLower as AutoCondition);

        // Fetch sleep and readiness data (always needed)
        const [sleepResult, scoresResult, readinessResult] = await Promise.allSettled([
          client.getSleep(startDate, endDate),
          client.getDailySleep(startDate, endDate),
          client.getDailyReadiness(startDate, endDate),
        ]);

        const allSleep = sleepResult.status === "fulfilled" ? sleepResult.value.data : [];
        const sessions = allSleep.filter((s) => s.type === "long_sleep");
        const scores = scoresResult.status === "fulfilled" ? scoresResult.value.data : [];
        const readiness = readinessResult.status === "fulfilled" ? readinessResult.value.data : [];

        const daysWithTag = new Set<string>();
        let conditionLabel = tag;

        if (isAutoCondition) {
          // Handle auto-tracked conditions
          if (tagLower === "workout") {
            const workoutsResult = await client.getWorkouts(startDate, endDate);
            workoutsResult.data.forEach((w) => daysWithTag.add(w.day));
            conditionLabel = "workout";
          } else if (tagLower === "meditation" || tagLower === "session") {
            const sessionsResult = await client.getSessions(startDate, endDate);
            sessionsResult.data.forEach((s) => daysWithTag.add(s.day));
            conditionLabel = "meditation/session";
          } else if (tagLower === "high_activity" || tagLower === "low_activity") {
            const activityResult = await client.getDailyActivity(startDate, endDate);
            const activities = activityResult.data;
            if (activities.length >= 5) {
              const allSteps = activities.map((a) => a.steps ?? 0).filter((s) => s > 0);
              const avgSteps = mean(allSteps);
              activities.forEach((a) => {
                const steps = a.steps ?? 0;
                if (tagLower === "high_activity" && steps > avgSteps * 1.2) {
                  daysWithTag.add(a.day);
                } else if (tagLower === "low_activity" && steps < avgSteps * 0.8) {
                  daysWithTag.add(a.day);
                }
              });
              conditionLabel = tagLower === "high_activity" ? "high activity (>20% above avg)" : "low activity (<20% below avg)";
            }
          }

          if (daysWithTag.size === 0) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `No ${conditionLabel} days found in the past ${days} days. Try a longer time period or check that you have ${tagLower === "workout" ? "workouts" : tagLower === "meditation" || tagLower === "session" ? "meditation sessions" : "activity data"} recorded.`,
                },
              ],
            };
          }
        } else {
          // Handle manual tags
          const [enhancedTagsResult, regularTagsResult] = await Promise.allSettled([
            client.getEnhancedTags(startDate, endDate),
            client.getTags(startDate, endDate),
          ]);

          const enhancedTags = enhancedTagsResult.status === "fulfilled" ? enhancedTagsResult.value.data : [];
          const regularTags = regularTagsResult.status === "fulfilled" ? regularTagsResult.value.data : [];

          if (enhancedTags.length === 0 && regularTags.length === 0) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `No tags found in the past ${days} days. Tags are manual lifestyle notes you add in the Oura app—try tracking alcohol, caffeine, late meals, or stress. Or use auto-tracked conditions: 'workout', 'high_activity', 'meditation'.`,
                },
              ],
            };
          }

          // Find days with the specified tag
          for (const t of enhancedTags) {
            const customMatch = t.custom_name?.toLowerCase().includes(tagLower);
            const codeMatch = t.tag_type_code?.toLowerCase().includes(tagLower);
            if (customMatch || codeMatch) {
              daysWithTag.add(t.start_day);
            }
          }

          for (const t of regularTags) {
            for (const tagName of t.tags) {
              if (tagName.toLowerCase().includes(tagLower)) {
                daysWithTag.add(t.day);
              }
            }
          }

          if (daysWithTag.size === 0) {
            const allTagNames = new Set<string>();
            enhancedTags.forEach((t) => allTagNames.add(t.custom_name || t.tag_type_code || "unknown"));
            regularTags.forEach((t) => t.tags.forEach((name) => allTagNames.add(name)));
            const tagList = [...allTagNames].join(", ") || "none";

            return {
              content: [
                {
                  type: "text" as const,
                  text: `No "${tag}" tags found. Available tags: ${tagList}. Auto-tracked options: workout, high_activity, meditation.`,
                },
              ],
            };
          }
        }

        // Create lookup maps
        const sleepByDay = new Map(sessions.map((s) => [s.day, s]));
        const scoresByDay = new Map(scores.map((s) => [s.day, s]));
        const readinessByDay = new Map(readiness.map((r) => [r.day, r]));

        // Get metric values for days with and without tag
        const getMetricValue = (day: string): number | null => {
          const sleep = sleepByDay.get(day);
          const score = scoresByDay.get(day);
          const read = readinessByDay.get(day);

          switch (metric) {
            case "sleep_duration":
              return sleep?.total_sleep_duration ? sleep.total_sleep_duration / 3600 : null;
            case "sleep_score":
              return score?.score ?? null;
            case "deep_sleep":
              return sleep?.deep_sleep_duration ? sleep.deep_sleep_duration / 3600 : null;
            case "rem_sleep":
              return sleep?.rem_sleep_duration ? sleep.rem_sleep_duration / 3600 : null;
            case "hrv":
              return sleep?.average_hrv ?? null;
            case "heart_rate":
              return sleep?.average_heart_rate ?? null;
            case "efficiency":
              return sleep?.efficiency ?? null;
            case "readiness":
              return read?.score ?? null;
            default:
              return null;
          }
        };

        const withTagValues: number[] = [];
        const withoutTagValues: number[] = [];

        // Get all days with data
        const allDays = new Set([...sessions.map((s) => s.day), ...scores.map((s) => s.day), ...readiness.map((r) => r.day)]);

        for (const day of allDays) {
          const value = getMetricValue(day);
          if (value === null) continue;

          if (daysWithTag.has(day)) {
            withTagValues.push(value);
          } else {
            withoutTagValues.push(value);
          }
        }

        if (withTagValues.length < 2 || withoutTagValues.length < 2) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Not enough data to compare. Found ${withTagValues.length} days with "${tag}" and ${withoutTagValues.length} days without.`,
              },
            ],
          };
        }

        const avgWith = mean(withTagValues);
        const avgWithout = mean(withoutTagValues);
        const difference = avgWith - avgWithout;
        const percentDiff = (difference / avgWithout) * 100;

        const metricLabels: Record<string, { name: string; unit: string; decimals: number; higherIsBetter: boolean }> = {
          sleep_duration: { name: "Sleep Duration", unit: "h", decimals: 1, higherIsBetter: true },
          sleep_score: { name: "Sleep Score", unit: "", decimals: 0, higherIsBetter: true },
          deep_sleep: { name: "Deep Sleep", unit: "h", decimals: 1, higherIsBetter: true },
          rem_sleep: { name: "REM Sleep", unit: "h", decimals: 1, higherIsBetter: true },
          hrv: { name: "HRV", unit: " ms", decimals: 0, higherIsBetter: true },
          heart_rate: { name: "Resting HR", unit: " bpm", decimals: 0, higherIsBetter: false },
          efficiency: { name: "Efficiency", unit: "%", decimals: 0, higherIsBetter: true },
          readiness: { name: "Readiness", unit: "", decimals: 0, higherIsBetter: true },
        };

        const m = metricLabels[metric];
        const formatVal = (v: number) => (m.decimals > 0 ? v.toFixed(m.decimals) : Math.round(v).toString()) + m.unit;

        const lines = [
          `## Condition Comparison: ${conditionLabel}`,
          "",
          `**Metric:** ${m.name}`,
          `**Period:** Last ${days} days`,
          "",
          `| Condition | Avg ${m.name} | Days |`,
          `|-----------|${"-".repeat(m.name.length + 6)}|------|`,
          `| With ${conditionLabel} | ${formatVal(avgWith)} | ${withTagValues.length} |`,
          `| Without ${conditionLabel} | ${formatVal(avgWithout)} | ${withoutTagValues.length} |`,
          "",
          `**Difference:** ${difference >= 0 ? "+" : ""}${formatVal(difference)} (${percentDiff >= 0 ? "+" : ""}${percentDiff.toFixed(0)}%)`,
          "",
        ];

        // Interpretation
        const isBetter = m.higherIsBetter ? difference > 0 : difference < 0;
        const isWorse = m.higherIsBetter ? difference < 0 : difference > 0;
        const isSignificant = Math.abs(percentDiff) > 5;

        if (isSignificant && isWorse) {
          lines.push(`⚠ ${conditionLabel} appears to negatively impact your ${m.name.toLowerCase()}.`);
        } else if (isSignificant && isBetter) {
          lines.push(`✓ ${conditionLabel} appears to positively impact your ${m.name.toLowerCase()}.`);
        } else {
          lines.push(`→ ${conditionLabel} doesn't show a significant impact on your ${m.name.toLowerCase()}.`);
        }

        lines.push("");
        lines.push("*Note: Correlation doesn't imply causation. Other factors may be involved.*");

        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
        };
      } catch (error) {
        return {
          content: [{ type: "text" as const, text: formatError(error) }],
        };
      }
    }
  );

  // ─────────────────────────────────────────────────────────────
  // best_sleep_conditions tool
  // ─────────────────────────────────────────────────────────────
  server.registerTool(
    "best_sleep_conditions",
    {
      description:
        "Analyze what conditions are associated with your best sleep nights. Looks at activity levels, workouts, meditation sessions, tags, and day-of-week patterns to identify what predicts good vs poor sleep.",
      inputSchema: {
        days: z.number().optional().describe("Number of days to analyze (default: 60)"),
      },
    },
    async ({ days = 60 }) => {
      try {
        const endDate = getToday();
        const startDate = getDaysAgo(days);

        // Fetch all relevant data (including tags, workouts, and sessions)
        const [sleepResult, scoresResult, activityResult, enhancedTagsResult, regularTagsResult, workoutsResult, meditationResult] = await Promise.allSettled([
          client.getSleep(startDate, endDate),
          client.getDailySleep(startDate, endDate),
          client.getDailyActivity(startDate, endDate),
          client.getEnhancedTags(startDate, endDate),
          client.getTags(startDate, endDate),
          client.getWorkouts(startDate, endDate),
          client.getSessions(startDate, endDate),
        ]);

        const allSleep = sleepResult.status === "fulfilled" ? sleepResult.value.data : [];
        const sessions = allSleep.filter((s) => s.type === "long_sleep");
        const scores = scoresResult.status === "fulfilled" ? scoresResult.value.data : [];
        const activity = activityResult.status === "fulfilled" ? activityResult.value.data : [];
        const enhancedTags = enhancedTagsResult.status === "fulfilled" ? enhancedTagsResult.value.data : [];
        const regularTags = regularTagsResult.status === "fulfilled" ? regularTagsResult.value.data : [];
        const workouts = workoutsResult.status === "fulfilled" ? workoutsResult.value.data : [];
        const meditationSessions = meditationResult.status === "fulfilled" ? meditationResult.value.data : [];

        // Create sets for auto-tracked conditions
        const workoutDays = new Set(workouts.map((w) => w.day));
        const meditationDays = new Set(meditationSessions.map((s) => s.day));

        if (sessions.length < 10) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Need at least 10 nights of sleep data for meaningful analysis. Found ${sessions.length} nights in the past ${days} days.`,
              },
            ],
          };
        }

        // Create lookup maps
        const scoresByDay = new Map(scores.map((s) => [s.day, s.score ?? 0]));
        const activityByDay = new Map(activity.map((a) => [a.day, a]));

        // Combine enhanced tags and regular tags into tagsByDay
        const tagsByDay = new Map<string, string[]>();
        enhancedTags.forEach((t) => {
          const existing = tagsByDay.get(t.start_day) || [];
          existing.push(t.custom_name || t.tag_type_code || "unknown");
          tagsByDay.set(t.start_day, existing);
        });
        regularTags.forEach((t) => {
          const existing = tagsByDay.get(t.day) || [];
          existing.push(...t.tags);
          tagsByDay.set(t.day, existing);
        });

        // Classify nights as good, average, or poor based on sleep score quartiles
        const allScores = sessions.map((s) => scoresByDay.get(s.day) ?? 0).filter((s) => s > 0);
        if (allScores.length < 10) {
          return {
            content: [{ type: "text" as const, text: "Not enough sleep score data for analysis." }],
          };
        }

        const sortedScores = [...allScores].sort((a, b) => a - b);
        const q25 = sortedScores[Math.floor(sortedScores.length * 0.25)];
        const q75 = sortedScores[Math.floor(sortedScores.length * 0.75)];

        type NightData = { day: string; score: number; activity: DailyActivity | undefined; tags: string[]; hadWorkout: boolean; hadMeditation: boolean };
        const goodNights: NightData[] = [];
        const poorNights: NightData[] = [];

        sessions.forEach((s) => {
          const score = scoresByDay.get(s.day) ?? 0;
          if (score === 0) return;

          const data: NightData = {
            day: s.day,
            score,
            activity: activityByDay.get(s.day),
            tags: tagsByDay.get(s.day) || [],
            hadWorkout: workoutDays.has(s.day),
            hadMeditation: meditationDays.has(s.day),
          };

          if (score >= q75) {
            goodNights.push(data);
          } else if (score <= q25) {
            poorNights.push(data);
          }
        });

        const lines = [
          `## Best Sleep Conditions Analysis`,
          "",
          `*Based on ${sessions.length} nights over ${days} days*`,
          "",
          `**Sleep Score Thresholds:**`,
          `- Good nights (top 25%): score ≥ ${q75}`,
          `- Poor nights (bottom 25%): score ≤ ${q25}`,
          "",
        ];

        // Activity comparison
        const goodActivity = goodNights.filter((n) => n.activity).map((n) => n.activity!);
        const poorActivity = poorNights.filter((n) => n.activity).map((n) => n.activity!);

        if (goodActivity.length >= 3 && poorActivity.length >= 3) {
          lines.push("### Activity Patterns");
          lines.push("");

          const avgGoodSteps = mean(goodActivity.map((a) => a.steps));
          const avgPoorSteps = mean(poorActivity.map((a) => a.steps));
          const avgGoodCal = mean(goodActivity.map((a) => a.active_calories));
          const avgPoorCal = mean(poorActivity.map((a) => a.active_calories));

          lines.push("| Metric | Good Nights | Poor Nights |");
          lines.push("|--------|-------------|-------------|");
          lines.push(`| Steps | ${Math.round(avgGoodSteps).toLocaleString()} | ${Math.round(avgPoorSteps).toLocaleString()} |`);
          lines.push(`| Active Calories | ${Math.round(avgGoodCal)} | ${Math.round(avgPoorCal)} |`);
          lines.push("");

          const stepsDiff = ((avgGoodSteps - avgPoorSteps) / avgPoorSteps) * 100;
          if (Math.abs(stepsDiff) > 10) {
            if (stepsDiff > 0) {
              lines.push(`→ Good sleep nights have ${stepsDiff.toFixed(0)}% more steps on average.`);
            } else {
              lines.push(`→ Good sleep nights have ${Math.abs(stepsDiff).toFixed(0)}% fewer steps on average.`);
            }
          }
          lines.push("");
        }

        // Auto-tracked conditions analysis (workouts and meditation)
        const workoutGood = goodNights.filter((n) => n.hadWorkout).length;
        const workoutPoor = poorNights.filter((n) => n.hadWorkout).length;
        const meditationGood = goodNights.filter((n) => n.hadMeditation).length;
        const meditationPoor = poorNights.filter((n) => n.hadMeditation).length;

        const hasWorkoutData = workoutGood + workoutPoor >= 3;
        const hasMeditationData = meditationGood + meditationPoor >= 3;

        if (hasWorkoutData || hasMeditationData) {
          lines.push("### Auto-Tracked Conditions");
          lines.push("");
          lines.push("| Condition | Good Nights | Poor Nights | Good Rate |");
          lines.push("|-----------|-------------|-------------|-----------|");

          if (hasWorkoutData) {
            const workoutGoodRate = workoutGood / (workoutGood + workoutPoor);
            lines.push(`| Workout | ${workoutGood} | ${workoutPoor} | ${(workoutGoodRate * 100).toFixed(0)}% |`);
          }
          if (hasMeditationData) {
            const meditationGoodRate = meditationGood / (meditationGood + meditationPoor);
            lines.push(`| Meditation/Session | ${meditationGood} | ${meditationPoor} | ${(meditationGoodRate * 100).toFixed(0)}% |`);
          }
          lines.push("");

          // Insights
          if (hasWorkoutData) {
            const workoutGoodRate = workoutGood / (workoutGood + workoutPoor);
            if (workoutGoodRate > 0.6) {
              lines.push(`✓ Workouts are associated with good sleep (${(workoutGoodRate * 100).toFixed(0)}% good nights)`);
            } else if (workoutGoodRate < 0.4) {
              lines.push(`⚠ Workouts may be affecting your sleep negatively (${((1 - workoutGoodRate) * 100).toFixed(0)}% poor nights)`);
            }
          }
          if (hasMeditationData) {
            const meditationGoodRate = meditationGood / (meditationGood + meditationPoor);
            if (meditationGoodRate > 0.6) {
              lines.push(`✓ Meditation/sessions are associated with good sleep (${(meditationGoodRate * 100).toFixed(0)}% good nights)`);
            } else if (meditationGoodRate < 0.4) {
              lines.push(`→ Meditation/sessions don't show a clear positive pattern yet`);
            }
          }
          lines.push("");
        }

        // Tag analysis
        const allTags = new Map<string, { good: number; poor: number; total: number }>();
        goodNights.forEach((n) => {
          n.tags.forEach((tag) => {
            const existing = allTags.get(tag) || { good: 0, poor: 0, total: 0 };
            existing.good++;
            existing.total++;
            allTags.set(tag, existing);
          });
        });
        poorNights.forEach((n) => {
          n.tags.forEach((tag) => {
            const existing = allTags.get(tag) || { good: 0, poor: 0, total: 0 };
            existing.poor++;
            existing.total++;
            allTags.set(tag, existing);
          });
        });

        const significantTags = [...allTags.entries()]
          .filter(([, data]) => data.total >= 3)
          .map(([tag, data]) => ({
            tag,
            ...data,
            goodRate: data.good / (data.good + data.poor),
          }))
          .sort((a, b) => b.goodRate - a.goodRate);

        if (significantTags.length > 0) {
          lines.push("### Tag Impact");
          lines.push("");
          lines.push("| Tag | Good Nights | Poor Nights | Good Rate |");
          lines.push("|-----|-------------|-------------|-----------|");

          significantTags.forEach((t) => {
            lines.push(`| ${t.tag} | ${t.good} | ${t.poor} | ${(t.goodRate * 100).toFixed(0)}% |`);
          });
          lines.push("");

          // Find best and worst tags
          if (significantTags.length >= 2) {
            const bestTag = significantTags[0];
            const worstTag = significantTags[significantTags.length - 1];

            if (bestTag.goodRate > 0.6) {
              lines.push(`✓ "${bestTag.tag}" is associated with good sleep (${(bestTag.goodRate * 100).toFixed(0)}% good nights)`);
            }
            if (worstTag.goodRate < 0.4) {
              lines.push(`⚠ "${worstTag.tag}" is associated with poor sleep (${((1 - worstTag.goodRate) * 100).toFixed(0)}% poor nights)`);
            }
          }
          lines.push("");
        }

        // Day of week patterns
        const dowGood = new Map<number, number>();
        const dowPoor = new Map<number, number>();
        const dowNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

        goodNights.forEach((n) => {
          const dow = new Date(n.day).getDay();
          dowGood.set(dow, (dowGood.get(dow) || 0) + 1);
        });
        poorNights.forEach((n) => {
          const dow = new Date(n.day).getDay();
          dowPoor.set(dow, (dowPoor.get(dow) || 0) + 1);
        });

        lines.push("### Day of Week");
        lines.push("");

        let bestDay = -1;
        let bestDayRate = 0;
        let worstDay = -1;
        let worstDayRate = 1;

        for (let dow = 0; dow < 7; dow++) {
          const good = dowGood.get(dow) || 0;
          const poor = dowPoor.get(dow) || 0;
          if (good + poor >= 2) {
            const rate = good / (good + poor);
            if (rate > bestDayRate) {
              bestDayRate = rate;
              bestDay = dow;
            }
            if (rate < worstDayRate) {
              worstDayRate = rate;
              worstDay = dow;
            }
          }
        }

        if (bestDay >= 0 && worstDay >= 0 && bestDay !== worstDay) {
          lines.push(`- Best sleep: **${dowNames[bestDay]}** nights (${(bestDayRate * 100).toFixed(0)}% good)`);
          lines.push(`- Worst sleep: **${dowNames[worstDay]}** nights (${((1 - worstDayRate) * 100).toFixed(0)}% poor)`);
        }

        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
        };
      } catch (error) {
        return {
          content: [{ type: "text" as const, text: formatError(error) }],
        };
      }
    }
  );

  // ─────────────────────────────────────────────────────────────
  // analyze_hrv_trend tool
  // ─────────────────────────────────────────────────────────────
  server.registerTool(
    "analyze_hrv_trend",
    {
      description:
        "Analyze your HRV (Heart Rate Variability) trend over time. HRV is a key indicator of recovery and stress. Shows trend direction, rolling averages, and identifies recovery patterns.",
      inputSchema: {
        days: z.number().optional().describe("Number of days to analyze (default: 30)"),
      },
    },
    async ({ days = 30 }) => {
      try {
        const endDate = getToday();
        const startDate = getDaysAgo(days);

        const sleepResult = await client.getSleep(startDate, endDate);
        const sessions = sleepResult.data.filter((s) => s.type === "long_sleep" && s.average_hrv != null);

        if (sessions.length < 5) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Need at least 5 nights of HRV data for analysis. Found ${sessions.length} nights with HRV in the past ${days} days.`,
              },
            ],
          };
        }

        const hrvValues = sessions.map((s) => s.average_hrv!);
        const hrvData = sessions.map((s) => ({ date: s.day, value: s.average_hrv! }));

        const lines = [
          `## HRV Trend Analysis (${days} days)`,
          "",
        ];

        // Overall stats
        const stats = dispersion(hrvValues);
        lines.push("### Overview");
        lines.push(`- **Current HRV:** ${Math.round(hrvValues[hrvValues.length - 1])} ms`);
        lines.push(`- **Average:** ${Math.round(stats.mean)} ms`);
        lines.push(`- **Range:** ${Math.round(stats.min)} - ${Math.round(stats.max)} ms`);
        lines.push(`- **Variability (CV):** ${stats.coefficientOfVariation.toFixed(0)}%`);
        lines.push("");

        // Trend analysis
        const hrvTrend = trend(hrvValues);
        lines.push("### Trend");

        if (hrvTrend.direction === "improving") {
          lines.push(`↑ HRV is **increasing** over this period`);
          if (hrvTrend.significant) {
            lines.push(`  *(Statistically significant, p=${hrvTrend.pValue.toFixed(3)})*`);
          }
          lines.push("");
          lines.push("This suggests improving recovery and stress resilience.");
        } else if (hrvTrend.direction === "declining") {
          lines.push(`↓ HRV is **decreasing** over this period`);
          if (hrvTrend.significant) {
            lines.push(`  *(Statistically significant, p=${hrvTrend.pValue.toFixed(3)})*`);
          }
          lines.push("");
          lines.push("This may indicate accumulated stress, overtraining, or illness.");
        } else {
          lines.push(`→ HRV is **stable** over this period`);
          lines.push("");
          lines.push("Your recovery capacity is consistent.");
        }
        lines.push("");

        // Rolling averages
        if (hrvValues.length >= 7) {
          const rolling = rollingAverages(hrvValues);
          lines.push("### Rolling Averages");
          lines.push(`- Last 7 days: ${Math.round(rolling.day7.value)} ms`);
          if (hrvValues.length >= 14) {
            lines.push(`- Last 14 days: ${Math.round(rolling.day14.value)} ms`);
          }
          if (hrvValues.length >= 30) {
            lines.push(`- Last 30 days: ${Math.round(rolling.day30.value)} ms`);
          }
          lines.push("");

          // Short vs long term comparison
          if (hrvValues.length >= 14) {
            const shortTerm = rolling.day7.value;
            const longTerm = hrvValues.length >= 30 ? rolling.day30.value : rolling.day14.value;
            const diff = ((shortTerm - longTerm) / longTerm) * 100;

            if (diff > 5) {
              lines.push(`✓ Recent HRV is ${diff.toFixed(0)}% above baseline - good recovery.`);
            } else if (diff < -5) {
              lines.push(`⚠ Recent HRV is ${Math.abs(diff).toFixed(0)}% below baseline - may need more recovery.`);
            } else {
              lines.push(`→ Recent HRV is close to baseline.`);
            }
            lines.push("");
          }
        }

        // Day of week patterns
        const dowAnalysis = dayOfWeekAnalysis(hrvData);
        lines.push("### Weekly Pattern");
        lines.push(`- **Best HRV:** ${dowAnalysis.bestDay.day} (avg ${Math.round(dowAnalysis.bestDay.average)} ms)`);
        lines.push(`- **Lowest HRV:** ${dowAnalysis.worstDay.day} (avg ${Math.round(dowAnalysis.worstDay.average)} ms)`);
        lines.push(`- **Weekday avg:** ${Math.round(dowAnalysis.weekdayAverage)} ms`);
        lines.push(`- **Weekend avg:** ${Math.round(dowAnalysis.weekendAverage)} ms`);

        // Outliers
        const outliers = detectOutliers(hrvValues);
        if (outliers.outliers.length > 0) {
          lines.push("");
          lines.push("### Unusual Nights");
          outliers.outliers.forEach((o) => {
            const session = sessions[o.index];
            const direction = o.value < stats.mean ? "low" : "high";
            lines.push(`- ${session.day}: ${Math.round(o.value)} ms (unusually ${direction})`);
          });
        }

        // Most recent night's HRV recovery pattern
        const mostRecent = sessions[sessions.length - 1];
        const hrvSamples = mostRecent.hrv?.items?.filter((v): v is number => v !== null) ?? [];
        if (hrvSamples.length >= 4) {
          const recovery = hrvRecoveryPattern(hrvSamples);
          if (recovery.pattern !== "insufficient_data") {
            lines.push("");
            lines.push("### Last Night's Recovery Pattern");
            lines.push(`- **Pattern:** ${recovery.pattern.replace(/_/g, " ")}`);
            lines.push(`- First half avg: ${recovery.firstHalfAvg} ms`);
            lines.push(`- Second half avg: ${recovery.secondHalfAvg} ms`);
            lines.push(`- ${recovery.interpretation}`);
          }
        }

        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
        };
      } catch (error) {
        return {
          content: [{ type: "text" as const, text: formatError(error) }],
        };
      }
    }
  );

  // ─────────────────────────────────────────────────────────────
  // analyze_adherence tool
  // ─────────────────────────────────────────────────────────────
  server.registerTool(
    "analyze_adherence",
    {
      description:
        "Analyze how consistently you wear your Oura ring. Shows daily non-wear time, identifies gaps in data, and calculates adherence percentage. Useful for understanding data quality.",
      inputSchema: {
        days: z.number().optional().describe("Number of days to analyze (default: 30)"),
      },
    },
    async ({ days = 30 }) => {
      try {
        const endDate = getToday();
        const startDate = getDaysAgo(days);

        const activityResult = await client.getDailyActivity(startDate, endDate);
        const data = activityResult.data;

        if (data.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No activity data found for the past ${days} days.`,
              },
            ],
          };
        }

        const lines = [
          `## Ring Adherence Analysis (${days} days)`,
          "",
        ];

        // Calculate total days in range
        const startMs = new Date(startDate).getTime();
        const endMs = new Date(endDate).getTime();
        const totalDaysInRange = Math.ceil((endMs - startMs) / (1000 * 60 * 60 * 24)) + 1;

        // Data coverage
        const daysWithData = data.length;
        const missingDays = totalDaysInRange - daysWithData;
        const coveragePercent = Math.round((daysWithData / totalDaysInRange) * 100);

        lines.push("### Data Coverage");
        lines.push(`- Days with data: ${daysWithData} of ${totalDaysInRange} (${coveragePercent}%)`);
        if (missingDays > 0) {
          lines.push(`- Missing days: ${missingDays}`);
        }
        lines.push("");

        // Non-wear time analysis
        const nonWearTimes = data.map(d => d.non_wear_time ?? 0);
        const totalNonWear = nonWearTimes.reduce((a, b) => a + b, 0);
        const avgNonWear = totalNonWear / nonWearTimes.length;

        lines.push("### Non-Wear Time");
        lines.push(`- Average: ${formatDuration(avgNonWear)}/day`);
        lines.push(`- Total: ${formatDuration(totalNonWear)} over ${daysWithData} days`);

        // Days with high non-wear (> 4 hours)
        const highNonWearDays = data.filter(d => (d.non_wear_time ?? 0) > 4 * 3600);
        if (highNonWearDays.length > 0) {
          lines.push(`- Days with >4h non-wear: ${highNonWearDays.length}`);
          if (highNonWearDays.length <= 5) {
            lines.push("  " + highNonWearDays.map(d => `${d.day} (${formatDuration(d.non_wear_time ?? 0)})`).join(", "));
          }
        }
        lines.push("");

        // Adherence score (percentage of time ring was worn)
        // Assuming 24h day, calculate % of time worn
        const totalPossibleSeconds = daysWithData * 24 * 3600;
        const wearPercent = Math.round(((totalPossibleSeconds - totalNonWear) / totalPossibleSeconds) * 100);

        lines.push("### Adherence Score");
        lines.push(`- **${wearPercent}%** of time wearing ring`);
        if (wearPercent >= 90) {
          lines.push("- ✓ Excellent adherence - data quality is high");
        } else if (wearPercent >= 75) {
          lines.push("- Good adherence - some data may be missing");
        } else if (wearPercent >= 50) {
          lines.push("- ⚠ Moderate adherence - consider wearing ring more consistently");
        } else {
          lines.push("- ⚠ Low adherence - data quality may be affected");
        }
        lines.push("");

        // Identify data gaps (missing consecutive days)
        const allDays = new Set(data.map(d => d.day));
        const gaps: { start: string; end: string; days: number }[] = [];
        let currentDate = new Date(startDate);
        let gapStart: string | null = null;
        let gapDays = 0;

        while (currentDate <= new Date(endDate)) {
          const dateStr = currentDate.toISOString().split("T")[0];
          if (!allDays.has(dateStr)) {
            if (!gapStart) gapStart = dateStr;
            gapDays++;
          } else {
            if (gapStart && gapDays > 1) {
              const prevDate = new Date(currentDate);
              prevDate.setDate(prevDate.getDate() - 1);
              gaps.push({ start: gapStart, end: prevDate.toISOString().split("T")[0], days: gapDays });
            }
            gapStart = null;
            gapDays = 0;
          }
          currentDate.setDate(currentDate.getDate() + 1);
        }
        // Handle gap at end
        if (gapStart && gapDays > 1) {
          gaps.push({ start: gapStart, end: endDate, days: gapDays });
        }

        if (gaps.length > 0) {
          lines.push("### Data Gaps (2+ days)");
          for (const gap of gaps) {
            lines.push(`- ${gap.start} to ${gap.end} (${gap.days} days)`);
          }
        }

        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
        };
      } catch (error) {
        return {
          content: [{ type: "text" as const, text: formatError(error) }],
        };
      }
    }
  );

  // ─────────────────────────────────────────────────────────────
  // get_sleep_time tool
  // ─────────────────────────────────────────────────────────────
  server.registerTool(
    "get_sleep_time",
    {
      description:
        "Get Oura's personalized bedtime recommendations. Shows your ideal bedtime window based on your sleep patterns and circadian rhythm.",
      inputSchema: {
        start_date: z.string().optional().describe("Start date in YYYY-MM-DD format. Defaults to today."),
        end_date: z.string().optional().describe("End date in YYYY-MM-DD format. Defaults to start_date."),
      },
    },
    async ({ start_date, end_date }) => {
      try {
        const startDate = start_date || getToday();
        const endDate = end_date || startDate;

        const response = await client.getSleepTime(startDate, endDate);

        if (response.data.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No sleep time recommendations found for ${startDate}${startDate !== endDate ? ` to ${endDate}` : ""}. Oura needs enough data to generate bedtime recommendations.`,
              },
            ],
          };
        }

        const formatted = response.data.map((st: SleepTime) => {
          const lines = [`## Bedtime Recommendation: ${st.day}`];

          if (st.recommendation === "improve_efficiency") {
            lines.push("**Status:** Working on improving sleep efficiency");
          } else if (st.recommendation === "earlier_bedtime") {
            lines.push("**Status:** Consider going to bed earlier");
          } else if (st.recommendation === "later_bedtime") {
            lines.push("**Status:** Consider going to bed later");
          } else if (st.recommendation === "follow_optimal_bedtime") {
            lines.push("**Status:** Following optimal bedtime");
          } else if (st.recommendation) {
            lines.push(`**Status:** ${st.recommendation}`);
          }

          if (st.optimal_bedtime?.day_tz) {
            lines.push("");
            lines.push("**Optimal Bedtime Window:**");
            const startTime = st.optimal_bedtime.start_offset !== undefined
              ? new Date(new Date(st.optimal_bedtime.day_tz).getTime() + st.optimal_bedtime.start_offset * 1000).toISOString()
              : undefined;
            const endTime = st.optimal_bedtime.end_offset !== undefined
              ? new Date(new Date(st.optimal_bedtime.day_tz).getTime() + st.optimal_bedtime.end_offset * 1000).toISOString()
              : undefined;
            lines.push(`- Start: ${startTime ? formatTime(startTime) : "N/A"}`);
            lines.push(`- End: ${endTime ? formatTime(endTime) : "N/A"}`);
          }

          return lines.join("\n");
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
          content: [{ type: "text" as const, text: formatError(error) }],
        };
      }
    }
  );

  // ─────────────────────────────────────────────────────────────
  // get_rest_mode tool
  // ─────────────────────────────────────────────────────────────
  server.registerTool(
    "get_rest_mode",
    {
      description:
        "Get rest mode periods when you've enabled rest mode in the Oura app (typically during illness or recovery). Shows when rest mode was active and any notes.",
      inputSchema: {
        start_date: z.string().optional().describe("Start date in YYYY-MM-DD format. Defaults to 30 days ago."),
        end_date: z.string().optional().describe("End date in YYYY-MM-DD format. Defaults to today."),
      },
    },
    async ({ start_date, end_date }) => {
      try {
        const endDate = end_date || getToday();
        const startDate = start_date || getDaysAgo(30);

        const response = await client.getRestModePeriods(startDate, endDate);

        if (response.data.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `No rest mode periods found between ${startDate} and ${endDate}. Rest mode is enabled manually in the Oura app when you need extra recovery time.`,
              },
            ],
          };
        }

        const formatted = response.data.map((rm: RestModePeriod) => {
          const lines = [`## Rest Mode Period`];
          lines.push(`- **Start:** ${rm.start_day}`);
          if (rm.end_day) {
            lines.push(`- **End:** ${rm.end_day}`);
            // Calculate duration
            const start = new Date(rm.start_day);
            const end = new Date(rm.end_day);
            const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
            lines.push(`- **Duration:** ${days} day${days > 1 ? "s" : ""}`);
          } else {
            lines.push("- **Status:** Currently active");
          }

          // Episodes within the rest mode period
          if (rm.episodes && rm.episodes.length > 0) {
            lines.push("");
            lines.push("**Episodes:**");
            for (const ep of rm.episodes) {
              lines.push(`- ${ep.timestamp}: ${ep.tags?.join(", ") || "No tags"}`);
            }
          }

          return lines.join("\n");
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
          content: [{ type: "text" as const, text: formatError(error) }],
        };
      }
    }
  );

  // ─────────────────────────────────────────────────────────────
  // get_ring_info tool
  // ─────────────────────────────────────────────────────────────
  server.registerTool(
    "get_ring_info",
    {
      description:
        "Get information about your Oura ring hardware including model, color, firmware version, and configuration.",
      inputSchema: {},
    },
    async () => {
      try {
        const response = await client.getRingConfiguration();

        if (response.data.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: "No ring configuration found. Make sure your ring is set up in the Oura app.",
              },
            ],
          };
        }

        const formatted = response.data.map((ring: RingConfiguration) => {
          const lines = [`## Oura Ring`];

          if (ring.color) {
            lines.push(`- **Color:** ${ring.color}`);
          }
          if (ring.design) {
            lines.push(`- **Design:** ${ring.design}`);
          }
          if (ring.firmware_version) {
            lines.push(`- **Firmware:** ${ring.firmware_version}`);
          }
          if (ring.hardware_type) {
            lines.push(`- **Hardware Type:** ${ring.hardware_type}`);
          }
          if (ring.set_up_at) {
            lines.push(`- **Set Up:** ${ring.set_up_at}`);
          }
          if (ring.size !== undefined) {
            lines.push(`- **Size:** ${ring.size}`);
          }

          return lines.join("\n");
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
          content: [{ type: "text" as const, text: formatError(error) }],
        };
      }
    }
  );

  // ─────────────────────────────────────────────────────────────
  // get_personal_info tool
  // ─────────────────────────────────────────────────────────────
  server.registerTool(
    "get_personal_info",
    {
      description:
        "Get your Oura profile information including age, weight, height, and biological sex. This data is used by Oura to personalize insights.",
      inputSchema: {},
    },
    async () => {
      try {
        const response: PersonalInfo = await client.getPersonalInfo();

        const lines = [`## Personal Info`];

        if (response.age !== undefined) {
          lines.push(`- **Age:** ${response.age}`);
        }
        if (response.weight !== undefined) {
          lines.push(`- **Weight:** ${response.weight} kg`);
        }
        if (response.height !== undefined) {
          lines.push(`- **Height:** ${response.height} cm`);
        }
        if (response.biological_sex) {
          lines.push(`- **Biological Sex:** ${response.biological_sex}`);
        }
        if (response.email) {
          lines.push(`- **Email:** ${response.email}`);
        }

        return {
          content: [
            {
              type: "text" as const,
              text: lines.join("\n"),
            },
          ],
        };
      } catch (error) {
        return {
          content: [{ type: "text" as const, text: formatError(error) }],
        };
      }
    }
  );

  // ─────────────────────────────────────────────────────────────
  // analyze_temperature tool
  // ─────────────────────────────────────────────────────────────
  server.registerTool(
    "analyze_temperature",
    {
      description:
        "Analyze body temperature patterns from readiness data. Temperature deviations can indicate illness, menstrual cycle phases, or environmental factors. Shows trends and flags unusual readings.",
      inputSchema: {
        days: z.number().optional().describe("Number of days to analyze (default: 30)"),
      },
    },
    async ({ days = 30 }) => {
      try {
        const endDate = getToday();
        const startDate = getDaysAgo(days);

        const response = await client.getDailyReadiness(startDate, endDate);
        const data = response.data.filter(r => r.temperature_deviation !== null && r.temperature_deviation !== undefined);

        if (data.length < 5) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Need at least 5 days of temperature data for analysis. Found ${data.length} days with temperature readings in the past ${days} days.`,
              },
            ],
          };
        }

        const temps = data.map(r => r.temperature_deviation!);
        const tempData = data.map(r => ({ date: r.day, value: r.temperature_deviation! }));

        const lines = [
          `## Body Temperature Analysis (${days} days)`,
          "",
        ];

        // Overview
        const stats = dispersion(temps);
        lines.push("### Overview");
        lines.push(`- **Current:** ${temps[temps.length - 1] >= 0 ? "+" : ""}${temps[temps.length - 1].toFixed(2)}°C from baseline`);
        lines.push(`- **Average deviation:** ${stats.mean >= 0 ? "+" : ""}${stats.mean.toFixed(2)}°C`);
        lines.push(`- **Range:** ${stats.min.toFixed(2)}°C to ${stats.max >= 0 ? "+" : ""}${stats.max.toFixed(2)}°C`);
        lines.push("");

        // Trend
        const tempTrend = trend(temps);
        lines.push("### Trend");
        if (tempTrend.direction === "improving") {
          // For temperature, "improving" means increasing (slope > 0)
          lines.push("↑ Temperature is **trending up** - could indicate:");
          lines.push("  - Onset of illness");
          lines.push("  - Luteal phase (for menstrual cycles)");
          lines.push("  - Increased stress or inflammation");
        } else if (tempTrend.direction === "declining") {
          lines.push("↓ Temperature is **trending down** - could indicate:");
          lines.push("  - Recovery from illness");
          lines.push("  - Follicular phase (for menstrual cycles)");
          lines.push("  - Good recovery");
        } else {
          lines.push("→ Temperature is **stable**");
        }
        lines.push("");

        // Elevated days (potential illness)
        const elevatedDays = data.filter(r => r.temperature_deviation! > 0.5);
        if (elevatedDays.length > 0) {
          lines.push("### Elevated Days (>+0.5°C)");
          lines.push("*May indicate illness, stress, or hormonal changes*");
          lines.push("");
          for (const day of elevatedDays.slice(-5)) {
            lines.push(`- ${day.day}: +${day.temperature_deviation!.toFixed(2)}°C`);
          }
          if (elevatedDays.length > 5) {
            lines.push(`- ... and ${elevatedDays.length - 5} more days`);
          }
          lines.push("");
        }

        // Weekly pattern
        const dowAnalysis = dayOfWeekAnalysis(tempData);
        lines.push("### Weekly Pattern");
        lines.push(`- **Highest avg:** ${dowAnalysis.bestDay.day} (${dowAnalysis.bestDay.average >= 0 ? "+" : ""}${dowAnalysis.bestDay.average.toFixed(2)}°C)`);
        lines.push(`- **Lowest avg:** ${dowAnalysis.worstDay.day} (${dowAnalysis.worstDay.average >= 0 ? "+" : ""}${dowAnalysis.worstDay.average.toFixed(2)}°C)`);
        lines.push("");

        // Body temperature contributor from readiness
        const tempContributors = data
          .filter(r => r.contributors?.body_temperature !== null && r.contributors?.body_temperature !== undefined)
          .map(r => r.contributors!.body_temperature!);

        if (tempContributors.length > 0) {
          const avgContributor = tempContributors.reduce((a, b) => a + b, 0) / tempContributors.length;
          lines.push("### Impact on Readiness");
          lines.push(`- Average temperature contributor: ${Math.round(avgContributor)}/100`);
          if (avgContributor < 70) {
            lines.push("- ⚠ Temperature is negatively affecting your readiness");
          } else {
            lines.push("- ✓ Temperature is within healthy range for readiness");
          }
        }

        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
        };
      } catch (error) {
        return {
          content: [{ type: "text" as const, text: formatError(error) }],
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
