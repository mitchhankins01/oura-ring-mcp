/**
 * MCP Tools for Oura Ring data
 *
 * Phase 1: Basic sleep tool
 * Phase 2: Add readiness, activity
 * Phase 3: Add derived/smart tools (compare, correlate, trends)
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { OuraClient, SleepSession } from "../client.js";
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
    }
  );
}

// ─────────────────────────────────────────────────────────────
// Formatting helpers
// ─────────────────────────────────────────────────────────────

function formatSleepSession(session: SleepSession): string {
  const efficiency = percentage(session.total_sleep_duration, session.time_in_bed);

  const lines = [
    `## Sleep: ${session.day}`,
    `**Bedtime:** ${formatTime(session.bedtime_start)} → ${formatTime(session.bedtime_end)}`,
    `**Total Sleep:** ${formatDuration(session.total_sleep_duration)} (of ${formatDuration(session.time_in_bed)} in bed)`,
    `**Efficiency:** ${efficiency}%`,
    "",
    "**Sleep Stages:**",
    `- Deep: ${formatDuration(session.deep_sleep_duration)} (${percentage(session.deep_sleep_duration, session.total_sleep_duration)}%)`,
    `- REM: ${formatDuration(session.rem_sleep_duration)} (${percentage(session.rem_sleep_duration, session.total_sleep_duration)}%)`,
    `- Light: ${formatDuration(session.light_sleep_duration)} (${percentage(session.light_sleep_duration, session.total_sleep_duration)}%)`,
    `- Awake: ${formatDuration(session.awake_time)}`,
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
