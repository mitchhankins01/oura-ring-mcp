# 🌙 Oura MCP Server

An MCP server that connects your Oura Ring to Claude and other AI assistants. Get human-readable insights about your sleep, readiness, and activity—not just raw JSON.

## Features

- **Smart formatting** - Durations in hours/minutes, scores with context ("85 - Optimal")
- **Sleep analysis** - Sleep stages, efficiency, HRV, and biometrics
- **Readiness tracking** - Recovery scores and contributor breakdown
- **Activity data** - Steps, calories, and intensity breakdown

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

**Important**: Replace `/absolute/path/to/oura-mcp` with the actual path to your installation. The MCP SDK requires Node >=18, so make sure Claude Desktop is using a modern Node version.

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
| `get_sleep` | Detailed sleep data with stages, efficiency, HRV |
| `get_readiness` | Recovery scores and contributors |
| `get_activity` | Steps, calories, activity breakdown |

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

**Phase 1: Hello World** ✅
- [x] Basic MCP server with 3 core tools (sleep, readiness, activity)
- [x] TypeScript types from OpenAPI spec
- [x] Automated spec updates

**Phase 2: Cover the API** (In Progress)
- [ ] More endpoints (heart rate, stress, workouts, SPO2, tags)
- [ ] MCP resources (`oura://today`, `oura://weekly-summary`)
- [ ] Better error messages

**Phase 3: Make it Smart**
- [ ] Derived metrics (sleep debt, rolling averages, trends)
- [ ] Smart analysis tools (`compare_periods`, `detect_anomalies`, `correlate`)
- [ ] HRV analysis (time/frequency domain, Poincaré plots)

**Phase 4: Ship It**
- [ ] OAuth CLI flow (`npx oura-mcp auth`)
- [ ] Publish to npm
- [ ] HTTP transport for remote/mobile access

## Contributing

See [CLAUDE.md](CLAUDE.md) for architecture details and development phases.

## License

MIT
