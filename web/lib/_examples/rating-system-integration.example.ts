// ============================================================
// FlashFlow — INTEGRATION EXAMPLE for the generation endpoint.
//
// This is NOT a drop-in file. It shows the minimal diff needed
// at your existing /api/generate (or wherever scripts are
// created). Copy the marked sections into the real route.
// ============================================================

import { createClient } from '@supabase/supabase-js';
import { buildPatternPromptBlock } from '@/lib/pattern-signals';
import {
  normalizePattern,
  extractPatternHeuristic,
  type ScriptPattern,
} from '@/lib/pattern-extractor';

// ---------- existing types (yours will differ) ----------
type GenerateRequest = {
  niche?: string;
  product?: string;
  // ...whatever your endpoint already accepts
};

type GeneratedScript = {
  id: string;
  hook: string;
  body: string;
  // existing fields...
  // NEW — ask the AI to emit these alongside the script:
  tags?: Partial<ScriptPattern>;
};

// ---------- helpers (yours will differ) ----------
declare function callAnthropic(systemPrompt: string, userPrompt: string): Promise<GeneratedScript[]>;

// ============================================================
// STEP 1 — Inject pattern signals into the system prompt.
// ============================================================
export async function buildSystemPrompt(req: GenerateRequest): Promise<string> {
  // existing system prompt — your current one
  const basePrompt = `You are FlashFlow's TikTok Shop script generator...`;

  // NEW: pull cross-account performance signals
  const patternBlock = await buildPatternPromptBlock(req.niche ?? null);

  return [basePrompt, patternBlock].filter(Boolean).join('\n\n');
}

// ============================================================
// STEP 2 — Ask the AI to ALSO return tags. Add this to the
// instructions you send the model:
// ============================================================
export const TAG_INSTRUCTIONS = `
For EACH script you generate, also return a "tags" object with these fields:
  - hook_type: one of [question, shock, storytime, pov, before_after, controversy, list, demo]
  - persona: one of [expert, peer, skeptic, newbie, insider, parent, pro_user]
  - cta_style: one of [urgency, curiosity, social_proof, discount, limited_stock, none]
  - tone: one of [casual, authoritative, energetic, calm, snarky, warm]
  - pace: one of [fast_cut, slow_build, mixed]
Use the EXACT lowercase values listed. These tags drive performance learning.
`.trim();

// ============================================================
// STEP 3 — After generation, persist each script's pattern.
// ============================================================
function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export async function persistScriptPattern(args: {
  scriptId: string;
  accountId: string;
  niche?: string;
  productCategory?: string;
  hook: string;
  fullScript: string;
  aiTags?: Partial<ScriptPattern>;
}) {
  // Prefer AI tags; fall back to heuristic if missing
  const heuristic = extractPatternHeuristic({
    hook: args.hook,
    fullScript: args.fullScript,
    niche: args.niche,
  });

  const merged = normalizePattern({
    ...heuristic,
    ...args.aiTags,
    niche: args.niche ?? heuristic.niche,
    product_category: args.productCategory,
    hook_length: heuristic.hook_length,
    script_length: heuristic.script_length,
  });

  await admin()
    .from('script_patterns')
    .upsert({
      script_id: args.scriptId,
      account_id: args.accountId,
      ...merged,
    });
}

// ============================================================
// PUT IT TOGETHER — example POST handler
// ============================================================
export async function exampleHandler(req: GenerateRequest, accountId: string) {
  const system = await buildSystemPrompt(req);
  const user = `${TAG_INSTRUCTIONS}\n\nNiche: ${req.niche ?? 'general'}\nProduct: ${req.product ?? ''}`;

  const scripts = await callAnthropic(system, user);

  // Fire-and-forget pattern persistence — don't block the response
  Promise.all(
    scripts.map((s) =>
      persistScriptPattern({
        scriptId: s.id,
        accountId,
        niche: req.niche,
        hook: s.hook,
        fullScript: `${s.hook}\n\n${s.body}`,
        aiTags: s.tags,
      })
    )
  ).catch((err) => console.warn('[persistScriptPattern] failed', err));

  return scripts;
}
