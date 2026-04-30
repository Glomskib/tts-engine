/**
 * Server-side queries for the MMM Command Center dashboard.
 *
 * Reuses the existing CC tables. Filters by initiative slug prefix `MMM_` so a
 * second nonprofit org can be added by registering new events with a different
 * initiative prefix and group_slug — no schema changes needed.
 */
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import type {
  MmmAgentActivity,
  MmmDashboardData,
  MmmFinancialLine,
  MmmFinancialSummary,
  MmmResearchItem,
  MmmSocialPost,
  MmmTaskOwnerGroup,
  MmmTaskRow,
} from './types';
import {
  MMM_AGENTS,
  MMM_EVENTS,
  MMM_GROUP_LABEL,
  MMM_GROUP_SLUG,
  MMM_TEAM,
  resolveTaskOwner,
} from './registry';
import {
  FFF_DEMO_LINES,
  HHH_DEMO_LINES,
  HHH_OUTSTANDING_TARGETS,
} from './finance-targets';
import { DEMO_AGENT_ACTIVITY } from './agent-activity';
import { DEMO_RESEARCH_ITEMS } from './research-seed';
import { listMmmMeetingNotes } from './meeting-notes';
import { fetchPendingApprovals } from './approvals';
import { computeHhhReadiness } from './readiness';
import { getMmmSponsorPipeline } from './sponsors';

interface InitiativeRow {
  id: string;
  slug: string | null;
  title: string;
  status: string;
}

interface CcProjectRow {
  id: string;
  name: string;
  initiative_id: string | null;
}

interface ProjectTaskRow {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  status: string;
  priority: number;
  risk_tier: string;
  assigned_agent: string | null;
  due_at: string | null;
  meta: Record<string, unknown> | null;
}

interface MarketingPostRow {
  id: string;
  content: string;
  // marketing_posts.platforms is stored as { platform, accountId, ... }[]
  // (PlatformTarget) — see lib/marketing/types.ts. We only need the platform names.
  platforms: Array<{ platform?: string } | string> | null;
  status: string | null;
  source: string | null;
  scheduled_for: string | null;
  meta: Record<string, unknown> | null;
}

interface FinanceTransactionRow {
  id: string;
  ts: string;
  direction: 'in' | 'out';
  amount: number;
  category: string | null;
  vendor: string | null;
  memo: string | null;
  initiative_id: string | null;
  source: string | null;
}

interface IdeaRow {
  id: string;
  title: string;
  prompt: string;
  tags: string[] | null;
  status: string;
  meta: Record<string, unknown> | null;
}

async function fetchMmmInitiatives(): Promise<InitiativeRow[]> {
  const { data } = await supabaseAdmin
    .from('initiatives')
    .select('id, slug, title, status')
    .ilike('slug', 'MMM_%');
  return (data || []) as InitiativeRow[];
}

async function fetchMmmProjects(initiativeIds: string[]): Promise<CcProjectRow[]> {
  if (initiativeIds.length === 0) return [];
  const { data } = await supabaseAdmin
    .from('cc_projects')
    .select('id, name, initiative_id')
    .or(`initiative_id.in.(${initiativeIds.join(',')}),type.eq.hhh`);
  return (data || []) as CcProjectRow[];
}

async function fetchTasksForProjects(projectIds: string[]): Promise<ProjectTaskRow[]> {
  if (projectIds.length === 0) return [];
  const { data } = await supabaseAdmin
    .from('project_tasks')
    .select('id, project_id, title, description, status, priority, risk_tier, assigned_agent, due_at, meta')
    .in('project_id', projectIds)
    .order('priority', { ascending: true })
    .order('updated_at', { ascending: false });
  return (data || []) as ProjectTaskRow[];
}

async function fetchMmmFinance(initiativeIds: string[]): Promise<FinanceTransactionRow[]> {
  if (initiativeIds.length === 0) return [];
  const { data } = await supabaseAdmin
    .from('finance_transactions')
    .select('id, ts, direction, amount, category, vendor, memo, initiative_id, source')
    .in('initiative_id', initiativeIds)
    .order('ts', { ascending: false })
    .limit(200);
  return (data || []) as FinanceTransactionRow[];
}

async function fetchMmmSocialPosts(): Promise<MarketingPostRow[]> {
  const { data } = await supabaseAdmin
    .from('marketing_posts')
    .select('id, content, platforms, status, source, scheduled_for, meta')
    .or('content.ilike.%makingmilesmatter%,content.ilike.%making miles matter%,content.ilike.%#hhh%,content.ilike.%#fff%')
    .order('scheduled_for', { ascending: true })
    .limit(40);
  return (data || []) as MarketingPostRow[];
}

async function fetchMmmResearchIdeas(): Promise<IdeaRow[]> {
  const { data } = await supabaseAdmin
    .from('ideas')
    .select('id, title, prompt, tags, status, meta')
    .or('tags.cs.{mmm},tags.cs.{bike-event-research}')
    .limit(50);
  return (data || []) as IdeaRow[];
}

async function fetchMilesAgentRuns(): Promise<
  { id: string; agent_id: string; action: string; status: string; created_at: string }[]
> {
  const { data } = await supabaseAdmin
    .from('agent_runs')
    .select('id, agent_id, action, status, created_at')
    .eq('agent_id', 'bolt-miles')
    .order('created_at', { ascending: false })
    .limit(20);
  return (data || []) as { id: string; agent_id: string; action: string; status: string; created_at: string }[];
}

function buildFinanceSummary(
  eventSlug: string,
  liveTx: FinanceTransactionRow[],
  demoLines: MmmFinancialLine[],
): MmmFinancialSummary {
  const event = MMM_EVENTS.find((e) => e.slug === eventSlug)!;
  const lines: MmmFinancialLine[] = [];
  let isDemo = true;

  if (liveTx.length > 0) {
    isDemo = false;
    for (const tx of liveTx) {
      const cents = Math.round(tx.amount * 100);
      let category: MmmFinancialLine['category'] = tx.direction === 'in' ? 'revenue' : 'expense';
      const cat = (tx.category || '').toLowerCase();
      if (cat.includes('sponsor')) category = 'sponsorship';
      else if (cat.includes('donation') || cat.includes('donat')) category = 'donation';
      lines.push({
        label: tx.memo || tx.vendor || tx.category || 'Transaction',
        category,
        amount_cents: cents,
        source_note: `Live · ${tx.source || 'manual'} · ${new Date(tx.ts).toLocaleDateString()}`,
        is_demo: false,
      });
    }
  } else {
    lines.push(...demoLines);
  }

  const totals = lines.reduce(
    (acc, l) => {
      if (l.category === 'revenue') acc.revenue_cents += l.amount_cents;
      else if (l.category === 'expense') acc.expense_cents += l.amount_cents;
      else if (l.category === 'sponsorship') acc.sponsorship_cents += l.amount_cents;
      else if (l.category === 'donation') acc.donations_cents += l.amount_cents;
      return acc;
    },
    { revenue_cents: 0, expense_cents: 0, net_cents: 0, sponsorship_cents: 0, donations_cents: 0 },
  );
  totals.net_cents =
    totals.revenue_cents + totals.sponsorship_cents + totals.donations_cents - totals.expense_cents;

  const outstanding = eventSlug === 'hhh-2026' ? HHH_OUTSTANDING_TARGETS : [];

  return {
    event_slug: eventSlug,
    display_date: event.display_date,
    status: event.status,
    lines,
    totals,
    outstanding_targets: outstanding,
    is_demo: isDemo,
  };
}

function groupTasksByOwner(rows: MmmTaskRow[]): MmmTaskOwnerGroup[] {
  const groups = new Map<string, MmmTaskOwnerGroup>();
  for (const t of rows) {
    const owner = resolveTaskOwner(t.assigned_agent);
    if (!groups.has(owner.id)) {
      groups.set(owner.id, {
        owner_id: owner.id,
        owner_label: owner.label,
        team_member: owner.team,
        agent: owner.agent,
        tasks: [],
      });
    }
    groups.get(owner.id)!.tasks.push(t);
  }
  // Order: humans first (by team registry order), then agents, then unknown
  const order = (g: MmmTaskOwnerGroup): number => {
    const teamIdx = MMM_TEAM.findIndex((m) => m.id === g.owner_id);
    if (teamIdx >= 0) return teamIdx;
    const agentIdx = MMM_AGENTS.findIndex((a) => a.id === g.owner_id);
    if (agentIdx >= 0) return 100 + agentIdx;
    if (g.owner_id === 'unassigned') return 999;
    return 500;
  };
  return [...groups.values()].sort((a, b) => order(a) - order(b));
}

function normalizePlatforms(raw: MarketingPostRow['platforms']): string[] {
  if (!raw) return [];
  return raw
    .map((p) => (typeof p === 'string' ? p : p?.platform))
    .filter((s): s is string => typeof s === 'string' && s.length > 0);
}

function buildSocialPosts(rows: MarketingPostRow[]): MmmSocialPost[] {
  return rows.map((r) => ({
    id: r.id,
    scheduled_for: r.scheduled_for,
    status: r.status || 'draft',
    platforms: normalizePlatforms(r.platforms),
    content: r.content || '',
    tags: extractHashtags(r.content || ''),
    source: r.source === 'agent' ? 'agent' : 'human',
    approval_state: r.status === 'approved' || r.status === 'published' ? 'approved' : 'pending',
    is_demo: false,
  }));
}

function extractHashtags(content: string): string[] {
  const tags: string[] = [];
  const re = /#([a-z0-9_]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) tags.push(m[1].toLowerCase());
  return Array.from(new Set(tags));
}

function buildResearch(rows: IdeaRow[]): MmmResearchItem[] {
  const live: MmmResearchItem[] = rows.map((r) => ({
    id: r.id,
    group_slug: MMM_GROUP_SLUG,
    title: r.title,
    status: mapIdeaStatus(r.status),
    source: 'agent',
    approval_state: 'pending',
    tags: r.tags || [],
    underlying_idea_id: r.id,
  }));
  if (live.length > 0) return live;
  return DEMO_RESEARCH_ITEMS;
}

function mapIdeaStatus(s: string): MmmResearchItem['status'] {
  if (s === 'researched') return 'researched';
  if (s === 'killed' || s === 'shipped') return 'archived';
  if (s === 'queued' || s === 'inbox') return 'queued';
  return 'researching';
}

function buildAgentActivityList(
  liveRuns: { id: string; agent_id: string; action: string; status: string; created_at: string }[],
): MmmAgentActivity[] {
  const live: MmmAgentActivity[] = liveRuns.map((r) => ({
    id: r.id,
    agent_id: r.agent_id,
    group_slug: MMM_GROUP_SLUG,
    kind: 'recap',
    title: r.action,
    summary: `Live agent run · status: ${r.status}`,
    approval_state: 'not-needed',
    source: 'agent',
    is_demo: false,
    created_at: r.created_at,
  }));
  // Always include demos until full live-only feed is enough on its own
  return [...live, ...DEMO_AGENT_ACTIVITY];
}

function buildNextActions(): MmmDashboardData['next_actions'] {
  return [
    { label: 'Approve and publish FFF thank-you post', owner_id: 'brandon', tone: 'urgent', due_label: 'Today' },
    { label: 'Close out FFF financial recap', owner_id: 'brandon', tone: 'urgent', due_label: 'This week' },
    { label: 'Send FFF rider follow-up email with HHH save-the-date', owner_id: 'brandon', due_label: 'This week' },
    { label: 'Update HHH sponsor packet with 2026 dates and after-party detail', owner_id: 'brandon', due_label: 'This week' },
    { label: 'Confirm Tim on HHH parking walkthrough video by Jul 15', owner_id: 'tim', due_label: 'Jul 15' },
    { label: 'Confirm Josh on HHH volunteer recruitment plan', owner_id: 'josh', due_label: 'Jul 1' },
  ];
}

export async function getMmmDashboardData(): Promise<MmmDashboardData> {
  const initiatives = await fetchMmmInitiatives();
  const initIds = initiatives.map((i) => i.id);
  const initBySlug = new Map(initiatives.map((i) => [i.slug || '', i]));

  const projects = await fetchMmmProjects(initIds);
  const projIds = projects.map((p) => p.id);
  const projById = new Map(projects.map((p) => [p.id, p]));

  const [taskRows, marketingRows, ideaRows, agentRuns, pendingApprovals, sponsors] =
    await Promise.all([
      fetchTasksForProjects(projIds),
      fetchMmmSocialPosts(),
      fetchMmmResearchIdeas(),
      fetchMilesAgentRuns(),
      fetchPendingApprovals(),
      getMmmSponsorPipeline(),
    ]);

  // Live finance, partitioned per event
  const fffInitId = initBySlug.get('MMM_FONDO_2026')?.id;
  const hhhInitId = initBySlug.get('MMM_HHH_2026')?.id;
  const sponsorInitId = initBySlug.get('MMM_SPONSORS_2026')?.id;
  const grantsInitId = initBySlug.get('MMM_GRANTS_2026')?.id;
  const allFinanceIds = [fffInitId, hhhInitId, sponsorInitId, grantsInitId].filter(Boolean) as string[];

  const liveFinance = await fetchMmmFinance(allFinanceIds);
  const fffTx = fffInitId ? liveFinance.filter((t) => t.initiative_id === fffInitId) : [];
  const hhhTx = hhhInitId ? liveFinance.filter((t) => t.initiative_id === hhhInitId) : [];

  // Tasks rows
  const tasks: MmmTaskRow[] = taskRows.map((t) => {
    const proj = projById.get(t.project_id);
    const init = proj?.initiative_id
      ? initiatives.find((i) => i.id === proj.initiative_id)
      : null;
    const meta = (t.meta || {}) as Record<string, unknown>;
    return {
      id: t.id,
      title: t.title,
      description: t.description,
      status: t.status,
      priority: t.priority,
      risk_tier: t.risk_tier,
      assigned_agent: t.assigned_agent || 'unassigned',
      due_at: t.due_at,
      initiative_slug: init?.slug || null,
      initiative_title: init?.title || null,
      project_name: proj?.name || null,
      source: meta.source === 'agent' ? 'agent' : 'human',
      approval_state: (meta.approval_state as MmmTaskRow['approval_state']) || 'not-needed',
    };
  });

  const finance: MmmFinancialSummary[] = [
    buildFinanceSummary('fff-2026', fffTx, FFF_DEMO_LINES),
    buildFinanceSummary('hhh-2026', hhhTx, HHH_DEMO_LINES),
  ];

  const warnings: string[] = [];
  if (initiatives.length === 0) {
    warnings.push(
      'No MMM initiatives found in the database. Run `pnpm run seed:cc` (or the equivalent) '
      + 'to seed initiatives, projects, and tasks before this view is meaningful.',
    );
  }
  if (tasks.length === 0 && initIds.length > 0) {
    warnings.push('No MMM project tasks in the DB yet — re-run the seed script after the latest update.');
  }

  const readiness = computeHhhReadiness(tasks);

  return {
    group_slug: MMM_GROUP_SLUG,
    group_label: MMM_GROUP_LABEL,
    fetched_at: new Date().toISOString(),
    events: MMM_EVENTS,
    team: MMM_TEAM,
    agents: MMM_AGENTS,
    task_groups: groupTasksByOwner(tasks),
    task_total: tasks.length,
    social_posts: buildSocialPosts(marketingRows),
    finance,
    meeting_notes: listMmmMeetingNotes(),
    research: buildResearch(ideaRows),
    agent_activity: buildAgentActivityList(agentRuns),
    pending_approvals: pendingApprovals,
    readiness,
    sponsors,
    next_actions: buildNextActions(),
    warnings,
  };
}
