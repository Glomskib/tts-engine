'use client';

/**
 * /upgrade-pro — was a tax-related landing left over from a different
 * project. Brandon flagged 2026-05-08: "This is a different project I think."
 *
 * Until a real Pro-tier landing exists, redirect to /upgrade so users hit
 * the canonical pricing page instead of seeing off-brand tax copy.
 *
 * If we ever want a true Pro-tier landing, build it here. Until then,
 * this is a soft 301 to /upgrade.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function UpgradeProRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/upgrade');
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-zinc-300">
      <div className="text-center">
        <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-teal-400" />
        <p className="text-sm">Redirecting to pricing…</p>
      </div>
    </div>
  );
}
