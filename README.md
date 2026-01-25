# 🌙 Oura MCP Server

[![CI](https://github.com/mitchhankins01/oura-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/mitchhankins01/oura-mcp/actions/workflows/ci.yml)

An MCP server that connects your Oura Ring to Claude and other AI assistants. Get human-readable insights about your sleep, readiness, and activity—not just raw JSON.

## Features

- **Smart formatting** - Durations in hours/minutes, scores with context ("85 - Optimal")
- **Sleep analysis** - Sleep stages, efficiency, HRV, and biometrics
- **Readiness tracking** - Recovery scores and contributor breakdown
- **Activity data** - Steps, calories, and intensity breakdown
- **Health metrics** - Heart rate, SpO2, stress, cardiovascular age
- **Workouts & sessions** - Exercise and meditation tracking
- **Tags support** - Custom user tags and notes

## Quick Start

### 1. Get your Oura token

Go to [cloud.ouraring.com/personal-access-tokens](https://cloud.ouraring.com/personal-access-tokens) and create a token.

### 2. Install

```bash
git clone https://github.com/yourusername/oura-mcp.git
cd oura-mcp
pnpm install
pnpm build
```

### 3. Configure Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%/Claude/claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "oura": {
      "command": "node",
      "args": ["/absolute/path/to/oura-mcp/dist/index.js"],
      "env": {
        "OURA_ACCESS_TOKEN": "your_token_here"
      }
    }
  }
}
```

**Important**: Replace `/absolute/path/to/oura-mcp` with the actual path to your installation. This project requires Node >=24, so make sure Claude Desktop is using a modern Node version.

Restart Claude Desktop.

## What can I ask?

Once connected, try asking Claude:

- "How did I sleep last night?"
- "Show me my sleep data for the past week"
- "What's my readiness score today?"
- "Compare my activity from Monday to Friday"
- "What was my average HRV this week?"

## Example Output

```
## Sleep: 2024-01-15
**Bedtime:** 10:45 PM → 6:30 AM
**Total Sleep:** 7h 12m (of 7h 45m in bed)
**Efficiency:** 93%

**Sleep Stages:**
- Deep: 1h 24m (19.4%)
- REM: 1h 48m (25%)
- Light: 4h 0m (55.6%)
- Awake: 33m

**Biometrics:**
- Avg Heart Rate: 52 bpm (lowest: 48)
- Avg HRV: 45 ms
- Avg Breathing Rate: 14.5 breaths/min
```

## Available Tools

| Tool | Description |
|------|-------------|
| `get_sleep` | Complete sleep data with stages, efficiency, HR, HRV |
| `get_daily_sleep` | Daily sleep scores with contributors |
| `get_readiness` | Daily readiness scores and recovery metrics |
| `get_resilience` | Body's capacity to recover from stress |
| `get_activity` | Daily activity, steps, calories, intensity breakdown |
| `get_workouts` | Workout sessions with type, duration, intensity |
| `get_sessions` | Meditation, breathing, and relaxation sessions |
| `get_vo2_max` | Cardiorespiratory fitness measurements |
| `get_stress` | Stress levels and recovery time |
| `get_heart_rate` | Individual HR readings throughout the day |
| `get_spo2` | Blood oxygen saturation and breathing disturbance |
| `get_cardiovascular_age` | Estimated vascular age based on heart health |
| `get_tags` | User-created tags and notes |
| `get_enhanced_tags` | Rich tags with custom names and types |

## MCP Resources

| Resource | Description |
|----------|-------------|
| `oura://today` | Today's health summary (sleep, readiness, activity, stress) |
| `oura://weekly-summary` | Last 7 days summary with averages and trends |

## Development

### Commands

```bash
pnpm install          # Install dependencies
pnpm build            # Compile TypeScript
pnpm dev              # Watch mode for development
pnpm start            # Run the server

# Type Management
pnpm update-openapi   # Download latest OpenAPI spec from Oura
pnpm generate-types   # Generate TypeScript types from spec
pnpm update-types     # Update spec + generate types (all-in-one)
```

### Updating API Types

When Oura releases API updates:

```bash
pnpm update-types
pnpm build
```

This automatically scrapes the latest OpenAPI spec from Oura's docs and regenerates TypeScript types. See [CLAUDE.md](CLAUDE.md) for more details.

## Roadmap

### Phase 1: Hello World ✅
- [x] Project scaffold
- [x] Basic MCP server with stdio transport
- [x] `get_sleep` tool with human-readable output
- [x] `get_readiness` tool
- [x] `get_activity` tool
- [x] Test with Claude Desktop

### Phase 2: Cover the API ✅
- [x] Generate types from OpenAPI: `pnpm generate-types`
- [x] Add high-priority endpoints:
  - [x] `get_stress` - Daily stress levels and recovery time
  - [x] `get_daily_sleep` - Sleep scores with contributors
  - [x] `get_heart_rate` - Individual HR readings with timestamps
  - [x] `get_workouts` - Workout sessions with activity type and intensity
  - [x] `get_spo2` - Blood oxygen saturation and breathing disturbance index
  - [x] `get_vo2_max` - Cardiorespiratory fitness measurements
- [x] Add remaining endpoints:
  - [x] `get_resilience` - Body's capacity to recover from stress
  - [x] `get_cardiovascular_age` - Estimated vascular age
  - [x] `get_tags` - User-created tags and notes
  - [x] `get_sessions` - Meditation/breathing sessions
- [x] Add MCP resources (`oura://today`, `oura://weekly-summary`)
- [x] Better error messages (OuraApiError class, user-friendly messages, no-data tips)
- [x] Set up Vitest with coverage thresholds (75/80/80/80)
- [x] Create test infrastructure (fixtures, helpers directories)
- [x] Write comprehensive tests for formatters (96%+ coverage achieved)
- [x] Add tests for Oura client (mocked fetch)
- [x] Add tests for tool handlers (mocked client)
- [x] Add tests for MCP server (mocked SDK)
- [x] Validate fixtures against real API (scripts/validate-fixtures.ts)
- [x] Set up CI/CD for automated testing (GitHub Actions)
- [x] Add pre-commit hooks for test validation (husky)

### Phase 3: Make it Smart (In Progress)

See [docs/RESEARCH.md](docs/RESEARCH.md) for detailed inspiration, formulas, and code examples.

**Derived metrics to compute:**
- [ ] Sleep stage ratios (deep/REM/light as % of total sleep)
- [ ] Sleep debt tracking (vs 8hr target)
- [ ] Sleep score formula (efficiency + deep% + REM%)
- [ ] HRV recovery pattern (first half vs second half of night)
- [ ] Rolling averages (7-day, 14-day, 30-day)
- [ ] Trend detection via linear regression slope
- [ ] Anomaly detection (IQR method + Z-score method)
- [ ] Sleep regularity score (consistency of bed/wake times)
- [ ] Day-of-week patterns ("I sleep worst on Fridays")
- [ ] Dispersion analysis (coefficient of variation)

**HRV-specific features:**
- [ ] Time domain: SDNN, RMSSD, pNN50, CVSD
- [ ] Frequency domain: LF, HF, LF/HF ratio (sympathovagal balance)
- [ ] Non-linear: Poincaré SD1/SD2 (short vs long-term variability)
- [ ] Preprocessing: ectopic beat removal (malik method)

**Smart tools:**
- [ ] `analyze_sleep_quality(days)` - Patterns and insights
- [ ] `analyze_hrv_trend(days)` - Recovery trajectory
- [ ] `compare_periods(period1, period2)` - This week vs last week
- [ ] `compare_conditions(tag1, tag2, metric)` - Alcohol vs no alcohol
- [ ] `detect_anomalies(days)` - Flag unusual readings (IQR + Z-score)
- [ ] `correlate(metric1, metric2, days)` - Pearson correlation with p-value
- [ ] `best_sleep_conditions()` - What predicts your good nights
- [ ] `day_of_week_analysis(metric)` - Weekly patterns

**Visualization-ready data (for Claude artifacts):**
- [ ] Sleep stages stackplot data (Oura app style)
- [ ] Heart rate during sleep with smoothing
- [ ] Body temperature trend bars
- [ ] Multi-metric overlays with gaussian smoothing
- [ ] Poincaré plot data (SD1/SD2 ellipse)

**MCP features:**
- [ ] Prompts for common analysis tasks

### Phase 4a: Ship It (Local)
- [ ] CLI auth flow: `npx oura-mcp auth` (for when PAT deprecated end of 2025)
- [ ] Publish to npm as `@username/oura-mcp`
- [ ] Great README with demo gif, examples, screenshots
- [ ] Add to MCP registry

### Phase 4b: Remote Access
- [ ] HTTP transport (SSE) for remote connections
- [ ] Hosted OAuth callback flow
- [ ] Deploy to Railway/Fly/Render
- [ ] Add production monitoring
- [ ] Connect from Claude mobile (when MCP support lands)

## Oura API Quirks

Documented issues discovered while building this server that developers should be aware of.

### Single-Date Query Bug

**Affected endpoints:** `/sleep`, `/daily_activity`, `/workout`, `/session`, `/tag`, `/enhanced_tag`

When `start_date == end_date`, these endpoints return empty arrays even when data exists.

```bash
# Returns empty despite data existing for 2026-01-21
curl ".../sleep?start_date=2026-01-21&end_date=2026-01-21"  # → []

# Works when range is expanded
curl ".../sleep?start_date=2026-01-20&end_date=2026-01-22"  # → [data]
```

**Workaround:** Query with ±1 day range and filter results client-side. The `/enhanced_tag` endpoint is worse—requires ±3 days.

**NOT affected:** `/daily_sleep`, `/daily_readiness`, `/daily_stress`, `/daily_spo2`, `/heartrate`, `/vO2_max`, `/daily_resilience`, `/daily_cardiovascular_age`

### OpenAPI Spec Missing `sleep_regularity`

The v2 API returns `sleep_regularity` in `ReadinessContributors`, but it's not in the OpenAPI spec (v1.27). TypeScript consumers must cast to access it.

### Internal vs Public API Discrepancy

The Oura dashboard uses internal endpoints with additional fields not in the public API:
- `average_breath_variation`, `got_ups`, `sleep_midpoint`, `wake_ups`
- Activity targets (`target_calories`, `target_meters`)

## Contributing

See [CLAUDE.md](CLAUDE.md) for architecture details and development guidelines.

## License

MIT
