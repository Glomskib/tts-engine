'use client';

import { ReactNode, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Briefcase, Menu, X } from 'lucide-react';
import type { MpAuthContext } from '@/lib/marketplace/auth';

export function VaLayoutShell({ children, auth }: { children: ReactNode; auth: MpAuthContext }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100">
      <header className="h-14 border-b border-white/10 px-4 lg:px-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-bold text-white">FlashFlow</h1>
          <span className="text-xs bg-purple-900/60 text-purple-300 px-2 py-0.5 rounded-full font-medium">VA Portal</span>
        </div>
        <nav className="hidden md:flex items-center gap-4">
          <Link
            href="/va/jobs"
            className={`text-sm ${pathname.startsWith('/va/jobs') ? 'text-white' : 'text-zinc-400 hover:text-white'}`}
          >
            <span className="flex items-center gap-2"><Briefcase className="w-4 h-4" /> Job Board</span>
          </Link>
          <span className="text-xs text-zinc-600">{auth.displayName || auth.email}</span>
        </nav>
        <button onClick={() => setMenuOpen(!menuOpen)} className="md:hidden text-zinc-400">
          {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </header>
      {menuOpen && (
        <div className="md:hidden border-b border-white/10 p-4">
          <Link href="/va/jobs" onClick={() => setMenuOpen(false)} className="block py-2 text-sm text-zinc-300 hover:text-white">
            Job Board
          </Link>
        </div>
      )}
      <main className="p-4 lg:p-6 max-w-6xl mx-auto">
        {children}
      </main>
    </div>
  );
}
