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
  const baseUrl = process.env.MC_BASE_URL || 'https://mc.flashflowai.com';
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
      title: 'CHECKPOINT — FinOps Usage Tracking & Smoke Tests',
      content,
      category: 'plans',
      lane: 'FlashFlow',
      tags: 'checkpoint,finops,usage-tracking,smoke-tests',
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

const content = `# CHECKPOINT — FinOps Usage Tracking & Smoke Tests (${new Date().toISOString().slice(0, 10)})

## What changed (this session)

### 1. Schema extension: correlation_id + endpoint
- New migration: \`20260221000001_finops_extend.sql\`
- Added \`correlation_id\` (text) — links to ff_generations.correlation_id for cross-system tracing
- Added \`endpoint\` (text) — tracks which API route generated the cost
- Indexed on both columns (WHERE NOT NULL)

### 2. Logger updated (lib/finops/log-usage.ts)
- \`LogUsageEventInput\` now accepts \`correlation_id\` and \`endpoint\`
- Both are inserted into ff_usage_events

### 3. All generation endpoints now include endpoint field
- \`/api/ai/generate-free\` → endpoint: '/api/ai/generate-free'
- \`/api/hooks/generate\` → endpoint: '/api/hooks/generate'
- \`/api/public/generate-script\` → endpoint + correlation_id
- \`/api/scripts/generate\` (via unified-script-generator) → endpoint: '/api/scripts/generate'

### 4. OpenClaw ingestion accepts new fields
- \`correlation_id\`, \`endpoint\`, \`user_id\` now accepted in POST body

### 5. Daily report includes "Top Endpoints" section
- Queries ff_usage_events by endpoint for the day
- Shows calls + cost per endpoint

### 6. Weekly digest includes cost summary
- Appends FinOps section: 7-day total, MTD, by-lane, by-model
- Pulls from ff_usage_rollups_daily

## How to run smoke tests

\`\`\`bash
cd web
npm run test:finops          # end-to-end: insert → rollup → verify → cleanup
npm run type-check           # tsc --noEmit
\`\`\`

## Sample curl calls

\`\`\`bash
# Report usage from an external agent
curl -X POST http://localhost:3000/api/finops/openclaw/usage \\
  -H "Authorization: Bearer $FINOPS_INGEST_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "lane": "FlashFlow",
    "agent_id": "my-agent",
    "provider": "openai",
    "model": "gpt-4o-mini",
    "input_tokens": 1500,
    "output_tokens": 800,
    "endpoint": "/my-endpoint",
    "correlation_id": "abc-123"
  }'

# Run daily rollup + report
cd web && npm run finops:daily

# Run weekly report
cd web && npm run finops:weekly
\`\`\`

## Where cost data appears
- **ff_usage_events** — raw per-call data (Supabase table)
- **ff_usage_rollups_daily** — aggregated by day/lane/provider/model
- **ff_budgets** — budget thresholds and alerts
- **Daily report** → MC doc: "FinOps Daily — YYYY-MM-DD"
- **Weekly report** → MC doc: "FinOps Weekly — start to end"
- **Weekly Intel Digest** → Cost Summary section appended

## Existing infrastructure (shipped prior)
- ff_usage_events, ff_usage_rollups_daily, ff_budgets tables
- costFromUsage() pricing map (Anthropic, OpenAI, DeepSeek, Google, Ollama)
- logUsageEvent() / logUsageEventAsync() — auto-computed cost
- Cron routes: /api/cron/finops-daily, /api/cron/finops-weekly
- Smoke test: scripts/test-finops/smoke.ts
`;

run().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
