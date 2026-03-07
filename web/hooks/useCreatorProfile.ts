'use client';

import { useState, useEffect, useCallback } from 'react';
import type { CreatorProfile } from '@/lib/creator-profile/schema';
import { computeCreatorStage, type CreatorStageResult } from '@/lib/creator-profile/stage';

interface UseCreatorProfileResult {
  profile: CreatorProfile | null;
  stage: CreatorStageResult;
  loading: boolean;
  needsOnboarding: boolean;
  save: (fields: Partial<CreatorProfile>) => Promise<void>;
  complete: (fields?: Partial<CreatorProfile>) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useCreatorProfile(): UseCreatorProfileResult {
  const [profile, setProfile] = useState<CreatorProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/user/creator-profile');
      if (res.ok) {
        const json = await res.json();
        setProfile(json.data ?? null);
      }
    } catch {
      // ignore — profile stays null, wizard shows
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const save = useCallback(async (fields: Partial<CreatorProfile>) => {
    const res = await fetch('/api/user/creator-profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    });
    if (res.ok) {
      const json = await res.json();
      setProfile(json.data ?? null);
    }
  }, []);

  const complete = useCallback(async (fields?: Partial<CreatorProfile>) => {
    const res = await fetch('/api/user/creator-profile/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields ?? {}),
    });
    if (res.ok) {
      const json = await res.json();
      setProfile(json.data ?? null);
    }
  }, []);

  const needsOnboarding = !loading && (profile === null || !profile.completed_onboarding_at);
  const stage = computeCreatorStage(profile);

  return { profile, stage, loading, needsOnboarding, save, complete, refresh };
}
