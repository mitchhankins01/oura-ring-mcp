/**
 * MCP Prompts for Oura Ring data analysis
 *
 * Prompts are pre-defined templates that help users get started with common
 * health analysis tasks. They guide the LLM to use the right tools and
 * ask the right questions.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// ─────────────────────────────────────────────────────────────
// Register Prompts with McpServer
// ─────────────────────────────────────────────────────────────

export function registerPrompts(server: McpServer) {
  // ─────────────────────────────────────────────────────────────
  // weekly-review prompt
  // ─────────────────────────────────────────────────────────────
  server.registerPrompt(
    "weekly-review",
    {
      title: "Weekly Health Review",
      description:
        "Get a comprehensive review of your sleep, readiness, and activity from the past week with insights and recommendations.",
      argsSchema: {},
    },
    async () => {
      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: `Please give me a comprehensive weekly health review.

Use the available Oura tools to:
1. Get my sleep data for the past 7 days and analyze sleep quality, duration trends, and sleep stage percentages
2. Check my readiness scores and identify any concerning patterns in recovery
3. Review my activity levels and see if they're balanced with my recovery
4. Look for any anomalies or unusual readings that stand out
5. Check if there are correlations between my activity and sleep quality

Summarize findings and provide 2-3 actionable recommendations based on the data.`,
            },
          },
        ],
      };
    }
  );

  // ─────────────────────────────────────────────────────────────
  // sleep-optimization prompt
  // ─────────────────────────────────────────────────────────────
  server.registerPrompt(
    "sleep-optimization",
    {
      title: "Sleep Optimization Analysis",
      description:
        "Analyze your sleep patterns over the past 30 days to identify what conditions lead to your best sleep.",
      argsSchema: {},
    },
    async () => {
      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: `I want to optimize my sleep. Please analyze my sleep patterns to help me understand what leads to my best nights.

Use the Oura tools to:
1. Run analyze_sleep_quality for the past 30 days to see my sleep trends, debt, and regularity
2. Use best_sleep_conditions to identify what factors predict good vs poor sleep
3. Check if there's a correlation between my activity levels and sleep quality
4. Look at my HRV trends to understand my recovery patterns
5. Identify my best and worst nights and what might have caused the difference

Based on the analysis, tell me:
- What time should I aim to go to bed?
- How much activity seems optimal for good sleep?
- Are there any patterns I should be aware of?
- What specific changes might improve my sleep quality?`,
            },
          },
        ],
      };
    }
  );

  // ─────────────────────────────────────────────────────────────
  // recovery-check prompt
  // ─────────────────────────────────────────────────────────────
  server.registerPrompt(
    "recovery-check",
    {
      title: "Recovery Status Check",
      description:
        "Check your current recovery status and get guidance on whether to push hard or take it easy today.",
      argsSchema: {},
    },
    async () => {
      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: `I want to know if I'm recovered enough to train hard today or if I should take it easy.

Please check:
1. My readiness score for today and what's contributing to it
2. Last night's sleep quality, duration, and HRV
3. My HRV trend over the past week (is it improving or declining?)
4. Any anomalies in recent data that might indicate I need more rest
5. How my activity levels have been - am I overtraining?

Based on this data, give me a clear recommendation:
- Should I train hard, do moderate activity, or focus on recovery today?
- What signs should I watch for?
- When might I expect to be fully recovered if I'm not now?`,
            },
          },
        ],
      };
    }
  );

  // ─────────────────────────────────────────────────────────────
  // compare-weeks prompt
  // ─────────────────────────────────────────────────────────────
  server.registerPrompt(
    "compare-weeks",
    {
      title: "This Week vs Last Week",
      description:
        "Compare your health metrics from this week to last week to see if you're improving or declining.",
      argsSchema: {},
    },
    async () => {
      // Calculate date ranges
      const today = new Date();
      const dayOfWeek = today.getDay();
      const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

      const thisWeekStart = new Date(today);
      thisWeekStart.setDate(today.getDate() - daysToMonday);

      const lastWeekStart = new Date(thisWeekStart);
      lastWeekStart.setDate(thisWeekStart.getDate() - 7);

      const lastWeekEnd = new Date(thisWeekStart);
      lastWeekEnd.setDate(thisWeekStart.getDate() - 1);

      const formatDate = (d: Date) => d.toISOString().split("T")[0];

      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: `Compare my health data from this week vs last week.

Use the compare_periods tool with these date ranges:
- This week: ${formatDate(thisWeekStart)} to ${formatDate(today)}
- Last week: ${formatDate(lastWeekStart)} to ${formatDate(lastWeekEnd)}

Compare these metrics: sleep_duration, sleep_score, deep_sleep, rem_sleep, hrv, readiness, activity, steps

After getting the comparison:
1. Highlight the biggest improvements
2. Flag any concerning declines
3. Explain what might be causing the changes
4. Suggest what to focus on for next week`,
            },
          },
        ],
      };
    }
  );

  // ─────────────────────────────────────────────────────────────
  // tag-analysis prompt
  // ─────────────────────────────────────────────────────────────
  server.registerPrompt(
    "tag-analysis",
    {
      title: "Analyze Tag Impact",
      description:
        "Analyze how a specific tag or condition affects your health metrics.",
      argsSchema: {
        tag: z.string().describe("The tag or condition to analyze (e.g., 'alcohol', 'workout', 'meditation')"),
      },
    },
    async ({ tag }) => {
      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: `I want to understand how "${tag}" affects my health metrics.

Please:
1. First check oura://tag-summary to see what tags I have available
2. Use compare_conditions with the condition "${tag}" to see how it affects my sleep and HRV
3. Look at multiple metrics: sleep score, HRV, deep sleep percentage, readiness

Based on the analysis:
- Does ${tag} have a positive or negative effect on my health metrics?
- How significant is the effect?
- Should I do more or less of this based on the data?
- Are there any surprising findings?`,
            },
          },
        ],
      };
    }
  );

  // ─────────────────────────────────────────────────────────────
  // monthly-trends prompt
  // ─────────────────────────────────────────────────────────────
  server.registerPrompt(
    "monthly-trends",
    {
      title: "Monthly Trends Analysis",
      description:
        "Analyze your health trends over the past 30 days to identify long-term patterns.",
      argsSchema: {},
    },
    async () => {
      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: `Analyze my health trends over the past 30 days.

Please:
1. Use analyze_hrv_trend to see my HRV trajectory and recovery patterns
2. Use detect_anomalies to find any unusual readings in the past month
3. Use correlate_metrics to find interesting relationships:
   - Does more activity correlate with better sleep?
   - Does HRV correlate with readiness?
   - Does sleep duration affect next-day activity?
4. Read oura://monthly-insights for a comprehensive overview

Summarize:
- Overall trajectory: Am I getting healthier or showing signs of overtraining/stress?
- Key patterns: What consistently affects my health?
- Recommendations: What should I focus on for the next month?`,
            },
          },
        ],
      };
    }
  );

  // ─────────────────────────────────────────────────────────────
  // quick-status prompt
  // ─────────────────────────────────────────────────────────────
  server.registerPrompt(
    "quick-status",
    {
      title: "Quick Daily Status",
      description: "Get a quick summary of today's health status.",
      argsSchema: {},
    },
    async () => {
      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: `Give me a quick status update on my health today.

Read the oura://today resource and tell me:
1. How did I sleep last night? (score, duration, any issues)
2. What's my readiness score and what's affecting it?
3. One sentence summary: Should I push hard today or take it easy?

Keep it brief and actionable.`,
            },
          },
        ],
      };
    }
  );
}
