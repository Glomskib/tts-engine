/**
 * QueueTicker — client-side poller that drives the worker queue.
 *
 * Why: Vercel cron is broken (CRON_SECRET binding 401s every minute). Until
 * that's fixed, we drive the queue from logged-in user sessions. Each user's
 * open tab pings /api/worker/tick on a slow interval; the server advances the
 * ve_runs queue, HeyGen/Runway polling, and email notifies one step at a time.
 *
 * Idempotent: tickActiveRuns has a built-in claim window — concurrent pollers
 * don't double-process the same run. Server-side per-user rate limit caps
 * actual work to one tick every 3 seconds per user.
 *
 * Mount this once in the root layout (under (app)) — it's invisible.
 */
"use client";
import { useEffect, useRef } from "react";

const POLL_INTERVAL_MS = 3000;   // every 6s when tab is visible
const IDLE_INTERVAL_MS = 30000;  // every 60s when tab is hidden

export default function QueueTicker() {
  const lastTick = useRef(0);
  const stopped = useRef(false);

  useEffect(() => {
    stopped.current = false;

    async function tick() {
      if (stopped.current) return;
      try {
        const r = await fetch("/api/worker/tick", {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: "{}",
          cache: "no-store",
        });
        // 401 → not logged in, stop polling
        if (r.status === 401) {
          stopped.current = true;
          return;
        }
        // Log non-2xx but don't stop
        if (!r.ok) {
          console.warn("[QueueTicker]", r.status, await r.text().catch(() => ""));
        }
        lastTick.current = Date.now();
      } catch (e) {
        // Network errors are fine — try again next interval
        console.debug("[QueueTicker] tick failed", e);
      }
    }

    // Tick once on mount so newly-loaded pages immediately advance the queue
    tick();

    let intervalId: ReturnType<typeof setInterval> | null = null;
    function start(ms: number) {
      if (intervalId) clearInterval(intervalId);
      intervalId = setInterval(tick, ms);
    }
    start(POLL_INTERVAL_MS);

    function onVisibility() {
      if (document.hidden) {
        start(IDLE_INTERVAL_MS);
      } else {
        // When the tab comes back, tick right away then resume fast cadence
        tick();
        start(POLL_INTERVAL_MS);
      }
    }
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stopped.current = true;
      if (intervalId) clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return null;
}
