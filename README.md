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
npm install
npm run build
```

### 3. Configure Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%/Claude/claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "oura": {
      "command": "npx",
      "args": ["node", "/path/to/oura-mcp/dist/index.js"],
      "env": {
        "OURA_ACCESS_TOKEN": "your_token_here"
      }
    }
  }
}
```

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

## Roadmap

- [ ] More endpoints (heart rate, stress, workouts)
- [ ] Smart tools (`compare_periods`, `detect_anomalies`, `correlate`)
- [ ] MCP resources (`oura://today`, `oura://weekly-summary`)
- [ ] OAuth CLI flow (`npx oura-mcp auth`) for when PAT deprecated
- [ ] Publish to npm
- [ ] HTTP transport for remote/mobile access

## License

MIT
