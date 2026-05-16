// ============================================================
// FlashFlow — Client-side rating helper.
// Drop into: web/lib/ratings.ts
//
// Usage from any React component:
//   import { trackScriptEvent } from '@/lib/ratings';
//   trackScriptEvent(scriptId, 'copied');
//
// Fire-and-forget. Failures are logged, never thrown — we don't want
// rating telemetry to break the creator's workflow.
// ============================================================

export type ScriptEventType =
  | 'viewed'
  | 'copied'
  | 'filmed'
  | 'skipped'
  | 'regenerated'
  | 'thumb_up'
  | 'thumb_down';

const inFlight = new Map<string, number>();
const LOCAL_DEDUP_MS: Record<ScriptEventType, number> = {
  viewed: 30_000,
  copied: 3_000,
  filmed: 30_000,
  skipped: 3_000,
  regenerated: 3_000,
  thumb_up: 1_000,
  thumb_down: 1_000,
};

export async function trackScriptEvent(
  scriptId: string,
  eventType: ScriptEventType,
  metadata?: Record<string, unknown>
): Promise<void> {
  if (!scriptId) return;

  // Client-side dedup (in addition to server-side) — saves a network round trip
  const key = `${scriptId}:${eventType}`;
  const now = Date.now();
  const last = inFlight.get(key) ?? 0;
  if (now - last < (LOCAL_DEDUP_MS[eventType] ?? 1000)) return;
  inFlight.set(key, now);

  try {
    await fetch(`/api/scripts/${encodeURIComponent(scriptId)}/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_type: eventType, metadata: metadata ?? {} }),
      // Use keepalive so events still fire on page-unload navigations
      keepalive: true,
    });
  } catch (err) {
    // Never throw — rating is best-effort
    if (typeof console !== 'undefined') {
      console.warn('[trackScriptEvent] failed', { scriptId, eventType, err });
    }
  }
}

// Convenience: track 'viewed' for every script currently in the picker
// once it's been visible for >=1s (filter out flash-renders during regen).
export function trackScriptsViewedAfterDwell(scriptIds: string[], dwellMs = 1000) {
  if (typeof window === 'undefined') return () => {};
  const timer = setTimeout(() => {
    scriptIds.forEach((id) => trackScriptEvent(id, 'viewed'));
  }, dwellMs);
  return () => clearTimeout(timer);
}
