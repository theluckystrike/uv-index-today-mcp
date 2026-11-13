# uv-index-today-mcp

Today's UV Index for AI assistants, by US ZIP code or city, read live from the EPA UV Index forecast that the National Weather Service issues each day.

This is a Model Context Protocol (MCP) server. It calls the EPA Envirofacts UV Index service at call time. It needs no API key.

## Tools

| Tool | What it returns |
| --- | --- |
| `get_uv_index_today` | Today's UV Index for a ZIP code or city and state, the EPA category and sun protection advice, whether a UV Alert is in effect, the hourly peak and the local hours when UV is 3 or higher. |
| `get_uv_index_hourly` | Hour by hour UV Index forecast in the local time of the place, each hour with its EPA band, plus the peak hour and the protection window. |
| `explain_uv_index` | What a UV Index number means on the EPA scale and the EPA advice for it, plus the NWS UV Alert rule. Works offline. |

Every result has structured JSON, a one-paragraph summary, `as_of`, `source` (the exact EPA request) and `more` (a page on [mcpstamp.com](https://www.mcpstamp.com/servers/?utm_source=mcp&utm_medium=uv-index-today-mcp)).

## What it knows that your model does not

- Today's UV Index for your ZIP code. It changes every day with season, cloud cover and ozone, so a model's training data cannot know it.
- The hour when the sun is strongest today and the hours when EPA says protection is needed.
- Whether NWS and EPA have issued a UV Alert for the place today.

## Install

### Hosted (Claude.ai custom connector, ChatGPT developer mode)

Paste this URL. No token, no sign-up. It works now.

```
https://uv-index-today-mcp.lipmichal.workers.dev/mcp
```

### Claude Code

```
claude mcp add --transport http uv-index https://uv-index-today-mcp.lipmichal.workers.dev/mcp
```

### Claude Desktop

Claude Desktop adds remote servers under Settings, Connectors, Add custom connector. Paste the URL above.

### Cursor

Add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "uv-index": { "url": "https://uv-index-today-mcp.lipmichal.workers.dev/mcp" }
  }
}
```

### VS Code

Add to `.vscode/mcp.json`:

```json
{
  "servers": {
    "uv-index": { "type": "http", "url": "https://uv-index-today-mcp.lipmichal.workers.dev/mcp" }
  }
}
```

### Local stdio (after npm release)

The npm package is not published yet. After it is, run it locally with Node 20 or newer:

```
claude mcp add uv-index -- npx -y uv-index-today-mcp
```

## Example prompts

- "What is the UV index today in 33101?"
- "When is the UV highest in Phoenix today, and when do I need sunscreen?"
- "Is there a UV alert for Denver today?"
- "Is a UV index of 7 high?"

## Data sources

Full list with fetch dates in [DATA_SOURCES.md](DATA_SOURCES.md).

- Daily and hourly UV Index forecasts from the [EPA Envirofacts UV Index web service](https://www.epa.gov/enviro/web-services#uvindex). The forecasts are produced by the National Weather Service Climate Prediction Center.
- Category bands and advice from the [EPA UV Index scale](https://www.epa.gov/sunsafety/uv-index-scale-0), which follows the WHO guidelines.
- The UV Alert rule from the [NWS Climate Prediction Center](https://www.cpc.ncep.noaa.gov/products/stratosphere/uv_index/uv_alert.shtml).

## Limitations

- US ZIP codes and cities only. EPA does not cover every small town by name. Use the ZIP code or the nearest larger city.
- These are forecasts. Clouds, altitude, snow, sand and water change the real exposure.
- Hourly times are local time for the place, as EPA publishes them.
- When EPA is down or has no forecast for a place, the tool returns a clear error instead of a remembered number.

## More

More MCP servers that answer questions your assistant cannot answer alone are on [mcpstamp.com](https://www.mcpstamp.com/servers/?utm_source=mcp&utm_medium=uv-index-today-mcp).

Part of the Zovo MCP collection: https://mcp.zovo.one

Built by [theluckystrike](https://github.com/theluckystrike).

## Development

```
npm install
npm test                              # builds, then runs the fixture tests and an offline stdio test
node scripts/stdio-transcript.mjs     # live stdio round trip, writes .live/stdio-transcript.jsonl
```

## License

MIT

## More from zovo

- [All free zovo VS Code extensions](https://marketplace.visualstudio.com/publishers/zovo) — file viewers, database clients, formatters. Offline, no telemetry, no sign-up.
- [Full MCP server catalogue](https://theluckystrike.github.io/mcp/) — local-first MCP servers for back-office work: invoices, VAT, PDFs, spreadsheets, payroll.
- [Hosted no-install MCP endpoints](https://mcp.zovo.one) — paste a URL in Claude / Cursor, nothing to install.
