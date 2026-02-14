/**
 * Credit system utilities for the freemium model.
 *
 * Admin users (determined by ADMIN_USERS env or isAdmin flag) bypass all credit checks.
 * Regular users have credit limits based on their subscription plan.
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";

export interface CreditCheckResult {
  hasCredits: boolean;
  remaining: number;
  isAdmin: boolean;
  isUnlimited: boolean;
  plan: string;
  error?: string;
}

export interface CreditDeductResult {
  success: boolean;
  remaining: number;
  error?: string;
}

export interface CreditDisplayInfo {
  display: string;
  remaining: number;
  showUpgrade: boolean;
  isUnlimited: boolean;
  plan: string;
}

/**
 * Ensure user has credit records. Creates them if missing.
 * Returns the user's current credits.
 */
export async function ensureUserCredits(userId: string): Promise<{ credits_remaining: number } | null> {
  // Check if user has credit records
  let { data: userCredits } = await supabaseAdmin
    .from("user_credits")
    .select("credits_remaining")
    .eq("user_id", userId)
    .single();

  // If no credits row exists, create default records
  if (!userCredits) {
    // Create subscription record (free plan)
    await supabaseAdmin
      .from("user_subscriptions")
      .upsert({
        user_id: userId,
        plan_id: "free",
        status: "active",
      }, { onConflict: "user_id" });

    // Create credits record with 5 free credits
    const { data: newCredits } = await supabaseAdmin
      .from("user_credits")
      .upsert({
        user_id: userId,
        credits_remaining: 5,
        free_credits_total: 5,
        free_credits_used: 0,
        credits_used_this_period: 0,
        lifetime_credits_used: 0,
      }, { onConflict: "user_id" })
      .select("credits_remaining")
      .single();

    userCredits = newCredits;

    // Log the initial credit grant
    await supabaseAdmin
      .from("credit_transactions")
      .insert({
        user_id: userId,
        type: "bonus",
        amount: 5,
        balance_after: 5,
        description: "Welcome bonus - 5 free generations (auto-initialized)",
      });
  }

  return userCredits;
}

/**
 * Check if a user has credits available for an operation.
 * Admins always have unlimited credits.
 * Automatically initializes credits if missing.
 */
export async function checkCredits(
  userId: string,
  isAdmin: boolean = false
): Promise<CreditCheckResult> {
  // Admin bypass - unlimited credits
  if (isAdmin) {
    return {
      hasCredits: true,
      remaining: -1, // -1 indicates unlimited
      isAdmin: true,
      isUnlimited: true,
      plan: "admin",
    };
  }

  try {
    // Ensure user has credit records (creates if missing)
    const credits = await ensureUserCredits(userId);

    if (!credits) {
      console.error("Failed to initialize credits for user:", userId);
      return {
        hasCredits: false,
        remaining: 0,
        isAdmin: false,
        isUnlimited: false,
        plan: "free",
        error: "Failed to initialize credits",
      };
    }

    // Get subscription plan
    const { data: subscription } = await supabaseAdmin
      .from("user_subscriptions")
      .select("plan_id, status")
      .eq("user_id", userId)
      .single();

    const planId = subscription?.plan_id || "free";
    const remaining = credits.credits_remaining ?? 5;

    // Check if plan has unlimited credits (pro/team/admin plans)
    const isUnlimited = ["admin", "pro", "team"].includes(planId) && remaining >= 999;

    return {
      hasCredits: remaining > 0 || isUnlimited,
      remaining: isUnlimited ? -1 : remaining,
      isAdmin: false,
      isUnlimited,
      plan: planId,
    };
  } catch (error) {
    console.error("Credit check exception:", error);
    return {
      hasCredits: false,
      remaining: 0,
      isAdmin: false,
      isUnlimited: false,
      plan: "free",
      error: "Credit check failed",
    };
  }
}

/**
 * Deduct a credit from the user's balance.
 * Returns success status and remaining credits.
 * Admins skip deduction entirely.
 */
export async function useCredit(
  userId: string,
  isAdmin: boolean = false,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  amount: number = 1,
  description: string = "AI generation"
): Promise<CreditDeductResult> {
  // Admin bypass - no deduction needed
  if (isAdmin) {
    return {
      success: true,
      remaining: -1, // Unlimited
    };
  }

  try {
    // Use the database function to deduct credits atomically
    const { data: result, error } = await supabaseAdmin.rpc("deduct_credit", {
      p_user_id: userId,
      p_description: description,
    });

    if (error) {
      console.error("Credit deduction error:", error);
      return {
        success: false,
        remaining: 0,
        error: "Failed to deduct credit",
      };
    }

    const deductResult = result?.[0];

    if (!deductResult?.success) {
      return {
        success: false,
        remaining: deductResult?.credits_remaining ?? 0,
        error: deductResult?.message || "No credits remaining",
      };
    }

    return {
      success: true,
      remaining: deductResult.credits_remaining,
    };
  } catch (error) {
    console.error("Credit deduction exception:", error);
    return {
      success: false,
      remaining: 0,
      error: "Credit deduction failed",
    };
  }
}

/**
 * Get display information for the credits badge/header.
 */
export async function getCreditsDisplay(
  userId: string,
  isAdmin: boolean = false
): Promise<CreditDisplayInfo> {
  const check = await checkCredits(userId, isAdmin);

  if (check.isUnlimited || check.isAdmin) {
    return {
      display: "Unlimited",
      remaining: -1,
      showUpgrade: false,
      isUnlimited: true,
      plan: check.plan,
    };
  }

  const showUpgrade = check.remaining <= 5 || check.plan === "free";

  return {
    display: `${check.remaining} credits`,
    remaining: check.remaining,
    showUpgrade,
    isUnlimited: false,
    plan: check.plan,
  };
}

/**
 * Check credits and return an error response if insufficient.
 * Use this at the start of API handlers that cost credits.
 * Returns null if credits are available, or an error object if not.
 */
export async function requireCredits(
  userId: string,
  isAdmin: boolean = false
): Promise<{ error: string; status: number; remaining: number } | null> {
  const check = await checkCredits(userId, isAdmin);

  if (!check.hasCredits) {
    return {
      error: check.error || "No credits remaining",
      status: 402, // Payment Required
      remaining: check.remaining,
    };
  }

  return null; // Credits available
}

// ─── Centralized credit management ─────────────────────────────────────────

export interface UsageBreakdownItem {
  action: string;
  total: number;
}

/**
 * Spend credits atomically.  Uses the `add_credits` RPC with a negative amount
 * so multi-credit operations (e.g. 3 for script generation) are handled in one
 * DB round-trip with a single transaction row.
 *
 * Returns the new balance or an error.  Admins bypass entirely.
 */
export async function spendCredits(
  userId: string,
  amount: number,
  action: string,
  description: string,
  isAdmin: boolean = false,
): Promise<CreditDeductResult> {
  if (isAdmin) return { success: true, remaining: -1 };
  if (amount <= 0) return { success: false, remaining: 0, error: "Amount must be positive" };

  try {
    // Ensure the user row exists before we try to deduct
    await ensureUserCredits(userId);

    const { data: result, error } = await supabaseAdmin.rpc("add_credits", {
      p_user_id: userId,
      p_amount: -amount,
      p_type: action,
      p_description: description,
    });

    if (error) {
      console.error("spendCredits RPC error:", error);
      return { success: false, remaining: 0, error: "Failed to deduct credits" };
    }

    const row = result?.[0];
    if (!row?.success) {
      return {
        success: false,
        remaining: row?.credits_remaining ?? 0,
        error: row?.message || "Insufficient credits",
      };
    }

    return { success: true, remaining: row.credits_remaining };
  } catch (err) {
    console.error("spendCredits exception:", err);
    return { success: false, remaining: 0, error: "Credit spend failed" };
  }
}

/**
 * Add credits to a user's balance (purchases, bonuses, refunds).
 * Always creates a transaction record.
 */
export async function addCredits(
  userId: string,
  amount: number,
  action: string,
  description: string,
): Promise<CreditDeductResult> {
  if (amount <= 0) return { success: false, remaining: 0, error: "Amount must be positive" };

  try {
    await ensureUserCredits(userId);

    const { data: result, error } = await supabaseAdmin.rpc("add_credits", {
      p_user_id: userId,
      p_amount: amount,
      p_type: action,
      p_description: description,
    });

    if (error) {
      console.error("addCredits RPC error:", error);
      return { success: false, remaining: 0, error: "Failed to add credits" };
    }

    const row = result?.[0];
    return {
      success: row?.success ?? false,
      remaining: row?.credits_remaining ?? 0,
    };
  } catch (err) {
    console.error("addCredits exception:", err);
    return { success: false, remaining: 0, error: "Credit add failed" };
  }
}

/**
 * Get a user's current credit balance.  Returns -1 for admins (unlimited).
 */
export async function getBalance(
  userId: string,
  isAdmin: boolean = false,
): Promise<number> {
  if (isAdmin) return -1;

  const credits = await ensureUserCredits(userId);
  return credits?.credits_remaining ?? 0;
}

/**
 * Get a breakdown of credit usage by action type within a date range.
 * Used for the pie chart on the credits page.
 */
export async function getUsageBreakdown(
  userId: string,
  startDate: string,
  endDate: string,
): Promise<UsageBreakdownItem[]> {
  // Fetch all spend transactions (negative amounts) in the range
  const { data, error } = await supabaseAdmin
    .from("credit_transactions")
    .select("type, amount")
    .eq("user_id", userId)
    .lt("amount", 0)
    .gte("created_at", startDate)
    .lte("created_at", endDate);

  if (error || !data) return [];

  // Aggregate by type
  const map = new Map<string, number>();
  for (const row of data) {
    const key = row.type || "other";
    map.set(key, (map.get(key) || 0) + Math.abs(row.amount));
  }

  return Array.from(map.entries())
    .map(([action, total]) => ({ action, total }))
    .sort((a, b) => b.total - a.total);
}
