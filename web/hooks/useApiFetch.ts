'use client';

import { useMemo } from 'react';
import { useUpgradeModal } from '@/contexts/UpgradeModalContext';
import { makeFetchWithUpgrade } from '@/lib/http/fetchWithUpgrade';

/**
 * useApiFetch — returns a fetch function pre-wired to the upgrade modal.
 *
 * Drop-in replacement for `fetch()` in any component.
 * Automatically triggers the upgrade modal when any response has { upgrade: true }.
 *
 * Usage:
 *   const apiFetch = useApiFetch();
 *   const res = await apiFetch('/api/scripts/generate', { method: 'POST', body: JSON.stringify(data) });
 *   const json = await res.json();
 *   if (!json.ok) { ... handle error ... }
 *   // If the API returned upgrade: true, modal already fired automatically
 */
export function useApiFetch() {
  const { showUpgrade } = useUpgradeModal();
  return useMemo(() => makeFetchWithUpgrade(showUpgrade), [showUpgrade]);
}
