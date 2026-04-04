/**
 * Campaign Generation Engine
 *
 * Orchestrates: experiment creation → hook generation → concept creation →
 * script generation → content item creation → experiment_creatives linking.
 *
 * Designed for partial success — each step logs progress, and the campaign
 * can be resumed or inspected even if generation fails midway.
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getPersonaById } from '@/lib/personas';
import { logEventSafe } from '@/lib/events-log';
import type {
  CampaignConfig,
  CampaignGenerateRequest,
  CampaignMatrixCell,
  CampaignGenerateResponse,
  MAX_MATRIX_SIZE,
  MAX_HOOKS_PER_COMBO,
  MAX_PERSONAS,
  MAX_ANGLES,
} from './types';

interface GenerateContext {
  userId: string;
  experimentId: string;
  productName: string;
  productBrand: string;
  errors: string[];
}

// ── Public entry point ──────────────────────────────────────────

export async function generateCampaign(
  req: CampaignGenerateRequest,
  userId: string,
): Promise<CampaignGenerateResponse> {
  const errors: string[] = [];

  // 1. Fetch product info
  const { data: product } = await supabaseAdmin
    .from('products')
    .select('id, name, brand, category, pain_points')
    .eq('id', req.product_id)
    .single();

  if (!product) {
    return { ok: false, experiment_id: '', matrix: [], total_hooks: 0, total_scripts: 0, total_items: 0, errors: ['Product not found'] };
  }

  // 2. Build the matrix
  const matrix: CampaignMatrixCell[] = [];
  for (const personaId of req.persona_ids) {
    const persona = getPersonaById(personaId);
    if (!persona) {
      errors.push(`Persona "${personaId}" not found, skipping`);
      continue;
    }
    for (const angle of req.angles) {
      matrix.push({
        persona_id: personaId,
        persona_name: persona.name,
        angle,
        hook_count: req.hooks_per_combo,
      });
    }
  }

  const totalHooksRequested = matrix.reduce((sum, cell) => sum + cell.hook_count, 0);

  // 3. Create the experiment
  const config: CampaignConfig = {
    hooks_per_combo: req.hooks_per_combo,
    persona_ids: req.persona_ids,
    angles: req.angles,
    platform: req.platform,
    tone: req.tone,
    cta_style: req.cta_style,
    auto_script: req.auto_script,
    auto_content_items: req.auto_content_items,
    generation_status: 'generating_hooks',
    generation_progress: {
      hooks_requested: totalHooksRequested,
      hooks_generated: 0,
      scripts_requested: 0,
      scripts_generated: 0,
      items_created: 0,
      errors: [],
      started_at: new Date().toISOString(),
    },
  };

  const { data: experiment, error: expError } = await supabaseAdmin
    .from('experiments')
    .insert({
      workspace_id: userId,
      brand_id: req.brand_id,
      product_id: req.product_id,
      name: req.name,
      goal: req.goal || null,
      status: 'draft',
      campaign_config: config,
    })
    .select()
    .single();

  if (expError || !experiment) {
    return { ok: false, experiment_id: '', matrix, total_hooks: 0, total_scripts: 0, total_items: 0, errors: [`Failed to create experiment: ${expError?.message}`] };
  }

  const ctx: GenerateContext = {
    userId,
    experimentId: experiment.id,
    productName: product.name,
    productBrand: product.brand || '',
    errors,
  };

  // Log campaign start
  await logEventSafe(supabaseAdmin, {
    entity_type: 'system',
    entity_id: experiment.id,
    event_type: 'campaign_generation_started',
    payload: { matrix_size: matrix.length, total_hooks: totalHooksRequested, product_id: req.product_id },
  });

  // 4. Generate hooks for each matrix cell
  let totalHooksGenerated = 0;
  const generatedHooks: Array<{ persona_id: string; angle: string; hooks: HookResult[] }> = [];

  for (const cell of matrix) {
    try {
      const hooks = await generateHooksForCell(cell, req, product, ctx);
      generatedHooks.push({ persona_id: cell.persona_id, angle: cell.angle, hooks });
      totalHooksGenerated += hooks.length;

      // Update progress
      await updateProgress(ctx.experimentId, {
        generation_status: 'generating_hooks',
        'generation_progress.hooks_generated': totalHooksGenerated,
      });
    } catch (err) {
      const msg = `Hook generation failed for ${cell.persona_name} × ${cell.angle}: ${String(err)}`;
      errors.push(msg);
      config.generation_progress.errors.push(msg);
    }
  }

  // 5. Create concepts + scripts if auto_script is enabled
  let totalScripts = 0;
  let totalItems = 0;

  if (req.auto_script && generatedHooks.length > 0) {
    await updateProgress(ctx.experimentId, { generation_status: 'generating_scripts' });

    for (const group of generatedHooks) {
      for (const hook of group.hooks) {
        try {
          const result = await createConceptAndScript(hook, group, req, product, ctx);
          if (result.scriptCreated) totalScripts++;
          if (result.itemCreated) totalItems++;

          await updateProgress(ctx.experimentId, {
            'generation_progress.scripts_generated': totalScripts,
            'generation_progress.items_created': totalItems,
          });
        } catch (err) {
          errors.push(`Script/item creation failed: ${String(err)}`);
        }
      }
    }
  }

  // 6. Finalize
  const finalStatus = errors.length === 0 ? 'completed'
    : totalHooksGenerated > 0 ? 'partial'
    : 'failed';

  await supabaseAdmin
    .from('experiments')
    .update({
      hook_count: totalHooksGenerated,
      status: finalStatus === 'completed' ? 'running' : 'draft',
      campaign_config: {
        ...config,
        generation_status: finalStatus,
        generation_progress: {
          ...config.generation_progress,
          hooks_generated: totalHooksGenerated,
          scripts_generated: totalScripts,
          items_created: totalItems,
          errors,
          completed_at: new Date().toISOString(),
        },
      },
    })
    .eq('id', experiment.id);

  await logEventSafe(supabaseAdmin, {
    entity_type: 'system',
    entity_id: experiment.id,
    event_type: 'campaign_generation_completed',
    payload: { status: finalStatus, hooks: totalHooksGenerated, scripts: totalScripts, items: totalItems, error_count: errors.length },
  });

  return {
    ok: finalStatus !== 'failed',
    experiment_id: experiment.id,
    matrix,
    total_hooks: totalHooksGenerated,
    total_scripts: totalScripts,
    total_items: totalItems,
    errors,
  };
}

// ── Hook generation per matrix cell ─────────────────────────────

interface HookResult {
  visual_hook: string;
  text_on_screen: string;
  verbal_hook: string;
  strategy_note: string;
  category: string;
}

async function generateHooksForCell(
  cell: CampaignMatrixCell,
  req: CampaignGenerateRequest,
  product: { name: string; brand: string | null; category: string | null; pain_points: string[] | null },
  ctx: GenerateContext,
): Promise<HookResult[]> {
  // Call the hook generation API internally
  const productDescription = [
    product.name,
    product.brand ? `by ${product.brand}` : '',
    product.category ? `(${product.category})` : '',
    `— Angle: ${cell.angle}`,
  ].filter(Boolean).join(' ');

  const persona = getPersonaById(cell.persona_id);
  const audienceContext = persona
    ? `${persona.name}: ${persona.fullDescription}. Tone: ${persona.tone}, Style: ${persona.style}`
    : '';

  const response = await fetch(`${getBaseUrl()}/api/hooks/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      product: productDescription,
      platform: req.platform === 'instagram_reels' ? 'instagram_reels' : req.platform === 'youtube_shorts' ? 'youtube_shorts' : 'tiktok',
      niche: product.category || '',
      tone: req.tone || persona?.tone || '',
      audience: audienceContext,
      constraints: req.cta_style ? `CTA style: ${req.cta_style}` : '',
    }),
  });

  if (!response.ok) {
    throw new Error(`Hook API returned ${response.status}`);
  }

  const data = await response.json();
  const hooks: HookResult[] = (data.hooks || []).slice(0, cell.hook_count);
  return hooks;
}

// ── Concept + Script + Content Item creation ────────────────────

async function createConceptAndScript(
  hook: HookResult,
  group: { persona_id: string; angle: string },
  req: CampaignGenerateRequest,
  product: { id?: string; name: string; brand: string | null },
  ctx: GenerateContext,
): Promise<{ scriptCreated: boolean; itemCreated: boolean }> {
  let scriptCreated = false;
  let itemCreated = false;

  // Create concept
  const conceptTitle = `${product.name} — ${group.angle} (${hook.category || 'hook'})`;
  const { data: concept, error: conceptError } = await supabaseAdmin
    .from('concepts')
    .insert({
      product_id: req.product_id,
      concept_title: conceptTitle,
      title: conceptTitle,
      core_angle: group.angle,
      visual_hook: hook.visual_hook,
      on_screen_text_hook: hook.text_on_screen,
      hook_options: [hook.verbal_hook],
      user_id: ctx.userId,
      notes: `Auto-generated campaign hook. Strategy: ${hook.strategy_note}`,
    })
    .select()
    .single();

  if (conceptError || !concept) {
    throw new Error(`Concept creation failed: ${conceptError?.message}`);
  }

  // Generate script via API
  try {
    const scriptRes = await fetch(`${getBaseUrl()}/api/scripts/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        concept_id: concept.id,
        hook_text: hook.verbal_hook,
        category_risk: 'general',
      }),
    });

    if (scriptRes.ok) {
      const scriptData = await scriptRes.json();
      if (scriptData.ok) {
        scriptCreated = true;

        // Create content item if auto_content_items is enabled
        if (req.auto_content_items) {
          const persona = getPersonaById(group.persona_id);
          const itemTitle = `${product.brand || product.name} — ${group.angle} — ${persona?.name || group.persona_id}`;

          const { data: item, error: itemError } = await supabaseAdmin
            .from('content_items')
            .insert({
              workspace_id: ctx.userId,
              title: itemTitle,
              brand_id: req.brand_id,
              product_id: req.product_id,
              source_type: 'script_generator',
              source_ref_id: concept.id,
              primary_hook: hook.verbal_hook,
              script_text: scriptData.data?.spoken_script || scriptData.data?.script_v1 || null,
              creative_notes: `Angle: ${group.angle}\nPersona: ${persona?.name || group.persona_id}\nVisual hook: ${hook.visual_hook}`,
              status: 'scripted',
              experiment_id: ctx.experimentId,
              short_id: 'temp',
              created_by: ctx.userId,
            })
            .select()
            .single();

          if (!itemError && item) {
            itemCreated = true;

            // Link to experiment_creatives
            await supabaseAdmin
              .from('experiment_creatives')
              .insert({
                experiment_id: ctx.experimentId,
                content_item_id: item.id,
                hook: hook.verbal_hook,
                angle: group.angle,
                persona: persona?.name || group.persona_id,
                cta: req.cta_style || null,
              });
          }
        }
      }
    }
  } catch (err) {
    ctx.errors.push(`Script generation error for concept ${concept.id}: ${String(err)}`);
  }

  return { scriptCreated, itemCreated };
}

// ── Helpers ─────────────────────────────────────────────────────

function getBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
}

async function updateProgress(experimentId: string, updates: Record<string, unknown>) {
  // For nested JSONB updates, we need to fetch and merge
  const { data: current } = await supabaseAdmin
    .from('experiments')
    .select('campaign_config')
    .eq('id', experimentId)
    .single();

  if (!current?.campaign_config) return;

  const config = current.campaign_config as CampaignConfig;
  const newConfig = { ...config };

  for (const [key, value] of Object.entries(updates)) {
    if (key === 'generation_status') {
      newConfig.generation_status = value as CampaignConfig['generation_status'];
    } else if (key.startsWith('generation_progress.')) {
      const progressKey = key.replace('generation_progress.', '') as keyof CampaignConfig['generation_progress'];
      (newConfig.generation_progress as Record<string, unknown>)[progressKey] = value;
    }
  }

  await supabaseAdmin
    .from('experiments')
    .update({ campaign_config: newConfig })
    .eq('id', experimentId);
}
