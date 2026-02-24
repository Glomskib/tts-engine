'use client';

import { ReactNode, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutList, BarChart3, Menu } from 'lucide-react';
import type { MpAuthContext } from '@/lib/marketplace/auth';

const NAV_ITEMS = [
  { href: '/app/pipeline', label: 'Pipeline', icon: LayoutList },
  { href: '/app/metrics', label: 'Metrics', icon: BarChart3 },
];

export function ClientLayoutShell({ children, auth }: { children: ReactNode; auth: MpAuthContext }) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 flex">
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/60 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}
      <aside className={`fixed lg:static inset-y-0 left-0 z-50 w-64 bg-zinc-900/80 border-r border-white/10 flex flex-col transition-transform lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-6 border-b border-white/10">
          <h1 className="text-lg font-bold text-white">FlashFlow</h1>
          <p className="text-xs text-zinc-500 mt-1">Client Portal</p>
          <p className="text-xs text-zinc-600 mt-0.5">{auth.email}</p>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {NAV_ITEMS.map(item => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                  active ? 'bg-white/10 text-white' : 'text-zinc-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b border-white/10 flex items-center px-4 lg:px-6 gap-4">
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden text-zinc-400 hover:text-white">
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex-1" />
        </header>
        <main className="flex-1 p-4 lg:p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
