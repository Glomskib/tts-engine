/**
 * Marketplace usage helpers — shared between job creation and client portal.
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getClientToday } from "./types";
import { getMpPlanConfig, type MpPlanTier } from "./plan-config";

export interface UsageToday {
  client_id: string;
  date: string;
  used_today: number;
  daily_cap: number;
  remaining_today: number;
  /** ISO timestamp when the counter resets (midnight in client TZ) */
  resets_at: string;
  plan_tier: MpPlanTier;
  plan_label: string;
  sla_hours: number;
}

/**
 * Get today's usage for a client — the single query backing both
 * the "X/Y used today" display and the cap check before job creation.
 */
export async function getUsageToday(clientId: string): Promise<UsageToday> {
  // Fetch plan + client timezone in parallel
  const [planRes, clientRes] = await Promise.all([
    supabaseAdmin.from("client_plans").select("*").eq("client_id", clientId).single(),
    supabaseAdmin.from("clients").select("timezone").eq("id", clientId).single(),
  ]);

  const plan = planRes.data;
  const tz = clientRes.data?.timezone || "UTC";
  const tier = (plan?.plan_tier || "pool_15") as MpPlanTier;
  const cfg = getMpPlanConfig(tier);
  const dailyCap = plan?.daily_cap ?? cfg.daily_cap;
  const slaHours = plan?.sla_hours ?? cfg.sla_hours;
  const today = getClientToday(tz);

  // Get submitted count for today
  const { data: usage } = await supabaseAdmin
    .from("plan_usage_daily")
    .select("submitted_count")
    .eq("client_id", clientId)
    .eq("date", today)
    .maybeSingle();

  const usedToday = usage?.submitted_count ?? 0;

  // Compute reset time: midnight tomorrow in client TZ
  const resetsAt = computeResetTime(tz);

  return {
    client_id: clientId,
    date: today,
    used_today: usedToday,
    daily_cap: dailyCap,
    remaining_today: Math.max(0, dailyCap - usedToday),
    resets_at: resetsAt,
    plan_tier: tier,
    plan_label: cfg.label,
    sla_hours: slaHours,
  };
}

/**
 * Check whether a client can submit a new job today.
 * Returns { allowed, usage } so callers can display the reason.
 */
export async function checkDailyCap(
  clientId: string
): Promise<{ allowed: boolean; usage: UsageToday }> {
  const usage = await getUsageToday(clientId);
  return { allowed: usage.remaining_today > 0, usage };
}

// ── Internal helpers ───────────────────────────────────────

function computeResetTime(tz: string): string {
  try {
    const now = new Date();
    // Get "today" in client TZ then add 1 day
    const todayStr = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);

    // Parse YYYY-MM-DD and add one day
    const [y, m, d] = todayStr.split("-").map(Number);
    const tomorrow = new Date(Date.UTC(y, m - 1, d + 1));

    // Convert to actual instant by applying offset
    // Use a formatter to find the UTC offset at midnight tomorrow in the target TZ
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      timeZoneName: "longOffset",
    }).formatToParts(tomorrow);

    const offsetPart = parts.find((p) => p.type === "timeZoneName");
    if (offsetPart) {
      // Parse "GMT+05:30" style offset
      const match = offsetPart.value.match(/GMT([+-]\d{2}):?(\d{2})?/);
      if (match) {
        const hrs = parseInt(match[1], 10);
        const mins = parseInt(match[2] || "0", 10);
        const offsetMs = (hrs * 60 + (hrs < 0 ? -mins : mins)) * 60_000;
        return new Date(tomorrow.getTime() - offsetMs).toISOString();
      }
    }
    return tomorrow.toISOString();
  } catch {
    // Fallback: midnight UTC tomorrow
    const t = new Date();
    t.setUTCDate(t.getUTCDate() + 1);
    t.setUTCHours(0, 0, 0, 0);
    return t.toISOString();
  }
}
