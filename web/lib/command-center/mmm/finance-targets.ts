/**
 * Demo financial baselines for MMM events.
 *
 * Live finance is read from `finance_transactions` joined to initiatives.
 * If the DB has zero MMM transactions yet, the dashboard falls back to these
 * clearly-labeled demo numbers so the UI is never empty.
 *
 * Wipe `is_demo: true` lines once real data lands.
 */
import type { MmmFinancialLine } from './types';

export const FFF_DEMO_LINES: MmmFinancialLine[] = [
  {
    label: 'Rider registrations',
    category: 'revenue',
    amount_cents: 980_000,
    source_note: 'Demo estimate · replace with Shopify/Stripe close-out',
    is_demo: true,
  },
  {
    label: 'Title sponsor',
    category: 'sponsorship',
    amount_cents: 250_000,
    source_note: 'Demo estimate · pending sponsor confirmation',
    is_demo: true,
  },
  {
    label: 'Donations on registration',
    category: 'donation',
    amount_cents: 80_000,
    source_note: 'Demo estimate',
    is_demo: true,
  },
  {
    label: 'Course/permits',
    category: 'expense',
    amount_cents: 120_000,
    source_note: 'Demo estimate',
    is_demo: true,
  },
  {
    label: 'Aid stations + food',
    category: 'expense',
    amount_cents: 220_000,
    source_note: 'Demo estimate',
    is_demo: true,
  },
  {
    label: 'Merch + swag',
    category: 'expense',
    amount_cents: 180_000,
    source_note: 'Demo estimate',
    is_demo: true,
  },
];

export const HHH_DEMO_LINES: MmmFinancialLine[] = [
  {
    label: 'Projected rider registrations (200 × $50)',
    category: 'projected',
    amount_cents: 1_000_000,
    source_note: 'Demo projection at 200 rider goal',
    is_demo: true,
  },
  {
    label: 'Sponsor revenue (3/8 secured)',
    category: 'sponsorship',
    amount_cents: 750_000,
    source_note: 'Demo · 3 confirmed sponsors',
    is_demo: true,
  },
  {
    label: 'Outstanding sponsor target (5 remaining)',
    category: 'projected',
    amount_cents: 1_250_000,
    source_note: 'Demo · 5 sponsor slots still open',
    is_demo: true,
  },
  {
    label: 'VFW + permits (estimated)',
    category: 'expense',
    amount_cents: 250_000,
    source_note: 'Demo estimate',
    is_demo: true,
  },
  {
    label: 'Battle of the bands production',
    category: 'expense',
    amount_cents: 350_000,
    source_note: 'Demo estimate',
    is_demo: true,
  },
  {
    label: 'Food + raffle prizes',
    category: 'expense',
    amount_cents: 400_000,
    source_note: 'Demo estimate',
    is_demo: true,
  },
];

export const HHH_OUTSTANDING_TARGETS = [
  {
    label: 'Sponsors needed (5 of 8 remaining)',
    remaining_cents: 1_250_000,
    note: 'Targeting $2,500 average per slot — adjust as packets land',
  },
  {
    label: 'Registrations needed (153 of 200 remaining)',
    remaining_cents: 765_000,
    note: 'At $50 avg ticket — push outreach through summer',
  },
];
