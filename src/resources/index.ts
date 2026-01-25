/**
 * MCP Resources for Oura Ring data
 *
 * Resources provide read-only data that clients can access via URIs.
 * Unlike tools, resources don't take parameters - they represent static or dynamic data.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { OuraClient } from "../client.js";
import {
  formatDuration,
  formatScore,
  formatSleepStages,
  formatTime,
  getToday,
  getDaysAgo,
} from "../utils/formatters.js";

/**
 * Register all MCP resources with the server
 */
export function registerResources(server: McpServer, client: OuraClient): void {
  // ─────────────────────────────────────────────────────────────
  // oura://today - Today's health summary
  // ─────────────────────────────────────────────────────────────

  server.registerResource(
    "today",
    "oura://today",
    {
      description: "Today's health summary including sleep, readiness, activity, and stress scores",
      mimeType: "text/plain",
    },
    async () => {
      const today = getToday();
      const sections: string[] = [];

      sections.push(`# Oura Health Summary for ${today}\n`);

      // Fetch all data in parallel
      const [sleepResult, readinessResult, activityResult, stressResult] = await Promise.allSettled([
        client.getDailySleep(today, today),
        client.getDailyReadiness(today, today),
        client.getDailyActivity(today, today),
        client.getDailyStress(today, today),
      ]);

      // Sleep
      if (sleepResult.status === "fulfilled" && sleepResult.value.data.length > 0) {
        const sleep = sleepResult.value.data[0];
        sections.push("## Sleep");
        sections.push(`- Score: ${formatScore(sleep.score ?? null)}`);
        if (sleep.contributors) {
          const c = sleep.contributors;
          sections.push(`- Contributors: Deep sleep ${c.deep_sleep ?? "N/A"}, REM ${c.rem_sleep ?? "N/A"}, Efficiency ${c.efficiency ?? "N/A"}, Timing ${c.timing ?? "N/A"}`);
        }
        sections.push("");
      } else {
        sections.push("## Sleep\n- No sleep data for today (ring may not have synced yet)\n");
      }

      // Readiness
      if (readinessResult.status === "fulfilled" && readinessResult.value.data.length > 0) {
        const readiness = readinessResult.value.data[0];
        sections.push("## Readiness");
        sections.push(`- Score: ${formatScore(readiness.score ?? null)}`);
        if (readiness.contributors) {
          const c = readiness.contributors;
          sections.push(`- Contributors: HRV Balance ${c.hrv_balance ?? "N/A"}, Recovery ${c.recovery_index ?? "N/A"}, Sleep Balance ${c.sleep_balance ?? "N/A"}`);
        }
        sections.push("");
      } else {
        sections.push("## Readiness\n- No readiness data for today\n");
      }

      // Activity
      if (activityResult.status === "fulfilled" && activityResult.value.data.length > 0) {
        const activity = activityResult.value.data[0];
        sections.push("## Activity");
        sections.push(`- Score: ${formatScore(activity.score ?? null)}`);
        sections.push(`- Steps: ${activity.steps?.toLocaleString() ?? "N/A"}`);
        sections.push(`- Active Calories: ${activity.active_calories ?? "N/A"} kcal`);
        if (activity.high_activity_time !== undefined) {
          sections.push(`- High Activity: ${formatDuration(activity.high_activity_time)}`);
        }
        sections.push("");
      } else {
        sections.push("## Activity\n- No activity data for today\n");
      }

      // Stress
      if (stressResult.status === "fulfilled" && stressResult.value.data.length > 0) {
        const stress = stressResult.value.data[0];
        sections.push("## Stress");
        if (stress.stress_high != null) {
          sections.push(`- High Stress: ${formatDuration(stress.stress_high)}`);
        }
        if (stress.recovery_high != null) {
          sections.push(`- Recovery Time: ${formatDuration(stress.recovery_high)}`);
        }
        if (stress.day_summary) {
          sections.push(`- Day Summary: ${stress.day_summary}`);
        }
        sections.push("");
      } else {
        sections.push("## Stress\n- No stress data for today\n");
      }

      return {
        contents: [
          {
            uri: "oura://today",
            mimeType: "text/plain",
            text: sections.join("\n"),
          },
        ],
      };
    }
  );

  // ─────────────────────────────────────────────────────────────
  // oura://weekly-summary - Last 7 days summary
  // ─────────────────────────────────────────────────────────────

  server.registerResource(
    "weekly-summary",
    "oura://weekly-summary",
    {
      description: "Weekly health summary with averages and trends for the past 7 days",
      mimeType: "text/plain",
    },
    async () => {
      const today = getToday();
      const weekAgo = getDaysAgo(7);
      const sections: string[] = [];

      sections.push(`# Oura Weekly Summary (${weekAgo} to ${today})\n`);

      // Fetch all data in parallel
      const [sleepResult, readinessResult, activityResult] = await Promise.allSettled([
        client.getDailySleep(weekAgo, today),
        client.getDailyReadiness(weekAgo, today),
        client.getDailyActivity(weekAgo, today),
      ]);

      // Sleep Summary
      if (sleepResult.status === "fulfilled" && sleepResult.value.data.length > 0) {
        const sleepData = sleepResult.value.data;
        const scores = sleepData.map(s => s.score).filter((s): s is number => s !== null && s !== undefined);

        sections.push("## Sleep");
        sections.push(`- Days with data: ${sleepData.length}`);

        if (scores.length > 0) {
          const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
          const minScore = Math.min(...scores);
          const maxScore = Math.max(...scores);
          sections.push(`- Average Score: ${formatScore(avgScore)}`);
          sections.push(`- Range: ${minScore} - ${maxScore}`);

          // Best and worst days
          const sortedByScore = [...sleepData].filter(s => s.score != null).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
          if (sortedByScore.length > 0) {
            sections.push(`- Best day: ${sortedByScore[0].day} (${sortedByScore[0].score})`);
            sections.push(`- Worst day: ${sortedByScore[sortedByScore.length - 1].day} (${sortedByScore[sortedByScore.length - 1].score})`);
          }
        }
        sections.push("");
      } else {
        sections.push("## Sleep\n- No sleep data for this week\n");
      }

      // Readiness Summary
      if (readinessResult.status === "fulfilled" && readinessResult.value.data.length > 0) {
        const readinessData = readinessResult.value.data;
        const scores = readinessData.map(r => r.score).filter((s): s is number => s !== null && s !== undefined);

        sections.push("## Readiness");
        sections.push(`- Days with data: ${readinessData.length}`);

        if (scores.length > 0) {
          const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
          const minScore = Math.min(...scores);
          const maxScore = Math.max(...scores);
          sections.push(`- Average Score: ${formatScore(avgScore)}`);
          sections.push(`- Range: ${minScore} - ${maxScore}`);

          // Best and worst days
          const sortedByScore = [...readinessData].filter(r => r.score != null).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
          if (sortedByScore.length > 0) {
            sections.push(`- Best day: ${sortedByScore[0].day} (${sortedByScore[0].score})`);
            sections.push(`- Worst day: ${sortedByScore[sortedByScore.length - 1].day} (${sortedByScore[sortedByScore.length - 1].score})`);
          }
        }
        sections.push("");
      } else {
        sections.push("## Readiness\n- No readiness data for this week\n");
      }

      // Activity Summary
      if (activityResult.status === "fulfilled" && activityResult.value.data.length > 0) {
        const activityData = activityResult.value.data;
        const scores = activityData.map(a => a.score).filter((s): s is number => s !== null && s !== undefined);
        const steps = activityData.map(a => a.steps).filter((s): s is number => s !== null && s !== undefined);
        const calories = activityData.map(a => a.active_calories).filter((c): c is number => c !== null && c !== undefined);

        sections.push("## Activity");
        sections.push(`- Days with data: ${activityData.length}`);

        if (scores.length > 0) {
          const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
          sections.push(`- Average Score: ${formatScore(avgScore)}`);
        }

        if (steps.length > 0) {
          const avgSteps = Math.round(steps.reduce((a, b) => a + b, 0) / steps.length);
          const totalSteps = steps.reduce((a, b) => a + b, 0);
          sections.push(`- Average Steps: ${avgSteps.toLocaleString()}/day`);
          sections.push(`- Total Steps: ${totalSteps.toLocaleString()}`);
        }

        if (calories.length > 0) {
          const avgCalories = Math.round(calories.reduce((a, b) => a + b, 0) / calories.length);
          const totalCalories = calories.reduce((a, b) => a + b, 0);
          sections.push(`- Average Active Calories: ${avgCalories} kcal/day`);
          sections.push(`- Total Active Calories: ${totalCalories.toLocaleString()} kcal`);
        }
        sections.push("");
      } else {
        sections.push("## Activity\n- No activity data for this week\n");
      }

      return {
        contents: [
          {
            uri: "oura://weekly-summary",
            mimeType: "text/plain",
            text: sections.join("\n"),
          },
        ],
      };
    }
  );
}
