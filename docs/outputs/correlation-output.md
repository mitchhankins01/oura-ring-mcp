# Example: Metric Correlation Output

**User:** "Is there a relationship between my activity and sleep quality?"

**Claude uses `correlate_metrics` tool:**

```
## Correlation: Activity Score vs Sleep Score

### Results
- **Correlation:** r = 0.42
- **Strength:** Moderate positive
- **P-value:** 0.003 (statistically significant)
- **Sample Size:** 45 days

### Interpretation
There is a moderate positive correlation between your daily
activity and subsequent sleep quality. On days when you're
more active, you tend to sleep better that night.

### Scatter Plot Summary
| Activity Level | Avg Sleep Score | Sample |
|----------------|-----------------|--------|
| Low (<60)      | 72              | 8 days |
| Medium (60-80) | 79              | 22 days|
| High (>80)     | 85              | 15 days|

### Caveats
- Correlation does not imply causation
- Other factors (stress, diet, bedtime) also affect sleep
- Very high activity (overtraining) may have opposite effect

### Recommendation
Aim for moderate-to-high activity days (score 70+) for
optimal sleep. Your data suggests a sweet spot around
8,000-12,000 steps.
```
