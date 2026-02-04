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
    console.log(`[Credits] Creating missing credit records for user ${userId}`);

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
