'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import type { GuidedModeState, GuidedStep } from '@/lib/guided-mode/types';

const STORAGE_KEY = 'ff-guided-mode';

const DEFAULT_STATE: GuidedModeState = {
  active: false,
  step: 1,
  contentItemId: null,
  startedAt: '',
};

interface GuidedModeContextValue {
  state: GuidedModeState;
  recordingAcknowledged: boolean;
  start: () => void;
  exit: () => void;
  setContentItemId: (id: string) => void;
  advance: () => void;
  acknowledgeRecording: () => void;
}

const GuidedModeContext = createContext<GuidedModeContextValue | null>(null);

function persist(next: GuidedModeState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch { /* ignore */ }
}

export function GuidedModeProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GuidedModeState>(DEFAULT_STATE);
  const [recordingAcknowledged, setRecordingAcknowledged] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setState(JSON.parse(saved) as GuidedModeState);
    } catch { /* ignore */ }
    setHydrated(true);
  }, []);

  const start = useCallback(() => {
    const next: GuidedModeState = {
      active: true,
      step: 1,
      contentItemId: null,
      startedAt: new Date().toISOString(),
    };
    setState(next);
    persist(next);
    setRecordingAcknowledged(false);
  }, []);

  const exit = useCallback(() => {
    setState(DEFAULT_STATE);
    persist(DEFAULT_STATE);
    setRecordingAcknowledged(false);
  }, []);

  const setContentItemId = useCallback((id: string) => {
    setState(prev => {
      const next: GuidedModeState = {
        ...prev,
        contentItemId: id,
        // advance past step 1 automatically when item is created
        step: prev.step === 1 ? 2 : prev.step,
      };
      persist(next);
      return next;
    });
  }, []);

  const advance = useCallback(() => {
    setState(prev => {
      if (!prev.active || prev.step >= 7) return prev;
      const next: GuidedModeState = { ...prev, step: (prev.step + 1) as GuidedStep };
      persist(next);
      return next;
    });
  }, []);

  const acknowledgeRecording = useCallback(() => {
    setRecordingAcknowledged(true);
  }, []);

  // Don't render children until hydrated to avoid flicker
  if (!hydrated) return <>{children}</>;

  return (
    <GuidedModeContext.Provider
      value={{ state, recordingAcknowledged, start, exit, setContentItemId, advance, acknowledgeRecording }}
    >
      {children}
    </GuidedModeContext.Provider>
  );
}

export function useGuidedMode(): GuidedModeContextValue {
  const ctx = useContext(GuidedModeContext);
  if (!ctx) throw new Error('useGuidedMode must be used within GuidedModeProvider');
  return ctx;
}
