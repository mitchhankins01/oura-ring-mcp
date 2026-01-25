# Example: Smart Analysis Tools

## Anomaly Detection

**User:** "Are there any unusual readings in my data recently?"

**Claude uses `detect_anomalies` tool:**

```
## Anomaly Detection (Last 30 Days)

### Unusual Readings Found

**HRV Anomalies (2 found):**
- 2026-01-15: 28 ms (Low) - Your baseline: 48 ms
- 2026-01-08: 72 ms (High) - Your baseline: 48 ms

**Resting HR Anomalies (1 found):**
- 2026-01-15: 62 bpm (High) - Your baseline: 52 bpm

**Sleep Score Anomalies (1 found):**
- 2026-01-22: 58 (Low) - Your baseline: 82

### Pattern Note
The anomalies on 2026-01-15 (low HRV, high HR, low sleep)
suggest possible illness or high stress that day.
```

---

## Compare Conditions

**User:** "How does alcohol affect my sleep?"

**Claude uses `compare_conditions` tool with tag "alcohol":**

```
## Sleep Comparison: With vs Without "alcohol"

### Overview
- Days with alcohol: 8
- Days without alcohol: 52

### Sleep Score
| Metric        | With Alcohol | Without | Difference |
|---------------|--------------|---------|------------|
| Average       | 71           | 84      | -13        |
| Best          | 78           | 94      | -16        |
| Worst         | 62           | 72      | -10        |

### Other Metrics
| Metric        | With Alcohol | Without | Difference |
|---------------|--------------|---------|------------|
| HRV (avg)     | 38 ms        | 51 ms   | -13 ms     |
| Resting HR    | 58 bpm       | 52 bpm  | +6 bpm     |
| Deep Sleep    | 52 min       | 78 min  | -26 min    |
| REM Sleep     | 68 min       | 102 min | -34 min    |
| Efficiency    | 84%          | 91%     | -7%        |

### Statistical Significance
- Sleep score difference is statistically significant (p < 0.01)
- HRV difference is statistically significant (p < 0.01)

### Insight
Alcohol consumption is associated with notably worse sleep
quality, particularly affecting deep sleep and REM sleep.
```

---

## Best Sleep Conditions

**User:** "What leads to my best sleep?"

**Claude uses `best_sleep_conditions` tool:**

```
## What Predicts Your Best Sleep

Based on 60 days of data, comparing nights with sleep score 85+
vs nights with sleep score below 70.

### Positive Predictors (Better Sleep)
1. **Meditation session** - +8 points avg sleep score
2. **10K+ steps** - +5 points avg sleep score
3. **No late meals** (tag) - +6 points avg sleep score
4. **Workout before 6pm** - +4 points avg sleep score

### Negative Predictors (Worse Sleep)
1. **Alcohol** (tag) - -13 points avg sleep score
2. **Late screen time** (tag) - -7 points avg sleep score
3. **Workout after 8pm** - -5 points avg sleep score
4. **Travel** (tag) - -9 points avg sleep score

### Optimal Conditions
Your best nights typically include:
- Meditation or relaxation session
- 8,000-12,000 steps (not extreme)
- No alcohol
- Evening workout before 6pm
- Bedtime between 10-11pm
```
