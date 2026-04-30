/**
 * Static registry for the Making Miles Matter group.
 *
 * Until we add team_members / events tables, this file is the source of truth
 * for human team members, helper agents, and event metadata. Each entry is
 * stamped with `group_slug` so a second nonprofit could be dropped in later
 * without forking the dashboard code.
 */
import type { MmmAgent, MmmEvent, MmmTeamMember } from './types';

export const MMM_GROUP_SLUG = 'making-miles-matter';
export const MMM_GROUP_LABEL = 'Making Miles Matter';

export const MMM_TEAM: MmmTeamMember[] = [
  {
    id: 'brandon',
    name: 'Brandon Glomski',
    role: 'director',
    email: 'spiderbuttons@gmail.com',
    group_slug: MMM_GROUP_SLUG,
    is_owner: true,
    notes: 'Founder/director. Operations, vision, sponsor relationships.',
  },
  {
    id: 'tim',
    name: 'Tim',
    role: 'logistics',
    group_slug: MMM_GROUP_SLUG,
    notes: 'Event logistics, on-the-ground coordination, parking, course setup.',
  },
  {
    id: 'josh',
    name: 'Josh',
    role: 'helper',
    group_slug: MMM_GROUP_SLUG,
    notes: 'Event helper. Volunteer coordination, vendor handling, day-of support.',
  },
];

export const MMM_AGENTS: MmmAgent[] = [
  {
    id: 'bolt-miles',
    name: 'Miles',
    identity: 'Bolt — Making Miles Matter helper',
    group_slug: MMM_GROUP_SLUG,
    description:
      'Helper agent for Making Miles Matter ops: drafts social posts, summarizes meetings, '
      + 'researches other bike events, and queues weekly status reports for human approval.',
    capabilities: [
      'social-draft',
      'meeting-summary',
      'research-note',
      'weekly-report',
      'recap',
      'suggested-task',
    ],
    default_owner_email: 'spiderbuttons@gmail.com',
  },
];

/**
 * Event registry. `initiative_slug` should match a row in the `initiatives` table
 * so the dashboard can join to live initiative status, projects, tasks, and finance.
 */
export const MMM_EVENTS: MmmEvent[] = [
  {
    slug: 'fff-2026',
    initiative_slug: 'MMM_FONDO_2026',
    group_slug: MMM_GROUP_SLUG,
    name: 'Findlay Further Fondo 2026',
    short_name: 'FFF',
    status: 'completed',
    date_iso: '2026-04-25',
    display_date: 'Apr 25, 2026',
    description:
      'The 2026 Findlay Further Fondo went great — first-of-the-year ride, strong rider energy, '
      + 'good weather window. Now in post-event momentum: thank-yous, recap, financial close-out, '
      + 'lessons-learned for HHH.',
    highlights: [
      'Event completed on schedule',
      'Strong post-event mood — capture momentum into HHH outreach',
      'Financial recap pending',
    ],
    notes: 'Update sponsor and rider lists into the HHH funnel while the warm leads are still warm.',
  },
  {
    slug: 'hhh-2026',
    initiative_slug: 'MMM_HHH_2026',
    group_slug: MMM_GROUP_SLUG,
    name: 'HHH 2026',
    short_name: 'HHH',
    status: 'upcoming',
    date_iso: '2026-09-12',
    display_date: 'Sept 12, 2026',
    start_time: '7:00 AM',
    location: 'VFW',
    registration_goal: 200,
    registrations: 47,
    sponsor_goal: 8,
    sponsors_secured: 3,
    description:
      'HHH is the marquee MMM event of the year. Day-long format at the VFW with food, raffles, '
      + 'a battle of the bands, games, sponsor activations, merch, parking walkthroughs, and an '
      + 'after-party at the same location.',
    highlights: [
      'Sept 12, 2026 · 7:00 AM · VFW',
      'Food + raffles + games + sponsor activations',
      'Battle of the bands',
      'Merch designs in progress',
      'Parking walkthrough/details to be communicated to riders',
      'After-party at the VFW',
    ],
  },
];

export function getMmmEvent(slug: string): MmmEvent | undefined {
  return MMM_EVENTS.find((e) => e.slug === slug);
}

export function getMmmEventByInitiativeSlug(initiativeSlug: string): MmmEvent | undefined {
  return MMM_EVENTS.find((e) => e.initiative_slug === initiativeSlug);
}

export function isMmmInitiativeSlug(slug: string | null | undefined): boolean {
  if (!slug) return false;
  return slug.startsWith('MMM_');
}

export function getTeamMember(id: string): MmmTeamMember | undefined {
  return MMM_TEAM.find((m) => m.id === id);
}

export function getAgent(id: string): MmmAgent | undefined {
  return MMM_AGENTS.find((a) => a.id === id);
}

/**
 * Map a `project_tasks.assigned_agent` string to a team member or agent identity.
 * Falls back to a generic display label so unknown agents still render cleanly.
 */
export function resolveTaskOwner(assignedAgent: string | null | undefined): {
  id: string;
  label: string;
  team?: MmmTeamMember;
  agent?: MmmAgent;
} {
  const value = (assignedAgent || '').trim().toLowerCase();
  if (!value) return { id: 'unassigned', label: 'Unassigned' };

  const member =
    MMM_TEAM.find((m) => m.id === value)
    || MMM_TEAM.find((m) => m.name.toLowerCase() === value)
    || MMM_TEAM.find((m) => m.email?.toLowerCase() === value);
  if (member) return { id: member.id, label: member.name, team: member };

  const agent =
    MMM_AGENTS.find((a) => a.id === value)
    || MMM_AGENTS.find((a) => a.name.toLowerCase() === value);
  if (agent) return { id: agent.id, label: agent.name, agent };

  return { id: value, label: assignedAgent || 'Unassigned' };
}
