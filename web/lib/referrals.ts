/**
 * Referral system for FlashFlow AI.
 *
 * Tables:
 *   referral_codes      — one row per user, stores their shareable code
 *   referral_redemptions — one row per referred user, tracks reward status
 *
 * Reward: both referrer AND new user receive 1 month of plan credits.
 *
 * Affiliate commission system (25% recurring) is separate.
 * // TODO: affiliate commission system (3rd party?)
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getPlanCredits, migrateOldPlanId } from "@/lib/plans";
import { addCredits } from "@/lib/credits";
import { sendTelegramNotification } from "@/lib/telegram";

// ---------------------------------------------------------------------------
// Code Generation
// ---------------------------------------------------------------------------

/**
 * Generate a referral code from a user's name.
 * Format: FIRSTNAME + 4 random digits (e.g. BRANDON4821)
 * Falls back to "FLASH" if no name available.
 */
export function generateReferralCode(userName?: string): string {
  const base = (userName || "FLASH")
    .replace(/[^A-Za-z]/g, "")
    .toUpperCase()
    .slice(0, 10); // cap length

  const digits = Math.floor(1000 + Math.random() * 9000); // 4-digit, always 1000-9999
  return `${base || "FLASH"}${digits}`;
}

// ---------------------------------------------------------------------------
// Ensure User Has a Referral Code
// ---------------------------------------------------------------------------

/**
 * Get or create a referral code for a user.
 * Called lazily on first visit to referrals page, or eagerly on signup.
 */
export async function ensureReferralCode(
  userId: string,
  userName?: string,
): Promise<string> {
  // Check if code already exists
  const { data: existing } = await supabaseAdmin
    .from("referral_codes")
    .select("code")
    .eq("user_id", userId)
    .eq("type", "referral")
    .single();

  if (existing?.code) return existing.code;

  // Generate and insert (retry up to 5 times on collision)
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateReferralCode(userName);
    const { error } = await supabaseAdmin.from("referral_codes").insert({
      user_id: userId,
      code,
      type: "referral",
    });

    if (!error) return code;

    // 23505 = unique violation → retry with different digits
    if (error.code !== "23505") {
      console.error("[referrals] insert error:", error);
      break;
    }
  }

  throw new Error("Failed to generate unique referral code after 5 attempts");
}

// ---------------------------------------------------------------------------
// Look Up a Referral Code
// ---------------------------------------------------------------------------

export async function lookupReferralCode(code: string) {
  const { data } = await supabaseAdmin
    .from("referral_codes")
    .select("id, user_id, code, type, uses, max_uses")
    .eq("code", code.toUpperCase().trim())
    .single();

  return data;
}

// ---------------------------------------------------------------------------
// Record Referral Signup + Award Credits
// ---------------------------------------------------------------------------

/**
 * Called after a referred user confirms their email.
 * Creates a redemption record and gives BOTH users 1 month of credits.
 */
export async function recordReferralSignup(
  referralCode: string,
  newUserId: string,
): Promise<void> {
  const codeRow = await lookupReferralCode(referralCode);
  if (!codeRow) return; // Invalid code — silently ignore

  // Don't let users refer themselves
  if (codeRow.user_id === newUserId) return;

  // Check max_uses
  if (codeRow.max_uses !== null && codeRow.uses >= codeRow.max_uses) return;

  // Check if new user was already referred (UNIQUE constraint on referred_user_id)
  const { data: alreadyReferred } = await supabaseAdmin
    .from("referral_redemptions")
    .select("id")
    .eq("referred_user_id", newUserId)
    .single();

  if (alreadyReferred) return;

  // Get both users' plan info for credit rewards
  const [referrerPlan, referredPlan] = await Promise.all([
    getUserPlanCredits(codeRow.user_id),
    getUserPlanCredits(newUserId),
  ]);

  const referrerReward = referrerPlan.monthlyCredits;
  const referredReward = referredPlan.monthlyCredits;

  // Create redemption record
  const { error: redemptionError } = await supabaseAdmin
    .from("referral_redemptions")
    .insert({
      referral_code_id: codeRow.id,
      referrer_user_id: codeRow.user_id,
      referred_user_id: newUserId,
      reward_given: true,
      reward_details: {
        referrer_credits: referrerReward,
        referred_credits: referredReward,
        referrer_plan: referrerPlan.planId,
        referred_plan: referredPlan.planId,
      },
    });

  if (redemptionError) {
    // Likely duplicate — silently ignore
    if (redemptionError.code === "23505") return;
    console.error("[referrals] redemption insert error:", redemptionError);
    return;
  }

  // Increment uses on the referral code
  await supabaseAdmin
    .from("referral_codes")
    .update({ uses: codeRow.uses + 1 })
    .eq("id", codeRow.id);

  // Award credits to BOTH users
  await Promise.all([
    addCredits(
      codeRow.user_id,
      referrerReward,
      "referral",
      `Referral reward: new user signed up with your code`,
    ),
    addCredits(
      newUserId,
      referredReward,
      "referral",
      `Welcome bonus: signed up with referral code ${codeRow.code}`,
    ),
  ]);

  // Send Telegram notification
  const [referrerEmail, referredEmail] = await Promise.all([
    getUserEmail(codeRow.user_id),
    getUserEmail(newUserId),
  ]);

  await sendTelegramNotification(
    `🎉 <b>Referral!</b> ${referrerEmail} → ${referredEmail}\n` +
    `Code: ${codeRow.code}\n` +
    `Rewards: ${referrerReward} credits (referrer) + ${referredReward} credits (new user)`,
  );
}

// ---------------------------------------------------------------------------
// Stats + Dashboard Data
// ---------------------------------------------------------------------------

export interface ReferralStats {
  totalReferrals: number;
  creditsEarned: number;
  referralLink: string;
  referralCode: string;
}

export async function getReferralStats(userId: string): Promise<ReferralStats> {
  const code = await ensureReferralCode(userId);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://flashflowai.com";

  // Count redemptions where this user is the referrer
  const { count: totalReferrals } = await supabaseAdmin
    .from("referral_redemptions")
    .select("id", { count: "exact", head: true })
    .eq("referrer_user_id", userId);

  // Sum credits earned from referral rewards
  const { data: transactions } = await supabaseAdmin
    .from("credit_transactions")
    .select("amount")
    .eq("user_id", userId)
    .eq("type", "referral");

  const creditsEarned = (transactions || []).reduce(
    (sum, t) => sum + (t.amount > 0 ? t.amount : 0),
    0,
  );

  return {
    totalReferrals: totalReferrals ?? 0,
    creditsEarned,
    referralLink: `${appUrl}/signup?ref=${code}`,
    referralCode: code,
  };
}

export interface ReferralRow {
  id: string;
  referred_email: string | null;
  reward_given: boolean;
  reward_details: Record<string, unknown> | null;
  created_at: string;
}

export async function getRecentReferrals(
  userId: string,
  limit = 20,
): Promise<ReferralRow[]> {
  const { data } = await supabaseAdmin
    .from("referral_redemptions")
    .select("id, referred_user_id, reward_given, reward_details, created_at")
    .eq("referrer_user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (!data) return [];

  const rows: ReferralRow[] = [];
  for (const r of data) {
    const email = await getUserEmail(r.referred_user_id);
    // Mask email: first 3 chars + *** + @domain
    let masked: string | null = null;
    if (email) {
      const parts = email.split("@");
      masked = parts[0].slice(0, 3) + "***@" + parts[1];
    }

    rows.push({
      id: r.id,
      referred_email: masked,
      reward_given: r.reward_given,
      reward_details: r.reward_details,
      created_at: r.created_at,
    });
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Get a user's plan monthly credit allocation.
 * Used to determine the referral reward amount ("1 month of credits").
 * Unlimited plans get a fixed 50-credit bonus.
 */
async function getUserPlanCredits(userId: string): Promise<{
  planId: string;
  monthlyCredits: number;
}> {
  const { data: sub } = await supabaseAdmin
    .from("user_subscriptions")
    .select("plan_id")
    .eq("user_id", userId)
    .single();

  const planId = migrateOldPlanId(sub?.plan_id || "free");
  const credits = getPlanCredits(planId);

  // Unlimited plans (-1) get a fixed 50-credit bonus
  const monthlyCredits = credits === -1 ? 50 : Math.max(credits, 5);

  return { planId, monthlyCredits };
}

async function getUserEmail(userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
  return data?.user?.email || null;
}

// Legacy compat — recordReferralClick is called from the API route
export async function recordReferralClick(referralCode: string): Promise<void> {
  // No-op in new system — we track redemptions, not clicks
}
