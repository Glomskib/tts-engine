'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Redirects to the comprehensive system status page.
 * The /admin/settings/system-status page has full workflow health,
 * cron freshness, env boot status, and all service checks.
 */
export default function SystemHealthRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/admin/settings/system-status');
  }, [router]);
  return (
    <div className="p-6 text-zinc-400">
      Redirecting to System Status...
    </div>
  );
}
