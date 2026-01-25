/**
 * MCP Resources for Oura Ring data
 *
 * Resources provide read-only data that clients can access via URIs.
 * Unlike tools, resources don't take parameters - they represent static or dynamic data.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { OuraClient, SleepSession, DailyReadiness, DailyActivity } from "../client.js";
import {
  formatDuration,
  formatScore,
  formatTime,
  getToday,
  getDaysAgo,
  percentage,
} from "../utils/formatters.js";
import {
  dispersion,
  trend,
  detectOutliers,
  dayOfWeekAnalysis,
  sleepDebt,
  sleepRegularity,
  sleepStageRatios,
  hrvRecoveryPattern,
} from "../utils/analysis.js";

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

          // Sleep stages with status from sleepStageRatios
          const stageRatios = sleepStageRatios(deepSleep, remSleep, lightSleep);
          sections.push("**Sleep Stages:**");
          sections.push(`- Deep: ${formatDuration(deepSleep)} (${stageRatios.deepPercent.toFixed(0)}%) - ${stageRatios.deepStatus}`);
          sections.push(`- REM: ${formatDuration(remSleep)} (${stageRatios.remPercent.toFixed(0)}%) - ${stageRatios.remStatus}`);
          sections.push(`- Light: ${formatDuration(lightSleep)} (${stageRatios.lightPercent.toFixed(0)}%)`);

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

            // HRV Recovery Pattern (if we have HRV samples)
            const hrvSamples = mainSession.hrv?.items?.filter((v): v is number => v !== null) ?? [];
            if (hrvSamples.length >= 4) {
              const recovery = hrvRecoveryPattern(hrvSamples);
              if (recovery.pattern !== "insufficient_data") {
                sections.push(`- Recovery Pattern: ${recovery.pattern.replace("_", " ")} (first half: ${recovery.firstHalfAvg}ms, second half: ${recovery.secondHalfAvg}ms)`);
              }
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

  // ─────────────────────────────────────────────────────────────
  // oura://baseline - Personal averages and normal ranges (30 days)
  // ─────────────────────────────────────────────────────────────

  server.registerResource(
    "baseline",
    "oura://baseline",
    {
      description: "Your personal health baseline: 30-day averages and normal ranges for sleep, HRV, heart rate, and activity. Use this to understand what's normal for you.",
      mimeType: "text/plain",
    },
    async () => {
      const today = getToday();
      const monthAgo = getDaysAgo(30);
      const sections: string[] = [];

      sections.push(`# Your Personal Baseline (30 days)\n`);
      sections.push(`*Based on data from ${monthAgo} to ${today}*\n`);

      // Fetch all data in parallel
      const [sleepResult, readinessResult, activityResult] = await Promise.allSettled([
        client.getSleep(monthAgo, today),
        client.getDailyReadiness(monthAgo, today),
        client.getDailyActivity(monthAgo, today),
      ]);

      // Filter to only main sleep sessions (exclude naps, rest periods)
      const allSleep = sleepResult.status === "fulfilled" ? sleepResult.value.data : [];
      const sessions: SleepSession[] = allSleep.filter((s) => s.type === "long_sleep");
      const readinessData: DailyReadiness[] = readinessResult.status === "fulfilled" ? readinessResult.value.data : [];
      const activityData: DailyActivity[] = activityResult.status === "fulfilled" ? activityResult.value.data : [];

      // Sleep baseline
      if (sessions.length >= 5) {
        const durations = sessions.map((s) => s.total_sleep_duration ?? 0).filter((d) => d > 0);
        const hrvValues = sessions.map((s) => s.average_hrv).filter((h): h is number => h != null);
        const hrValues = sessions.map((s) => s.lowest_heart_rate).filter((h): h is number => h != null);
        const deepDurations = sessions.map((s) => s.deep_sleep_duration ?? 0);
        const efficiencies = sessions.map((s) => s.efficiency).filter((e): e is number => e != null);

        sections.push("## Sleep");
        sections.push(`- Nights analyzed: ${sessions.length}`);

        if (durations.length > 0) {
          const durationStats = dispersion(durations);
          sections.push(`- **Duration:** ${formatDuration(durationStats.mean)} avg (range: ${formatDuration(durationStats.min)} - ${formatDuration(durationStats.max)})`);
        }

        if (efficiencies.length > 0) {
          const effStats = dispersion(efficiencies);
          sections.push(`- **Efficiency:** ${Math.round(effStats.mean)}% avg (range: ${Math.round(effStats.min)}% - ${Math.round(effStats.max)}%)`);
        }

        if (deepDurations.length > 0) {
          const deepStats = dispersion(deepDurations);
          sections.push(`- **Deep Sleep:** ${formatDuration(deepStats.mean)} avg`);
        }

        if (hrvValues.length > 0) {
          const hrvStats = dispersion(hrvValues);
          const hrvOutliers = detectOutliers(hrvValues);
          sections.push(`- **HRV:** ${Math.round(hrvStats.mean)} ms avg (normal range: ${Math.round(hrvOutliers.lowerBound)}-${Math.round(hrvOutliers.upperBound)} ms)`);
        }

        if (hrValues.length > 0) {
          const hrStats = dispersion(hrValues);
          sections.push(`- **Resting HR:** ${Math.round(hrStats.mean)} bpm avg (range: ${Math.round(hrStats.min)}-${Math.round(hrStats.max)} bpm)`);
        }

        sections.push("");
      } else {
        sections.push("## Sleep\n- Insufficient data (need at least 5 nights)\n");
      }

      // Readiness baseline
      if (readinessData.length >= 5) {
        const scores = readinessData.map((r) => r.score).filter((s): s is number => s != null);

        if (scores.length > 0) {
          const scoreStats = dispersion(scores);
          const scoreOutliers = detectOutliers(scores);

          sections.push("## Readiness");
          sections.push(`- Days analyzed: ${readinessData.length}`);
          sections.push(`- **Score:** ${Math.round(scoreStats.mean)} avg (normal range: ${Math.round(scoreOutliers.lowerBound)}-${Math.round(scoreOutliers.upperBound)})`);
          sections.push("");
        }
      } else {
        sections.push("## Readiness\n- Insufficient data (need at least 5 days)\n");
      }

      // Activity baseline
      if (activityData.length >= 5) {
        const scores = activityData.map((a) => a.score).filter((s): s is number => s != null);
        const steps = activityData.map((a) => a.steps).filter((s): s is number => s != null);
        const calories = activityData.map((a) => a.active_calories).filter((c): c is number => c != null);

        sections.push("## Activity");
        sections.push(`- Days analyzed: ${activityData.length}`);

        if (scores.length > 0) {
          const scoreStats = dispersion(scores);
          sections.push(`- **Score:** ${Math.round(scoreStats.mean)} avg`);
        }

        if (steps.length > 0) {
          const stepStats = dispersion(steps);
          sections.push(`- **Steps:** ${Math.round(stepStats.mean).toLocaleString()} avg/day (range: ${Math.round(stepStats.min).toLocaleString()}-${Math.round(stepStats.max).toLocaleString()})`);
        }

        if (calories.length > 0) {
          const calStats = dispersion(calories);
          sections.push(`- **Active Calories:** ${Math.round(calStats.mean)} avg/day`);
        }

        sections.push("");
      } else {
        sections.push("## Activity\n- Insufficient data (need at least 5 days)\n");
      }

      sections.push("---");
      sections.push("*Use these baselines to interpret your daily data. Values outside normal ranges may indicate something worth investigating.*");

      return {
        contents: [
          {
            uri: "oura://baseline",
            mimeType: "text/plain",
            text: sections.join("\n"),
          },
        ],
      };
    }
  );

  // ─────────────────────────────────────────────────────────────
  // oura://monthly-insights - 30-day comprehensive analysis
  // ─────────────────────────────────────────────────────────────

  server.registerResource(
    "monthly-insights",
    "oura://monthly-insights",
    {
      description: "Comprehensive 30-day health insights including trends, patterns, anomalies, and actionable observations about your sleep, recovery, and activity.",
      mimeType: "text/plain",
    },
    async () => {
      const today = getToday();
      const monthAgo = getDaysAgo(30);
      const sections: string[] = [];

      sections.push(`# Monthly Health Insights\n`);
      sections.push(`*Analysis period: ${monthAgo} to ${today}*\n`);

      // Fetch all data in parallel
      const [sleepResult, readinessResult, activityResult] = await Promise.allSettled([
        client.getSleep(monthAgo, today),
        client.getDailyReadiness(monthAgo, today),
        client.getDailyActivity(monthAgo, today),
      ]);

      // Filter to only main sleep sessions (exclude naps, rest periods)
      const allSleep = sleepResult.status === "fulfilled" ? sleepResult.value.data : [];
      const sessions: SleepSession[] = allSleep.filter((s) => s.type === "long_sleep");
      const readinessData: DailyReadiness[] = readinessResult.status === "fulfilled" ? readinessResult.value.data : [];
      const activityData: DailyActivity[] = activityResult.status === "fulfilled" ? activityResult.value.data : [];

      // ═══════════════════════════════════════════════════════════
      // SLEEP INSIGHTS
      // ═══════════════════════════════════════════════════════════
      if (sessions.length >= 7) {
        sections.push("## 💤 Sleep Insights");

        const durations = sessions.map((s) => s.total_sleep_duration ?? 0).filter((d) => d > 0);
        const hrvValues = sessions.map((s) => s.average_hrv).filter((h): h is number => h != null);

        // Sleep debt
        const debt = sleepDebt(durations, 8);
        if (debt.status === "significant_debt") {
          sections.push(`⚠️ **Sleep Debt Alert:** You're averaging ${(debt.actualHours).toFixed(1)}h/night, ${debt.debtHours.toFixed(1)}h short of the 8h target.`);
        } else if (debt.status === "surplus") {
          sections.push(`✓ **Sleep Surplus:** Averaging ${(debt.actualHours).toFixed(1)}h/night - exceeding 8h target.`);
        } else {
          sections.push(`✓ **On Target:** Averaging ${(debt.actualHours).toFixed(1)}h/night.`);
        }

        // Sleep regularity
        const bedtimes = sessions.map((s) => s.bedtime_start);
        const waketimes = sessions.map((s) => s.bedtime_end);
        const regularity = sleepRegularity(bedtimes, waketimes);
        if (regularity.regularityScore < 50) {
          sections.push(`⚠️ **Irregular Schedule:** Your bedtime varies significantly (regularity: ${Math.round(regularity.regularityScore)}/100). Consistent sleep times improve sleep quality.`);
        } else if (regularity.regularityScore >= 80) {
          sections.push(`✓ **Consistent Schedule:** Excellent sleep regularity (${Math.round(regularity.regularityScore)}/100).`);
        }

        // Day of week patterns
        const dowData = sessions.map((s) => ({
          date: s.day,
          value: (s.total_sleep_duration ?? 0) / 3600,
        }));
        const dowAnalysis = dayOfWeekAnalysis(dowData);
        const weekdayWeekendDiff = dowAnalysis.weekendAverage - dowAnalysis.weekdayAverage;
        if (Math.abs(weekdayWeekendDiff) > 1) {
          if (weekdayWeekendDiff > 0) {
            sections.push(`📊 **Weekend Pattern:** You sleep ${weekdayWeekendDiff.toFixed(1)}h more on weekends (${dowAnalysis.weekendAverage.toFixed(1)}h) than weekdays (${dowAnalysis.weekdayAverage.toFixed(1)}h).`);
          } else {
            sections.push(`📊 **Weekday Pattern:** You sleep ${Math.abs(weekdayWeekendDiff).toFixed(1)}h more on weekdays than weekends.`);
          }
        }
        sections.push(`📅 **Best Night:** ${dowAnalysis.bestDay.day} (${dowAnalysis.bestDay.average.toFixed(1)}h avg) | **Worst:** ${dowAnalysis.worstDay.day} (${dowAnalysis.worstDay.average.toFixed(1)}h avg)`);

        // HRV trend
        if (hrvValues.length >= 7) {
          const hrvTrend = trend(hrvValues);
          if (hrvTrend.significant && hrvTrend.direction === "improving") {
            sections.push(`📈 **HRV Improving:** Your heart rate variability shows a positive trend - a sign of good recovery.`);
          } else if (hrvTrend.significant && hrvTrend.direction === "declining") {
            sections.push(`📉 **HRV Declining:** Your heart rate variability is trending down - consider more recovery time.`);
          }
        }

        // Anomalies
        if (hrvValues.length >= 10) {
          const hrvOutliers = detectOutliers(hrvValues);
          if (hrvOutliers.outliers.length > 0) {
            const lowOutliers = hrvOutliers.outliers.filter((o) => o.value < hrvOutliers.lowerBound);
            if (lowOutliers.length > 0) {
              sections.push(`🔍 **${lowOutliers.length} night(s) with unusually low HRV** - may indicate stress, illness, or poor recovery.`);
            }
          }
        }

        sections.push("");
      } else {
        sections.push("## 💤 Sleep Insights\n- Need at least 7 nights of data for insights.\n");
      }

      // ═══════════════════════════════════════════════════════════
      // READINESS INSIGHTS
      // ═══════════════════════════════════════════════════════════
      if (readinessData.length >= 7) {
        sections.push("## 🔋 Readiness Insights");

        const scores = readinessData.map((r) => r.score).filter((s): s is number => s != null);

        if (scores.length >= 7) {
          const scoreStats = dispersion(scores);
          const scoreTrend = trend(scores);

          sections.push(`📊 **Average Readiness:** ${Math.round(scoreStats.mean)} (range: ${Math.round(scoreStats.min)}-${Math.round(scoreStats.max)})`);

          if (scoreTrend.significant) {
            if (scoreTrend.direction === "improving") {
              sections.push(`📈 **Trend:** Readiness is improving over the past month.`);
            } else if (scoreTrend.direction === "declining") {
              sections.push(`📉 **Trend:** Readiness is declining - you may need more rest.`);
            }
          }

          // Low readiness days
          const lowDays = readinessData.filter((r) => r.score != null && r.score < 60);
          if (lowDays.length >= 5) {
            sections.push(`⚠️ **${lowDays.length} days with low readiness** (<60) this month.`);
          }
        }

        sections.push("");
      } else {
        sections.push("## 🔋 Readiness Insights\n- Need at least 7 days of data for insights.\n");
      }

      // ═══════════════════════════════════════════════════════════
      // ACTIVITY INSIGHTS
      // ═══════════════════════════════════════════════════════════
      if (activityData.length >= 7) {
        sections.push("## 🏃 Activity Insights");

        const steps = activityData.map((a) => a.steps).filter((s): s is number => s != null);

        if (steps.length >= 7) {
          const stepStats = dispersion(steps);
          const stepTrend = trend(steps);

          sections.push(`📊 **Average Steps:** ${Math.round(stepStats.mean).toLocaleString()}/day`);

          // Goal achievement (assuming 10k steps goal)
          const daysOver10k = steps.filter((s) => s >= 10000).length;
          const pctOver10k = Math.round((daysOver10k / steps.length) * 100);
          sections.push(`🎯 **10k Goal:** Achieved ${daysOver10k} of ${steps.length} days (${pctOver10k}%)`);

          // Day of week patterns for steps
          const stepDowData = activityData
            .filter((a) => a.steps != null)
            .map((a) => ({ date: a.day, value: a.steps! }));
          if (stepDowData.length >= 7) {
            const stepDow = dayOfWeekAnalysis(stepDowData);
            sections.push(`📅 **Most Active:** ${stepDow.bestDay.day} (${Math.round(stepDow.bestDay.average).toLocaleString()} steps)`);
            sections.push(`📅 **Least Active:** ${stepDow.worstDay.day} (${Math.round(stepDow.worstDay.average).toLocaleString()} steps)`);
          }

          if (stepTrend.significant && stepTrend.direction === "declining") {
            sections.push(`📉 **Trend:** Activity levels are declining this month.`);
          }
        }

        sections.push("");
      } else {
        sections.push("## 🏃 Activity Insights\n- Need at least 7 days of data for insights.\n");
      }

      // ═══════════════════════════════════════════════════════════
      // SUMMARY
      // ═══════════════════════════════════════════════════════════
      sections.push("---");
      sections.push("*These insights are based on your personal data patterns. Significant changes may warrant discussion with a healthcare provider.*");

      return {
        contents: [
          {
            uri: "oura://monthly-insights",
            mimeType: "text/plain",
            text: sections.join("\n"),
          },
        ],
      };
    }
  );

  // ─────────────────────────────────────────────────────────────
  // oura://tag-summary - User's tags and their usage frequency
  // ─────────────────────────────────────────────────────────────

  server.registerResource(
    "tag-summary",
    "oura://tag-summary",
    {
      description: "Summary of your tags and their usage over the past 90 days. Use this to see what tags are available for analysis with compare_conditions tool.",
      mimeType: "text/plain",
    },
    async () => {
      const today = getToday();
      const ninetyDaysAgo = getDaysAgo(90);
      const sections: string[] = [];

      sections.push(`# Your Tags (Last 90 Days)\n`);
      sections.push(`*From ${ninetyDaysAgo} to ${today}*\n`);

      // Fetch enhanced tags (they have more detail than regular tags)
      const [enhancedTagsResult, tagsResult] = await Promise.allSettled([
        client.getEnhancedTags(ninetyDaysAgo, today),
        client.getTags(ninetyDaysAgo, today),
      ]);

      // Process enhanced tags
      const enhancedTags = enhancedTagsResult.status === "fulfilled" ? enhancedTagsResult.value.data : [];
      const regularTags = tagsResult.status === "fulfilled" ? tagsResult.value.data : [];

      if (enhancedTags.length === 0 && regularTags.length === 0) {
        sections.push("No tags found in the past 90 days.");
        sections.push("");
        sections.push("**Tip:** Add tags in the Oura app to track conditions like:");
        sections.push("- Alcohol, caffeine, late meal");
        sections.push("- Stressful day, travel, sick");
        sections.push("- Exercise, meditation, supplements");
        sections.push("");
        sections.push("Tags help the `compare_conditions` tool analyze how different factors affect your sleep and recovery.");

        return {
          contents: [
            {
              uri: "oura://tag-summary",
              mimeType: "text/plain",
              text: sections.join("\n"),
            },
          ],
        };
      }

      // Count tag frequency and track recent usage
      const tagStats = new Map<string, { count: number; lastUsed: string; type?: string }>();

      // Process enhanced tags (use start_day, have custom_name and tag_type_code)
      for (const tag of enhancedTags) {
        const name = tag.custom_name || tag.tag_type_code || "unknown";
        const day = tag.start_day;
        const existing = tagStats.get(name);
        if (!existing) {
          tagStats.set(name, {
            count: 1,
            lastUsed: day,
            type: tag.tag_type_code || undefined,
          });
        } else {
          existing.count++;
          if (day > existing.lastUsed) {
            existing.lastUsed = day;
          }
        }
      }

      // Also count regular tags (use day, have tags[] array)
      for (const tag of regularTags) {
        // Regular tags have a tags[] array of strings
        for (const tagName of tag.tags) {
          const existing = tagStats.get(tagName);
          if (!existing) {
            tagStats.set(tagName, {
              count: 1,
              lastUsed: tag.day,
            });
          } else {
            existing.count++;
            if (tag.day > existing.lastUsed) {
              existing.lastUsed = tag.day;
            }
          }
        }
      }

      // Sort by frequency (most used first)
      const sortedTags = Array.from(tagStats.entries()).sort((a, b) => b[1].count - a[1].count);

      sections.push(`## Tags (${sortedTags.length} unique)\n`);
      sections.push("| Tag | Times Used | Last Used |");
      sections.push("|-----|------------|-----------|");

      for (const [name, stats] of sortedTags) {
        sections.push(`| ${name} | ${stats.count} | ${stats.lastUsed} |`);
      }

      sections.push("");
      sections.push("---");
      sections.push("**Usage:** These tags can be used with the `compare_conditions` tool to analyze how different conditions affect your sleep and recovery.");
      sections.push("");
      sections.push("Example: `compare_conditions(tag: \"alcohol\", metric: \"hrv\")` to see how alcohol affects your HRV.");

      return {
        contents: [
          {
            uri: "oura://tag-summary",
            mimeType: "text/plain",
            text: sections.join("\n"),
          },
        ],
      };
    }
  );

  // ─────────────────────────────────────────────────────────────
  // oura://streaks - Track consecutive goal achievements
  // ─────────────────────────────────────────────────────────────

  server.registerResource(
    "streaks",
    "oura://streaks",
    {
      description: "Your current and best streaks for sleep, readiness, and activity goals. Track consecutive days of good health metrics.",
      mimeType: "text/plain",
    },
    async () => {
      const today = getToday();
      const ninetyDaysAgo = getDaysAgo(90);
      const sections: string[] = [];

      sections.push(`# Your Health Streaks\n`);
      sections.push(`*Based on data from ${ninetyDaysAgo} to ${today}*\n`);

      // Fetch all data in parallel
      const [sleepResult, readinessResult, activityResult] = await Promise.allSettled([
        client.getDailySleep(ninetyDaysAgo, today),
        client.getDailyReadiness(ninetyDaysAgo, today),
        client.getDailyActivity(ninetyDaysAgo, today),
      ]);

      // Helper to calculate streaks
      const calculateStreaks = (
        data: { day: string; meetsGoal: boolean }[]
      ): { current: number; best: number; currentStart?: string; bestStart?: string; bestEnd?: string } => {
        // Sort by date descending (most recent first)
        const sorted = [...data].sort((a, b) => b.day.localeCompare(a.day));

        let current = 0;
        let best = 0;
        let bestStart: string | undefined;
        let bestEnd: string | undefined;
        let currentStart: string | undefined;
        let tempStreak = 0;
        let tempStart: string | undefined;

        // Calculate current streak (from most recent)
        for (const item of sorted) {
          if (item.meetsGoal) {
            if (current === 0) currentStart = item.day;
            current++;
          } else {
            break;
          }
        }

        // Calculate best streak (scan all data chronologically)
        const chronological = [...data].sort((a, b) => a.day.localeCompare(b.day));
        for (const item of chronological) {
          if (item.meetsGoal) {
            if (tempStreak === 0) tempStart = item.day;
            tempStreak++;
          } else {
            if (tempStreak > best) {
              best = tempStreak;
              bestStart = tempStart;
              bestEnd = chronological[chronological.indexOf(item) - 1]?.day;
            }
            tempStreak = 0;
            tempStart = undefined;
          }
        }
        // Check if final streak is the best
        if (tempStreak > best) {
          best = tempStreak;
          bestStart = tempStart;
          bestEnd = chronological[chronological.length - 1]?.day;
        }

        return { current, best, currentStart, bestStart, bestEnd };
      };

      // Sleep streaks (score >= 85 = "optimal")
      if (sleepResult.status === "fulfilled" && sleepResult.value.data.length > 0) {
        const sleepData = sleepResult.value.data.map(s => ({
          day: s.day,
          meetsGoal: (s.score ?? 0) >= 85,
        }));
        const sleepStreaks = calculateStreaks(sleepData);

        sections.push("## 💤 Sleep Score Streaks (85+ = Optimal)");
        sections.push(`- **Current streak:** ${sleepStreaks.current} days${sleepStreaks.current > 0 && sleepStreaks.currentStart ? ` (since ${sleepStreaks.currentStart})` : ""}`);
        sections.push(`- **Best streak:** ${sleepStreaks.best} days${sleepStreaks.bestStart ? ` (${sleepStreaks.bestStart} to ${sleepStreaks.bestEnd})` : ""}`);

        // Show progress indicator
        if (sleepStreaks.current > 0) {
          const progress = "🟢".repeat(Math.min(sleepStreaks.current, 7));
          sections.push(`- ${progress}`);
        }
        sections.push("");
      }

      // Readiness streaks (score >= 85 = "optimal")
      if (readinessResult.status === "fulfilled" && readinessResult.value.data.length > 0) {
        const readinessData = readinessResult.value.data.map(r => ({
          day: r.day,
          meetsGoal: (r.score ?? 0) >= 85,
        }));
        const readinessStreaks = calculateStreaks(readinessData);

        sections.push("## 🔋 Readiness Score Streaks (85+ = Optimal)");
        sections.push(`- **Current streak:** ${readinessStreaks.current} days${readinessStreaks.current > 0 && readinessStreaks.currentStart ? ` (since ${readinessStreaks.currentStart})` : ""}`);
        sections.push(`- **Best streak:** ${readinessStreaks.best} days${readinessStreaks.bestStart ? ` (${readinessStreaks.bestStart} to ${readinessStreaks.bestEnd})` : ""}`);

        if (readinessStreaks.current > 0) {
          const progress = "🟢".repeat(Math.min(readinessStreaks.current, 7));
          sections.push(`- ${progress}`);
        }
        sections.push("");
      }

      // Activity streaks (steps >= 10000 OR activity score >= 85)
      if (activityResult.status === "fulfilled" && activityResult.value.data.length > 0) {
        // 10k steps streak
        const stepData = activityResult.value.data.map(a => ({
          day: a.day,
          meetsGoal: (a.steps ?? 0) >= 10000,
        }));
        const stepStreaks = calculateStreaks(stepData);

        sections.push("## 🏃 10K Steps Streaks");
        sections.push(`- **Current streak:** ${stepStreaks.current} days${stepStreaks.current > 0 && stepStreaks.currentStart ? ` (since ${stepStreaks.currentStart})` : ""}`);
        sections.push(`- **Best streak:** ${stepStreaks.best} days${stepStreaks.bestStart ? ` (${stepStreaks.bestStart} to ${stepStreaks.bestEnd})` : ""}`);

        if (stepStreaks.current > 0) {
          const progress = "🟢".repeat(Math.min(stepStreaks.current, 7));
          sections.push(`- ${progress}`);
        }
        sections.push("");

        // Activity score streak
        const activityScoreData = activityResult.value.data.map(a => ({
          day: a.day,
          meetsGoal: (a.score ?? 0) >= 85,
        }));
        const activityStreaks = calculateStreaks(activityScoreData);

        sections.push("## 🎯 Activity Score Streaks (85+ = Optimal)");
        sections.push(`- **Current streak:** ${activityStreaks.current} days${activityStreaks.current > 0 && activityStreaks.currentStart ? ` (since ${activityStreaks.currentStart})` : ""}`);
        sections.push(`- **Best streak:** ${activityStreaks.best} days${activityStreaks.bestStart ? ` (${activityStreaks.bestStart} to ${activityStreaks.bestEnd})` : ""}`);

        if (activityStreaks.current > 0) {
          const progress = "🟢".repeat(Math.min(activityStreaks.current, 7));
          sections.push(`- ${progress}`);
        }
        sections.push("");
      }

      // Summary
      sections.push("---");
      sections.push("*Streaks reset when a day falls below the goal threshold. Missing data days break the streak.*");

      return {
        contents: [
          {
            uri: "oura://streaks",
            mimeType: "text/plain",
            text: sections.join("\n"),
          },
        ],
      };
    }
  );

  // ─────────────────────────────────────────────────────────────
  // oura://weekly-report - Comprehensive weekly health report with recommendations
  // ─────────────────────────────────────────────────────────────

  server.registerResource(
    "weekly-report",
    "oura://weekly-report",
    {
      description: "Comprehensive weekly health report with data analysis, highlights, concerns, and actionable recommendations. More detailed than weekly-summary.",
      mimeType: "text/plain",
    },
    async () => {
      const today = getToday();
      const weekAgo = getDaysAgo(7);
      const twoWeeksAgo = getDaysAgo(14);
      const sections: string[] = [];

      sections.push(`# Weekly Health Report`);
      sections.push(`*${weekAgo} to ${today}*\n`);

      // Fetch this week and previous week for comparison
      const [
        sleepThisWeek,
        sleepLastWeek,
        sessionsThisWeek,
        sessionsLastWeek,
        readinessThisWeek,
        readinessLastWeek,
        activityThisWeek,
        activityLastWeek,
      ] = await Promise.all([
        client.getDailySleep(weekAgo, today).catch(() => ({ data: [] })),
        client.getDailySleep(twoWeeksAgo, getDaysAgo(8)).catch(() => ({ data: [] })),
        client.getSleep(weekAgo, today).catch(() => ({ data: [] })),
        client.getSleep(twoWeeksAgo, getDaysAgo(8)).catch(() => ({ data: [] })),
        client.getDailyReadiness(weekAgo, today).catch(() => ({ data: [] })),
        client.getDailyReadiness(twoWeeksAgo, getDaysAgo(8)).catch(() => ({ data: [] })),
        client.getDailyActivity(weekAgo, today).catch(() => ({ data: [] })),
        client.getDailyActivity(twoWeeksAgo, getDaysAgo(8)).catch(() => ({ data: [] })),
      ]);

      const highlights: string[] = [];
      const concerns: string[] = [];
      const recommendations: string[] = [];

      // ═══════════════════════════════════════════════════════════
      // SLEEP ANALYSIS
      // ═══════════════════════════════════════════════════════════
      sections.push("## 💤 Sleep");

      if (sleepThisWeek.data.length > 0) {
        const sleepScores = sleepThisWeek.data.map(s => s.score).filter((s): s is number => s != null);
        const lastWeekScores = sleepLastWeek.data.map(s => s.score).filter((s): s is number => s != null);

        if (sleepScores.length > 0) {
          const avgScore = Math.round(sleepScores.reduce((a, b) => a + b, 0) / sleepScores.length);
          const lastWeekAvg = lastWeekScores.length > 0
            ? Math.round(lastWeekScores.reduce((a, b) => a + b, 0) / lastWeekScores.length)
            : null;

          sections.push(`- **Average Score:** ${avgScore}${lastWeekAvg ? ` (${avgScore >= lastWeekAvg ? "↑" : "↓"} from ${lastWeekAvg} last week)` : ""}`);

          if (avgScore >= 85) {
            highlights.push("Excellent sleep scores this week");
          } else if (avgScore < 70) {
            concerns.push("Sleep scores below optimal (<70 average)");
            recommendations.push("Prioritize sleep: aim for consistent bedtime and 7-9 hours");
          }

          // Best/worst days
          const sorted = [...sleepThisWeek.data].filter(s => s.score != null).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
          if (sorted.length >= 2) {
            sections.push(`- **Best:** ${sorted[0].day} (${sorted[0].score}) | **Worst:** ${sorted[sorted.length - 1].day} (${sorted[sorted.length - 1].score})`);
          }
        }

        // Duration analysis from sessions
        if (sessionsThisWeek.data.length > 0) {
          const mainSessions = sessionsThisWeek.data.filter(s => s.type === "long_sleep");
          const durations = mainSessions.map(s => s.total_sleep_duration ?? 0).filter(d => d > 0);

          if (durations.length > 0) {
            const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
            const avgHours = avgDuration / 3600;
            sections.push(`- **Average Duration:** ${formatDuration(avgDuration)}/night`);

            if (avgHours < 7) {
              concerns.push(`Sleep duration averaging ${avgHours.toFixed(1)}h (below 7h recommended)`);
              recommendations.push("Try going to bed 30 minutes earlier");
            } else if (avgHours >= 7.5) {
              highlights.push(`Good sleep duration (${avgHours.toFixed(1)}h average)`);
            }

            // Sleep debt calculation
            const debt = sleepDebt(durations, 8);
            if (debt.status === "significant_debt") {
              concerns.push(`Sleep debt: ${debt.debtHours.toFixed(1)}h behind target`);
            }

            // HRV from sessions
            const hrvValues = mainSessions.map(s => s.average_hrv).filter((h): h is number => h != null);
            if (hrvValues.length > 0) {
              const avgHrv = Math.round(hrvValues.reduce((a, b) => a + b, 0) / hrvValues.length);
              sections.push(`- **Average HRV:** ${avgHrv} ms`);

              // Compare to last week
              const lastWeekSessions = sessionsLastWeek.data.filter(s => s.type === "long_sleep");
              const lastWeekHrv = lastWeekSessions.map(s => s.average_hrv).filter((h): h is number => h != null);
              if (lastWeekHrv.length > 0) {
                const lastAvgHrv = Math.round(lastWeekHrv.reduce((a, b) => a + b, 0) / lastWeekHrv.length);
                const change = avgHrv - lastAvgHrv;
                if (Math.abs(change) >= 3) {
                  if (change > 0) {
                    highlights.push(`HRV improved by ${change} ms from last week`);
                  } else {
                    concerns.push(`HRV dropped by ${Math.abs(change)} ms from last week`);
                    recommendations.push("Consider more rest and recovery activities");
                  }
                }
              }
            }

            // Sleep regularity
            const bedtimes = mainSessions.map(s => s.bedtime_start);
            const waketimes = mainSessions.map(s => s.bedtime_end);
            const regularity = sleepRegularity(bedtimes, waketimes);
            if (regularity.regularityScore < 60) {
              concerns.push("Irregular sleep schedule");
              recommendations.push("Aim for consistent bed/wake times (±30 min)");
            } else if (regularity.regularityScore >= 80) {
              highlights.push("Excellent sleep schedule consistency");
            }
          }
        }
      } else {
        sections.push("- No sleep data this week");
      }
      sections.push("");

      // ═══════════════════════════════════════════════════════════
      // READINESS ANALYSIS
      // ═══════════════════════════════════════════════════════════
      sections.push("## 🔋 Readiness");

      if (readinessThisWeek.data.length > 0) {
        const scores = readinessThisWeek.data.map(r => r.score).filter((s): s is number => s != null);
        const lastWeekScores = readinessLastWeek.data.map(r => r.score).filter((s): s is number => s != null);

        if (scores.length > 0) {
          const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
          const lastWeekAvg = lastWeekScores.length > 0
            ? Math.round(lastWeekScores.reduce((a, b) => a + b, 0) / lastWeekScores.length)
            : null;

          sections.push(`- **Average Score:** ${avgScore}${lastWeekAvg ? ` (${avgScore >= lastWeekAvg ? "↑" : "↓"} from ${lastWeekAvg} last week)` : ""}`);

          if (avgScore >= 85) {
            highlights.push("Strong readiness this week");
          } else if (avgScore < 70) {
            concerns.push("Low readiness scores - recovery may be compromised");
            recommendations.push("Reduce training intensity and prioritize rest");
          }

          // Low days count
          const lowDays = scores.filter(s => s < 70).length;
          if (lowDays >= 3) {
            concerns.push(`${lowDays} days with low readiness (<70)`);
          }
        }
      } else {
        sections.push("- No readiness data this week");
      }
      sections.push("");

      // ═══════════════════════════════════════════════════════════
      // ACTIVITY ANALYSIS
      // ═══════════════════════════════════════════════════════════
      sections.push("## 🏃 Activity");

      if (activityThisWeek.data.length > 0) {
        const steps = activityThisWeek.data.map(a => a.steps).filter((s): s is number => s != null);
        const lastWeekSteps = activityLastWeek.data.map(a => a.steps).filter((s): s is number => s != null);

        if (steps.length > 0) {
          const avgSteps = Math.round(steps.reduce((a, b) => a + b, 0) / steps.length);
          const totalSteps = steps.reduce((a, b) => a + b, 0);
          const lastWeekAvg = lastWeekSteps.length > 0
            ? Math.round(lastWeekSteps.reduce((a, b) => a + b, 0) / lastWeekSteps.length)
            : null;

          sections.push(`- **Average Steps:** ${avgSteps.toLocaleString()}/day${lastWeekAvg ? ` (${avgSteps >= lastWeekAvg ? "↑" : "↓"} from ${lastWeekAvg.toLocaleString()} last week)` : ""}`);
          sections.push(`- **Total Steps:** ${totalSteps.toLocaleString()}`);

          // 10k goal achievement
          const daysOver10k = steps.filter(s => s >= 10000).length;
          sections.push(`- **10K Goal:** ${daysOver10k}/${steps.length} days`);

          if (daysOver10k === steps.length) {
            highlights.push("Hit 10k steps every day!");
          } else if (avgSteps < 5000) {
            concerns.push("Low activity levels (<5k steps average)");
            recommendations.push("Add short walks throughout the day");
          } else if (avgSteps >= 10000) {
            highlights.push(`Excellent activity level (${avgSteps.toLocaleString()} avg steps)`);
          }
        }

        // Calories
        const calories = activityThisWeek.data.map(a => a.active_calories).filter((c): c is number => c != null);
        if (calories.length > 0) {
          const avgCalories = Math.round(calories.reduce((a, b) => a + b, 0) / calories.length);
          sections.push(`- **Active Calories:** ${avgCalories} avg/day`);
        }
      } else {
        sections.push("- No activity data this week");
      }
      sections.push("");

      // ═══════════════════════════════════════════════════════════
      // HIGHLIGHTS, CONCERNS & RECOMMENDATIONS
      // ═══════════════════════════════════════════════════════════
      if (highlights.length > 0) {
        sections.push("## ✨ Highlights");
        highlights.forEach(h => sections.push(`- ${h}`));
        sections.push("");
      }

      if (concerns.length > 0) {
        sections.push("## ⚠️ Areas of Concern");
        concerns.forEach(c => sections.push(`- ${c}`));
        sections.push("");
      }

      if (recommendations.length > 0) {
        sections.push("## 💡 Recommendations");
        recommendations.forEach((r, i) => sections.push(`${i + 1}. ${r}`));
        sections.push("");
      }

      if (highlights.length === 0 && concerns.length === 0) {
        sections.push("## 📊 Summary");
        sections.push("- Overall a stable week. Keep maintaining your current habits.");
        sections.push("");
      }

      sections.push("---");
      sections.push("*This report compares your data to your own patterns and general health guidelines.*");

      return {
        contents: [
          {
            uri: "oura://weekly-report",
            mimeType: "text/plain",
            text: sections.join("\n"),
          },
        ],
      };
    }
  );
}
