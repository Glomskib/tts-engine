/**
 * Billing Module
 *
 * Event-based org billing with:
 * - Plan pricing configuration
 * - Monthly usage calculation (videos reaching POSTED status)
 * - Invoice preview computation with rollover credits
 *
 * Billing rules:
 * - Billable unit = video status transition to POSTED
 * - Billing period = UTC calendar month
 * - Base fee covers included_videos_per_month
 * - True-up: overage charged, underage rolls over (up to 25% of included)
 *
 * Event types (video_id null):
 * - client_org_billing_config_set: { org_id, timezone?, rollover_percent? }
 * - client_org_rollover_set: { org_id, year, month, rollover_videos }
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { OrgPlanType, getOrgPlan } from "@/lib/subscription";
import { getOrgVideos, getClientOrgById } from "@/lib/client-org";

// ============================================================================
// Plan Pricing Defaults
// ============================================================================

export interface PlanPricing {
  monthly_base_fee_cents: number;
  included_videos_per_month: number;
  overage_rate_cents_per_video: number;
  rollover_percent_default: number;
}

/**
 * Default pricing per plan tier.
 * Base fee = included * rate (simple model).
 */
export const PLAN_PRICING: Record<OrgPlanType, PlanPricing> = {
  free: {
    monthly_base_fee_cents: 0,
    included_videos_per_month: 5,
    overage_rate_cents_per_video: 0, // Free plan doesn't charge overage
    rollover_percent_default: 0, // No rollover for free
  },
  pro: {
    monthly_base_fee_cents: 49900, // $499/month
    included_videos_per_month: 50,
    overage_rate_cents_per_video: 999, // $9.99 per video overage
    rollover_percent_default: 25,
  },
  enterprise: {
    monthly_base_fee_cents: 149900, // $1,499/month
    included_videos_per_month: 200,
    overage_rate_cents_per_video: 749, // $7.49 per video overage (volume discount)
    rollover_percent_default: 25,
  },
};

// ============================================================================
// Event Types
// ============================================================================

export const BILLING_EVENT_TYPES = {
  BILLING_CONFIG_SET: "client_org_billing_config_set",
  ROLLOVER_SET: "client_org_rollover_set",
} as const;

// ============================================================================
// Types
// ============================================================================

export interface OrgBillingConfig {
  org_id: string;
  plan: OrgPlanType;
  monthly_base_fee_cents: number;
  included_videos_per_month: number;
  overage_rate_cents_per_video: number;
  rollover_percent: number;
  timezone: string;
}

export interface OrgInvoicePreview {
  org_id: string;
  org_name: string;
  plan: OrgPlanType;
  billing_status: string;
  period_start: string; // ISO date YYYY-MM-DD
  period_end: string; // ISO date YYYY-MM-DD
  included_videos: number;
  posted_videos: number;
  base_fee_cents: number;
  overage_videos: number;
  overage_fee_cents: number;
  rollover_in_videos: number;
  rollover_out_videos: number;
  effective_included_videos: number;
  estimated_total_cents: number;
  notes: string[];
}

// ============================================================================
// Billing Config Functions
// ============================================================================

/**
 * Get billing configuration for an organization.
 * Resolution order:
 * 1. Per-org billing config override event (if present)
 * 2. Derive from org plan defaults
 */
export async function getOrgBillingConfig(
  supabase: SupabaseClient,
  orgId: string
): Promise<OrgBillingConfig> {
  // Get org plan
  const orgPlanInfo = await getOrgPlan(supabase, orgId);
  const planPricing = PLAN_PRICING[orgPlanInfo.plan];

  // Start with plan defaults
  let config: OrgBillingConfig = {
    org_id: orgId,
    plan: orgPlanInfo.plan,
    monthly_base_fee_cents: planPricing.monthly_base_fee_cents,
    included_videos_per_month: planPricing.included_videos_per_month,
    overage_rate_cents_per_video: planPricing.overage_rate_cents_per_video,
    rollover_percent: planPricing.rollover_percent_default,
    timezone: "UTC", // Default to UTC for simplicity
  };

  // Check for per-org billing config override
  try {
    const { data: configEvents } = await supabase
      .from("video_events")
      .select("details, created_at")
      .eq("event_type", BILLING_EVENT_TYPES.BILLING_CONFIG_SET)
      .is("video_id", null)
      .order("created_at", { ascending: false })
      .limit(100);

    if (configEvents) {
      for (const event of configEvents) {
        if (event.details?.org_id === orgId) {
          // Apply overrides from event
          if (typeof event.details.timezone === "string") {
            config.timezone = event.details.timezone;
          }
          if (typeof event.details.rollover_percent === "number") {
            config.rollover_percent = Math.max(0, Math.min(100, event.details.rollover_percent));
          }
          if (typeof event.details.monthly_base_fee_cents === "number") {
            config.monthly_base_fee_cents = event.details.monthly_base_fee_cents;
          }
          if (typeof event.details.included_videos_per_month === "number") {
            config.included_videos_per_month = event.details.included_videos_per_month;
          }
          if (typeof event.details.overage_rate_cents_per_video === "number") {
            config.overage_rate_cents_per_video = event.details.overage_rate_cents_per_video;
          }
          break;
        }
      }
    }
  } catch (err) {
    console.error("Error fetching org billing config override:", err);
  }

  return config;
}

// ============================================================================
// Usage Calculation Functions
// ============================================================================

/**
 * Get rollover credits for an org from previous month.
 */
async function getOrgRolloverIn(
  supabase: SupabaseClient,
  orgId: string,
  year: number,
  month: number
): Promise<number> {
  // Rollover comes from the previous month's rollover_set event
  let prevYear = year;
  let prevMonth = month - 1;
  if (prevMonth < 1) {
    prevMonth = 12;
    prevYear = year - 1;
  }

  try {
    const { data: rolloverEvents } = await supabase
      .from("video_events")
      .select("details, created_at")
      .eq("event_type", BILLING_EVENT_TYPES.ROLLOVER_SET)
      .is("video_id", null)
      .order("created_at", { ascending: false })
      .limit(200);

    if (rolloverEvents) {
      for (const event of rolloverEvents) {
        if (
          event.details?.org_id === orgId &&
          event.details?.year === prevYear &&
          event.details?.month === prevMonth
        ) {
          return typeof event.details.rollover_videos === "number"
            ? event.details.rollover_videos
            : 0;
        }
      }
    }
  } catch (err) {
    console.error("Error fetching rollover:", err);
  }

  return 0;
}

/**
 * Count videos that transitioned to POSTED status within a billing period.
 * Uses UTC calendar month as the billing period.
 */
export async function computeOrgMonthlyUsage(
  supabase: SupabaseClient,
  orgId: string,
  year: number,
  month: number
): Promise<number> {
  // Get period boundaries in UTC
  const periodStart = new Date(Date.UTC(year, month - 1, 1)); // Month is 0-indexed
  const periodEnd = new Date(Date.UTC(year, month, 1)); // First day of next month

  // Get all videos assigned to this org
  const orgVideoIds = await getOrgVideos(supabase, orgId);
  if (orgVideoIds.length === 0) {
    return 0;
  }

  // Query status change events to POSTED within the period
  try {
    const { data: statusEvents, error } = await supabase
      .from("video_events")
      .select("video_id, to_status, created_at")
      .eq("event_type", "recording_status_changed")
      .eq("to_status", "POSTED")
      .gte("created_at", periodStart.toISOString())
      .lt("created_at", periodEnd.toISOString());

    if (error) {
      console.error("Error fetching POSTED status events:", error);
      return 0;
    }

    if (!statusEvents) {
      return 0;
    }

    // Count unique videos that reached POSTED in this period and belong to org
    const postedVideoIds = new Set<string>();
    const orgVideoIdSet = new Set(orgVideoIds);

    for (const event of statusEvents) {
      if (event.video_id && orgVideoIdSet.has(event.video_id)) {
        postedVideoIds.add(event.video_id);
      }
    }

    return postedVideoIds.size;
  } catch (err) {
    console.error("Error computing org monthly usage:", err);
    return 0;
  }
}

// ============================================================================
// Invoice Preview Computation
// ============================================================================

/**
 * Compute invoice preview for an organization for a specific month.
 */
export async function computeOrgInvoicePreview(
  supabase: SupabaseClient,
  orgId: string,
  year: number,
  month: number
): Promise<OrgInvoicePreview> {
  const notes: string[] = [];

  // Get org details
  const org = await getClientOrgById(supabase, orgId);
  const orgName = org?.org_name || orgId;

  // Get billing config
  const config = await getOrgBillingConfig(supabase, orgId);

  // Get org plan info
  const orgPlanInfo = await getOrgPlan(supabase, orgId);

  // Calculate period dates
  const periodStart = new Date(Date.UTC(year, month - 1, 1));
  const periodEnd = new Date(Date.UTC(year, month, 0)); // Last day of month

  // Get usage
  const postedVideos = await computeOrgMonthlyUsage(supabase, orgId, year, month);

  // Get rollover from previous month
  const rolloverIn = await getOrgRolloverIn(supabase, orgId, year, month);

  // Calculate effective included videos (base + rollover)
  const effectiveIncluded = config.included_videos_per_month + rolloverIn;

  // Calculate overage
  let overageVideos = 0;
  let overageFeeCents = 0;
  let rolloverOut = 0;

  if (postedVideos > effectiveIncluded) {
    // Overage situation
    overageVideos = postedVideos - effectiveIncluded;
    overageFeeCents = overageVideos * config.overage_rate_cents_per_video;
    notes.push(`${overageVideos} overage videos at $${(config.overage_rate_cents_per_video / 100).toFixed(2)}/video`);
  } else if (postedVideos < effectiveIncluded) {
    // Underage situation - calculate rollover for next month
    const unusedVideos = effectiveIncluded - postedVideos;
    const maxRollover = Math.floor(config.included_videos_per_month * (config.rollover_percent / 100));
    rolloverOut = Math.min(unusedVideos, maxRollover);

    if (rolloverOut > 0) {
      notes.push(`${rolloverOut} unused videos rolling over to next month`);
    }
  }

  if (rolloverIn > 0) {
    notes.push(`Includes ${rolloverIn} rollover credits from previous month`);
  }

  // Calculate total
  const estimatedTotalCents = config.monthly_base_fee_cents + overageFeeCents;

  // Special notes for free plan
  if (config.plan === "free") {
    notes.push("Free plan - no charges");
  }

  return {
    org_id: orgId,
    org_name: orgName,
    plan: config.plan,
    billing_status: orgPlanInfo.billing_status,
    period_start: periodStart.toISOString().split("T")[0],
    period_end: periodEnd.toISOString().split("T")[0],
    included_videos: config.included_videos_per_month,
    posted_videos: postedVideos,
    base_fee_cents: config.monthly_base_fee_cents,
    overage_videos: overageVideos,
    overage_fee_cents: overageFeeCents,
    rollover_in_videos: rolloverIn,
    rollover_out_videos: rolloverOut,
    effective_included_videos: effectiveIncluded,
    estimated_total_cents: estimatedTotalCents,
    notes,
  };
}

// ============================================================================
// Admin Functions
// ============================================================================

/**
 * Get invoice previews for all organizations for a specific month.
 */
export async function getAllOrgInvoicePreviews(
  supabase: SupabaseClient,
  year: number,
  month: number
): Promise<OrgInvoicePreview[]> {
  // Get all org creation events to find org IDs
  const { data: orgEvents, error } = await supabase
    .from("video_events")
    .select("details")
    .eq("event_type", "client_org_created")
    .is("video_id", null);

  if (error || !orgEvents) {
    console.error("Error fetching orgs for billing:", error);
    return [];
  }

  // Extract unique org IDs
  const orgIds = new Set<string>();
  for (const event of orgEvents) {
    if (event.details?.org_id) {
      orgIds.add(event.details.org_id);
    }
  }

  // Compute invoice preview for each org
  const previews: OrgInvoicePreview[] = [];
  for (const orgId of orgIds) {
    const preview = await computeOrgInvoicePreview(supabase, orgId, year, month);
    previews.push(preview);
  }

  // Sort by org_name
  previews.sort((a, b) => a.org_name.localeCompare(b.org_name));

  return previews;
}

/**
 * Generate CSV export of billing data for a month.
 */
export function generateBillingCsv(previews: OrgInvoicePreview[]): string {
  const headers = [
    "org_name",
    "org_id",
    "plan",
    "billing_status",
    "included",
    "rollover_in",
    "posted",
    "overage_videos",
    "base_fee",
    "overage_fee",
    "total",
  ];

  const rows = previews.map((p) => [
    `"${p.org_name.replace(/"/g, '""')}"`,
    p.org_id,
    p.plan,
    p.billing_status,
    p.included_videos,
    p.rollover_in_videos,
    p.posted_videos,
    p.overage_videos,
    (p.base_fee_cents / 100).toFixed(2),
    (p.overage_fee_cents / 100).toFixed(2),
    (p.estimated_total_cents / 100).toFixed(2),
  ]);

  return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
}

/**
 * Format cents as currency string.
 */
export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
