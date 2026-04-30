/**
 * Event readiness scoring.
 *
 * Maps each readiness category (Registration, Route, Parking, Sponsors, Volunteers,
 * Food, Merch, Raffles, Music/Battle of the Bands, Safety/SAG, Communications,
 * Post-event follow-up) to keyword predicates against `project_tasks.title` and
 * computes status from task counts:
 *
 *   - all done                          → 'done'
 *   - any blocked OR ≥1 task untouched  → 'needs-attention'
 *   - some active/queued, none blocked  → 'on-track'
 *   - zero matching tasks               → 'not-started'
 *
 * White-label note: each `MmmEventReadinessConfig` is self-contained — a second
 * org/event can register its own readiness map without touching the scoring code.
 */
import type { MmmReadinessCategory, MmmReadinessSummary, MmmTaskRow } from './types';
import { resolveTaskOwner } from './registry';

interface CategoryDef {
  key: string;
  label: string;
  /** Lowercased substrings; a task matches if its title contains ANY of these. */
  match: string[];
}

interface EventReadinessConfig {
  event_slug: string;
  event_label: string;
  initiative_slugs: string[];
  categories: CategoryDef[];
}

const HHH_CONFIG: EventReadinessConfig = {
  event_slug: 'hhh-2026',
  event_label: 'HHH 2026 readiness',
  initiative_slugs: ['MMM_HHH_2026'],
  categories: [
    { key: 'registration', label: 'Registration', match: ['registration', 'register'] },
    { key: 'route', label: 'Route', match: ['route', 'course'] },
    { key: 'parking', label: 'Parking', match: ['parking'] },
    { key: 'sponsors', label: 'Sponsors', match: ['sponsor'] },
    { key: 'volunteers', label: 'Volunteers', match: ['volunteer'] },
    { key: 'food', label: 'Food / vendors', match: ['food', 'vendor'] },
    { key: 'merch', label: 'Merch', match: ['merch'] },
    { key: 'raffles', label: 'Raffles', match: ['raffle'] },
    { key: 'music', label: 'Battle of the bands', match: ['battle of the bands', 'band', 'music'] },
    { key: 'safety', label: 'Safety / SAG', match: ['safety', 'sag', 'medic'] },
    { key: 'comms', label: 'Communications', match: ['communicat', 'social', 'thank-you', 'recap', 'email'] },
    { key: 'post', label: 'Post-event follow-up', match: ['post-event', 'follow-up', 'lessons', 'recap'] },
  ],
};

const STATUS_RANK: Record<MmmReadinessCategory['status'], number> = {
  'needs-attention': 0,
  'not-started': 1,
  'on-track': 2,
  done: 3,
};

function scoreCategory(def: CategoryDef, tasks: MmmTaskRow[]): MmmReadinessCategory {
  const lower = (s: string) => s.toLowerCase();
  const matched = tasks.filter((t) => def.match.some((m) => lower(t.title).includes(lower(m))));

  const total = matched.length;
  const done = matched.filter((t) => t.status === 'done').length;
  const blocked = matched.filter((t) => t.status === 'blocked' || t.status === 'killed').length;
  const active = matched.filter((t) => t.status === 'active' || t.status === 'queued').length;

  let status: MmmReadinessCategory['status'];
  if (total === 0) status = 'not-started';
  else if (done === total) status = 'done';
  else if (blocked > 0) status = 'needs-attention';
  else if (active === 0) status = 'needs-attention';
  else status = 'on-track';

  // Pick a representative open task (highest priority, not done).
  const openTasks = matched
    .filter((t) => t.status !== 'done' && t.status !== 'killed')
    .sort((a, b) => a.priority - b.priority);
  const representative = openTasks[0];
  const owner = representative ? resolveTaskOwner(representative.assigned_agent) : null;

  return {
    key: def.key,
    label: def.label,
    status,
    owner_id: owner?.id,
    owner_label: owner?.label,
    due_label: representative?.due_at
      ? new Date(representative.due_at).toLocaleDateString()
      : undefined,
    task_total: total,
    task_done: done,
    task_blocked: blocked,
    next_action: representative?.title,
    blockers: matched
      .filter((t) => t.status === 'blocked')
      .map((t) => t.title)
      .slice(0, 3),
  };
}

export function computeHhhReadiness(tasks: MmmTaskRow[]): MmmReadinessSummary {
  const config = HHH_CONFIG;
  const eventTasks = tasks.filter(
    (t) => !!t.initiative_slug && config.initiative_slugs.includes(t.initiative_slug),
  );

  const categories = config.categories.map((c) => scoreCategory(c, eventTasks));
  const counts = categories.reduce(
    (acc, c) => {
      if (c.status === 'on-track') acc.on_track++;
      else if (c.status === 'needs-attention') acc.needs_attention++;
      else if (c.status === 'not-started') acc.not_started++;
      else if (c.status === 'done') acc.done++;
      return acc;
    },
    { on_track: 0, needs_attention: 0, not_started: 0, done: 0 },
  );
  const total = categories.length;
  const readyPct = Math.round(((counts.done + counts.on_track) / Math.max(1, total)) * 100);

  let statusLabel = 'On track';
  if (counts.needs_attention > 3) statusLabel = 'Needs attention';
  else if (counts.not_started > 4) statusLabel = 'Behind';
  else if (counts.done === total) statusLabel = 'Ready';

  // Sort: needs-attention first, then not-started, then on-track, then done.
  categories.sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status]);

  return {
    event_slug: config.event_slug,
    event_label: config.event_label,
    status_label: statusLabel,
    on_track: counts.on_track,
    needs_attention: counts.needs_attention,
    not_started: counts.not_started,
    done: counts.done,
    total,
    ready_pct: readyPct,
    categories,
  };
}
