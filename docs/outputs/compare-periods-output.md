# Example: Compare Periods Output

**User:** "Compare my sleep this week vs last week"

**Claude uses `compare_periods` tool:**

```
## Period Comparison: This Week vs Last Week

### Overview
- **This Week:** 2026-01-19 to 2026-01-25 (7 days)
- **Last Week:** 2026-01-12 to 2026-01-18 (7 days)

### Sleep
| Metric          | This Week | Last Week | Change      |
|-----------------|-----------|-----------|-------------|
| Avg Score       | 82        | 76        | +6 ⬆️       |
| Avg Duration    | 7h 24m    | 6h 52m    | +32m ⬆️     |
| Avg Efficiency  | 89%       | 85%       | +4% ⬆️      |
| Avg HRV         | 48 ms     | 42 ms     | +6 ms ⬆️    |
| Avg Resting HR  | 52 bpm    | 55 bpm    | -3 bpm ⬆️   |

### Readiness
| Metric          | This Week | Last Week | Change      |
|-----------------|-----------|-----------|-------------|
| Avg Score       | 79        | 72        | +7 ⬆️       |
| Days Optimal    | 3/7       | 1/7       | +2 days     |
| Days Pay Attention | 1/7    | 3/7       | -2 days ⬆️  |

### Activity
| Metric          | This Week | Last Week | Change      |
|-----------------|-----------|-----------|-------------|
| Avg Steps       | 9,234     | 8,102     | +1,132 ⬆️   |
| Total Steps     | 64,638    | 56,714    | +7,924      |
| 10K Days        | 4/7       | 2/7       | +2 days     |
| Avg Calories    | 2,340     | 2,180     | +160        |

### Summary
This week was notably better across all metrics:
- Sleep improved significantly (+6 points, +32 min duration)
- HRV up 14% suggesting better recovery
- More consistent activity with 2 extra 10K step days
- Readiness reflects the improved sleep quality

### What Changed?
Consider what you did differently this week to maintain
these improvements (earlier bedtimes, more activity, less
alcohol, etc.)
```
