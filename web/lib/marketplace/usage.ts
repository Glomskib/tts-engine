/**
 * Marketplace usage helpers — shared between job creation and client portal.
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getClientToday } from "./types";
import { getMpPlanConfig, type MpPlanTier, type MpPlanStatus } from "./plan-config";

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
  plan_status: MpPlanStatus;
  sla_hours: number;
  /** Jobs claimed by VAs today for this client */
  claimed_today: number;
  /** True when used_today >= 80% of daily_cap — triggers soft upsell nudge */
  upgrade_hint: boolean;
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
  const planStatus = (plan?.status as MpPlanStatus) || "active";
  const today = getClientToday(tz);

  // Get submitted count + claimed count in parallel
  const [usageRes, claimedRes] = await Promise.all([
    supabaseAdmin
      .from("plan_usage_daily")
      .select("submitted_count")
      .eq("client_id", clientId)
      .eq("date", today)
      .maybeSingle(),
    supabaseAdmin
      .from("edit_jobs")
      .select("id", { count: "exact", head: true })
      .eq("client_id", clientId)
      .gte("claimed_at", `${today}T00:00:00`)
      .lt("claimed_at", `${today}T23:59:59.999`),
  ]);

  const usedToday = usageRes.data?.submitted_count ?? 0;
  const claimedToday = claimedRes.count ?? 0;

  // Compute reset time: midnight tomorrow in client TZ
  const resetsAt = computeResetTime(tz);

  // Soft upsell: trigger at 80% of daily cap
  const upgradeHint = dailyCap > 0 && usedToday >= Math.ceil(dailyCap * 0.8);

  return {
    client_id: clientId,
    date: today,
    used_today: usedToday,
    daily_cap: dailyCap,
    remaining_today: Math.max(0, dailyCap - usedToday),
    resets_at: resetsAt,
    plan_tier: tier,
    plan_label: cfg.label,
    plan_status: planStatus,
    sla_hours: slaHours,
    claimed_today: claimedToday,
    upgrade_hint: upgradeHint,
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

// ── Entitlement checks ───────────────────────────────────

/** Plan statuses that allow job creation and VA dispatch */
const BILLABLE_STATUSES: MpPlanStatus[] = ["active", "trialing"];

/**
 * Check whether a client's plan is in a billable state.
 * Returns the plan status. Throws MarketplaceError if not billable.
 *
 * Import MarketplaceError lazily to avoid circular deps with queries.ts.
 */
export async function checkPlanActive(clientId: string): Promise<MpPlanStatus> {
  const { data: plan } = await supabaseAdmin
    .from("client_plans")
    .select("status")
    .eq("client_id", clientId)
    .maybeSingle();

  const status = (plan?.status as MpPlanStatus) || "active";

  if (!BILLABLE_STATUSES.includes(status)) {
    // Dynamic import to avoid circular dependency with queries.ts
    const { MarketplaceError } = await import("./queries");
    throw new MarketplaceError(
      `Plan is ${status}. Please update your billing to continue submitting jobs.`,
      "PLAN_INACTIVE",
      402,
    );
  }

  return status;
}

/**
 * Check if a plan status allows VA dispatch (used for queue filtering).
 */
export function isPlanBillable(status: MpPlanStatus | string | null): boolean {
  return BILLABLE_STATUSES.includes((status || "active") as MpPlanStatus);
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
