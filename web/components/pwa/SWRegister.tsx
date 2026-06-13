'use client';
import { useEffect } from 'react';

/**
 * Registers /sw.js (mounted once in the root layout). Production-only so dev
 * hot-reload never fights a service worker. The 2.5s delay keeps SW setup off
 * the critical first-paint path. The SW itself is deliberately minimal —
 * network-first navigations + an offline fallback page, zero app caching —
 * see public/sw.js for the history of why we never cache app content.
 */
export default function SWRegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production') return;
    const t = setTimeout(() => {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }, 2500);
    return () => clearTimeout(t);
  }, []);
  return null;
}
