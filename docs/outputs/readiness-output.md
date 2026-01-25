# Example: Readiness Data Output

**User:** "What's my readiness today?"

**Claude uses `get_readiness` tool:**

```
## Readiness: 2026-01-25

**Score:** 78 (Good)

Your body is mostly recovered. Good for moderate activity.

### Contributors
| Factor              | Score | Status  |
|---------------------|-------|---------|
| Previous Night      | 85    | Optimal |
| Sleep Balance       | 72    | Fair    |
| Previous Day        | 80    | Good    |
| Activity Balance    | 75    | Good    |
| Body Temperature    | 88    | Good    |
| Resting Heart Rate  | 82    | Good    |
| HRV Balance         | 68    | Fair    |
| Recovery Index      | 90    | Optimal |

### Key Insights
- Sleep balance slightly low - consider an earlier bedtime
- HRV trending below your baseline (45ms vs 52ms avg)
- Good recovery from yesterday's workout
```
