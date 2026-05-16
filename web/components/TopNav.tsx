'use client';

/**
 * TopNav — sticky global navigation rendered on every non-fullscreen route.
 *
 * Visible everywhere EXCEPT:
 *   - /studio          (fullscreen camera; would cover the viewfinder)
 *   - /admin/*         (admin has its own sidebar)
 *   - /cooking/*       (existing fullscreen render screen)
 *   - /api/*, /_next/* (not rendered through React anyway)
 *
 * Routes shown: Create · Studio · Library · Pricing · (account on right)
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Sparkles, Camera, Library, CreditCard, Menu, X, User } from 'lucide-react';
import { useState } from 'react';

const HIDDEN_PREFIXES = ['/studio', '/admin', '/cooking', '/auth', '/onboarding'];

const LINKS: { href: string; label: string; Icon: typeof Sparkles }[] = [
  { href: '/create', label: 'Create', Icon: Sparkles },
  { href: '/avatars', label: 'Avatars', Icon: User },
  { href: '/studio', label: 'Studio', Icon: Camera },
  { href: '/library', label: 'Library', Icon: Library },
  { href: '/pricing', label: 'Pricing', Icon: CreditCard },
];

export default function TopNav() {
  const pathname = usePathname() || '/';
  const [open, setOpen] = useState(false);

  if (HIDDEN_PREFIXES.some(p => pathname === p || pathname.startsWith(p + '/'))) return null;

  return (
    <nav className="sticky top-0 z-40 backdrop-blur bg-zinc-950/80 border-b border-white/5">
      <div className="max-w-6xl mx-auto px-4 h-12 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 font-semibold text-sm text-white">
          <span className="text-teal-400">⚡</span> FlashFlow
        </Link>

        {/* Desktop links */}
        <div className="hidden sm:flex items-center gap-1">
          {LINKS.map(({ href, label, Icon }) => {
            const active = pathname === href || pathname.startsWith(href + '/');
            return (
              <Link
                key={href}
                href={href}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors ${
                  active ? 'bg-teal-500/20 text-teal-300' : 'text-zinc-300 hover:text-white hover:bg-white/5'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </Link>
            );
          })}
          <Link href="/account" className="ml-2 px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-300 hover:text-white hover:bg-white/5">
            Account
          </Link>
        </div>

        {/* Mobile menu button */}
        <button onClick={() => setOpen(v => !v)} className="sm:hidden p-1.5 rounded-md text-zinc-300 hover:text-white hover:bg-white/5">
          {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="sm:hidden border-t border-white/5 bg-zinc-950 px-2 py-2 space-y-1">
          {LINKS.map(({ href, label, Icon }) => {
            const active = pathname === href || pathname.startsWith(href + '/');
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
                  active ? 'bg-teal-500/20 text-teal-300' : 'text-zinc-300 hover:bg-white/5'
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </Link>
            );
          })}
          <Link href="/account" onClick={() => setOpen(false)} className="block px-3 py-2 rounded-lg text-sm text-zinc-300 hover:bg-white/5">
            Account
          </Link>
        </div>
      )}
    </nav>
  );
}
