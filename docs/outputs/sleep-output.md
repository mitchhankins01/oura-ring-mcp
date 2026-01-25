# Example: Sleep Data Output

**User:** "How did I sleep last night?"

**Claude uses `get_sleep` tool:**

```
## Sleep: 2026-01-24

**Score:** 87 (Optimal)

**Bedtime:** 10:32 PM → 6:45 AM
**Total Sleep:** 7h 28m (of 8h 13m in bed)
**Efficiency:** 91%

### Sleep Stages
| Stage | Duration | % of Sleep |
|-------|----------|------------|
| Deep  | 1h 18m   | 17.5%      |
| REM   | 1h 52m   | 25.0%      |
| Light | 4h 18m   | 57.5%      |
| Awake | 45m      | -          |

### Biometrics
- **Avg Heart Rate:** 54 bpm (lowest: 48)
- **Avg HRV:** 42 ms
- **Avg Breathing Rate:** 14.2 breaths/min
- **Avg SpO2:** 97%

### Score Contributors
- Total Sleep: 92 (Optimal)
- Efficiency: 88 (Good)
- Restfulness: 85 (Good)
- REM Sleep: 90 (Optimal)
- Deep Sleep: 82 (Good)
- Latency: 95 (Optimal)
- Timing: 88 (Good)
```
