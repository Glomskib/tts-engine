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
 * Check if a user has credits available for an operation.
 * Admins always have unlimited credits.
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
    // Fetch user's credits and subscription
    const { data: credits, error: creditsError } = await supabaseAdmin
      .from("user_credits")
      .select("credits_remaining")
      .eq("user_id", userId)
      .single();

    if (creditsError && creditsError.code !== "PGRST116") {
      console.error("Credit check error:", creditsError);
      return {
        hasCredits: false,
        remaining: 0,
        isAdmin: false,
        isUnlimited: false,
        plan: "free",
        error: "Failed to check credits",
      };
    }

    // Get subscription plan
    const { data: subscription } = await supabaseAdmin
      .from("user_subscriptions")
      .select("plan_id, status")
      .eq("user_id", userId)
      .single();

    const planId = subscription?.plan_id || "free";
    const remaining = credits?.credits_remaining ?? 5; // Default 5 for new users

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
