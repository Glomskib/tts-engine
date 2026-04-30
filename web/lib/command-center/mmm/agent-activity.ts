/**
 * Demo agent activity for the Bolt/Miles workspace.
 *
 * Until the real agent loop is wired up, the dashboard renders these clearly-
 * labeled examples so the operator (Brandon/Tim/Josh) can see the *shape* of
 * what an autonomous helper would produce: drafts, summaries, research notes,
 * weekly reports — each with an explicit approval state.
 *
 * Real activity should be persisted to `agent_runs` with `agent_id='bolt-miles'`
 * and rendered alongside these stubs (or replace them). See queries.ts.
 */
import type { MmmAgentActivity } from './types';
import { MMM_GROUP_SLUG } from './registry';

export const DEMO_AGENT_ACTIVITY: MmmAgentActivity[] = [
  {
    id: 'demo-recap-fff',
    agent_id: 'bolt-miles',
    group_slug: MMM_GROUP_SLUG,
    kind: 'recap',
    title: 'FFF post-event recap draft',
    summary:
      'Auto-drafted recap of the 2026 Findlay Further Fondo: mileage, rider count placeholder, '
      + 'sponsor shoutouts, photo prompts. Awaiting Brandon\'s edits before it goes to socials.',
    related_event_slug: 'fff-2026',
    approval_state: 'pending',
    source: 'agent',
    is_demo: true,
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString(),
  },
  {
    id: 'demo-social-thankyou',
    agent_id: 'bolt-miles',
    group_slug: MMM_GROUP_SLUG,
    kind: 'social-draft',
    title: 'FFF thank-you post (Facebook-first)',
    summary:
      'Facebook-first draft thanking riders, volunteers, and sponsors with a soft CTA pointing '
      + 'at the HHH save-the-date. LinkedIn variant included.',
    related_event_slug: 'fff-2026',
    approval_state: 'pending',
    source: 'agent',
    is_demo: true,
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 8).toISOString(),
  },
  {
    id: 'demo-suggested-task',
    agent_id: 'bolt-miles',
    group_slug: MMM_GROUP_SLUG,
    kind: 'suggested-task',
    title: 'Suggest: lock HHH parking walkthrough video by July 15',
    summary:
      'Riders historically ask about parking 60–90 days out. Suggest assigning Tim to scout '
      + 'and shoot a 60-second VFW parking walkthrough by mid-July so the social calendar can '
      + 'queue a teaser in early August.',
    related_event_slug: 'hhh-2026',
    approval_state: 'pending',
    source: 'agent',
    is_demo: true,
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 30).toISOString(),
  },
  {
    id: 'demo-meeting-summary',
    agent_id: 'bolt-miles',
    group_slug: MMM_GROUP_SLUG,
    kind: 'meeting-summary',
    title: 'FFF debrief — auto-summary placeholder',
    summary:
      'Will summarize the FFF debrief once the human-written meeting note is finalized. Pulls '
      + 'decisions and action items into the team task list.',
    related_event_slug: 'fff-2026',
    approval_state: 'not-needed',
    source: 'agent',
    is_demo: true,
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString(),
  },
  {
    id: 'demo-research-cycling',
    agent_id: 'bolt-miles',
    group_slug: MMM_GROUP_SLUG,
    kind: 'research-note',
    title: 'Bike event research: 3 candidates queued',
    summary:
      'Gravel Worlds, Dirty Kanza-style local rides, and a regional charity century — pulled '
      + 'into the research queue with sponsor notes and registration models. See research tab.',
    approval_state: 'pending',
    source: 'agent',
    is_demo: true,
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 50).toISOString(),
  },
  {
    id: 'demo-weekly-report',
    agent_id: 'bolt-miles',
    group_slug: MMM_GROUP_SLUG,
    kind: 'weekly-report',
    title: 'Weekly MMM report (placeholder)',
    summary:
      'Cron-style weekly digest will land here on Mondays: registrations delta, sponsor '
      + 'pipeline, social engagement, finance net, top blockers. Right now it\'s a placeholder.',
    approval_state: 'not-needed',
    source: 'agent',
    is_demo: true,
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
  },
];
