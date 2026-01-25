# Example: Sleep Quality Analysis Output

**User:** "Analyze my sleep quality over the past month"

**Claude uses `analyze_sleep_quality` tool:**

```
## Sleep Quality Analysis (Last 30 Days)

### Overall Score
- **Average:** 79 (Good)
- **Trend:** Stable (+0.1/day, not significant)
- **Consistency:** 72% (Moderate variation)

### Sleep Duration
- **Average:** 7h 18m
- **Target:** 8h 00m
- **Sleep Debt:** 5.2 hours accumulated
- **Status:** Mild debt - consider earlier bedtimes

### Sleep Stages (Averages)
| Stage | Duration | % of Sleep | Status    |
|-------|----------|------------|-----------|
| Deep  | 1h 12m   | 16.4%      | Normal    |
| REM   | 1h 38m   | 22.4%      | Normal    |
| Light | 4h 28m   | 61.2%      | Normal    |

### Sleep Timing
- **Avg Bedtime:** 10:48 PM
- **Avg Wake Time:** 6:42 AM
- **Regularity Score:** 78/100 (Good)
- **Most Irregular:** Weekends (+52 min later avg)

### Day-of-Week Patterns
| Day       | Avg Score | Avg Duration |
|-----------|-----------|--------------|
| Monday    | 74        | 6h 52m       |
| Tuesday   | 80        | 7h 24m       |
| Wednesday | 81        | 7h 31m       |
| Thursday  | 79        | 7h 18m       |
| Friday    | 77        | 7h 08m       |
| Saturday  | 82        | 7h 45m       |
| Sunday    | 83        | 7h 58m       |

**Best Day:** Sunday (score 83)
**Worst Day:** Monday (score 74)

### Key Insights
1. Monday sleep suffers - likely weekend schedule disruption
2. Sleep debt is accumulating (~1.2h/week)
3. Good stage distribution - deep and REM are healthy
4. Consider consistent weekend bedtimes for better Monday scores
```
