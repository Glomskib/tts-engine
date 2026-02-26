'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity, BarChart, ListTodo, Briefcase, Lightbulb,
  DollarSign, Zap, Gauge, Handshake, MessageSquare,
} from 'lucide-react';

const TABS = [
  { label: 'Overview', href: '/admin/command-center', icon: Activity },
  { label: 'API Usage', href: '/admin/command-center/usage', icon: BarChart },
  { label: 'Campaigns', href: '/admin/command-center/projects', icon: ListTodo },
  { label: 'Jobs', href: '/admin/command-center/jobs', icon: Briefcase },
  { label: 'Ideas', href: '/admin/command-center/ideas', icon: Lightbulb },
  { label: 'Finance', href: '/admin/command-center/finance', icon: DollarSign },
  { label: 'Agents', href: '/admin/command-center/agents', icon: Zap },
  { label: 'FinOps', href: '/admin/command-center/finops', icon: Gauge },
  { label: 'CRM', href: '/admin/command-center/crm', icon: Handshake },
  { label: 'Feedback', href: '/admin/command-center/feedback', icon: MessageSquare },
];

export default function CCSubnav() {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === '/admin/command-center') return pathname === href;
    return pathname === href || pathname.startsWith(href + '/');
  }

  return (
    <div className="-mx-6 px-6 border-b border-zinc-800 mb-5 overflow-x-auto scrollbar-none">
      <nav className="flex gap-1 min-w-max" aria-label="Command Center navigation">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = isActive(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`
                flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium whitespace-nowrap
                border-b-2 transition-colors
                ${active
                  ? 'border-teal-400 text-teal-400'
                  : 'border-transparent text-zinc-500 hover:text-zinc-300'
                }
              `}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
