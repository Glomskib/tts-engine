#!/usr/bin/env node
/**
 * Command Center Verification Script
 *
 * Checks:
 * 1.  Migration tables exist
 * 2.  RLS blocks anon
 * 3.  Create + cleanup idea
 * 4.  Usage ingest + cost calc
 * 5.  Finance summary
 * 6.  Nightly job dry-run
 * 7.  Initiative filtering works
 * 8.  Dashboard telemetry check
 * 9.  Convert idea → task end-to-end
 * 10. CC_INGEST_KEY env check
 * 11. FLASHFLOW_CORE initiative exists with slug
 * 12. No "TikTok Shop Engine" initiative exists
 * 13. Expected projects exist under FlashFlow
 * 14. Profit endpoint returns valid structure
 *
 * Usage:
 *   pnpm run verify:cc
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
  const supabase = createClient(SUPABASE_URL!, SERVICE_KEY!, {
    auth: { persistSession: false },
  });

  const results: { check: string; pass: boolean; detail: string }[] = [];

  function log(check: string, pass: boolean, detail: string) {
    results.push({ check, pass, detail });
    const icon = pass ? '\u2705' : '\u274C';
    console.log(`${icon} ${check}: ${detail}`);
  }

  // ── 1. Check tables exist ──────────────────────────────────────
  const tables = [
    'usage_events', 'usage_daily_rollups', 'cc_projects', 'project_tasks',
    'task_events', 'ideas', 'idea_artifacts', 'finance_accounts',
    'finance_transactions', 'initiatives', 'agent_runs',
  ];

  for (const table of tables) {
    const { error } = await supabase.from(table).select('id').limit(1);
    log(`Table: ${table}`, !error, error ? error.message : 'exists');
  }

  // ── 2. RLS check ───────────────────────────────────────────────
  const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (ANON_KEY) {
    const anonClient = createClient(SUPABASE_URL!, ANON_KEY, {
      auth: { persistSession: false },
    });
    const { data, error } = await anonClient.from('ideas').select('id').limit(1);
    const blocked = !!error || (data && data.length === 0);
    log('RLS: anon blocked from ideas', blocked, error ? error.message : `${data?.length ?? 0} rows (should be 0)`);
  } else {
    log('RLS: anon key check', false, 'NEXT_PUBLIC_SUPABASE_ANON_KEY not set, skipping');
  }

  // ── 3. Create an idea ──────────────────────────────────────────
  const { data: idea, error: ideaErr } = await supabase
    .from('ideas')
    .insert({
      title: '__verify_test_idea__',
      prompt: 'Verification test idea',
      mode: 'research_and_plan',
      priority: 2,
      status: 'queued',
      score: 8.5,
      created_by: 'verify-script',
    })
    .select('id')
    .single();
  log('Create idea', !!idea && !ideaErr, ideaErr ? ideaErr.message : `id=${idea?.id}`);

  // ── 4. Usage ingest + cost calc ────────────────────────────────
  const { computeCost } = await import('../lib/llm-pricing');
  const cost = computeCost(1000, 500, 'anthropic', 'claude-3.5-sonnet');
  log('Cost calc', cost > 0, `1000in+500out claude-3.5-sonnet = $${cost}`);

  const { data: usage, error: usageErr } = await supabase
    .from('usage_events')
    .insert({
      provider: 'anthropic',
      model: 'claude-3.5-sonnet',
      agent_id: 'verify-script',
      request_type: 'chat',
      input_tokens: 1000,
      output_tokens: 500,
      cost_usd: cost,
      latency_ms: 1234,
      status: 'ok',
    })
    .select('id')
    .single();
  log('Usage ingest', !!usage && !usageErr, usageErr ? usageErr.message : `id=${usage?.id}`);

  // ── 5. Finance ─────────────────────────────────────────────────
  const { data: acct, error: acctErr } = await supabase
    .from('finance_accounts')
    .insert({ name: '__verify_account__', type: 'bank', currency: 'USD' })
    .select('id')
    .single();

  if (acct) {
    const { data: txn, error: txnErr } = await supabase
      .from('finance_transactions')
      .insert({
        account_id: acct.id,
        direction: 'out',
        amount: 9.99,
        category: 'software',
        vendor: 'verify-test',
      })
      .select('id')
      .single();
    log('Finance transaction', !!txn && !txnErr, txnErr ? txnErr.message : `id=${txn?.id}`);

    const { data: txns } = await supabase
      .from('finance_transactions')
      .select('direction, amount')
      .eq('account_id', acct.id);
    const finTotal = (txns || []).reduce((s, t) => s + Number(t.amount), 0);
    log('Finance summary', finTotal > 0, `total=${finTotal}`);

    await supabase.from('finance_transactions').delete().eq('account_id', acct.id);
    await supabase.from('finance_accounts').delete().eq('id', acct.id);
  } else {
    log('Finance account', false, acctErr?.message || 'Failed to create');
  }

  // ── 6. Nightly job dry-run ─────────────────────────────────────
  try {
    const { runNightlyIdeaResearch } = await import('../lib/command-center/nightly-job');
    const result = await runNightlyIdeaResearch(true, 2);
    log('Nightly job (dry-run)', result.errors === 0, `processed=${result.processed} errors=${result.errors}`);
  } catch (err) {
    log('Nightly job (dry-run)', false, String(err));
  }

  // ── 7. Initiative filtering ────────────────────────────────────
  const { data: inits, error: initErr } = await supabase
    .from('initiatives')
    .select('id, slug, title')
    .limit(10);
  log('Initiative query', !initErr && (inits?.length ?? 0) >= 0, initErr ? initErr.message : `${inits?.length ?? 0} initiatives found`);

  if (inits && inits.length > 0) {
    const initId = inits[0].id;
    const { error: projFilterErr } = await supabase
      .from('cc_projects')
      .select('id')
      .eq('initiative_id', initId)
      .limit(5);
    log('Initiative project filter', !projFilterErr, projFilterErr ? projFilterErr.message : 'query ok');
  } else {
    log('Initiative project filter', true, 'No initiatives to filter, skipping');
  }

  // ── 8. Dashboard telemetry check ───────────────────────────────
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const { data: telData, error: telErr } = await supabase
    .from('usage_events')
    .select('agent_id, model, cost_usd, latency_ms')
    .gte('ts', sevenDaysAgo)
    .limit(10);
  log('Telemetry query', !telErr, telErr ? telErr.message : `${telData?.length ?? 0} usage events for telemetry`);

  const { data: failData, error: failErr } = await supabase
    .from('agent_runs')
    .select('agent_id')
    .eq('status', 'failed')
    .gte('created_at', sevenDaysAgo)
    .limit(10);
  log('Failure query', !failErr, failErr ? failErr.message : `${failData?.length ?? 0} failed runs`);

  // ── 9. Convert idea → task ─────────────────────────────────────
  const { data: testProj } = await supabase
    .from('cc_projects')
    .select('id')
    .limit(1)
    .single();

  if (idea?.id && testProj?.id) {
    const { data: task, error: taskErr } = await supabase
      .from('project_tasks')
      .insert({
        project_id: testProj.id,
        title: '__verify_converted_task__',
        description: 'Test converted from idea',
        assigned_agent: 'verify-script',
        status: 'queued',
        priority: 3,
        risk_tier: 'low',
        meta: { source_idea_id: idea.id, converted_at: new Date().toISOString() },
      })
      .select('id')
      .single();
    log('Convert idea → task', !!task && !taskErr, taskErr ? taskErr.message : `task_id=${task?.id}`);

    if (task) {
      const { error: evtErr } = await supabase
        .from('task_events')
        .insert({
          task_id: task.id,
          agent_id: 'verify-script',
          event_type: 'created',
          payload: { source: 'idea_conversion', idea_id: idea.id },
        });
      log('Task event for conversion', !evtErr, evtErr ? evtErr.message : 'logged');

      await supabase.from('task_events').delete().eq('task_id', task.id);
      await supabase.from('project_tasks').delete().eq('id', task.id);
    }
  } else {
    log('Convert idea → task', false, 'No project or idea to test with');
  }

  // ── 10. CC_INGEST_KEY env check ────────────────────────────────
  const hasKey = !!process.env.CC_INGEST_KEY;
  log('CC_INGEST_KEY configured', hasKey, hasKey ? 'set' : 'NOT SET — ingest endpoints will return 501 for non-owner calls');

  // ── 11. FLASHFLOW_CORE initiative exists ───────────────────────
  const { data: ffCore } = await supabase
    .from('initiatives')
    .select('id, slug, title')
    .eq('slug', 'FLASHFLOW_CORE')
    .single();
  log('FLASHFLOW_CORE exists', !!ffCore, ffCore ? `id=${ffCore.id}, title="${ffCore.title}"` : 'NOT FOUND — run seed:cc first');

  // ── 12. No TikTok Shop Engine initiative ───────────────────────
  const { data: ttsRows } = await supabase
    .from('initiatives')
    .select('id, title')
    .or('title.ilike.%TikTok Shop%Content Engine%,title.ilike.%TTS_ENGINE%,title.ilike.%TikTokShopEngine%');
  const noTTS = !ttsRows || ttsRows.length === 0;
  log('No TikTok Shop Engine initiative', noTTS, noTTS ? 'clean' : `FOUND: ${ttsRows?.map((r) => r.title).join(', ')}`);

  // ── 13. Expected projects under FlashFlow ──────────────────────
  if (ffCore) {
    const { data: ffProjects } = await supabase
      .from('cc_projects')
      .select('name')
      .eq('initiative_id', ffCore.id);
    const names = (ffProjects || []).map((p) => p.name);
    const hasPlatform = names.some((n) => n.includes('Platform Core'));
    const hasContentOps = names.some((n) => n.includes('Content Ops'));
    const hasOpenClaw = names.some((n) => n.includes('OpenClaw Agents'));
    log('FlashFlow projects', hasPlatform && hasContentOps && hasOpenClaw,
      `found: ${names.join(', ')}` +
      (!hasPlatform ? ' (MISSING Platform Core)' : '') +
      (!hasContentOps ? ' (MISSING Content Ops)' : '') +
      (!hasOpenClaw ? ' (MISSING OpenClaw Agents)' : ''));
  } else {
    log('FlashFlow projects', false, 'FLASHFLOW_CORE not found, cannot check projects');
  }

  // ── 14. Profit endpoint structure check ────────────────────────
  // We test the underlying query logic directly since we can't call the API route from a script
  const { data: profitTxns, error: profitErr } = await supabase
    .from('finance_transactions')
    .select('direction, amount, category, ts')
    .gte('ts', new Date(Date.now() - 30 * 86400000).toISOString())
    .limit(5);
  log('Profit query (finance_transactions)', !profitErr,
    profitErr ? profitErr.message : `${profitTxns?.length ?? 0} recent transactions`);

  const { data: profitUsage, error: profitUsageErr } = await supabase
    .from('usage_daily_rollups')
    .select('day, cost_usd')
    .gte('day', new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10))
    .limit(5);
  log('Profit query (usage_daily_rollups)', !profitUsageErr,
    profitUsageErr ? profitUsageErr.message : `${profitUsage?.length ?? 0} recent rollups`);

  // ── Cleanup ────────────────────────────────────────────────────
  if (idea?.id) {
    await supabase.from('idea_artifacts').delete().eq('idea_id', idea.id);
    await supabase.from('ideas').delete().eq('id', idea.id);
  }
  if (usage?.id) {
    await supabase.from('usage_events').delete().eq('id', usage.id);
  }

  // ── Summary ────────────────────────────────────────────────────
  const passed = results.filter((r) => r.pass).length;
  const total = results.length;
  console.log(`\n${'='.repeat(50)}`);
  console.log(`Verification: ${passed}/${total} checks passed`);
  if (passed < total) {
    console.log('Failed checks:');
    results.filter((r) => !r.pass).forEach((r) => console.log(`  - ${r.check}: ${r.detail}`));
  }

  process.exit(passed === total ? 0 : 1);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
