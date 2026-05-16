'use client';
import { useEffect } from 'react';

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
