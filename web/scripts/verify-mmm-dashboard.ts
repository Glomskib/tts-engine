#!/usr/bin/env tsx
/**
 * Smoke-test the MMM dashboard data layer against live Supabase.
 *
 * Calls getMmmDashboardData() and reports counts for each section so we know
 * the queries return real seeded data without needing to authenticate to the
 * web UI. Read-only.
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

async function main() {
  const { getMmmDashboardData } = await import('../lib/command-center/mmm/queries');
  const data = await getMmmDashboardData();

  const log = (k: string, v: unknown) => console.log(`  ${k.padEnd(28)} ${v}`);

  console.log('MMM Command Center smoke-test');
  console.log('─'.repeat(60));
  log('group_slug', data.group_slug);
  log('group_label', data.group_label);
  log('events', data.events.length);
  log('team', data.team.length);
  log('agents', data.agents.length);
  log('task_total', data.task_total);
  log('task_groups', data.task_groups.length);
  log('social_posts', data.social_posts.length);
  log('finance', data.finance.length);
  log('meeting_notes', data.meeting_notes.length);
  log('research', data.research.length);
  log('agent_activity', data.agent_activity.length);
  log('pending_approvals', data.pending_approvals.length);
  log('readiness ready_pct', `${data.readiness.ready_pct}%`);
  log('readiness categories', data.readiness.categories.length);
  log('sponsor pipeline_id', data.sponsors.pipeline_id || '(missing)');
  log('sponsor deals', data.sponsors.deals.length);
  log('sponsor committed', data.sponsors.committed_count);
  log('sponsor next_followups', data.sponsors.next_followups.length);
  log('next_actions', data.next_actions.length);
  log('warnings', data.warnings.length);

  console.log('\nTask groups:');
  for (const g of data.task_groups) {
    console.log(`  ${g.owner_label.padEnd(20)} ${g.tasks.length} task(s)`);
  }

  console.log('\nFinance summaries:');
  for (const f of data.finance) {
    const fmt = (c: number) => `$${(c / 100).toFixed(0)}`;
    console.log(
      `  ${f.event_slug.padEnd(12)} status=${f.status.padEnd(10)} `
      + `rev=${fmt(f.totals.revenue_cents)} exp=${fmt(f.totals.expense_cents)} `
      + `net=${fmt(f.totals.net_cents)} demo=${f.is_demo}`,
    );
  }

  console.log('\nWarnings:');
  if (data.warnings.length === 0) console.log('  (none)');
  for (const w of data.warnings) console.log(`  • ${w}`);

  console.log('\nFirst 5 social posts:');
  for (const p of data.social_posts.slice(0, 5)) {
    const date = p.scheduled_for ? new Date(p.scheduled_for).toISOString().slice(0, 10) : '????-??-??';
    console.log(
      `  ${date} [${p.status}] ${p.platforms.join(',').padEnd(20)} ${p.content.slice(0, 60).replace(/\n/g, ' ')}`,
    );
  }
}

main().catch((err) => {
  console.error('Smoke test failed:', err);
  process.exit(1);
});
