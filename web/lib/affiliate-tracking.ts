/**
 * Affiliate Tracking — click recording, attribution, and link management.
 *
 * Tracks the path from ?ref=CODE click → signup → paid conversion.
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import crypto from 'crypto';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hashValue(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 16);
}

// ---------------------------------------------------------------------------
// Click Recording
// ---------------------------------------------------------------------------

/**
 * Record an affiliate link click. Hashes IP and user-agent for privacy.
 * Creates the link row lazily if it doesn't exist yet.
 */
export async function recordAffiliateClick(
  code: string,
  ip: string,
  userAgent: string,
  referrer: string | null,
): Promise<void> {
  // Look up (or lazy-create) the link for this code
  const linkId = await ensureAffiliateLink(code);
  if (!linkId) return; // code not found in referral_codes

  await supabaseAdmin.from('ff_affiliate_clicks').insert({
    link_id: linkId,
    ip_hash: hashValue(ip),
    user_agent_hash: hashValue(userAgent),
    referrer: referrer?.slice(0, 500) || null,
  });
}

// ---------------------------------------------------------------------------
// Attribution
// ---------------------------------------------------------------------------

/**
 * Record that a new user signed up via a referral code.
 * Idempotent — the UNIQUE constraint on referred_user_id prevents duplicates.
 */
export async function recordAffiliateAttribution(
  refCode: string,
  newUserId: string,
  method: 'cookie' | 'url_param' | 'both',
): Promise<void> {
  // Look up the referral code to find the affiliate user
  const { data: codeRow } = await supabaseAdmin
    .from('referral_codes')
    .select('user_id')
    .eq('code', refCode)
    .single();

  if (!codeRow) return; // unknown code

  // Don't attribute self-referrals
  if (codeRow.user_id === newUserId) return;

  // Insert attribution (idempotent via UNIQUE on referred_user_id)
  await supabaseAdmin.from('ff_affiliate_attributions').insert({
    affiliate_user_id: codeRow.user_id,
    referred_user_id: newUserId,
    attribution_method: method,
    plan: 'free',
    status: 'signed_up',
  });
}

// ---------------------------------------------------------------------------
// Attribution Status Updates
// ---------------------------------------------------------------------------

/**
 * Update attribution status when a user's plan changes (e.g. on invoice.paid).
 */
export async function updateAttributionOnPlanChange(
  userId: string,
  plan: string,
  isPaid: boolean,
): Promise<void> {
  const status = isPaid ? 'active_paid' : 'active_free';

  await supabaseAdmin
    .from('ff_affiliate_attributions')
    .update({ plan, status })
    .eq('referred_user_id', userId);
}

// ---------------------------------------------------------------------------
// Link Management
// ---------------------------------------------------------------------------

/**
 * Ensure an ff_affiliate_links row exists for a given referral code.
 * Returns the link ID, or null if the code doesn't exist.
 */
export async function ensureAffiliateLink(
  code: string,
  destinationUrl: string = '/',
): Promise<string | null> {
  // Check if link already exists
  const { data: existing } = await supabaseAdmin
    .from('ff_affiliate_links')
    .select('id')
    .eq('code', code)
    .eq('destination_url', destinationUrl)
    .single();

  if (existing) return existing.id;

  // Look up the code owner
  const { data: codeRow } = await supabaseAdmin
    .from('referral_codes')
    .select('user_id')
    .eq('code', code)
    .single();

  if (!codeRow) return null;

  // Create the link
  const { data: newLink } = await supabaseAdmin
    .from('ff_affiliate_links')
    .insert({
      affiliate_user_id: codeRow.user_id,
      code,
      destination_url: destinationUrl,
    })
    .select('id')
    .single();

  return newLink?.id || null;
}

// ---------------------------------------------------------------------------
// Referrer Lookup (for commission fallback)
// ---------------------------------------------------------------------------

/**
 * Look up the affiliate user_id for a referred user via the attributions table.
 * Used as a fallback when user_subscriptions.referred_by is missing.
 */
export async function getAffiliateForUser(
  referredUserId: string,
): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('ff_affiliate_attributions')
    .select('affiliate_user_id')
    .eq('referred_user_id', referredUserId)
    .single();

  return data?.affiliate_user_id || null;
}
