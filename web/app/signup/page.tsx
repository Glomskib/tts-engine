'use client';

import { useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function SignupRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const plan = searchParams.get('plan');

  useEffect(() => {
    const redirectUrl = plan
      ? `/login?mode=signup&plan=${plan}`
      : '/login?mode=signup';
    router.replace(redirectUrl);
  }, [router, plan]);

  return (
    <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
      <div className="flex items-center gap-3 text-zinc-500">
        <div className="w-5 h-5 border-2 border-zinc-600 border-t-zinc-300 rounded-full animate-spin" />
        Redirecting...
      </div>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
        <div className="flex items-center gap-3 text-zinc-500">
          <div className="w-5 h-5 border-2 border-zinc-600 border-t-zinc-300 rounded-full animate-spin" />
          Loading...
        </div>
      </div>
    }>
      <SignupRedirect />
    </Suspense>
  );
}
