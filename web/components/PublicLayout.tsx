'use client';

import { useState, useEffect, ReactNode } from 'react';
import Link from 'next/link';

// Pricing only shown when logged out — logged-in users see plan in /account.
// Items kept consistent with TopNav so the nav doesn't morph when you sign in.
const NAV_LINKS_PUBLIC = [
  { name: 'Free script writer', href: '/script-generator' },
  { name: 'TikTok transcriber', href: '/transcribe' },
  { name: 'YouTube transcriber', href: '/youtube-transcribe' },
  { name: 'Pricing', href: '/pricing' },
  { name: 'Blog', href: '/blog' },
];

const NAV_LINKS_LOGGED_IN = [
  { name: 'Free script writer', href: '/script-generator' },
  { name: 'TikTok transcriber', href: '/transcribe' },
  { name: 'YouTube transcriber', href: '/youtube-transcribe' },
  { name: 'Blog', href: '/blog' },
];

function useIsLoggedIn(): boolean | null {
  // null = unknown (during hydration), false/true once resolved.
  // We hit /api/credits which is auth-gated; 401 → logged out, 200 → logged in.
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

const FOOTER_COLUMNS = [
  {
    title: 'Free Tools',
    links: [
      { name: 'Script Generator', href: '/script-generator' },
      { name: 'TikTok Transcriber', href: '/transcribe' },
      { name: 'YouTube Transcriber', href: '/youtube-transcribe' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { name: 'Pricing', href: '/pricing' },
      { name: 'Blog', href: '/blog' },
      { name: 'Script Vault', href: '/free-scripts' },
    ],
  },
  {
    title: 'Company',
    links: [
      { name: 'About', href: '/about' },
      { name: 'Privacy', href: '/privacy' },
      { name: 'Terms', href: '/terms' },
    ],
  },
];

export function PublicHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const loggedIn = useIsLoggedIn();
  // While loading auth state, use the public list (avoids flashing "Pricing"
  // away from logged-in users — public list shows it, logged-in hides it).
  const NAV_LINKS = loggedIn === true ? NAV_LINKS_LOGGED_IN : NAV_LINKS_PUBLIC;

  return (
    <header className="relative z-20 border-b border-white/5">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-2 sm:gap-3">
        <Link href="/" className="text-lg sm:text-xl font-bold text-teal-400 flex-shrink-0">
          FlashFlow AI
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-6">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm text-zinc-400 hover:text-white transition-colors"
            >
              {link.name}
            </Link>
          ))}
        </nav>

        {/* CTA cluster — Log in + Sign up always visible (mobile + desktop).
            Mobile gets compact labels; full link list goes in hamburger. */}
        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          <Link
            href="/login"
            className="text-sm px-3 sm:px-4 py-2 rounded-lg border border-white/15 text-zinc-200 hover:text-white hover:bg-white/5 hover:border-white/30 transition-colors whitespace-nowrap font-medium"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="text-sm px-3 sm:px-4 py-2 bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-white rounded-lg transition-all font-semibold whitespace-nowrap shadow-lg shadow-teal-500/20"
          >
            <span className="sm:hidden">Sign up</span>
            <span className="hidden sm:inline">Sign up free</span>
          </Link>

          {/* Mobile Menu Button — sits to the right of the auth buttons so the
              primary actions stay reachable without opening the sheet. */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="md:hidden p-2 text-zinc-400 hover:text-white"
            aria-label="Toggle menu"
          >
            {menuOpen ? (
              <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile Menu — secondary nav links only. Log in + Sign up live in the
          header bar above so users never have to open this sheet to auth. */}
      {menuOpen && (
        <div className="md:hidden border-t border-white/5 bg-zinc-950/95 backdrop-blur">
          <nav className="max-w-6xl mx-auto px-6 py-4 space-y-1">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className="block text-sm text-zinc-300 hover:text-white py-3"
              >
                {link.name}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="relative z-10 border-t border-white/5 bg-zinc-950">
      <div className="max-w-6xl mx-auto px-6 py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-8">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="text-lg font-bold text-teal-400">
              FlashFlow AI
            </Link>
            <p className="text-xs text-zinc-500 mt-2 max-w-[200px]">
              AI-powered scripts for TikTok Shop creators
            </p>
          </div>

          {/* Link Columns */}
          {FOOTER_COLUMNS.map((col) => (
            <div key={col.title}>
              <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
                {col.title}
              </h4>
              <ul className="space-y-1">
                {col.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors inline-flex items-center min-h-[44px]"
                    >
                      {link.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="border-t border-white/5 pt-6 text-center">
          <p className="text-xs text-zinc-600">
            &copy; 2026 FlashFlow AI by Making Miles Matter INC
          </p>
        </div>
      </div>
    </footer>
  );
}

export function PublicLayout({ children }: { children: ReactNode }) {
  // NOTE: TopNav is also rendered globally by web/app/layout.tsx, so by the
  // time PublicLayout mounts there's already a top bar. We intentionally do
  // NOT render <TopNav /> here again — that would double-stack. We keep
  // PublicLayout for the marketing background grid + footer. The legacy
  // <PublicHeader /> was replaced by the global TopNav so the nav no longer
  // morphs between marketing and app routes.
  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 flex flex-col">
      <div className="fixed inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px] pointer-events-none" />
      <main className="relative z-10 flex-1">
        {children}
      </main>
      <PublicFooter />
    </div>
  );
}
