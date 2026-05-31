'use client';

// ============================================================
// AuthNav — right-side nav buttons that depend on auth state.
// Lives inside the SSR'd header so the rest of the bar renders
// server-side; only this button group hydrates.
// ============================================================

import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';

export default function AuthNav() {
  const { authenticated, loading: authLoading } = useAuth();

  if (!authLoading && authenticated) {
    // Logged-in users land on the creator dashboard, NOT /create. The /create
    // page is the kitchen-sink clip tool; the dashboard is the actual home
    // surface (incident 2026-05-27 — Brandon's "Home = Create" complaint).
    return (
      <Link
        href="/home"
        className="text-sm px-4 py-2 rounded-lg bg-white text-zinc-900 font-medium hover:bg-zinc-200 transition-colors whitespace-nowrap"
      >
        <span className="sm:hidden">Open</span>
        <span className="hidden sm:inline">Open FlashFlow</span>
      </Link>
    );
  }

  return (
    <>
      <Link
        href="/login"
        className="text-sm px-3 sm:px-4 py-2 rounded-lg border border-white/15 text-zinc-200 hover:text-white hover:bg-white/5 hover:border-white/30 transition-colors whitespace-nowrap font-medium"
      >
        Log in
      </Link>
      <Link
        href="/signup"
        className="text-sm px-3 sm:px-4 py-2 rounded-lg bg-gradient-to-r from-teal-500 to-emerald-500 text-white font-semibold hover:from-teal-400 hover:to-emerald-400 transition-all whitespace-nowrap shadow-lg shadow-teal-500/20"
      >
        <span className="sm:hidden">Sign up</span>
        <span className="hidden sm:inline">Sign up free</span>
      </Link>
    </>
  );
}
