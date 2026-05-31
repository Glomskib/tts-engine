'use client';

/**
 * /onboarding — Standalone creator profile onboarding page.
 *
 * Lives outside the admin layout so there's no nav chrome during the flow.
 * Redirect rules:
 *   - Not authenticated     → /login
 *   - Already completed     → /admin/dashboard
 *   - Needs onboarding      → render wizard inline
 */

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useCreatorProfile } from '@/hooks/useCreatorProfile';
import { CreatorProfileWizard } from '@/components/onboarding/CreatorProfileWizard';
import { events } from '@/lib/tracking';

export default function OnboardingPage() {
  const router = useRouter();
  const { loading: authLoading, authenticated } = useAuth();
  const { loading: profileLoading, needsOnboarding, save, complete } = useCreatorProfile();
  const firedStart = useRef(false);

  useEffect(() => {
    if (authLoading || profileLoading) return;
    if (!authenticated) {
      router.replace('/login');
      return;
    }
    if (!needsOnboarding) {
      router.replace('/create');
      return;
    }
    // Fire the funnel events exactly once per page mount.
    if (!firedStart.current) {
      firedStart.current = true;
      events.signupCompleted({ source: 'onboarding_landing' });
      events.onboardingStarted();
    }
  }, [authLoading, profileLoading, authenticated, needsOnboarding, router]);

  // Show nothing while we're figuring out where to send the user
  if (authLoading || profileLoading || !authenticated) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-zinc-950 text-zinc-400">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-zinc-600 border-t-zinc-300 rounded-full animate-spin" />
          Loading...
        </div>
      </div>
    );
  }

  if (!needsOnboarding) return null;

  async function handleComplete(fields?: Parameters<typeof complete>[0]) {
    await complete(fields);
    events.onboardingCompleted();
    router.replace('/create');
  }

  return (
    <div className="min-h-screen bg-zinc-950">
      <CreatorProfileWizard onSave={save} onComplete={handleComplete} />
    </div>
  );
}
