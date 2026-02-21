# FinOps Usage Tracker

Track LLM token usage, compute costs, detect spend spikes, and enforce budgets across all FlashFlow lanes.

## Tables

### ff_usage_events
Per-call token usage and cost. One row per LLM API call.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| created_at | timestamptz | auto |
| source | text | `flashflow`, `openclaw`, `manual` |
| lane | text | `FlashFlow`, `Making Miles Matter`, `Zebby's World`, etc. |
| provider | text | `openai`, `anthropic`, `ollama`, etc. |
| model | text | e.g. `gpt-4o-mini`, `claude-haiku-4-5-20251001` |
| input_tokens | integer | |
| output_tokens | integer | |
| cache_read_tokens | integer | |
| cache_write_tokens | integer | |
| cost_usd | numeric(12,6) | auto-computed if not provided |
| agent_id | text | optional |
| user_id | uuid | optional |
| generation_id | uuid | FK to ff_generations |
| correlation_id | text | links to ff_generations.correlation_id |
| endpoint | text | API route that generated the cost |
| template_key | text | e.g. `hook_generate`, `script_generate` |
| metadata | jsonb | arbitrary extra data |

### ff_usage_rollups_daily
Aggregated daily costs. Populated by the rollup script/function.

PK: `(day, lane, provider, model, agent_id, template_key)`

### ff_budgets
Spend thresholds and alerts.

| Column | Notes |
|--------|-------|
| scope | `global`, `lane`, `agent`, `template` |
| scope_key | lane name, agent id, etc. |
| period | `daily`, `weekly`, `monthly` |
| limit_usd | hard cap |
| soft_alert_usd | warning threshold |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Service role key (for inserts) |
| `ANTHROPIC_API_KEY` | for generation | Used by generation endpoints |
| `OPENAI_API_KEY` | for generation | Used by generation endpoints |
| `MC_BASE_URL` | no | Mission Control URL (default: `http://127.0.0.1:3100`) |
| `MC_API_TOKEN` | no | MC auth token for posting reports |
| `FINOPS_INGEST_KEY` | no | Shared secret for OpenClaw ingestion endpoint |

## Pricing Map

Centralized in `web/lib/finops/cost.ts`. All rates are per 1M tokens.

Models marked `// PLACEHOLDER` need confirmed pricing when published:
- `openai/gpt-5.1-codex`
- `openai/gpt-4.1-mini`
- `openai/gpt-4.1-nano`

To add a new model, add an entry to `PRICING_MAP` in `cost.ts`:
```ts
'provider/model-name': { input_per_m: X, output_per_m: Y },
```

## Scripts

```bash
# Daily rollup (default: today)
pnpm run finops:rollup
pnpm run finops:rollup -- 2026-02-20

# Daily report (rollup + report + MC post)
pnpm run finops:daily
pnpm run finops:daily -- 2026-02-20

# Weekly report
pnpm run finops:weekly

# Smoke tests
pnpm run test:finops
```

## OpenClaw Ingestion

External agents can report usage via:

```bash
curl -X POST http://localhost:3000/api/finops/openclaw/usage \
  -H "Authorization: Bearer $FINOPS_INGEST_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "lane": "FlashFlow",
    "agent_id": "my-agent",
    "provider": "openai",
    "model": "gpt-4o-mini",
    "input_tokens": 1500,
    "output_tokens": 800,
    "metadata": { "task": "summarize" }
  }'
```

Response: `{ "ok": true, "id": "uuid", "cost_usd": 0.000705 }`

If `cost_usd` is omitted, it's auto-computed from the pricing map.

## How Usage Logging Works

Generation endpoints call `logUsageEventAsync()` (fire-and-forget) after each LLM API call. This inserts into `ff_usage_events` without blocking the response.

Wired endpoints:
- `POST /api/hooks/generate` (OpenAI gpt-4o-mini)
- `POST /api/scripts/generate` (Anthropic, via unified-script-generator)
- `POST /api/public/generate-script` (Anthropic claude-haiku-4-5)
- `POST /api/ai/generate-free` (OpenAI gpt-4o-mini)

## Daily Report Contents

The daily report includes:
- Today's totals (cost, calls, tokens)
- Month-to-date cost
- Lane breakdown
- Top 10 most expensive model/template combos
- Top endpoints by cost
- Cost per winner (joins ff_outcomes)
- Spike detection: today > 1.5x 7-day avg AND > $0.50
- Budget threshold checks

Posted to MC as: `FinOps Daily -- YYYY-MM-DD` (category: plans, lane: FlashFlow, tags: finops,cost,usage,daily)

## Migration

```bash
supabase db push
# or apply directly:
supabase migration up --linked
```

Migration files:
- `supabase/migrations/20260226000001_finops.sql` — base tables
- `supabase/migrations/20260221000001_finops_extend.sql` — adds correlation_id + endpoint
