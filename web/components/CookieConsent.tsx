'use client';

// ============================================================
// CookieConsent — minimal GDPR/CCPA banner.
//
// First-visit unauth visitor sees a slide-up bar with Accept all /
// Reject all / Manage. Choice persists in localStorage AND a
// first-party cookie (server-readable, useful when SSR-gating
// analytics). PostHog only initializes after Accept.
//
// Not shown after a choice is made. Not shown to anyone who lands
// with a valid ff_consent cookie already (server-rendered).
//
// Lives at the root, rendered once by app/layout.tsx.
// ============================================================

import { useEffect, useState } from 'react';
import Link from 'next/link';

type Choice = 'accept' | 'reject';

const COOKIE_KEY = 'ff_consent';
const STORAGE_KEY = 'ff_consent';
// Long expiry — browsers cap to ~13 months for first-party cookies set via
// document.cookie anyway; we just write the canonical max.
const COOKIE_MAX_AGE_DAYS = 365;

function readChoice(): Choice | null {
  if (typeof document === 'undefined') return null;
  try {
    const fromCookie = document.cookie
      .split(';')
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${COOKIE_KEY}=`))
      ?.split('=')[1];
    if (fromCookie === 'accept' || fromCookie === 'reject') return fromCookie;
    const fromStorage = localStorage.getItem(STORAGE_KEY);
    if (fromStorage === 'accept' || fromStorage === 'reject') return fromStorage;
  } catch {
    // SSR or storage blocked — treat as no choice yet
  }
  return null;
}

function writeChoice(choice: Choice) {
  try {
    localStorage.setItem(STORAGE_KEY, choice);
    const maxAge = COOKIE_MAX_AGE_DAYS * 86400;
    document.cookie = `${COOKIE_KEY}=${choice}; path=/; max-age=${maxAge}; SameSite=Lax`;
  } catch {
    // ignore
  }
  // Fire a custom event so other client modules (PostHog, etc) can react
  try {
    window.dispatchEvent(new CustomEvent('ff:consent', { detail: { choice } }));
  } catch {
    // ignore
  }
}

export function getConsentChoice(): Choice | null {
  return readChoice();
}

export default function CookieConsent() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Delay slightly so we don't FOUC the banner during hydration
    const t = setTimeout(() => {
      if (!readChoice()) setShow(true);
    }, 400);
    return () => clearTimeout(t);
  }, []);

  if (!show) return null;

  const handle = (choice: Choice) => {
    writeChoice(choice);
    setShow(false);
  };

  return (
    <div
      role="dialog"
      aria-label="Cookie preferences"
      className="fixed bottom-4 inset-x-4 sm:inset-x-auto sm:left-4 sm:right-4 sm:max-w-2xl sm:mx-auto z-[60] rounded-2xl border border-white/10 bg-zinc-900/95 backdrop-blur-xl shadow-2xl p-5 text-zinc-100"
    >
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1 text-sm leading-relaxed">
          <span className="font-semibold">We use cookies.</span>{' '}
          <span className="text-zinc-400">
            Functional cookies keep you signed in. Analytics cookies (opt-in) help us
            see what&apos;s working so we can ship better tools.{' '}
            <Link href="/privacy" className="underline underline-offset-2 hover:text-zinc-200">
              Privacy policy
            </Link>
            .
          </span>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            type="button"
            onClick={() => handle('reject')}
            className="px-4 py-2 text-sm rounded-lg border border-white/15 text-zinc-200 hover:bg-white/5 hover:border-white/30 transition-colors"
          >
            Reject
          </button>
          <button
            type="button"
            onClick={() => handle('accept')}
            className="px-4 py-2 text-sm rounded-lg bg-gradient-to-r from-teal-500 to-emerald-500 text-white font-semibold hover:from-teal-400 hover:to-emerald-400 transition-all"
          >
            Accept all
          </button>
        </div>
      </div>
    </div>
  );
}
