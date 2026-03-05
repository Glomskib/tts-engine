'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function HooksRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/admin/script-library?tab=hooks');
  }, [router]);

  return (
    <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
      <p className="text-zinc-500">Redirecting to Script Library...</p>
    </div>
  );
}
