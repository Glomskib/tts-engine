'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { BRAND } from '@/lib/brand';

/**
 * (public) route-group layout — marketing / legal / free-tool pages.
 *
 * Header was removed (2026-06-01): the canonical <TopNav /> is rendered
 * globally by app/layout.tsx, so adding another header here was creating
 * the "morphing nav" Brandon's wife complained about. We keep only the
 * footer + page wrapper. If you need page-specific chrome, add it inside
 * the page itself.
 */
export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 flex flex-col">
      {/* Content */}
      <main className="flex-1">{children}</main>

      {/* Footer */}
      <footer className="border-t border-white/10 py-8 px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-zinc-500">
          <span>&copy; {new Date().getFullYear()} {BRAND.name}. All rights reserved.</span>
          <div className="flex gap-6">
            <Link href="/roadmap" className="hover:text-zinc-300 transition-colors">Roadmap</Link>
            <Link href="/privacy" className="hover:text-zinc-300 transition-colors">Privacy</Link>
            <Link href="/terms" className="hover:text-zinc-300 transition-colors">Terms</Link>
            <Link href="/" className="hover:text-zinc-300 transition-colors">Home</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
