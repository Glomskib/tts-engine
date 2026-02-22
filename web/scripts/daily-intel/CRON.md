# Daily Intel — Cron Schedule & Operations

## Overview

The daily intel pipeline fetches news from RSS feeds and web sources, generates AI-powered intelligence reports and social media drafts, then posts them to Mission Control and exports locally.

## Pipelines

| Pipeline | Lane | Sources | Output |
|----------|------|---------|--------|
| cycling | Making Miles Matter | CyclingNews, Bicycling, VeloNews, BikeRumor, Google News | 10 stories + 5 MMM-tone drafts |
| eds | Zebby's World | Google News (EDS), Google News (POTS), Dysautonomia Intl | 10 stories + 5 Zebby drafts + 3 scene prompts |

## Outputs

Each run produces per pipeline:

1. **Intel doc** → Mission Control (`category: intelligence`, `lane: <pipeline lane>`)
2. **Drafts doc** → Mission Control (`category: drafts`, `lane: <pipeline lane>`)
3. **Local export** → `~/DailyDrafts/YYYY-MM-DD/{cycling,eds}/`
   - `intel.md` — full intelligence report
   - `drafts.md` — social media drafts in markdown
   - `drafts.json` — structured JSON for programmatic use

## Tags

- Intel docs: `daily-intel`, `cycling` or `eds`
- Drafts docs: `social-drafts`, `cycling` or `eds`, `daily-intel`, `drafts`

## Cron Setup

### macOS (launchd via crontab)

Run daily at 6:00 AM local time:

```bash
crontab -e
```

```cron
# Daily intel — both pipelines, 6 AM
0 6 * * * cd /Users/brandonglomski/tts-engine/web && /usr/local/bin/pnpm run job:daily-intel >> ~/DailyDrafts/cron.log 2>&1
```

### Manual Run

```bash
cd /Users/brandonglomski/tts-engine/web

# Both pipelines
pnpm run job:daily-intel

# Dry run (no MC posts, but still exports locally)
pnpm run job:daily-intel:dry

# Single pipeline
pnpm run job:daily-intel:cycling
pnpm run job:daily-intel:eds

# Content agents (run after daily-intel to generate extended drafts from MC intel)
pnpm run job:cycling-agent
pnpm run job:zebby-agent
```

## Required Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `ANTHROPIC_API_KEY` | Recommended | Claude Haiku for AI generation. Without it, pipeline exports article list only. |
| `MC_API_TOKEN` | Recommended | Mission Control auth. Without it, pipeline exports locally only. |
| `MC_BASE_URL` | Optional | MC endpoint (default: `https://mc.flashflowai.com`) |
| `BUFFER_ACCESS_TOKEN` | Optional | Buffer.com post scheduling |
| `BUFFER_PROFILE_IDS` | Optional | Comma-separated Buffer profile IDs |

## Graceful Degradation

The pipeline is designed to run unattended without hard failures:

- **No ANTHROPIC_API_KEY**: Skips AI generation, still fetches articles and exports a raw article list
- **No MC token**: Skips MC posts, still generates reports and exports locally
- **Source fetch failure**: Non-fatal, logs warning, continues with remaining sources
- **Buffer not configured**: Silently skips Buffer push

## Monitoring

- Check `~/DailyDrafts/cron.log` for cron output
- Check `~/DailyDrafts/YYYY-MM-DD/` for daily output presence
- MC docs visible in Mission Control UI under respective lanes

## Recommended Full Schedule

```cron
# 6:00 AM — fetch + generate intel + drafts for both pipelines
0 6 * * * cd /Users/brandonglomski/tts-engine/web && pnpm run job:daily-intel >> ~/DailyDrafts/cron.log 2>&1

# 6:15 AM — cycling extended drafts (depends on intel doc in MC)
15 6 * * * cd /Users/brandonglomski/tts-engine/web && pnpm run job:cycling-agent >> ~/DailyDrafts/cron.log 2>&1

# 6:20 AM — zebby scene drafts (depends on intel doc in MC)
20 6 * * * cd /Users/brandonglomski/tts-engine/web && pnpm run job:zebby-agent >> ~/DailyDrafts/cron.log 2>&1
```
