# Oura MCP Server

An MCP (Model Context Protocol) server that exposes Oura Ring health data to LLMs like Claude. Built for learning MCP development while creating something genuinely useful.

## Project Goals

1. **Learn MCP** - Understand how tools, resources, and prompts work
2. **Improve on existing implementations** - Most Oura MCPs just dump raw JSON; ours provides human-readable summaries
3. **Ship something worth starring** - Clean code, great README, published to npm

## Architecture

```
src/
├── index.ts           # MCP server entry point (stdio transport)
├── client.ts          # Oura API client (thin wrapper)
├── tools/
│   └── index.ts       # Tool definitions and handlers
├── resources/         # (Phase 2) MCP resources like oura://today
├── prompts/           # (Phase 3) Prompt templates
├── auth/              # (Phase 4a) OAuth CLI flow
│   ├── cli.ts         # `npx oura-mcp auth` command
│   ├── oauth.ts       # OAuth2 flow helpers
│   └── store.ts       # Token storage (~/.oura-mcp/credentials.json)
├── transports/        # (Phase 4b) Alternative transports
│   └── http.ts        # HTTP/SSE for remote access
└── utils/
    └── formatters.ts  # Human-readable formatting (seconds→hours, etc.)
```

## Current Tools (9 available)

**Sleep & Recovery:**
- `get_sleep` - Detailed sleep sessions with stages, efficiency, HR, HRV
- `get_daily_sleep` - Daily sleep scores with contributors
- `get_readiness` - Daily readiness scores and recovery metrics

**Activity & Fitness:**
- `get_activity` - Daily activity, steps, calories, intensity breakdown
- `get_workouts` - Workout sessions with type, duration, intensity
- `get_vo2_max` - Cardiorespiratory fitness measurements

**Health Metrics:**
- `get_stress` - Stress levels and recovery time
- `get_heart_rate` - Individual HR readings throughout the day
- `get_spo2` - Blood oxygen saturation and breathing disturbance

## Notes

- Oura PAT tokens deprecated end of 2025 → Phase 4a adds OAuth CLI flow
- Data syncs when user opens Oura app - "no data" often means ring hasn't synced
- Sleep data is attributed to the day you woke up, not when you fell asleep
- Use Zod for API response validation—define schema once, get types with `z.infer<typeof schema>`
- Once work has been completed, update CLAUDE.MD accordingly. Conversely, if more work needs to be done at it as well.

## Development Phases

### Phase 1: Hello World ✅
- [x] Project scaffold
- [x] Basic MCP server with stdio transport
- [x] `get_sleep` tool with human-readable output
- [x] `get_readiness` tool
- [x] `get_activity` tool
- [x] Test with Claude Desktop

### Phase 2: Cover the API
- [x] Generate types from OpenAPI: `pnpm generate-types`
- [x] Add high-priority endpoints:
  - [x] `get_stress` - Daily stress levels and recovery time
  - [x] `get_daily_sleep` - Sleep scores with contributors
  - [x] `get_heart_rate` - Individual HR readings with timestamps
  - [x] `get_workouts` - Workout sessions with activity type and intensity
  - [x] `get_spo2` - Blood oxygen saturation and breathing disturbance index
  - [x] `get_vo2_max` - Cardiorespiratory fitness measurements
- [ ] Add remaining endpoints (resilience, cardiovascular age, tags, sessions, etc.)
- [ ] Add MCP resources (`oura://today`, `oura://weekly-summary`)
- [ ] Better error messages
- [x] Set up Vitest with coverage thresholds (75/80/80/80)
- [x] Create test infrastructure (fixtures, helpers directories)
- [x] Write comprehensive tests for formatters (96%+ coverage achieved)
- [ ] Add tests for Oura client (mocked fetch)
- [ ] Add tests for tool handlers (mocked client)
- [ ] Add tests for MCP server (mocked SDK)
- [ ] Set up CI/CD for automated testing (GitHub Actions)
- [ ] Add pre-commit hooks for test validation

### Phase 3: Make it Smart
See `docs/RESEARCH.md` for detailed inspiration, formulas, and code examples from Wearipedia notebook.

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

**HRV-specific features (from hrvanalysis library):**
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
- [ ] Resources: `oura://today`, `oura://weekly-report`

### Phase 4a: Ship It (Local)
- [ ] CLI auth flow: `npx oura-mcp auth` (for when PAT deprecated end of 2025)
- [ ] Publish to npm as `@username/oura-mcp`
- [ ] Great README with:
  - Demo gif
  - "What can I ask Claude?" examples
  - Screenshots
- [ ] Add to MCP registry

### Phase 4b: Remote Access
- [ ] HTTP transport (SSE) for remote connections
- [ ] Hosted OAuth callback flow
- [ ] Deploy to Railway/Fly/Render
- [ ] Add production monitoring (highlight/datadog etc)
- [ ] Connect from Claude mobile (when MCP support lands)

## Key Files

- `src/index.ts` - MCP server setup and request routing
- `src/client.ts` - Oura API client with TypeScript types
- `src/tools/index.ts` - Tool definitions (schemas) and handlers
- `src/utils/formatters.ts` - Convert seconds to hours, format scores, etc.
- `docs/RESEARCH.md` - **Competitive analysis, derived metrics formulas, Phase 3 inspiration**

## Reference Materials

- **Wearipedia notebook** (`oura_ring_gen_3.ipynb`) - Comprehensive Oura analysis from Stanford
  - Sleep stage visualization (stackplots)
  - Outlier detection (IQR, Z-score)
  - Correlation analysis with p-values
  - Gaussian smoothing for time series
  - Data joining patterns (match on day)
  
- **HRV Analysis library** (Aura-healthcare/hrv-analysis) - Production-grade HRV
  - Time domain: RMSSD, SDNN, pNN50, CVSD, mean/max/min HR
  - Frequency domain: VLF, LF, HF, LF/HF ratio (Welch + Lomb methods)
  - Non-linear: Poincaré plot (SD1, SD2), Sample Entropy
  - Preprocessing: outlier removal, ectopic beat detection (malik/kamath/karlsson/acar)
  
- **Sleep Stage Classification** (CNN+LSTM) - Deep learning on PSG data
  - Feature extraction: skew, kurtosis, RMS, zero crossings
  - Band powers: delta, theta, alpha, beta, gamma
  - Sleep score formula: 0.5*efficiency + 0.4*deep% + 0.2*REM%
  
- **Oura OpenAPI spec** - Full API documentation (367KB JSON)

## Commands

```bash
pnpm install          # Install dependencies
pnpm build            # Compile TypeScript
pnpm dev              # Watch mode
pnpm start            # Run the server

# Testing
pnpm test             # Run all tests
pnpm test:watch       # Watch mode for development
pnpm test:coverage    # Run tests with coverage report
pnpm test:ui          # Open Vitest UI in browser

# OpenAPI & Type Generation
pnpm update-openapi   # Download latest OpenAPI spec from Oura
pnpm generate-types   # Generate TypeScript types from spec
pnpm update-types     # Update spec AND generate types (convenience)
```

## Testing Strategy

We use **Vitest** for testing with the following structure:

**Test Organization:**
- Tests are co-located with source files (`*.test.ts`)
- Shared fixtures in `tests/fixtures/` (sample API responses)
- Test utilities in `tests/helpers/` (mocks, helpers)

**Coverage Thresholds:**
```json
{
  "branches": 75,
  "functions": 80,
  "lines": 80,
  "statements": 80
}
```

**What We Test:**
1. **Formatters** (`utils/formatters.ts`) - Unit tests, 90%+ coverage target
2. **Tool Handlers** (`tools/index.ts`) - Unit tests with mocked client
3. **Oura Client** (`client.ts`) - Integration tests with mocked fetch
4. **MCP Server** (`index.ts`) - Integration tests with mocked SDK

**Mock Strategy:**
- Oura API calls → `nock` or `msw` for deterministic testing
- Environment vars → Override `process.env` in tests
- Date/time → `vitest.useFakeTimers()` for consistent "today" tests

**Exclusions:**
- Generated types (`src/types/oura-api.ts`) excluded from coverage
- Scripts and config files excluded

See `tests/README.md` for detailed testing guidelines.

## Keeping Types Up-to-Date

When Oura updates their API, run:

```bash
pnpm update-types
pnpm build
```

This will:
1. Scrape the latest OpenAPI spec download link from https://cloud.ouraring.com/v2/docs
2. Download the spec automatically (currently v1.27)
3. Generate fresh TypeScript types
4. Rebuild the project

**How it works**: The script fetches the docs page, extracts the "Download OpenAPI specification" link, and downloads whatever version Oura is currently serving. No manual version updates needed!

**Tip**: Check for API updates:
- Every few months
- When Oura announces new features
- When you see deprecation warnings
- Before major releases

## Testing with Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

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

**Important Notes**:
- Replace `/absolute/path/to/oura-mcp` with your actual installation path
- This project requires **Node >=24**. If Claude Desktop is using an older Node version (check logs), specify the full path to a modern Node:
  ```json
  "command": "/Users/yourusername/.nvm/versions/node/v24.7.0/bin/node"
  ```

Then restart Claude Desktop.

## Oura API Reference

- Docs: https://cloud.ouraring.com/v2/docs
- Get token: https://cloud.ouraring.com/personal-access-tokens
- Rate limit: 5000 requests per 5 minutes
- All durations are in **seconds** (we convert to hours/minutes for display)

## Design Decisions

1. **Human-readable + raw data**: Tools return formatted summaries, not just JSON blobs
2. **Sensible defaults**: `get_sleep()` with no args returns today's data
3. **Score interpretation**: We add context like "85 (Optimal)" not just "85"
4. **Sleep percentages**: Calculated from `total_sleep_duration`, not `time_in_bed` (matches Oura app)

## Auth Strategy

**Current (Phase 1-3):** PAT token via `OURA_ACCESS_TOKEN` env var

**Phase 4a (CLI auth for local users):**
```bash
npx oura-mcp auth
# Opens browser → Oura OAuth → callback to localhost:3000
# Saves refresh token to ~/.oura-mcp/credentials.json
```
Server reads token from file, refreshes automatically. Still stdio transport.

**Phase 4b (Remote access):**
- HTTP transport with SSE (Server-Sent Events)
- OAuth callback hosted on the server itself
- Deploy to Railway/Fly/Render
- Enables mobile access when Claude app supports MCP
