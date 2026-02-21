/**
 * @module flashflow/prompt-registry
 *
 * Prompt template registry with version control and A/B rollout.
 * Provides resolvePromptVersion() for runtime prompt selection,
 * plus admin CRUD for templates, versions, and assignments.
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';

// ── Types ──────────────────────────────────────────────────────

export interface PromptTemplate {
  id: string;
  key: string;
  title: string;
  description: string | null;
  output_schema_json: Record<string, unknown> | null;
  created_at: string;
}

export interface PromptVersion {
  id: string;
  template_id: string;
  version: number;
  status: 'draft' | 'active' | 'retired';
  system_prompt: string | null;
  developer_prompt: string | null;
  user_prompt_template: string | null;
  guardrails_json: Record<string, unknown>;
  scoring_rubric_json: Record<string, unknown>;
  created_at: string;
  created_by: string | null;
}

export interface PromptAssignment {
  id: string;
  template_id: string;
  active_version_id: string;
  rollout_strategy: 'all' | 'percent' | 'by_user' | 'by_lane';
  rollout_percent: number;
  created_at: string;
  updated_at: string;
}

export interface ResolvedPrompt {
  template: PromptTemplate;
  version: PromptVersion;
  assignment: PromptAssignment;
}

// ── FNV-1a hash for deterministic percent rollout ──────────────

function fnv1aHash(input: string): number {
  let hash = 0x811c9dc5; // FNV offset basis (32-bit)
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0; // FNV prime, keep unsigned 32-bit
  }
  return hash;
}

// ── Core functions ─────────────────────────────────────────────

/**
 * Resolve the active prompt version for a template key.
 * Returns null if template/assignment not found (backwards compat).
 */
export async function resolvePromptVersion(
  templateKey: string,
  userId?: string,
  _lane?: string,
): Promise<ResolvedPrompt | null> {
  try {
    // 1. Look up template by key
    const { data: template, error: tErr } = await supabaseAdmin
      .from('ff_prompt_templates')
      .select('*')
      .eq('key', templateKey)
      .single();

    if (tErr || !template) return null;

    // 2. Look up assignment for template
    const { data: assignment, error: aErr } = await supabaseAdmin
      .from('ff_prompt_assignments')
      .select('*')
      .eq('template_id', template.id)
      .single();

    if (aErr || !assignment) return null;

    // 3. Evaluate rollout
    if (assignment.rollout_strategy === 'percent' && userId) {
      const bucket = fnv1aHash(userId + templateKey) % 100;
      if (bucket >= assignment.rollout_percent) return null;
    }

    // 4. Fetch the active version
    const { data: version, error: vErr } = await supabaseAdmin
      .from('ff_prompt_versions')
      .select('*')
      .eq('id', assignment.active_version_id)
      .single();

    if (vErr || !version) return null;

    return {
      template: template as PromptTemplate,
      version: version as PromptVersion,
      assignment: assignment as PromptAssignment,
    };
  } catch (err) {
    console.error('[ff:prompt-registry] resolvePromptVersion error:', err);
    return null;
  }
}

/**
 * Create a new prompt template.
 */
export async function createTemplate(input: {
  key: string;
  title: string;
  description?: string;
  output_schema_json?: Record<string, unknown>;
}): Promise<PromptTemplate | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('ff_prompt_templates')
      .insert({
        key: input.key,
        title: input.title,
        description: input.description ?? null,
        output_schema_json: input.output_schema_json ?? null,
      })
      .select()
      .single();

    if (error) {
      console.error('[ff:prompt-registry] createTemplate error:', error.message);
      return null;
    }

    return data as PromptTemplate;
  } catch (err) {
    console.error('[ff:prompt-registry] createTemplate exception:', err);
    return null;
  }
}

/**
 * Create a new prompt version (always draft, auto-increments version number).
 * Retries once on unique constraint violation (23505).
 */
export async function createVersion(input: {
  template_id: string;
  system_prompt?: string;
  developer_prompt?: string;
  user_prompt_template?: string;
  guardrails_json?: Record<string, unknown>;
  scoring_rubric_json?: Record<string, unknown>;
  created_by?: string;
}): Promise<PromptVersion | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      // Get next version number
      const { data: maxRow } = await supabaseAdmin
        .from('ff_prompt_versions')
        .select('version')
        .eq('template_id', input.template_id)
        .order('version', { ascending: false })
        .limit(1)
        .single();

      const nextVersion = (maxRow?.version ?? 0) + 1;

      const { data, error } = await supabaseAdmin
        .from('ff_prompt_versions')
        .insert({
          template_id: input.template_id,
          version: nextVersion,
          status: 'draft',
          system_prompt: input.system_prompt ?? null,
          developer_prompt: input.developer_prompt ?? null,
          user_prompt_template: input.user_prompt_template ?? null,
          guardrails_json: input.guardrails_json ?? {},
          scoring_rubric_json: input.scoring_rubric_json ?? {},
          created_by: input.created_by ?? null,
        })
        .select()
        .single();

      if (error) {
        // Retry on unique violation
        if (error.code === '23505' && attempt === 0) continue;
        console.error('[ff:prompt-registry] createVersion error:', error.message);
        return null;
      }

      return data as PromptVersion;
    } catch (err) {
      console.error('[ff:prompt-registry] createVersion exception:', err);
      return null;
    }
  }
  return null;
}

/**
 * Assign (activate) a version for a template.
 * Retires the current active version, sets the new one to 'active',
 * and upserts the assignment row.
 */
export async function assignVersion(input: {
  template_id: string;
  active_version_id: string;
  rollout_strategy?: 'all' | 'percent' | 'by_user' | 'by_lane';
  rollout_percent?: number;
}): Promise<PromptAssignment | null> {
  try {
    // Retire current active versions for this template
    await supabaseAdmin
      .from('ff_prompt_versions')
      .update({ status: 'retired' })
      .eq('template_id', input.template_id)
      .eq('status', 'active');

    // Set new version to active
    const { error: activateErr } = await supabaseAdmin
      .from('ff_prompt_versions')
      .update({ status: 'active' })
      .eq('id', input.active_version_id);

    if (activateErr) {
      console.error('[ff:prompt-registry] activate version error:', activateErr.message);
      return null;
    }

    // Upsert assignment
    const { data, error } = await supabaseAdmin
      .from('ff_prompt_assignments')
      .upsert(
        {
          template_id: input.template_id,
          active_version_id: input.active_version_id,
          rollout_strategy: input.rollout_strategy ?? 'all',
          rollout_percent: input.rollout_percent ?? 100,
        },
        { onConflict: 'template_id' },
      )
      .select()
      .single();

    if (error) {
      console.error('[ff:prompt-registry] assignVersion upsert error:', error.message);
      return null;
    }

    return data as PromptAssignment;
  } catch (err) {
    console.error('[ff:prompt-registry] assignVersion exception:', err);
    return null;
  }
}
