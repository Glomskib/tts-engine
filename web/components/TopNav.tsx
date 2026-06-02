// v12-unified-shell
'use client';

/**
 * TopNav — the ONE canonical top bar for the entire site.
 *
 * Renders on every route EXCEPT:
 *   - /studio          (fullscreen camera; would cover the viewfinder)
 *   - /admin/*         (admin has its own sidebar)
 *   - /cooking/*       (existing fullscreen render screen)
 *   - /auth, /onboarding  (auth funnels — keep distraction-free)
 *   - /api/*, /_next/* (not rendered through React anyway)
 *
 * Auth-aware nav (Brandon's wife was confused by a morphing nav, so we keep
 * the SAME shell for logged-in and logged-out users — only the link list
 * shifts a little). Pricing only shows when logged out; paid users get their
 * plan in /account.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Sparkles, Camera, Library, CreditCard, Menu, X, User,
  PenLine, Mic,
} from 'lucide-react';
import { useEffect, useState } from 'react';

const HIDDEN_PREFIXES = [
  '/studio', '/admin', '/cooking', '/auth', '/onboarding',
];

type NavItem = { href: string; label: string; Icon: typeof Sparkles };

// Always-on app shortcuts. Visible whether or not the user is signed in —
// signed-out visitors clicking these will hit the auth wall on the page itself,
// which is fine: keeps the nav stable across auth state (the whole point of
// this refactor).
const APP_LINKS: NavItem[] = [
  { href: '/create',   label: 'Create',   Icon: Sparkles },
  { href: '/avatars',  label: 'Avatars',  Icon: User },
  { href: '/studio',   label: 'Studio',   Icon: Camera },
  { href: '/library',  label: 'Library',  Icon: Library },
];

// Lead-gen / free-tool links. Stay visible to logged-in users too so they
// can keep using the tools (e.g. transcribe a video) without the nav morphing.
const TOOL_LINKS: NavItem[] = [
  { href: '/script-generator', label: 'Free script writer', Icon: PenLine },
  { href: '/transcribe',       label: 'Transcribe',         Icon: Mic },
];

// Pricing is added only when logged-out (paid users see plan in /account).
const PRICING_LINK: NavItem = { href: '/pricing', label: 'Pricing', Icon: CreditCard };

function useIsLoggedIn(): boolean | null {
  // null = unknown (during hydration). Mirrors the hook in PublicLayout.tsx —
  // we hit /api/credits (auth-gated) and read r.ok. Cheap and accurate.
  const [v, setV] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    fetch('/api/credits', { credentials: 'include' })
      .then(r => { if (alive) setV(r.ok); })
      .catch(() => { if (alive) setV(false); });
    return () => { alive = false; };
  }, []);
  return v;
}

export default function TopNav() {
  const pathname = usePathname() || '/';
  const [open, setOpen] = useState(false);
  const loggedIn = useIsLoggedIn();

  if (HIDDEN_PREFIXES.some(p => pathname === p || pathname.startsWith(p + '/'))) return null;

  // While auth state is unknown, render the logged-OUT list (which includes
  // Pricing). This avoids a flash of "Pricing" disappearing for paying users
  // — they'll see it briefly then it'll hide once /api/credits resolves.
  const links: NavItem[] = [
    ...APP_LINKS,
    ...TOOL_LINKS,
    ...(loggedIn === true ? [] : [PRICING_LINK]),
  ];

  return (
    <nav className="sticky top-0 backdrop-blur-md bg-zinc-950/80 border-b border-white/5 supports-[backdrop-filter]:bg-zinc-950/70 z-40">
      <div className="max-w-6xl mx-auto px-4 h-12 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 font-semibold text-sm text-white">
          <span className="text-teal-400">⚡</span> FlashFlow
        </Link>

        {/* Desktop links */}
        <div className="hidden sm:flex items-center gap-1">
          {links.map(({ href, label, Icon }) => {
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
          {links.map(({ href, label, Icon }) => {
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
