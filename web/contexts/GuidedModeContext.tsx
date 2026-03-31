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
  } catch { /* ignore — private browsing, quota exceeded, etc. */ }
}

/** Validate and sanitize loaded state. Returns null if state is unusable. */
function parsePersistedState(raw: string): GuidedModeState | null {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const { active, step, contentItemId, startedAt } = parsed as Record<string, unknown>;
    if (typeof active !== 'boolean') return null;
    const stepNum = Number(step);
    if (!Number.isInteger(stepNum) || stepNum < 1 || stepNum > 7) return null;
    return {
      active,
      step: stepNum as GuidedStep,
      contentItemId: typeof contentItemId === 'string' ? contentItemId : null,
      startedAt: typeof startedAt === 'string' ? startedAt : '',
    };
  } catch {
    return null;
  }
}

export function GuidedModeProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GuidedModeState>(DEFAULT_STATE);
  const [recordingAcknowledged, setRecordingAcknowledged] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const valid = parsePersistedState(saved);
        if (valid) {
          setState(valid);
        } else {
          // Corrupt or incompatible persisted state — clear it
          localStorage.removeItem(STORAGE_KEY);
        }
      }
    } catch { /* ignore */ }
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

  return (
    <GuidedModeContext.Provider
      value={{ state, recordingAcknowledged, start, exit, setContentItemId, advance, acknowledgeRecording }}
    >
      {children}
    </GuidedModeContext.Provider>
  );
}

const NOOP = () => {};
const FALLBACK: GuidedModeContextValue = {
  state: DEFAULT_STATE,
  recordingAcknowledged: false,
  start: NOOP,
  exit: NOOP,
  setContentItemId: NOOP,
  advance: NOOP,
  acknowledgeRecording: NOOP,
};

export function useGuidedMode(): GuidedModeContextValue {
  const ctx = useContext(GuidedModeContext);
  if (!ctx) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[useGuidedMode] used outside GuidedModeProvider — returning inactive fallback');
    }
    return FALLBACK;
  }
  return ctx;
}
