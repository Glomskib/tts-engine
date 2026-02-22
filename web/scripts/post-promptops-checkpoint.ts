#!/usr/bin/env npx tsx
/**
 * Post a Mission Control checkpoint for Phase 3A: PromptOps.
 *
 * Usage:
 *   npx tsx scripts/post-promptops-checkpoint.ts
 *
 * Requires MC_API_TOKEN (and optionally MC_BASE_URL) env vars.
 */

export {};

const MC_BASE_URL = process.env.MC_BASE_URL || 'https://mc.flashflowai.com';
const MC_TOKEN = process.env.MC_API_TOKEN;

if (!MC_TOKEN) {
  console.error('MC_API_TOKEN env var is required');
  process.exit(1);
}

async function main() {
  const now = new Date().toISOString().slice(0, 10);

  const content = `# CHECKPOINT — Phase 3A: PromptOps shipped

**Date:** ${now}

## What shipped

1. **Migration** — \`20260225000001_ff_prompt_ops.sql\`
   - \`ff_prompt_templates\` — prompt template registry
   - \`ff_prompt_versions\` — versioned prompt content (draft/active/retired)
   - \`ff_prompt_assignments\` — active version per template with rollout strategy
   - \`ff_generations.prompt_version_id\` — links generations to PromptOps versions

2. **Prompt Registry** — \`lib/flashflow/prompt-registry.ts\`
   - \`resolvePromptVersion()\` — runtime resolution with FNV-1a percent rollout
   - \`createTemplate()\`, \`createVersion()\`, \`assignVersion()\` — admin CRUD

3. **API Routes**
   - \`POST /api/flashflow/prompts/templates\` — create template
   - \`POST /api/flashflow/prompts/versions\` — create version (always draft)
   - \`POST /api/flashflow/prompts/assign\` — activate version with rollout config
   - \`GET /api/flashflow/prompts/report\` — per-version performance report

4. **Weekly Trainer Extension**
   - Prompt tuning recommendations posted as separate MC doc
   - Version comparison tables, retire/keep recommendations (>20% win rate delta)
   - Guardrail suggestions based on common rejection tags
   - Draft variant ideas for single-version high-reject templates

5. **Backwards Compatibility**
   - \`resolvePromptVersion()\` returns null → existing hardcoded behavior continues
   - \`prompt_version_id\` is nullable with no strict FK
   - All existing rows unaffected

## Verification

\`\`\`
npx tsc --noEmit                              # Type check
npx tsx scripts/smoke-test-prompt-ops.ts      # Smoke test
\`\`\`
`;

  console.log('Posting PromptOps checkpoint to Mission Control...');

  const res = await fetch(`${MC_BASE_URL}/api/documents`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${MC_TOKEN}`,
    },
    body: JSON.stringify({
      title: 'CHECKPOINT — Phase 3A: PromptOps shipped',
      content,
      category: 'plans',
      lane: 'FlashFlow',
      tags: 'prompt-ops,checkpoint',
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error(`Failed: HTTP ${res.status} ${text}`);
    process.exit(1);
  }

  const json = await res.json();
  console.log('Posted successfully. Doc ID:', json.id ?? json.data?.id ?? 'unknown');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
