/**
 * Demo research items for the bike-event research queue.
 *
 * Persists nowhere — these are TS-side placeholders so the queue UI is testable
 * before the real Bolt/Miles agent populates it. The dashboard merges these
 * with live `ideas` rows tagged `mmm` or `bike-event-research`.
 */
import type { MmmResearchItem } from './types';
import { MMM_GROUP_SLUG } from './registry';

export const DEMO_RESEARCH_ITEMS: MmmResearchItem[] = [
  {
    id: 'demo-r-1',
    group_slug: MMM_GROUP_SLUG,
    title: 'Gravel Worlds (Lincoln, NE) — sponsor + format study',
    status: 'queued',
    event_name: 'Gravel Worlds',
    location: 'Lincoln, NE',
    date_or_season: 'Mid-August',
    registration_model: 'Tiered (150 / 75 / 50 mile options) with cap and waitlist',
    sponsor_ideas: ['Bike shops', 'Local breweries', 'Energy nutrition brands'],
    attendance_clue: 'Routinely caps at 1,500+ riders',
    takeaways: [
      'Tiered distance options drive higher total registrations',
      'Local food/brewery sponsor pairing works for after-party energy',
    ],
    source: 'agent',
    approval_state: 'pending',
    tags: ['mmm', 'bike-event-research', 'gravel'],
  },
  {
    id: 'demo-r-2',
    group_slug: MMM_GROUP_SLUG,
    title: 'Charity century rides — registration-as-fundraising patterns',
    status: 'queued',
    event_name: 'Generic charity centuries',
    location: 'Various US',
    date_or_season: 'Spring–Fall',
    registration_model: 'Registration + fundraising minimum per rider',
    sponsor_ideas: ['Healthcare systems', 'Insurance companies', 'Regional banks'],
    attendance_clue: 'Mid-size events average 300–800 riders',
    takeaways: [
      'Per-rider fundraising minimum doubles donation revenue vs flat ticket',
      'Healthcare sponsors over-index for nonprofits with mission alignment',
    ],
    source: 'agent',
    approval_state: 'pending',
    tags: ['mmm', 'bike-event-research', 'charity'],
  },
  {
    id: 'demo-r-3',
    group_slug: MMM_GROUP_SLUG,
    title: 'After-party + battle-of-the-bands events research',
    status: 'researching',
    event_name: 'Multi-format community rides',
    location: 'Various',
    date_or_season: 'Summer',
    registration_model: 'Single ticket covers ride + after-party access',
    sponsor_ideas: ['Local music venues', 'Beverage brands', 'Audio/AV vendors as in-kind sponsors'],
    attendance_clue: 'After-party converts ~60–70% of riders into attendees',
    takeaways: [
      'Bundle pricing simplifies registration and lifts after-party attendance',
      'In-kind audio/AV sponsorship swap is a common pattern worth replicating for HHH',
    ],
    source: 'agent',
    approval_state: 'pending',
    tags: ['mmm', 'bike-event-research', 'after-party', 'hhh-applicable'],
  },
];
