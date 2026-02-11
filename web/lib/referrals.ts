/**
 * Referral system utilities for FlashFlow AI.
 * Handles referral code generation, tracking, and reward distribution.
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";

// ---------------------------------------------------------------------------
// Code Generation
// ---------------------------------------------------------------------------

/**
 * Generate a unique 8-character referral code.
 * Format: 2 letters + 4 numbers + 2 letters (e.g., BK4829TM)
 * Easy to type, share verbally, and hard to guess.
 */
export function generateReferralCode(): string {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // no I/O to avoid confusion
  const digits = "0123456789";

  const pick = (chars: string) => chars[Math.floor(Math.random() * chars.length)];

  return (
    pick(letters) +
    pick(letters) +
    pick(digits) +
    pick(digits) +
    pick(digits) +
    pick(digits) +
    pick(letters) +
    pick(letters)
  );
}

// ---------------------------------------------------------------------------
// User Referral Code
// ---------------------------------------------------------------------------

/**
 * Get (or lazily create) a user's referral code.
 * Stored on user_subscriptions.referral_code.
 */
export async function getUserReferralCode(userId: string): Promise<string> {
  // Check if user already has a code
  const { data } = await supabaseAdmin
    .from("user_subscriptions")
    .select("referral_code")
    .eq("user_id", userId)
    .single();

  if (data?.referral_code) return data.referral_code;

  // Generate a unique one (retry up to 5 times on collision)
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateReferralCode();
    const { error } = await supabaseAdmin
      .from("user_subscriptions")
      .update({ referral_code: code })
      .eq("user_id", userId);

    if (!error) return code;
    // Unique constraint violation → retry
  }

  throw new Error("Failed to generate unique referral code after 5 attempts");
}

// ---------------------------------------------------------------------------
// Referral Stats
// ---------------------------------------------------------------------------

export interface ReferralStats {
  totalClicks: number;
  signedUp: number;
  converted: number;
  creditsEarned: number;
  creditsAvailable: number;
  referralLink: string;
  referralCode: string;
}

export async function getReferralStats(userId: string): Promise<ReferralStats> {
  const code = await getUserReferralCode(userId);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://flashflowai.com";

  const { data: referrals } = await supabaseAdmin
    .from("referrals")
    .select("status, click_count, credited")
    .eq("referrer_id", userId);

  const rows = referrals || [];

  const totalClicks = rows.reduce((sum, r) => sum + (r.click_count || 0), 0);
  const signedUp = rows.filter((r) => ["signed_up", "converted"].includes(r.status)).length;
  const converted = rows.filter((r) => r.status === "converted").length;
  const creditsEarned = rows.filter((r) => r.credited).length;

  // Credits available from user_subscriptions
  const { data: sub } = await supabaseAdmin
    .from("user_subscriptions")
    .select("referral_credits")
    .eq("user_id", userId)
    .single();

  return {
    totalClicks,
    signedUp,
    converted,
    creditsEarned,
    creditsAvailable: sub?.referral_credits || 0,
    referralLink: `${appUrl}/?ref=${code}`,
    referralCode: code,
  };
}

// ---------------------------------------------------------------------------
// Referral Click Tracking
// ---------------------------------------------------------------------------

/**
 * Record a referral link click. Creates or updates the referral row.
 */
export async function recordReferralClick(referralCode: string): Promise<void> {
  // Find the referrer
  const { data: referrer } = await supabaseAdmin
    .from("user_subscriptions")
    .select("user_id")
    .eq("referral_code", referralCode)
    .single();

  if (!referrer) return; // Invalid code — silently ignore

  // Upsert a pending referral (one per code, no referred user yet)
  const { data: existing } = await supabaseAdmin
    .from("referrals")
    .select("id, click_count")
    .eq("referral_code", referralCode)
    .is("referred_id", null)
    .single();

  if (existing) {
    await supabaseAdmin
      .from("referrals")
      .update({
        click_count: (existing.click_count || 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
  } else {
    await supabaseAdmin.from("referrals").insert({
      referrer_id: referrer.user_id,
      referral_code: referralCode,
      status: "pending",
      click_count: 1,
    });
  }
}

// ---------------------------------------------------------------------------
// Referral Signup
// ---------------------------------------------------------------------------

/**
 * Record that a referred user signed up.
 */
export async function recordReferralSignup(
  referralCode: string,
  newUserId: string,
): Promise<void> {
  // Find the referrer
  const { data: referrer } = await supabaseAdmin
    .from("user_subscriptions")
    .select("user_id")
    .eq("referral_code", referralCode)
    .single();

  if (!referrer) return;

  // Store the referral code on the new user's subscription row
  await supabaseAdmin
    .from("user_subscriptions")
    .update({ referred_by: referralCode })
    .eq("user_id", newUserId);

  // Create or update referral record
  const { data: existing } = await supabaseAdmin
    .from("referrals")
    .select("id")
    .eq("referral_code", referralCode)
    .is("referred_id", null)
    .single();

  if (existing) {
    await supabaseAdmin
      .from("referrals")
      .update({
        referred_id: newUserId,
        status: "signed_up",
        signed_up_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
  } else {
    await supabaseAdmin.from("referrals").insert({
      referrer_id: referrer.user_id,
      referred_id: newUserId,
      referral_code: referralCode,
      status: "signed_up",
      signed_up_at: new Date().toISOString(),
    });
  }
}

// ---------------------------------------------------------------------------
// Referral Conversion (user upgraded to paid plan)
// ---------------------------------------------------------------------------

/**
 * When a referred user upgrades to paid, credit the referrer.
 */
export async function recordReferralConversion(referredUserId: string): Promise<void> {
  // Check if this user was referred
  const { data: sub } = await supabaseAdmin
    .from("user_subscriptions")
    .select("referred_by")
    .eq("user_id", referredUserId)
    .single();

  if (!sub?.referred_by) return;

  // Find the referral record
  const { data: referral } = await supabaseAdmin
    .from("referrals")
    .select("id, referrer_id, status")
    .eq("referred_id", referredUserId)
    .single();

  if (!referral || referral.status === "converted") return;

  // Update referral status
  await supabaseAdmin
    .from("referrals")
    .update({
      status: "converted",
      converted_at: new Date().toISOString(),
      credited: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", referral.id);

  // Credit the referrer with 1 free month (stored as referral_credits)
  await supabaseAdmin.rpc("increment_referral_credits", {
    p_user_id: referral.referrer_id,
  }).then(({ error }) => {
    if (error) {
      // Fallback: direct increment
      supabaseAdmin
        .from("user_subscriptions")
        .select("referral_credits")
        .eq("user_id", referral.referrer_id)
        .single()
        .then(({ data }) => {
          const current = data?.referral_credits || 0;
          supabaseAdmin
            .from("user_subscriptions")
            .update({ referral_credits: current + 1 })
            .eq("user_id", referral.referrer_id);
        });
    }
  });
}

// ---------------------------------------------------------------------------
// Recent Referrals (for dashboard)
// ---------------------------------------------------------------------------

export interface ReferralRow {
  id: string;
  referred_email: string | null;
  status: string;
  signed_up_at: string | null;
  converted_at: string | null;
  created_at: string;
}

export async function getRecentReferrals(
  userId: string,
  limit = 10,
): Promise<ReferralRow[]> {
  const { data } = await supabaseAdmin
    .from("referrals")
    .select("id, referred_id, status, signed_up_at, converted_at, created_at")
    .eq("referrer_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (!data) return [];

  // Fetch emails for referred users (masked for privacy)
  const rows: ReferralRow[] = [];
  for (const r of data) {
    let email: string | null = null;
    if (r.referred_id) {
      const { data: user } = await supabaseAdmin.auth.admin.getUserById(r.referred_id);
      if (user?.user?.email) {
        // Mask email: show first 3 chars + *** + domain
        const parts = user.user.email.split("@");
        email = parts[0].slice(0, 3) + "***@" + parts[1];
      }
    }
    rows.push({
      id: r.id,
      referred_email: email,
      status: r.status,
      signed_up_at: r.signed_up_at,
      converted_at: r.converted_at,
      created_at: r.created_at,
    });
  }

  return rows;
}
