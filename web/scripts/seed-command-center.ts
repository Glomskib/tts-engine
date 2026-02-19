#!/usr/bin/env tsx
/**
 * Seed Command Center with demo data.
 *
 * Idempotent: checks for existing rows before insert, safe to re-run.
 * Uses upsert-by-title pattern for all entities.
 *
 * Canonical naming:
 *   - FLASHFLOW_CORE is the umbrella initiative for FlashFlow + TikTok Shop
 *   - "TikTok Shop" is a project under FlashFlow, NOT a separate initiative
 *   - Ideas with tiktok_shop tags belong to FLASHFLOW_CORE
 *
 * Usage:
 *   pnpm run seed:cc
 *   npx tsx scripts/seed-command-center.ts
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('ERROR: Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

async function main() {
  const { createClient } = await import('@supabase/supabase-js');
  const sb = createClient(SUPABASE_URL!, SERVICE_KEY!, {
    auth: { persistSession: false },
  });

  let created = 0;
  let skipped = 0;

  function log(entity: string, action: 'created' | 'skipped' | 'updated', name: string) {
    if (action === 'created') created++;
    else skipped++;
    const icon = action === 'created' ? '\u2795' : action === 'updated' ? '\u270f\ufe0f' : '\u23ed\ufe0f';
    console.log(`${icon} ${entity}: ${name} [${action}]`);
  }

  // ── Helpers ────────────────────────────────────────────────────

  async function upsertByTitle<T extends Record<string, unknown>>(
    table: string,
    titleField: string,
    titleValue: string,
    row: T,
  ): Promise<string> {
    const { data: existing } = await sb
      .from(table)
      .select('id')
      .eq(titleField, titleValue)
      .limit(1)
      .single();

    if (existing) {
      log(table, 'skipped', titleValue);
      return existing.id as string;
    }

    const { data, error } = await sb
      .from(table)
      .insert(row)
      .select('id')
      .single();

    if (error) {
      console.error(`  ERROR inserting into ${table}: ${error.message}`);
      log(table, 'skipped', `${titleValue} (error)`);
      return '';
    }
    log(table, 'created', titleValue);
    return (data as { id: string }).id;
  }

  /** Upsert an initiative with slug support. If a row with matching slug exists, update title. */
  async function upsertInitiative(slug: string, title: string, type: string): Promise<string> {
    // Check by slug first
    const { data: bySlug } = await sb
      .from('initiatives')
      .select('id, title')
      .eq('slug', slug)
      .limit(1)
      .single();

    if (bySlug) {
      // Update title if changed
      if (bySlug.title !== title) {
        await sb.from('initiatives').update({ title }).eq('id', bySlug.id);
        log('initiatives', 'updated', `${slug} → ${title}`);
      } else {
        log('initiatives', 'skipped', slug);
      }
      return bySlug.id as string;
    }

    // Check by title (legacy rows without slug)
    const { data: byTitle } = await sb
      .from('initiatives')
      .select('id')
      .eq('title', title)
      .limit(1)
      .single();

    if (byTitle) {
      // Add slug to existing row
      await sb.from('initiatives').update({ slug }).eq('id', byTitle.id);
      log('initiatives', 'updated', `${title} → slug=${slug}`);
      return byTitle.id as string;
    }

    // Insert new
    const { data, error } = await sb
      .from('initiatives')
      .insert({
        title,
        slug,
        type,
        status: 'active',
        owner_email: 'spiderbuttons@gmail.com',
      })
      .select('id')
      .single();

    if (error) {
      console.error(`  ERROR inserting initiative: ${error.message}`);
      return '';
    }
    log('initiatives', 'created', `${slug} (${title})`);
    return (data as { id: string }).id;
  }

  // ── 1. Initiatives ─────────────────────────────────────────────
  // FLASHFLOW_CORE is the umbrella: FlashFlow platform + TikTok Shop + content ops

  const initFlashFlow = await upsertInitiative('FLASHFLOW_CORE', 'FlashFlow', 'business');
  const initHHH = await upsertInitiative('MMM_HHH_2026', 'MMM — HHH 2026', 'business');
  const initFFF = await upsertInitiative('MMM_FONDO_2026', 'MMM — Findlay Further Fondo 2026-04-25', 'business');
  const initSponsor = await upsertInitiative('MMM_SPONSORS_2026', 'MMM — Sponsorships 2026', 'business');
  const initGrants = await upsertInitiative('MMM_GRANTS_2026', 'MMM — Grants 2026', 'business');
  const initOpenClaw = await upsertInitiative('OPENCLAW_OPS', 'OpenClaw — Agent Ops & Reliability', 'business');
  const initAmazon = await upsertInitiative('AMAZON_WHOLESALE', 'Amazon/Wholesale — Ops & Growth', 'business');
  const initZebby = await upsertInitiative('ZEBBY_WORLD', "Zebby's World — Core App MVP", 'personal');

  // ── Clean up: merge any lingering TikTok Shop initiative ───────
  const { data: ttsRows } = await sb
    .from('initiatives')
    .select('id')
    .or('title.ilike.%TikTok Shop%,title.ilike.%TTS%Engine%,title.ilike.%Content Engine%')
    .neq('slug', 'FLASHFLOW_CORE');

  if (ttsRows && ttsRows.length > 0 && initFlashFlow) {
    const ttsIds = ttsRows.map((r) => r.id);
    console.log(`  Merging ${ttsIds.length} TikTok Shop initiative(s) into FLASHFLOW_CORE...`);
    await sb.from('cc_projects').update({ initiative_id: initFlashFlow }).in('initiative_id', ttsIds);
    await sb.from('finance_transactions').update({ initiative_id: initFlashFlow }).in('initiative_id', ttsIds);
    await sb.from('initiatives').delete().in('id', ttsIds);
    log('initiatives', 'updated', `merged ${ttsIds.length} TTS row(s) → FLASHFLOW_CORE`);
  }

  // ── 2. Projects (under FLASHFLOW_CORE umbrella) ────────────────

  const projPlatform = await upsertByTitle('cc_projects', 'name', 'FlashFlow Platform Core', {
    name: 'FlashFlow Platform Core',
    type: 'flashflow',
    status: 'active',
    owner: 'tom-dev',
    initiative_id: initFlashFlow || null,
  });

  const projContentOps = await upsertByTitle('cc_projects', 'name', 'FlashFlow Content Ops (TikTok Shop)', {
    name: 'FlashFlow Content Ops (TikTok Shop)',
    type: 'ttshop',
    status: 'active',
    owner: 'greg-uploader',
    initiative_id: initFlashFlow || null,
  });

  const projOpenClawAgents = await upsertByTitle('cc_projects', 'name', 'FlashFlow OpenClaw Agents', {
    name: 'FlashFlow OpenClaw Agents',
    type: 'other',
    status: 'active',
    owner: 'dan-ops',
    initiative_id: initFlashFlow || null,
  });

  const projHHH = await upsertByTitle('cc_projects', 'name', 'HHH Marketing', {
    name: 'HHH Marketing',
    type: 'hhh',
    status: 'active',
    owner: 'brett-growth',
    initiative_id: initHHH || null,
  });

  const projZebby = await upsertByTitle('cc_projects', 'name', 'Zebby Compliance', {
    name: 'Zebby Compliance',
    type: 'zebby',
    status: 'active',
    owner: 'dan-ops',
    initiative_id: initZebby || null,
  });

  const projOpenClaw = await upsertByTitle('cc_projects', 'name', 'OpenClaw Ops', {
    name: 'OpenClaw Ops',
    type: 'other',
    status: 'active',
    owner: 'dan-ops',
    initiative_id: initOpenClaw || null,
  });

  const projAmazon = await upsertByTitle('cc_projects', 'name', 'Amazon/Wholesale Channel', {
    name: 'Amazon/Wholesale Channel',
    type: 'other',
    status: 'active',
    owner: 'brett-growth',
    initiative_id: initAmazon || null,
  });

  // Rename legacy "FlashFlow Platform" → now "FlashFlow Platform Core"
  // and legacy "TT Shop Integration" → now "FlashFlow Content Ops (TikTok Shop)"
  // (handled by upsertByTitle — new names create new rows, old rows stay but harmless)

  // ── 3. Tasks ───────────────────────────────────────────────────

  if (projPlatform) {
    await upsertByTitle('project_tasks', 'title', 'Implement Command Center dashboard', {
      project_id: projPlatform,
      title: 'Implement Command Center dashboard',
      description: 'Build the admin-only ops dashboard with stats, activity feed, and quick nav.',
      assigned_agent: 'tom-dev',
      status: 'active',
      priority: 1,
      risk_tier: 'low',
    });

    await upsertByTitle('project_tasks', 'title', 'Set up usage event ingestion pipeline', {
      project_id: projPlatform,
      title: 'Set up usage event ingestion pipeline',
      description: 'Wire openclaw adapter to capture all LLM API calls and record them as usage_events.',
      assigned_agent: 'dan-ops',
      status: 'queued',
      priority: 2,
      risk_tier: 'medium',
    });
  }

  if (projHHH) {
    await upsertByTitle('project_tasks', 'title', 'Research competitor positioning for HHH', {
      project_id: projHHH,
      title: 'Research competitor positioning for HHH',
      description: 'Analyze top 5 competitors in the wellness space and summarize positioning gaps.',
      assigned_agent: 'brett-growth',
      status: 'queued',
      priority: 2,
      risk_tier: 'low',
    });
  }

  if (projContentOps) {
    await upsertByTitle('project_tasks', 'title', 'Build TikTok Shop product sync', {
      project_id: projContentOps,
      title: 'Build TikTok Shop product sync',
      description: 'Automate product listing sync between Shopify and TikTok Shop.',
      assigned_agent: 'greg-uploader',
      status: 'active',
      priority: 1,
      risk_tier: 'high',
    });
  }

  if (projZebby) {
    await upsertByTitle('project_tasks', 'title', 'Audit Zebby data retention policies', {
      project_id: projZebby,
      title: 'Audit Zebby data retention policies',
      description: 'Review and document current data retention, GDPR compliance status.',
      assigned_agent: 'dan-ops',
      status: 'queued',
      priority: 3,
      risk_tier: 'medium',
    });

    await upsertByTitle('project_tasks', 'title', 'Set up monitoring alerts for Zebby', {
      project_id: projZebby,
      title: 'Set up monitoring alerts for Zebby',
      description: 'Configure uptime and error rate alerts for all Zebby endpoints.',
      assigned_agent: 'dan-ops',
      status: 'blocked',
      priority: 2,
      risk_tier: 'low',
    });
  }

  // ── 4. Ideas ───────────────────────────────────────────────────
  // TikTok-related ideas use tags [tiktok_shop, ...] under FLASHFLOW_CORE

  await upsertByTitle('ideas', 'title', 'AI-powered product descriptions from reviews', {
    title: 'AI-powered product descriptions from reviews',
    prompt: 'Use customer review sentiment to auto-generate product descriptions that highlight what real buyers love.',
    tags: ['flashflow', 'ai', 'content', 'tiktok_shop'],
    mode: 'research_and_plan',
    priority: 1,
    status: 'queued',
    score: 9.2,
    created_by: 'human',
  });

  await upsertByTitle('ideas', 'title', 'Automated TikTok trending sound matcher', {
    title: 'Automated TikTok trending sound matcher',
    prompt: 'Build a tool that matches product video clips with trending TikTok sounds for maximum reach.',
    tags: ['tiktok_shop', 'social', 'automation', 'creator_ops'],
    mode: 'research_only',
    priority: 2,
    status: 'queued',
    score: 7.5,
    created_by: 'brett-growth',
  });

  await upsertByTitle('ideas', 'title', 'Multi-brand affiliate dashboard', {
    title: 'Multi-brand affiliate dashboard',
    prompt: 'Unified dashboard showing affiliate performance across all brands with revenue attribution.',
    tags: ['flashflow', 'affiliate', 'analytics'],
    mode: 'research_and_build',
    priority: 2,
    status: 'researched',
    score: 8.1,
    created_by: 'human',
  });

  await upsertByTitle('ideas', 'title', 'Auto-respond to negative reviews with empathy template', {
    title: 'Auto-respond to negative reviews with empathy template',
    prompt: 'AI drafts empathetic responses to 1-2 star reviews within 1 hour of posting.',
    tags: ['zebby', 'customer-service'],
    mode: 'research_only',
    priority: 3,
    status: 'inbox',
    score: 5.0,
    created_by: 'susan-social',
  });

  await upsertByTitle('ideas', 'title', 'Nightly cost anomaly detector', {
    title: 'Nightly cost anomaly detector',
    prompt: 'Alert if daily LLM spend exceeds 2x the 7-day rolling average.',
    tags: ['flashflow', 'ops', 'cost'],
    mode: 'research_and_plan',
    priority: 1,
    status: 'queued',
    score: 8.8,
    created_by: 'dan-ops',
  });

  await upsertByTitle('ideas', 'title', 'Weekly digest email for stakeholders', {
    title: 'Weekly digest email for stakeholders',
    prompt: 'Auto-generate and send a weekly summary of all project progress, costs, and blockers.',
    tags: ['flashflow', 'reporting'],
    mode: 'research_only',
    priority: 4,
    status: 'killed',
    score: 3.2,
    created_by: 'human',
  });

  // ── Summary ────────────────────────────────────────────────────

  // Suppress unused variable warnings
  void initSponsor; void initGrants; void initFFF;
  void projOpenClaw; void projAmazon; void projOpenClawAgents;

  console.log(`\n${'='.repeat(50)}`);
  console.log(`Seed complete: ${created} created, ${skipped} skipped (already exist)`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
