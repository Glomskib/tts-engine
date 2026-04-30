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
  const initHHH = await upsertInitiative('MMM_HHH_2026', 'MMM — HHH 2026 (Sept 12 · 7AM · VFW)', 'business');
  const initFFF = await upsertInitiative('MMM_FONDO_2026', 'MMM — Findlay Further Fondo 2026 (completed Apr 25)', 'business');
  const initSponsor = await upsertInitiative('MMM_SPONSORS_2026', 'MMM — Sponsorships 2026', 'business');
  const initGrants = await upsertInitiative('MMM_GRANTS_2026', 'MMM — Grants 2026', 'business');

  // Mark FFF as archived now that the event is in the books (Apr 25, 2026).
  if (initFFF) {
    const { error: fffStatusErr } = await sb
      .from('initiatives')
      .update({ status: 'archived' })
      .eq('id', initFFF);
    if (!fffStatusErr) log('initiatives', 'updated', 'MMM_FONDO_2026 → status=archived');
  }
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
    owner: 'brandon',
    initiative_id: initHHH || null,
  });

  const projHHHOps = await upsertByTitle('cc_projects', 'name', 'HHH Event Ops', {
    name: 'HHH Event Ops',
    type: 'hhh',
    status: 'active',
    owner: 'tim',
    initiative_id: initHHH || null,
  });

  const projFFF = await upsertByTitle('cc_projects', 'name', 'FFF Post-Event Wrap', {
    name: 'FFF Post-Event Wrap',
    type: 'hhh',
    status: 'active',
    owner: 'brandon',
    initiative_id: initFFF || null,
  });

  const projSponsors = await upsertByTitle('cc_projects', 'name', 'MMM Sponsorships 2026', {
    name: 'MMM Sponsorships 2026',
    type: 'hhh',
    status: 'active',
    owner: 'brandon',
    initiative_id: initSponsor || null,
  });

  const projGrants = await upsertByTitle('cc_projects', 'name', 'MMM Grants 2026', {
    name: 'MMM Grants 2026',
    type: 'hhh',
    status: 'active',
    owner: 'brandon',
    initiative_id: initGrants || null,
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
    // Re-target the legacy "wellness positioning" task to the actual cycling-event focus.
    await upsertByTitle('project_tasks', 'title', 'Research competitor positioning for HHH', {
      project_id: projHHH,
      title: 'Research competitor positioning for HHH',
      description:
        'Study other regional cycling events (gravel + charity rides) — registration formats, sponsor models, after-party patterns. Feed findings into the HHH sponsor packet.',
      assigned_agent: 'bolt-miles',
      status: 'queued',
      priority: 2,
      risk_tier: 'low',
      meta: { source: 'agent', approval_state: 'pending' },
    });

    await upsertByTitle('project_tasks', 'title', 'HHH registration push (47 → 200)', {
      project_id: projHHH,
      title: 'HHH registration push (47 → 200)',
      description: 'Drive registrations from 47 toward the 200 goal via social, email warm pool, and rider-of-FFF follow-ups.',
      assigned_agent: 'brandon',
      status: 'active',
      priority: 1,
      risk_tier: 'medium',
      meta: { source: 'human' },
    });

    await upsertByTitle('project_tasks', 'title', 'HHH sponsor packet — 2026 update', {
      project_id: projHHH,
      title: 'HHH sponsor packet — 2026 update',
      description: 'Refresh sponsor packet with confirmed Sept 12 date, VFW location, after-party + battle of the bands detail, and FFF photos.',
      assigned_agent: 'brandon',
      status: 'queued',
      priority: 1,
      risk_tier: 'low',
      meta: { source: 'human' },
    });

    await upsertByTitle('project_tasks', 'title', 'HHH sponsor outreach (5 of 8 remaining)', {
      project_id: projHHH,
      title: 'HHH sponsor outreach (5 of 8 remaining)',
      description: 'Outreach to fill remaining 5 sponsor slots. 3 secured. Target $2,500 average per slot.',
      assigned_agent: 'brandon',
      status: 'queued',
      priority: 1,
      risk_tier: 'medium',
      meta: { source: 'human' },
    });

    await upsertByTitle('project_tasks', 'title', 'HHH merch designs', {
      project_id: projHHH,
      title: 'HHH merch designs',
      description: 'Lock 2026 HHH merch lineup — tees, hats, and one new item. Designs need to be approved before pre-order opens.',
      assigned_agent: 'brandon',
      status: 'queued',
      priority: 2,
      risk_tier: 'low',
      meta: { source: 'human' },
    });

    await upsertByTitle('project_tasks', 'title', 'Sponsor spotlight schedule (social)', {
      project_id: projHHH,
      title: 'Sponsor spotlight schedule (social)',
      description: 'Weekly sponsor spotlight cadence on Facebook from June through HHH. Coordinate with Miles for first drafts.',
      assigned_agent: 'bolt-miles',
      status: 'queued',
      priority: 3,
      risk_tier: 'low',
      meta: { source: 'agent', approval_state: 'pending' },
    });
  }

  if (projHHHOps) {
    await upsertByTitle('project_tasks', 'title', 'HHH parking walkthrough video', {
      project_id: projHHHOps,
      title: 'HHH parking walkthrough video',
      description: 'Tim to scout VFW parking and shoot a 60-second walkthrough by July 15 so social can queue the teaser early August.',
      assigned_agent: 'tim',
      status: 'queued',
      priority: 2,
      risk_tier: 'low',
      meta: { source: 'human' },
    });

    await upsertByTitle('project_tasks', 'title', 'HHH route finalization', {
      project_id: projHHHOps,
      title: 'HHH route finalization',
      description: 'Confirm route, distances, aid station locations, and emergency turn-around points. Lock by mid-August.',
      assigned_agent: 'tim',
      status: 'queued',
      priority: 1,
      risk_tier: 'medium',
      meta: { source: 'human' },
    });

    await upsertByTitle('project_tasks', 'title', 'HHH volunteer recruitment', {
      project_id: projHHHOps,
      title: 'HHH volunteer recruitment',
      description: 'Recruit volunteers for registration, aid stations, parking, after-party. Use FFF day-of helpers as the warm pool.',
      assigned_agent: 'josh',
      status: 'queued',
      priority: 1,
      risk_tier: 'low',
      meta: { source: 'human' },
    });

    await upsertByTitle('project_tasks', 'title', 'HHH food/vendor coordination', {
      project_id: projHHHOps,
      title: 'HHH food/vendor coordination',
      description: 'Lock food vendors and raffle prize donors for HHH. After-party catering needs separate confirmation.',
      assigned_agent: 'josh',
      status: 'queued',
      priority: 2,
      risk_tier: 'medium',
      meta: { source: 'human' },
    });

    await upsertByTitle('project_tasks', 'title', 'Battle of the bands — book lineup', {
      project_id: projHHHOps,
      title: 'Battle of the bands — book lineup',
      description: 'Book local bands for HHH after-party stage. Open call goes out in May; lock lineup by end of June.',
      assigned_agent: 'josh',
      status: 'queued',
      priority: 2,
      risk_tier: 'medium',
      meta: { source: 'human' },
    });

    await upsertByTitle('project_tasks', 'title', 'Weekly board/team update', {
      project_id: projHHHOps,
      title: 'Weekly board/team update',
      description: 'Recurring weekly status digest — registrations, sponsors, top blockers. Miles drafts, Brandon approves.',
      assigned_agent: 'bolt-miles',
      status: 'queued',
      priority: 3,
      risk_tier: 'low',
      meta: { source: 'agent', approval_state: 'pending' },
    });
  }

  if (projFFF) {
    await upsertByTitle('project_tasks', 'title', 'FFF thank-you post', {
      project_id: projFFF,
      title: 'FFF thank-you post',
      description: 'Publish FFF thank-you post on Facebook + LinkedIn (draft in Apr/May social calendar).',
      assigned_agent: 'brandon',
      status: 'active',
      priority: 1,
      risk_tier: 'low',
      meta: { source: 'human' },
    });

    await upsertByTitle('project_tasks', 'title', 'FFF rider follow-up email', {
      project_id: projFFF,
      title: 'FFF rider follow-up email',
      description: 'Email FFF riders thanking them and inviting them to HHH save-the-date. Warm pool conversion is the priority.',
      assigned_agent: 'brandon',
      status: 'queued',
      priority: 1,
      risk_tier: 'low',
      meta: { source: 'human' },
    });

    await upsertByTitle('project_tasks', 'title', 'FFF financial recap', {
      project_id: projFFF,
      title: 'FFF financial recap',
      description: 'Close out FFF revenue, expenses, sponsor receipts, donations. Clean number for the board.',
      assigned_agent: 'brandon',
      status: 'queued',
      priority: 1,
      risk_tier: 'medium',
      meta: { source: 'human' },
    });

    await upsertByTitle('project_tasks', 'title', 'FFF lessons learned doc', {
      project_id: projFFF,
      title: 'FFF lessons learned doc',
      description: 'Write what worked and what would change. Feed into HHH planning kickoff.',
      assigned_agent: 'tim',
      status: 'queued',
      priority: 2,
      risk_tier: 'low',
      meta: { source: 'human' },
    });
  }

  if (projSponsors) {
    await upsertByTitle('project_tasks', 'title', 'Sponsor pipeline tracker', {
      project_id: projSponsors,
      title: 'Sponsor pipeline tracker',
      description: 'Track sponsor outreach: contacted, in conversation, secured, declined. Weekly review.',
      assigned_agent: 'brandon',
      status: 'queued',
      priority: 2,
      risk_tier: 'low',
      meta: { source: 'human' },
    });
  }

  if (projGrants) {
    await upsertByTitle('project_tasks', 'title', 'Identify and apply to 2026 grants', {
      project_id: projGrants,
      title: 'Identify and apply to 2026 grants',
      description: 'Research grants that align with cycling, community health, and youth programs. Apply to top 3 fits.',
      assigned_agent: 'brandon',
      status: 'queued',
      priority: 3,
      risk_tier: 'low',
      meta: { source: 'human' },
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

  // ── 5. MMM Bike-Event Research Ideas ──────────────────────────
  // Tagged so they appear in the MMM Command Center research queue.

  await upsertByTitle('ideas', 'title', 'Gravel Worlds — sponsor + format study', {
    title: 'Gravel Worlds — sponsor + format study',
    prompt:
      'Study Gravel Worlds (Lincoln, NE) — registration tiers, sponsor mix, attendance, after-party format. Pull lessons that translate to HHH 2026.',
    tags: ['mmm', 'bike-event-research', 'gravel'],
    mode: 'research_only',
    priority: 2,
    status: 'queued',
    score: 6.5,
    created_by: 'bolt-miles',
  });

  await upsertByTitle('ideas', 'title', 'Charity century rides — fundraising minimum patterns', {
    title: 'Charity century rides — fundraising minimum patterns',
    prompt:
      'Survey US charity century rides that use per-rider fundraising minimums. Document conversion lift vs. flat-ticket events and sponsor mix patterns.',
    tags: ['mmm', 'bike-event-research', 'charity'],
    mode: 'research_only',
    priority: 2,
    status: 'queued',
    score: 7.0,
    created_by: 'bolt-miles',
  });

  await upsertByTitle('ideas', 'title', 'After-party bundle pricing — bike events', {
    title: 'After-party bundle pricing — bike events',
    prompt:
      'Find bike events that bundle ride + after-party in a single ticket. Document conversion to after-party attendance and any in-kind audio/AV sponsor patterns. HHH-applicable.',
    tags: ['mmm', 'bike-event-research', 'after-party', 'hhh-applicable'],
    mode: 'research_only',
    priority: 2,
    status: 'queued',
    score: 7.5,
    created_by: 'bolt-miles',
  });

  // ── 6. Demo MMM Finance Transactions ───────────────────────────
  // Clearly marked demo via meta.is_demo = true. Wipe with:
  //   delete from finance_transactions where (meta->>'is_demo')::boolean = true;

  // Pick or create a finance account to attach demo MMM transactions to.
  let mmmDemoAccountId: string | null = null;
  {
    const { data: accounts } = await sb
      .from('finance_accounts')
      .select('id, name')
      .order('created_at', { ascending: true })
      .limit(1);
    if (accounts && accounts.length > 0) {
      mmmDemoAccountId = (accounts[0] as { id: string }).id;
    } else {
      const { data: created, error: accErr } = await sb
        .from('finance_accounts')
        .insert({ name: 'MMM Operating (demo)', type: 'bank', currency: 'USD' })
        .select('id')
        .single();
      if (accErr) {
        console.error(`  ERROR creating demo finance account: ${accErr.message}`);
      } else if (created) {
        mmmDemoAccountId = (created as { id: string }).id;
        log('finance_accounts', 'created', 'MMM Operating (demo)');
      }
    }
  }

  async function upsertMmmDemoTx(memo: string, row: Record<string, unknown>): Promise<void> {
    if (!mmmDemoAccountId) return;
    const { data: existing } = await sb
      .from('finance_transactions')
      .select('id')
      .eq('memo', memo)
      .limit(1)
      .single();
    if (existing) {
      log('finance_transactions', 'skipped', memo);
      return;
    }
    const { error } = await sb.from('finance_transactions').insert({
      ...row,
      memo,
      account_id: mmmDemoAccountId,
      source: 'manual',
      meta: { is_demo: true, group_slug: 'making-miles-matter' },
    });
    if (error) {
      console.error(`  ERROR inserting finance_transactions(${memo}): ${error.message}`);
      return;
    }
    log('finance_transactions', 'created', memo);
  }

  if (initFFF) {
    await upsertMmmDemoTx('FFF 2026 — rider registrations (demo)', {
      ts: '2026-04-25T18:00:00Z',
      direction: 'in',
      amount: 9800,
      category: 'event_registration',
      vendor: null,
      initiative_id: initFFF,
    });
    await upsertMmmDemoTx('FFF 2026 — title sponsor (demo)', {
      ts: '2026-04-20T12:00:00Z',
      direction: 'in',
      amount: 2500,
      category: 'sponsorship',
      vendor: 'Demo Title Sponsor',
      initiative_id: initFFF,
    });
    await upsertMmmDemoTx('FFF 2026 — donations on registration (demo)', {
      ts: '2026-04-25T18:00:00Z',
      direction: 'in',
      amount: 800,
      category: 'donation',
      vendor: null,
      initiative_id: initFFF,
    });
    await upsertMmmDemoTx('FFF 2026 — aid stations + food (demo)', {
      ts: '2026-04-25T08:00:00Z',
      direction: 'out',
      amount: 2200,
      category: 'event_supplies',
      vendor: 'Demo Aid Station Vendor',
      initiative_id: initFFF,
    });
    await upsertMmmDemoTx('FFF 2026 — merch + swag (demo)', {
      ts: '2026-04-15T10:00:00Z',
      direction: 'out',
      amount: 1800,
      category: 'merch',
      vendor: 'Demo Merch Vendor',
      initiative_id: initFFF,
    });
  }

  if (initHHH) {
    await upsertMmmDemoTx('HHH 2026 — early sponsor #1 (demo)', {
      ts: '2026-04-10T10:00:00Z',
      direction: 'in',
      amount: 2500,
      category: 'sponsorship',
      vendor: 'Demo HHH Sponsor 1',
      initiative_id: initHHH,
    });
    await upsertMmmDemoTx('HHH 2026 — early sponsor #2 (demo)', {
      ts: '2026-04-15T10:00:00Z',
      direction: 'in',
      amount: 2500,
      category: 'sponsorship',
      vendor: 'Demo HHH Sponsor 2',
      initiative_id: initHHH,
    });
    await upsertMmmDemoTx('HHH 2026 — early sponsor #3 (demo)', {
      ts: '2026-04-22T10:00:00Z',
      direction: 'in',
      amount: 2500,
      category: 'sponsorship',
      vendor: 'Demo HHH Sponsor 3',
      initiative_id: initHHH,
    });
  }

  // ── 6b. Re-target legacy MMM task assignments ─────────────────
  // Older seed runs left some MMM tasks assigned to brett-growth before the
  // MMM team registry existed. Reassign them to the right humans/agent.

  const reassign = async (title: string, newAgent: string): Promise<void> => {
    const { data: row } = await sb
      .from('project_tasks')
      .select('id, assigned_agent')
      .eq('title', title)
      .limit(1)
      .single();
    if (row && row.assigned_agent !== newAgent) {
      await sb.from('project_tasks').update({ assigned_agent: newAgent }).eq('id', row.id);
      log('project_tasks', 'updated', `${title} → ${newAgent}`);
    }
  };

  await reassign('Research competitor positioning for HHH', 'bolt-miles');
  await reassign('Draft sponsor outreach email for Fondo', 'brandon');
  await reassign('Launch spring promo campaign', 'bolt-miles');

  // ── 6c. Demo MMM sponsor deals (mmm-sponsors CRM pipeline) ────
  // Only seeded if the pipeline exists; clearly marked as demo via meta.is_demo.
  // Wipe with: delete from crm_deals where (meta->>'is_demo')::boolean = true and pipeline_id = (select id from crm_pipelines where slug='mmm-sponsors');

  const { data: mmmSponsorPipeline } = await sb
    .from('crm_pipelines')
    .select('id')
    .eq('slug', 'mmm-sponsors')
    .maybeSingle();

  if (mmmSponsorPipeline) {
    const sponsorPipelineId = (mmmSponsorPipeline as { id: string }).id;

    async function upsertSponsorContact(name: string, email: string): Promise<string | null> {
      const { data: existing } = await sb
        .from('crm_contacts')
        .select('id')
        .eq('email', email)
        .maybeSingle();
      if (existing) return (existing as { id: string }).id;
      const { data: created, error } = await sb
        .from('crm_contacts')
        .insert({ name, email, source: 'manual', meta: { is_demo: true, group_slug: 'making-miles-matter' } })
        .select('id')
        .single();
      if (error || !created) return null;
      log('crm_contacts', 'created', `${name} <${email}>`);
      return (created as { id: string }).id;
    }

    async function upsertSponsorDeal(
      title: string,
      stageKey: string,
      valueCents: number,
      contact: { name: string; email: string },
      notes?: string,
    ): Promise<void> {
      const { data: existing } = await sb
        .from('crm_deals')
        .select('id')
        .eq('pipeline_id', sponsorPipelineId)
        .eq('title', title)
        .maybeSingle();
      if (existing) {
        log('crm_deals', 'skipped', title);
        return;
      }
      const contactId = await upsertSponsorContact(contact.name, contact.email);
      const { error } = await sb.from('crm_deals').insert({
        pipeline_id: sponsorPipelineId,
        contact_id: contactId,
        title,
        stage_key: stageKey,
        value_cents: valueCents,
        notes: notes || null,
        stage_entered_at: new Date(Date.now() - Math.floor(Math.random() * 1000 * 60 * 60 * 24 * 14)).toISOString(),
        meta: { is_demo: true, group_slug: 'making-miles-matter' },
      });
      if (error) {
        console.error(`  ERROR inserting deal "${title}": ${error.message}`);
        return;
      }
      log('crm_deals', 'created', title);
    }

    await upsertSponsorDeal(
      'Findlay Bike Co — HHH 2026 (demo)',
      'confirmed',
      250_000,
      { name: 'Marcus Reyes', email: 'marcus@findlaybike.example' },
      'Returning sponsor. $2,500 commitment, packet sent, signed agreement returned.',
    );

    await upsertSponsorDeal(
      'Riverside Brewing — HHH after-party (demo)',
      'confirmed',
      250_000,
      { name: 'Dana Patel', email: 'dana@riversidebrew.example' },
      'In-kind beverage sponsorship for after-party + $2,500 cash. Confirmed verbally; awaiting signed packet.',
    );

    await upsertSponsorDeal(
      'Glomski Insurance — HHH 2026 (demo)',
      'fulfilled',
      250_000,
      { name: 'Sam Glomski', email: 'sam@glomskiins.example' },
      'Family connection. Paid in full Q1.',
    );

    await upsertSponsorDeal(
      'Northwest Health — HHH 2026 (demo)',
      'follow-up',
      500_000,
      { name: 'Priya Mehta', email: 'priya@nwhealth.example' },
      'Title sponsor candidate at $5K. Sent packet; waiting on next-step call.',
    );

    await upsertSponsorDeal(
      'Tri-County Cycling Club — HHH 2026 (demo)',
      'outreach-sent',
      150_000,
      { name: 'Chris Lee', email: 'chris@tricountycycling.example' },
      'Cold outreach via email. No response yet.',
    );

    await upsertSponsorDeal(
      'Local Dental — HHH 2026 (demo)',
      'lead',
      0,
      { name: 'Jamie Fox', email: 'jamie@localdental.example' },
      'Initial lead from FFF rider list. Has not been contacted.',
    );
  }

  // ── 7. Demo Bolt/Miles agent_runs (so the Glance ROI strip lights up) ──

  async function upsertDemoAgentRun(action: string, row: Record<string, unknown>): Promise<void> {
    const { data: existing } = await sb
      .from('agent_runs')
      .select('id')
      .eq('agent_id', 'bolt-miles')
      .eq('action', action)
      .limit(1)
      .single();
    if (existing) {
      log('agent_runs', 'skipped', action);
      return;
    }
    const { error } = await sb.from('agent_runs').insert({
      agent_id: 'bolt-miles',
      action,
      status: 'completed',
      ...row,
    });
    if (error) {
      console.error(`  ERROR inserting agent_runs(${action}): ${error.message}`);
      return;
    }
    log('agent_runs', 'created', action);
  }

  await upsertDemoAgentRun('draft-fff-thankyou-post', {
    related_type: 'project',
    related_id: projFFF || null,
    started_at: new Date(Date.now() - 1000 * 60 * 60 * 8).toISOString(),
    ended_at: new Date(Date.now() - 1000 * 60 * 60 * 8 + 1000 * 30).toISOString(),
    tokens_in: 1200,
    tokens_out: 380,
    cost_usd: 0.04,
    metadata: { is_demo: true, group_slug: 'making-miles-matter' },
  });

  await upsertDemoAgentRun('draft-hhh-save-the-date', {
    related_type: 'project',
    related_id: projHHH || null,
    started_at: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString(),
    ended_at: new Date(Date.now() - 1000 * 60 * 60 * 6 + 1000 * 25).toISOString(),
    tokens_in: 900,
    tokens_out: 320,
    cost_usd: 0.03,
    metadata: { is_demo: true, group_slug: 'making-miles-matter' },
  });

  await upsertDemoAgentRun('research-gravel-worlds-format', {
    related_type: 'idea',
    related_id: null,
    started_at: new Date(Date.now() - 1000 * 60 * 60 * 30).toISOString(),
    ended_at: new Date(Date.now() - 1000 * 60 * 60 * 30 + 1000 * 60).toISOString(),
    tokens_in: 1800,
    tokens_out: 560,
    cost_usd: 0.06,
    metadata: { is_demo: true, group_slug: 'making-miles-matter' },
  });

  // ── Summary ────────────────────────────────────────────────────

  // Suppress unused variable warnings
  void initSponsor; void initGrants;
  void projOpenClaw; void projAmazon; void projOpenClawAgents;
  void projSponsors; void projGrants;

  console.log(`\n${'='.repeat(50)}`);
  console.log(`Seed complete: ${created} created, ${skipped} skipped (already exist)`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
