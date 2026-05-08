'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity,    // Today
  ListTodo,    // Work
  Zap,         // Agents
  Lightbulb,   // Ideas
  DollarSign,  // Money
  Bike,        // MMM
} from 'lucide-react';

/**
 * Mission Control subnav — "if a 4th grader can't navigate, redo it" pass.
 *
 * Old: 14 tabs (Glance / Deep View / API Usage / Campaigns / MMM / Jobs /
 *      Ideas / Finance / Agents / FinOps / CRM / Feedback / Research / Ops Health)
 *
 * New: 6 tabs with plain-English labels. Sub-pages collapse under their parent
 *      via the `matches` array — visiting /finops still highlights "Money".
 *
 * Mobile-first: full-width pill buttons, scroll horizontally only when overflow.
 */

const TABS = [
  {
    label: 'Today',
    href: '/admin/command-center',
    icon: Activity,
    matches: ['/admin/command-center'],
  },
  {
    label: 'Work',
    href: '/admin/command-center/projects',
    icon: ListTodo,
    matches: [
      '/admin/command-center/projects',
      '/admin/command-center/jobs',
      '/admin/command-center/deep',
      '/admin/command-center/feedback',
    ],
  },
  {
    label: 'Money',
    href: '/admin/command-center/finance',
    icon: DollarSign,
    matches: [
      '/admin/command-center/finance',
      '/admin/command-center/finops',
      '/admin/command-center/usage',
      '/admin/command-center/crm',
    ],
  },
  {
    label: 'Agents',
    href: '/admin/command-center/agents',
    icon: Zap,
    matches: [
      '/admin/command-center/agents',
      '/admin/command-center/ops-health',
    ],
  },
  {
    label: 'Ideas',
    href: '/admin/command-center/ideas',
    icon: Lightbulb,
    matches: [
      '/admin/command-center/ideas',
      '/admin/command-center/research',
    ],
  },
  {
    label: 'MMM',
    href: '/admin/command-center/mmm',
    icon: Bike,
    matches: ['/admin/command-center/mmm'],
  },
];

export default function CCSubnav() {
  const pathname = usePathname();

  function isActive(tab: (typeof TABS)[number]) {
    if (tab.href === '/admin/command-center') return pathname === '/admin/command-center';
    return tab.matches.some(
      (m) => pathname === m || pathname.startsWith(m + '/'),
    );
  }

  return (
    <div className="-mx-4 sm:-mx-6 px-4 sm:px-6 border-b border-zinc-800 mb-5 overflow-x-auto scrollbar-none">
      <nav
        className="flex gap-2 sm:gap-1 min-w-max"
        aria-label="Mission Control"
      >
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = isActive(tab);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`
                flex items-center justify-center gap-2 px-4 py-3 sm:px-3 sm:py-2.5
                text-sm font-semibold whitespace-nowrap
                rounded-t-lg sm:rounded-none border-b-2
                min-w-[5rem] sm:min-w-0
                transition-colors
                ${
                  active
                    ? 'border-teal-400 text-teal-400 bg-teal-500/5'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
                }
              `}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
