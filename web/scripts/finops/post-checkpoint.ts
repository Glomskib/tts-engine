#!/usr/bin/env tsx
/**
 * Post CHECKPOINT doc to Mission Control for Phase 3E.
 *
 * Usage:
 *   tsx scripts/finops/post-checkpoint.ts
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

async function run() {
  const baseUrl = process.env.MC_BASE_URL || 'http://127.0.0.1:3100';
  const token = process.env.MC_API_TOKEN;

  if (!token) {
    console.log('MC_API_TOKEN not set — printing checkpoint to stdout instead:\n');
    console.log(content);
    return;
  }

  const res = await fetch(`${baseUrl}/api/documents`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      title: 'CHECKPOINT — Phase 3E: FinOps shipped',
      content,
      category: 'plans',
      lane: 'FlashFlow',
      tags: 'checkpoint,finops,phase-3e',
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error(`MC post failed: ${res.status} ${text}`);
    process.exit(1);
  }

  const json = await res.json();
  console.log('Checkpoint posted to MC:', json.id ?? json.data?.id ?? 'ok');
}

const content = `# CHECKPOINT — Phase 3E: FinOps / UsageOps

## What shipped

### A) Database (Supabase migration)
- **ff_usage_events** — per-call token usage + estimated cost, linked to ff_generations
- **ff_usage_rollups_daily** — aggregated daily by lane/provider/model/agent/template
- **ff_budgets** — configurable spend thresholds with soft alerts
- RLS: authenticated users read own rows; writes via service role only

### B) Cost Calculator (lib/finops/cost.ts)
- \`costFromUsage()\` with cache token support
- Centralized PRICING_MAP covering Anthropic, OpenAI, DeepSeek, Google, Ollama
- Placeholder pricing for gpt-5.1-codex, gpt-4.1-mini, gpt-4.1-nano
- Single file to update when pricing changes

### C) Usage Logger (lib/finops/log-usage.ts)
- \`logUsageEvent()\` — inserts into ff_usage_events with auto-computed cost
- \`logUsageEventAsync()\` — fire-and-forget, non-blocking

### D) Wired into Generation Endpoints
- **hooks/generate** — captures OpenAI gpt-4o-mini token usage
- **unified-script-generator** — captures Anthropic Sonnet usage (incl. cache tokens)
- Both endpoints log to ff_usage_events via logUsageEventAsync

### E) OpenClaw Ingestion Endpoint
- POST /api/finops/openclaw/usage — accepts external usage events
- Auto-computes cost if not provided
- Auth via FINOPS_INGEST_KEY or CRON_SECRET

### F) Rollup + Reports
- \`scripts/finops/rollup-daily.ts\` — idempotent daily aggregation via SQL function
- \`scripts/finops/daily-report.ts\` — CLI daily report with spike detection + budget checks
- \`scripts/finops/weekly-report.ts\` — CLI weekly report with WoW comparison

### G) Cron Routes
- /api/cron/finops-daily — daily at 6 AM UTC (rollup + report + MC post)
- /api/cron/finops-weekly — Monday 6:30 AM UTC (weekly summary + MC post)

### H) Verification
- \`scripts/test-finops/smoke.ts\` — end-to-end smoke test
- tsc --noEmit passes clean
- Also updated llm-pricing.ts with new model entries for consistency

## Files created/modified
- \`supabase/migrations/20260226000001_finops.sql\` (new)
- \`lib/finops/cost.ts\` (new)
- \`lib/finops/log-usage.ts\` (new)
- \`lib/finops/index.ts\` (new)
- \`app/api/finops/openclaw/usage/route.ts\` (new)
- \`app/api/cron/finops-daily/route.ts\` (new)
- \`app/api/cron/finops-weekly/route.ts\` (new)
- \`scripts/finops/rollup-daily.ts\` (new)
- \`scripts/finops/daily-report.ts\` (new)
- \`scripts/finops/weekly-report.ts\` (new)
- \`scripts/finops/post-checkpoint.ts\` (new)
- \`scripts/test-finops/smoke.ts\` (new)
- \`app/api/hooks/generate/route.ts\` (modified — added FinOps logging)
- \`lib/unified-script-generator.ts\` (modified — added FinOps logging)
- \`lib/llm-pricing.ts\` (modified — added new model entries)
- \`vercel.json\` (modified — added finops-daily + finops-weekly crons)
`;

run().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
