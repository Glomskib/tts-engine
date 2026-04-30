#!/usr/bin/env tsx
/**
 * MMM weekly digest — operator-grade Monday report.
 *
 * Pulls live state from the same data layer the dashboard uses, formats it as
 * markdown, prints to stdout. Optional --persist creates a marketing_posts
 * draft (status='cancelled', source='digest-script') that surfaces in the
 * Needs-Approval queue, keeping a human in the loop before anything is shared.
 *
 * Usage:
 *   npm run mmm:weekly                     # print only
 *   npm run mmm:weekly -- --persist        # print + save draft
 *
 * No cron registration here. The cron pattern (vercel.json + Bearer token)
 * is documented in docs/event-os-mmm-command-center.md and can be added later.
 */
import { config } from 'dotenv';
config({ path: '.env.local' });

const args = process.argv.slice(2);
const SHOULD_PERSIST = args.includes('--persist');

function usd(cents: number): string {
  const dollars = cents / 100;
  if (Math.abs(dollars) >= 1000) return `$${(dollars / 1000).toFixed(1)}k`;
  return `$${dollars.toFixed(0)}`;
}

async function main() {
  // Lazy load so dotenv has time to populate process.env first.
  const { getMmmDashboardData } = await import('../lib/command-center/mmm/queries');
  const data = await getMmmDashboardData();

  const today = new Date();
  const weekOf = today.toISOString().slice(0, 10);

  const upcomingEvents = data.events.filter((e) => e.status !== 'completed');
  const completedEvents = data.events.filter((e) => e.status === 'completed');

  const tasksOpen = data.task_groups.flatMap((g) => g.tasks).filter((t) => t.status !== 'done' && t.status !== 'killed');
  const tasksOverdue = tasksOpen.filter((t) => {
    if (!t.due_at) return false;
    return new Date(t.due_at).getTime() < Date.now();
  });

  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recentSocial = data.social_posts.filter(
    (p) => p.scheduled_for && new Date(p.scheduled_for).getTime() >= sevenDaysAgo,
  );

  const lines: string[] = [];
  lines.push(`# MMM Weekly Digest — ${weekOf}`);
  lines.push('');
  lines.push(`Group: **${data.group_label}**`);
  lines.push('');

  // Events
  lines.push('## Events');
  for (const e of [...completedEvents, ...upcomingEvents]) {
    lines.push(`- **${e.short_name}** (${e.status}) — ${e.display_date}${e.location ? ` · ${e.location}` : ''}${e.start_time ? ` · ${e.start_time}` : ''}`);
  }
  lines.push('');

  // Readiness (HHH)
  lines.push('## HHH readiness');
  lines.push(
    `- ${data.readiness.status_label} · ${data.readiness.ready_pct}% (${data.readiness.done} done, ${data.readiness.on_track} on track, ${data.readiness.needs_attention} needs attention, ${data.readiness.not_started} not started)`,
  );
  const concerns = data.readiness.categories.filter((c) => c.status === 'needs-attention' || c.status === 'not-started');
  if (concerns.length > 0) {
    for (const c of concerns.slice(0, 6)) {
      lines.push(`  - **${c.label}** (${c.status}) — ${c.next_action || 'no current task'}${c.owner_label ? ` · owner: ${c.owner_label}` : ''}${c.task_blocked > 0 ? ` · ${c.task_blocked} blocked` : ''}`);
    }
  }
  lines.push('');

  // Tasks
  lines.push('## Tasks');
  lines.push(`- Total: ${data.task_total}`);
  lines.push(`- Open: ${tasksOpen.length}`);
  lines.push(`- Overdue: ${tasksOverdue.length}`);
  if (tasksOverdue.length > 0) {
    for (const t of tasksOverdue.slice(0, 5)) {
      lines.push(`  - ⚠ ${t.title} — ${t.assigned_agent} · due ${t.due_at?.slice(0, 10)}`);
    }
  }
  lines.push('- By owner:');
  for (const g of data.task_groups) {
    lines.push(`  - ${g.owner_label}: ${g.tasks.length}`);
  }
  lines.push('');

  // Sponsors
  lines.push('## Sponsors');
  lines.push(`- Goal: ${data.sponsors.goal}`);
  lines.push(`- Committed: ${data.sponsors.committed_count} (${usd(data.sponsors.total_committed_cents)})`);
  lines.push(`- Paid: ${data.sponsors.paid_count} (${usd(data.sponsors.total_paid_cents)})`);
  lines.push(`- Unpaid committed: ${data.sponsors.unpaid_committed_count}`);
  lines.push(`- Next follow-ups: ${data.sponsors.next_followups.length}`);
  if (data.sponsors.next_followups.length > 0) {
    for (const f of data.sponsors.next_followups.slice(0, 5)) {
      lines.push(`  - ${f.title} — ${f.stage_label}${f.due_in_days ? ` (${f.due_in_days}d in stage)` : ''}`);
    }
  }
  lines.push('');

  // Pending approvals
  lines.push('## Pending Bolt/Miles approvals');
  lines.push(`- ${data.pending_approvals.length} item(s) waiting`);
  if (data.pending_approvals.length > 0) {
    const grouped = new Map<string, number>();
    for (const a of data.pending_approvals) grouped.set(a.kind, (grouped.get(a.kind) || 0) + 1);
    for (const [kind, n] of grouped) lines.push(`  - ${kind}: ${n}`);
  }
  lines.push('');

  // Finance
  lines.push('## Finance');
  for (const f of data.finance) {
    const totalIn =
      f.totals.revenue_cents + f.totals.sponsorship_cents + f.totals.donations_cents;
    lines.push(`- **${f.event_slug}** (${f.status}) — in ${usd(totalIn)} · out ${usd(f.totals.expense_cents)} · net ${usd(f.totals.net_cents)}${f.is_demo ? ' (demo)' : ''}`);
  }
  lines.push('');

  // Social
  lines.push('## Social');
  lines.push(`- Posts in marketing_posts (last 7d scheduled): ${recentSocial.length}`);
  lines.push(`- Total queued: ${data.social_posts.length}`);
  lines.push('');

  // Research
  lines.push('## Research');
  lines.push(`- Items in queue: ${data.research.length}`);
  for (const r of data.research.slice(0, 4)) {
    lines.push(`  - ${r.title} (${r.status})`);
  }
  lines.push('');

  // Latest agent activity
  lines.push('## Latest Bolt/Miles activity');
  const liveActivity = data.agent_activity.filter((a) => !a.is_demo).slice(0, 5);
  if (liveActivity.length === 0) {
    lines.push('- (none in DB; only demo activity present)');
  } else {
    for (const a of liveActivity) {
      lines.push(`- ${a.title} — ${new Date(a.created_at).toLocaleDateString()}`);
    }
  }
  lines.push('');

  // Warnings
  if (data.warnings.length > 0) {
    lines.push('## ⚠ Warnings');
    for (const w of data.warnings) lines.push(`- ${w}`);
    lines.push('');
  }

  const digest = lines.join('\n');
  console.log(digest);

  if (SHOULD_PERSIST) {
    const { createClient } = await import('@supabase/supabase-js');
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    );
    const { data: row, error } = await sb
      .from('marketing_posts')
      .insert({
        content: digest,
        media_items: [],
        platforms: [],
        status: 'cancelled',
        source: 'digest-script',
        scheduled_for: null,
        claim_risk_score: 0,
        claim_risk_flags: [],
        created_by: 'mmm-weekly-digest',
        meta: {
          source: 'agent',
          agent_id: 'mmm-weekly-digest',
          requires_approval: true,
          approval_status: 'pending',
          approval_type: 'weekly_digest',
          group_slug: 'making-miles-matter',
          is_demo: false,
          week_of: weekOf,
        },
      })
      .select('id')
      .single();
    if (error) {
      console.error('\n[persist] failed:', error.message);
      process.exit(1);
    }
    console.log(`\n[persist] saved as marketing_posts row ${(row as { id: string }).id} — pending approval.`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('Digest failed:', err);
  process.exit(1);
});
