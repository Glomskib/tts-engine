'use client';

/**
 * PostHogProvider
 *
 * Client-side PostHog wiring. Initializes the SDK once on mount, identifies
 * the auth user when AuthContext finishes loading, calls into lib/tracking
 * so existing `events.*` call sites become real captures, and tracks page
 * views on every Next.js route change.
 *
 * Env:
 *   NEXT_PUBLIC_POSTHOG_KEY  — phc_xxx project key (required to enable)
 *   NEXT_PUBLIC_POSTHOG_HOST — defaults to https://us.i.posthog.com
 *
 * If the key is unset (e.g. local dev without analytics), this is a no-op
 * and the existing dev-mode console.log fallback in lib/tracking remains.
 */

import { ReactNode, useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import posthog from 'posthog-js';
import { useAuth } from '@/contexts/AuthContext';
import { initTracking, identifyUser, resetTracking, _setPosthog } from '@/lib/tracking';

let initialized = false;

function ensureInitialized() {
  if (initialized) return;
  if (typeof window === 'undefined') return;
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return; // graceful no-op when unset

  posthog.init(key, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
    // We track page views ourselves so the App Router transition fires events.
    capture_pageview: false,
    capture_pageleave: true,
    persistence: 'localStorage+cookie',
    // Don't disable in dev — Brandon wants to see events flowing while ad spend
    // ramps up; the project key is dev/prod-split via Vercel env scoping.
    loaded: () => {
      _setPosthog(posthog);
      initTracking();
    },
  });
  initialized = true;
}

export function PostHogProvider({ children }: { children: ReactNode }) {
  const { user, authenticated } = useAuth();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // SDK init (run once, client-side).
  useEffect(() => {
    ensureInitialized();
  }, []);

  // Identify / reset on auth changes.
  useEffect(() => {
    if (!initialized) return;
    if (authenticated && user?.id) {
      // Identify in PostHog directly + mirror into our tracking shim so any
      // call site that reads userProperties keeps working.
      posthog.identify(user.id, { email: user.email ?? undefined });
      identifyUser({ userId: user.id, email: user.email ?? undefined });
    } else if (!authenticated) {
      posthog.reset();
      resetTracking();
    }
  }, [authenticated, user?.id, user?.email]);

  // Page-view tracking — fire on every App Router transition.
  useEffect(() => {
    if (!initialized) return;
    if (!pathname) return;
    const qs = searchParams?.toString();
    const url = qs ? `${pathname}?${qs}` : pathname;
    posthog.capture('$pageview', { $current_url: window.location.origin + url });
  }, [pathname, searchParams]);

  return <>{children}</>;
}
