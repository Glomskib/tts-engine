/**
 * QueueTicker — client-side poller that drives the worker queue.
 *
 * 2026-06-11: this is now an ACCELERATOR, not the engine. The Vercel cron
 * (/api/cron/video-engine-tick, every minute) is the engine again — its auth
 * was fixed (it expected an `x-vercel-cron` header Vercel never sends, and
 * did an untrimmed CRON_SECRET compare, so it 401'd every minute and runs
 * only advanced while someone had a tab open — short uploads "never
 * rendered" once the tab closed). Keep this ticker: it gives logged-in users
 * ~3s latency instead of waiting up to a minute for the next cron tick.
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
