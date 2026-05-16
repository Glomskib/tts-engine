'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { BRAND } from '@/lib/brand';
import { useAuth } from '@/contexts/AuthContext';

export default function PublicLayout({ children }: { children: ReactNode }) {
  const { loading, authenticated, isAdmin } = useAuth();

  const dashboardHref = '/create';

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 flex flex-col">
      {/* Header */}
      <header className="border-b border-white/10 bg-[#09090b]/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Image
              src={BRAND.logo}
              alt={BRAND.name}
              width={28}
              height={28}
              className="rounded-lg"
            />
            <span className="font-semibold text-zinc-100">{BRAND.name}</span>
          </Link>
          <nav className="flex items-center gap-6">
            <Link
              href="/script-generator"
              className="text-sm text-zinc-400 hover:text-white transition-colors"
            >
              Script Generator
            </Link>
            <Link
              href="/transcribe"
              className="text-sm text-zinc-400 hover:text-white transition-colors"
            >
              TikTok Transcriber
            </Link>
            <Link
              href="/youtube-transcribe"
              className="text-sm text-zinc-400 hover:text-white transition-colors"
            >
              YouTube Transcriber
            </Link>
            <Link
              href="/pricing"
              className="text-sm text-zinc-400 hover:text-white transition-colors"
            >
              Pricing
            </Link>
            {!loading && authenticated ? (
              <Link
                href={dashboardHref}
                className="text-sm px-4 py-2 bg-white text-zinc-900 rounded-lg font-medium hover:bg-zinc-100 transition-colors whitespace-nowrap"
              >
                Dashboard
              </Link>
            ) : (
              // Unauthed visitors see BOTH log-in and sign-up — matches the
              // homepage AuthNav pattern. Customers expect a "normal site"
              // top-right with two distinct buttons.
              <>
                <Link
                  href="/login"
                  className="text-sm px-3 sm:px-4 py-2 rounded-lg border border-white/15 text-zinc-200 hover:text-white hover:bg-white/5 hover:border-white/30 transition-colors font-medium whitespace-nowrap"
                >
                  Log in
                </Link>
                <Link
                  href="/signup"
                  className="text-sm px-3 sm:px-4 py-2 rounded-lg bg-gradient-to-r from-teal-500 to-emerald-500 text-white font-semibold hover:from-teal-400 hover:to-emerald-400 transition-all shadow-lg shadow-teal-500/20 whitespace-nowrap"
                >
                  Sign up free
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

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
