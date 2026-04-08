'use client';

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';

export interface UpgradeModalState {
  open: boolean;
  headline: string;
  subtext: string;
  feature?: string;
}

interface UpgradeModalContextValue {
  state: UpgradeModalState;
  showUpgrade: (opts?: { headline?: string; subtext?: string; feature?: string }) => void;
  hideUpgrade: () => void;
}

const DEFAULT_STATE: UpgradeModalState = {
  open: false,
  headline: "You're getting traction",
  subtext: 'Upgrade to unlock unlimited scripts, Winners Bank, and full production tools.',
};

const UpgradeModalContext = createContext<UpgradeModalContextValue>({
  state: DEFAULT_STATE,
  showUpgrade: () => {},
  hideUpgrade: () => {},
});

export function UpgradeModalProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<UpgradeModalState>(DEFAULT_STATE);

  const showUpgrade = useCallback((opts?: { headline?: string; subtext?: string; feature?: string }) => {
    setState({
      open: true,
      headline: opts?.headline ?? "You're getting traction",
      subtext: opts?.subtext ?? 'Unlock unlimited scripts, campaigns, and scaling tools.',
      feature: opts?.feature,
    });
  }, []);

  const hideUpgrade = useCallback(() => {
    setState(s => ({ ...s, open: false }));
  }, []);

  // Listen for upgrade events dispatched by fetchJson
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as Record<string, unknown>;
      showUpgrade(upgradePayloadToOpts(detail));
    };
    window.addEventListener('flashflow:upgrade', handler);
    return () => window.removeEventListener('flashflow:upgrade', handler);
  }, [showUpgrade]);

  return (
    <UpgradeModalContext.Provider value={{ state, showUpgrade, hideUpgrade }}>
      {children}
    </UpgradeModalContext.Provider>
  );
}

export function useUpgradeModal() {
  return useContext(UpgradeModalContext);
}

/**
 * Call this anywhere after a fetch returns { upgrade: true }.
 * Reads the response body and triggers the appropriate modal copy.
 */
export function upgradePayloadToOpts(json: Record<string, unknown>) {
  const feature = typeof json.feature === 'string' ? json.feature : undefined;
  // Prefer explicit headline/subtext from the API payload so each
  // trigger can ship its own conversion-tuned copy.
  const headline =
    typeof json.headline === 'string' && json.headline.length > 0
      ? json.headline
      : "You're getting traction";
  const subtext =
    typeof json.subtext === 'string' && json.subtext.length > 0
      ? json.subtext
      : `Your free tier is full. Upgrade to unlock${feature ? ` more ${feature}` : ' unlimited access'} and keep the momentum going.`;
  return { headline, subtext, feature };
}
