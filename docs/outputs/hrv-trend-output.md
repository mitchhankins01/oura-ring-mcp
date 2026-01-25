# Example: HRV Trend Analysis Output

**User:** "Is my HRV improving or declining?"

**Claude uses `analyze_hrv_trend` tool:**

```
## HRV Trend Analysis (Last 30 Days)

### Current Status
- **Latest HRV:** 48 ms
- **7-Day Avg:** 46 ms
- **30-Day Avg:** 44 ms
- **Trend:** Improving (+0.3 ms/day, p=0.02)

### Rolling Averages
| Period   | Average | Change from 30d |
|----------|---------|-----------------|
| 7-Day    | 46 ms   | +2 ms (+4.5%)   |
| 14-Day   | 45 ms   | +1 ms (+2.3%)   |
| 30-Day   | 44 ms   | baseline        |

### Recovery Patterns
- **Night Recovery:** Good (avg +8% from evening to morning)
- **Post-Workout Recovery:** 1.5 days average
- **Best Day:** Sunday (avg 52 ms)
- **Worst Day:** Monday (avg 39 ms)

### Notable Observations
- HRV dips significantly on Mondays (likely weekend effects)
- Strong recovery pattern after rest days
- Trend is statistically significant (p < 0.05)

### Insight
Your HRV is gradually improving, suggesting positive adaptation
to training load. Monday dips may indicate weekend sleep/alcohol
effects carrying over.
```
