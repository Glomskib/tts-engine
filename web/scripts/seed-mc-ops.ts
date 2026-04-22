#!/usr/bin/env tsx
/**
 * Seed Mission Control operational demo data.
 *
 * Creates realistic tasks, interventions, integrations, and agent runs
 * to demonstrate the operational Command Center.
 *
 * Idempotent: checks for existing rows before insert.
 *
 * Usage:
 *   npx tsx scripts/seed-mc-ops.ts
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

  // ── Get existing projects ────────────────────────────────────────
  const { data: projects } = await sb.from('cc_projects').select('id, name');
  const projectMap = new Map((projects || []).map(p => [p.name, p.id]));

  const ffProject = projectMap.get('FlashFlow Platform Core') || '';
  const ttsProject = projectMap.get('FlashFlow Content Ops (TikTok Shop)') || '';
  const zebbyProject = projectMap.get('Zebby Compliance') || '';
  const hhhProject = projectMap.get('HHH Marketing') || '';
  const oclProject = projectMap.get('OpenClaw Ops') || '';

  if (!ffProject) {
    console.log('No projects found. Run seed-command-center.ts first.');
    return;
  }

  const now = new Date();
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600000).toISOString();
  const minsAgo = (m: number) => new Date(now.getTime() - m * 60000).toISOString();
  // ── Helper ────────────────────────────────────────────────────────
  async function upsertByTitle(table: string, title: string, row: Record<string, unknown>): Promise<string> {
    const { data: existing } = await sb.from(table).select('id').eq('title', title).limit(1).single();
    if (existing) {
      console.log(`  skip ${table}: ${title}`);
      return existing.id as string;
    }
    const { data, error } = await sb.from(table).insert(row).select('id').single();
    if (error) {
      console.error(`  ERROR ${table}: ${error.message}`);
      return '';
    }
    console.log(`  + ${table}: ${title}`);
    return (data as { id: string }).id;
  }

  // ── 1. Operational Tasks ──────────────────────────────────────────

  // Stale task — active but no heartbeat for 3+ hours
  await upsertByTitle('project_tasks', 'Sync TikTok Shop inventory with Shopify', {
    project_id: ttsProject,
    title: 'Sync TikTok Shop inventory with Shopify',
    description: 'Automated inventory sync has stalled. Product counts may be drifting.',
    assigned_agent: 'greg-uploader',
    status: 'active',
    priority: 1,
    risk_tier: 'high',
    lane: 'POD TikTok Shop',
    is_revenue_critical: true,
    stale_after_minutes: 60,
    started_at: hoursAgo(5),
    heartbeat_at: hoursAgo(3),
    last_transition_at: hoursAgo(3),
    source_system: 'openclaw',
  });

  // Blocked task — revenue-critical
  await upsertByTitle('project_tasks', 'Launch spring promo campaign', {
    project_id: hhhProject,
    title: 'Launch spring promo campaign',
    description: 'Waiting on approved creative assets from design team.',
    assigned_agent: 'brett-growth',
    status: 'blocked',
    priority: 1,
    risk_tier: 'high',
    lane: 'Making Miles Matter',
    is_revenue_critical: true,
    blocked_reason: 'Waiting on design team creative assets',
    created_at: hoursAgo(48),
    last_transition_at: hoursAgo(24),
    source_system: 'manual',
  });

  // Completed with proof — today
  await upsertByTitle('project_tasks', 'Deploy revenue intelligence v2 pipeline', {
    project_id: ffProject,
    title: 'Deploy revenue intelligence v2 pipeline',
    description: 'Upgraded RI pipeline with improved accuracy and cost reduction.',
    assigned_agent: 'dan-ops',
    status: 'done',
    priority: 2,
    risk_tier: 'low',
    lane: 'FlashFlow',
    completed_at: minsAgo(45),
    started_at: hoursAgo(3),
    claimed_at: hoursAgo(4),
    proof_summary: 'Deployed to production. Pipeline processing 23% faster, cost per analysis reduced from $0.12 to $0.08.',
    proof_url: 'https://vercel.com/deploys/ri-v2-prod',
    output_count: 1,
    last_transition_at: minsAgo(45),
    source_system: 'openclaw',
  });

  // Completed without proof (flagged)
  await upsertByTitle('project_tasks', 'Review Zebby onboarding copy', {
    project_id: zebbyProject,
    title: 'Review Zebby onboarding copy',
    description: 'Review and approve the onboarding flow copy for Zebby.',
    assigned_agent: 'susan-social',
    status: 'done',
    priority: 3,
    risk_tier: 'low',
    lane: "Zebby's World",
    completed_at: hoursAgo(2),
    started_at: hoursAgo(6),
    last_transition_at: hoursAgo(2),
    source_system: 'manual',
    // No proof_summary or proof_url — deliberately proofless
  });

  // Active with recent heartbeat (producing agent demo)
  await upsertByTitle('project_tasks', 'Generate TikTok content batch #47', {
    project_id: ttsProject,
    title: 'Generate TikTok content batch #47',
    description: 'Processing batch of 12 product videos for TikTok Shop.',
    assigned_agent: 'tom-dev',
    status: 'active',
    priority: 2,
    risk_tier: 'low',
    lane: 'POD TikTok Shop',
    started_at: minsAgo(20),
    claimed_at: minsAgo(25),
    heartbeat_at: minsAgo(2),
    last_transition_at: minsAgo(20),
    output_count: 7,
    source_system: 'openclaw',
  });

  // Task requiring human review
  await upsertByTitle('project_tasks', 'Draft sponsor outreach email for Fondo', {
    project_id: hhhProject,
    title: 'Draft sponsor outreach email for Fondo',
    description: 'AI-drafted outreach email needs human review before sending.',
    assigned_agent: 'brett-growth',
    status: 'active',
    priority: 2,
    risk_tier: 'medium',
    lane: 'Making Miles Matter',
    requires_human_review: true,
    started_at: hoursAgo(1),
    heartbeat_at: minsAgo(15),
    last_transition_at: hoursAgo(1),
    source_system: 'openclaw',
  });

  // Stale OpenClaw task
  await upsertByTitle('project_tasks', 'Run nightly cost anomaly check', {
    project_id: oclProject,
    title: 'Run nightly cost anomaly check',
    description: 'Nightly job that checks for LLM cost spikes.',
    assigned_agent: 'dan-ops',
    status: 'active',
    priority: 3,
    risk_tier: 'low',
    lane: 'OpenClaw',
    stale_after_minutes: 120,
    started_at: hoursAgo(8),
    heartbeat_at: hoursAgo(6),
    last_transition_at: hoursAgo(6),
    source_system: 'openclaw',
  });

  // ── 2. Intervention Queue Items ───────────────────────────────────

  await upsertByTitle('intervention_queue', 'TikTok Shop inventory sync stalled', {
    title: 'TikTok Shop inventory sync stalled',
    description: 'Inventory sync agent has not sent heartbeat in 3+ hours. Product counts may be drifting from Shopify.',
    severity: 'critical',
    category: 'stale_task',
    source_type: 'task',
    lane: 'POD TikTok Shop',
    status: 'open',
  });

  await upsertByTitle('intervention_queue', 'Spring promo campaign blocked on creative', {
    title: 'Spring promo campaign blocked on creative',
    description: 'Revenue-critical campaign waiting 48h on design team assets. Fondo event date approaching.',
    severity: 'high',
    category: 'blocked_revenue',
    source_type: 'task',
    lane: 'Making Miles Matter',
    status: 'open',
  });

  await upsertByTitle('intervention_queue', 'Proofless completion: Zebby onboarding copy', {
    title: 'Proofless completion: Zebby onboarding copy',
    description: 'Task marked done without proof summary or proof URL.',
    severity: 'medium',
    category: 'proofless_completion',
    source_type: 'task',
    lane: "Zebby's World",
    status: 'open',
  });

  // ── 3. Integration Health ─────────────────────────────────────────

  const integrations = [
    { service_name: 'TikTok Session', status: 'healthy', last_check_at: minsAgo(5), last_success_at: minsAgo(5), error_count_24h: 0, success_count_24h: 288 },
    { service_name: 'Shopify API', status: 'healthy', last_check_at: minsAgo(3), last_success_at: minsAgo(3), error_count_24h: 2, success_count_24h: 450 },
    { service_name: 'HeyGen API', status: 'degraded', last_check_at: minsAgo(10), last_success_at: hoursAgo(2), last_error: 'Rate limit exceeded (429)', error_count_24h: 15, success_count_24h: 85 },
    { service_name: 'Supabase', status: 'healthy', last_check_at: minsAgo(1), last_success_at: minsAgo(1), error_count_24h: 0, success_count_24h: 1200 },
    { service_name: 'Vercel Deploy', status: 'healthy', last_check_at: hoursAgo(1), last_success_at: hoursAgo(1), error_count_24h: 0, success_count_24h: 3 },
    { service_name: 'Late.dev', status: 'healthy', last_check_at: minsAgo(30), last_success_at: minsAgo(30), error_count_24h: 1, success_count_24h: 42 },
  ];

  for (const integ of integrations) {
    const { data: existing } = await sb.from('integration_health').select('id').eq('service_name', integ.service_name).limit(1).single();
    if (existing) {
      await sb.from('integration_health').update(integ).eq('id', existing.id);
      console.log(`  ~ integration_health: ${integ.service_name} (updated)`);
    } else {
      const { error } = await sb.from('integration_health').insert(integ);
      if (error) console.error(`  ERROR integration_health: ${error.message}`);
      else console.log(`  + integration_health: ${integ.service_name}`);
    }
  }

  // ── 4. Agent Runs (recent) ────────────────────────────────────────

  const agentRuns = [
    { agent_id: 'dan-ops', action: 'deploy_ri_v2', status: 'completed', started_at: hoursAgo(3), ended_at: minsAgo(45), cost_usd: 0.34 },
    { agent_id: 'tom-dev', action: 'generate_content_batch', status: 'completed', started_at: minsAgo(20), ended_at: null, cost_usd: 0.18 },
    { agent_id: 'greg-uploader', action: 'sync_inventory', status: 'failed', started_at: hoursAgo(3), ended_at: hoursAgo(2.5), cost_usd: 0.05 },
    { agent_id: 'brett-growth', action: 'draft_outreach', status: 'completed', started_at: hoursAgo(1), ended_at: minsAgo(15), cost_usd: 0.22 },
    { agent_id: 'dan-ops', action: 'nightly_cost_check', status: 'failed', started_at: hoursAgo(6), ended_at: hoursAgo(5.9), cost_usd: 0.02 },
    { agent_id: 'susan-social', action: 'review_copy', status: 'completed', started_at: hoursAgo(6), ended_at: hoursAgo(2), cost_usd: 0.08 },
    { agent_id: 'tom-dev', action: 'script_generation', status: 'completed', started_at: hoursAgo(4), ended_at: hoursAgo(3.5), cost_usd: 0.15 },
    { agent_id: 'dan-ops', action: 'watchdog_check', status: 'completed', started_at: minsAgo(10), ended_at: minsAgo(9), cost_usd: 0.01 },
  ];

  // Only insert if we don't already have recent agent runs
  const { count: existingRuns } = await sb.from('agent_runs').select('id', { count: 'exact', head: true }).gte('created_at', hoursAgo(12));
  if ((existingRuns ?? 0) < 5) {
    for (const run of agentRuns) {
      const { error } = await sb.from('agent_runs').insert(run);
      if (error) console.error(`  ERROR agent_runs: ${error.message}`);
      else console.log(`  + agent_runs: ${run.agent_id}/${run.action}`);
    }
  } else {
    console.log('  skip agent_runs: sufficient recent runs exist');
  }

  console.log('\nOperational seed complete.');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
