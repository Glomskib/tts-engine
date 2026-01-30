'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Redirect /pricing to landing page pricing section
export default function PricingPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/#pricing');
  }, [router]);

  return (
    <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
      <div className="text-zinc-500">Redirecting to pricing...</div>
    </div>
  );
}
