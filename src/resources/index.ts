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
  formatTime,
  getToday,
  getDaysAgo,
  percentage,
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

      // Fetch all data in parallel (including detailed sleep sessions)
      const [sleepScoreResult, sleepSessionResult, readinessResult, activityResult, stressResult] = await Promise.allSettled([
        client.getDailySleep(today, today),
        client.getSleep(today, today),
        client.getDailyReadiness(today, today),
        client.getDailyActivity(today, today),
        client.getDailyStress(today, today),
      ]);

      // Sleep - combine score and detailed session data
      const hasScore = sleepScoreResult.status === "fulfilled" && sleepScoreResult.value.data.length > 0;
      const hasSession = sleepSessionResult.status === "fulfilled" && sleepSessionResult.value.data.length > 0;

      if (hasScore || hasSession) {
        sections.push("## Sleep");

        // Score from daily_sleep
        if (hasScore) {
          const sleep = sleepScoreResult.value.data[0];
          sections.push(`- Score: ${formatScore(sleep.score ?? null)}`);
        }

        // Detailed data from sleep sessions (use the longest/main session)
        if (hasSession) {
          const sessions = sleepSessionResult.value.data;
          // Find the main sleep session (longest one)
          const mainSession = sessions.reduce((longest, current) =>
            (current.total_sleep_duration ?? 0) > (longest.total_sleep_duration ?? 0) ? current : longest
          );

          const totalSleep = mainSession.total_sleep_duration ?? 0;
          const timeInBed = mainSession.time_in_bed ?? 0;
          const deepSleep = mainSession.deep_sleep_duration ?? 0;
          const remSleep = mainSession.rem_sleep_duration ?? 0;
          const lightSleep = mainSession.light_sleep_duration ?? 0;

          sections.push(`- Total Sleep: ${formatDuration(totalSleep)} (of ${formatDuration(timeInBed)} in bed)`);
          sections.push(`- Efficiency: ${percentage(totalSleep, timeInBed)}%`);
          sections.push(`- Bedtime: ${formatTime(mainSession.bedtime_start)} → ${formatTime(mainSession.bedtime_end)}`);
          sections.push("");
          sections.push("**Sleep Stages:**");
          sections.push(`- Deep: ${formatDuration(deepSleep)} (${percentage(deepSleep, totalSleep)}%)`);
          sections.push(`- REM: ${formatDuration(remSleep)} (${percentage(remSleep, totalSleep)}%)`);
          sections.push(`- Light: ${formatDuration(lightSleep)} (${percentage(lightSleep, totalSleep)}%)`);

          // Biometrics
          if (mainSession.average_heart_rate || mainSession.average_hrv) {
            sections.push("");
            sections.push("**Biometrics:**");
            if (mainSession.lowest_heart_rate) {
              sections.push(`- Resting HR: ${mainSession.lowest_heart_rate} bpm`);
            }
            if (mainSession.average_hrv) {
              sections.push(`- Avg HRV: ${mainSession.average_hrv} ms`);
            }
            if (mainSession.average_breath) {
              sections.push(`- Breathing Rate: ${mainSession.average_breath} breaths/min`);
            }
          }
        }

        // Contributors from daily_sleep (if no detailed session)
        if (hasScore && !hasSession) {
          const sleep = sleepScoreResult.value.data[0];
          if (sleep.contributors) {
            const c = sleep.contributors;
            sections.push(`- Contributors: Deep sleep ${c.deep_sleep ?? "N/A"}, REM ${c.rem_sleep ?? "N/A"}, Efficiency ${c.efficiency ?? "N/A"}, Timing ${c.timing ?? "N/A"}`);
          }
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

      // Fetch all data in parallel (including detailed sleep sessions for duration averages)
      const [sleepScoreResult, sleepSessionResult, readinessResult, activityResult] = await Promise.allSettled([
        client.getDailySleep(weekAgo, today),
        client.getSleep(weekAgo, today),
        client.getDailyReadiness(weekAgo, today),
        client.getDailyActivity(weekAgo, today),
      ]);

      // Sleep Summary - combine scores and detailed sessions
      const hasScores = sleepScoreResult.status === "fulfilled" && sleepScoreResult.value.data.length > 0;
      const hasSessions = sleepSessionResult.status === "fulfilled" && sleepSessionResult.value.data.length > 0;

      if (hasScores || hasSessions) {
        sections.push("## Sleep");

        // Scores from daily_sleep
        if (hasScores) {
          const sleepData = sleepScoreResult.value.data;
          const scores = sleepData.map(s => s.score).filter((s): s is number => s !== null && s !== undefined);

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
        }

        // Detailed duration averages from sleep sessions
        if (hasSessions) {
          const sessions = sleepSessionResult.value.data;

          // Get main session per day (longest one)
          const sessionsByDay = new Map<string, typeof sessions[0]>();
          for (const session of sessions) {
            const existing = sessionsByDay.get(session.day);
            if (!existing || (session.total_sleep_duration ?? 0) > (existing.total_sleep_duration ?? 0)) {
              sessionsByDay.set(session.day, session);
            }
          }
          const mainSessions = Array.from(sessionsByDay.values());

          // Calculate averages
          const durations = mainSessions.map(s => s.total_sleep_duration ?? 0).filter(d => d > 0);
          const deepDurations = mainSessions.map(s => s.deep_sleep_duration ?? 0);
          const remDurations = mainSessions.map(s => s.rem_sleep_duration ?? 0);
          const hrvValues = mainSessions.map(s => s.average_hrv).filter((h): h is number => h !== null && h !== undefined);

          if (durations.length > 0) {
            const avgDuration = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
            const avgDeep = Math.round(deepDurations.reduce((a, b) => a + b, 0) / deepDurations.length);
            const avgRem = Math.round(remDurations.reduce((a, b) => a + b, 0) / remDurations.length);

            sections.push("");
            sections.push("**Sleep Duration:**");
            sections.push(`- Average: ${formatDuration(avgDuration)}/night`);
            sections.push(`- Deep: ${formatDuration(avgDeep)} avg (${percentage(avgDeep, avgDuration)}%)`);
            sections.push(`- REM: ${formatDuration(avgRem)} avg (${percentage(avgRem, avgDuration)}%)`);
          }

          if (hrvValues.length > 0) {
            const avgHrv = Math.round(hrvValues.reduce((a, b) => a + b, 0) / hrvValues.length);
            sections.push(`- Avg HRV: ${avgHrv} ms`);
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
