'use client';

import { useState, ReactNode } from 'react';
import Link from 'next/link';

const NAV_LINKS = [
  { name: 'Creators', href: '/creators' },
  { name: 'Agencies', href: '/agencies' },
  { name: 'Brands', href: '/brands' },
  { name: 'Examples', href: '/examples' },
  { name: 'Blog', href: '/blog' },
];

const FOOTER_COLUMNS = [
  {
    title: 'Product',
    links: [
      { name: 'Pricing', href: '/pricing' },
      { name: 'Examples', href: '/examples' },
      { name: 'Blog', href: '/blog' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { name: 'Script Vault', href: '/free-scripts' },
    ],
  },
  {
    title: 'Company',
    links: [
      { name: 'Privacy', href: '/privacy' },
      { name: 'Terms', href: '/terms' },
    ],
  },
];

export function PublicHeader() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="relative z-20 border-b border-white/5">
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
        <Link href="/" className="text-xl font-bold text-teal-400">
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

        {/* Desktop CTA */}
        <div className="hidden md:flex items-center gap-3">
          <Link href="/login" className="text-sm text-zinc-400 hover:text-white transition-colors">
            Login
          </Link>
          <Link
            href="/login?mode=signup"
            className="text-sm px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-lg transition-colors font-medium"
          >
            Try Free
          </Link>
        </div>

        {/* Mobile Menu Button */}
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

      {/* Mobile Menu */}
      {menuOpen && (
        <div className="md:hidden border-t border-white/5 bg-zinc-950/95 backdrop-blur">
          <nav className="max-w-6xl mx-auto px-6 py-4 space-y-3">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className="block text-sm text-zinc-300 hover:text-white py-2"
              >
                {link.name}
              </Link>
            ))}
            <div className="pt-3 border-t border-white/5 space-y-2">
              <Link
                href="/login"
                onClick={() => setMenuOpen(false)}
                className="block text-sm text-zinc-400 py-2"
              >
                Login
              </Link>
              <Link
                href="/login?mode=signup"
                onClick={() => setMenuOpen(false)}
                className="block text-sm px-4 py-2.5 bg-teal-600 text-white rounded-lg font-medium text-center"
              >
                Try Free
              </Link>
            </div>
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
              <ul className="space-y-2">
                {col.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
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
  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 flex flex-col">
      <div className="fixed inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px] pointer-events-none" />
      <PublicHeader />
      <main className="relative z-10 flex-1">
        {children}
      </main>
      <PublicFooter />
    </div>
  );
}
