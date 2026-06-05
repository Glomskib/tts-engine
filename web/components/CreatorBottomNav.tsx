'use client';

/**
 * CreatorBottomNav — bottom tab bar for consumer-facing creator pages.
 *
 * Distinct from the existing /admin MobileBottomNav (which is complex —
 * customizable middle slots, drawer trigger, notification badges). This is
 * the simple 5-tab dock for the actual creator surfaces: Home, Create,
 * Studio, Clips, Account.
 *
 * 2026-05-31: top-nav-on-mobile is desktop-brain. Real creators thumb their
 * phones; bottom tab bar matches the iOS/Android pattern they already know.
 * The desktop TopNav stays intact above; this only appears < sm breakpoint.
 *
 * Suppressed on marketing/auth routes so those surfaces stay clean.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Sparkles, Home, Film, User, Camera } from 'lucide-react';

const TABS = [
  { href: '/home',    label: 'Home',    Icon: Home },
  { href: '/create',  label: 'Create',  Icon: Sparkles },
  { href: '/studio',  label: 'Studio',  Icon: Camera },
  { href: '/clips',   label: 'Clips',   Icon: Film },
  { href: '/account', label: 'Account', Icon: User },
] as const;

// Routes where we suppress the dock entirely so marketing / auth / admin
// don't get the creator shell.
//
// 2026-06-05: added public marketing/free-tool pages — bottom dock on
// /script-generator etc. ate vertical space + cluttered the page on
// mobile when the user is logged-out trying out the free tool.
const HIDE_PREFIXES = [
  '/admin', '/mission-control',
  '/transcribe', '/youtube-transcribe', '/transcribe-anything',
  '/script-generator', '/free-scripts', '/blog',
  '/pricing', '/about', '/privacy', '/terms', '/refund',
  '/lp', '/tools', '/trend-radar', '/remix', '/roadmap',
];
const HIDE_EXACT = new Set<string>(['/', '/login', '/signup', '/onboarding']);

export default function CreatorBottomNav() {
  const pathname = usePathname() || '/';
  if (HIDE_EXACT.has(pathname)) return null;
  if (HIDE_PREFIXES.some(p => pathname === p || pathname.startsWith(p + '/'))) return null;

  return (
    <nav
      role="navigation"
      aria-label="Creator primary nav"
      className="sm:hidden fixed inset-x-0 bottom-0 z-40 border-t border-zinc-800 bg-zinc-950/95 backdrop-blur supports-[backdrop-filter]:bg-zinc-950/85"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0)' }}
    >
      <ul className="flex items-stretch justify-around max-w-md mx-auto">
        {TABS.map(({ href, label, Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/');
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                className={`flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium transition-colors ${
                  active ? 'text-teal-300' : 'text-zinc-500 hover:text-zinc-200'
                }`}
                aria-current={active ? 'page' : undefined}
              >
                <Icon className={`w-5 h-5 ${active ? 'stroke-[2.2]' : 'stroke-[1.8]'}`} />
                <span>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
