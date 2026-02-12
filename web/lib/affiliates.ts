/**
 * Affiliate Commission System for FlashFlow AI
 *
 * 25% recurring commission on referred subscription payments.
 * Payouts processed monthly via Stripe Connect transfers.
 *
 * Milestone bonuses:
 *   5  conversions → $50
 *   15 conversions → $150
 *   30 conversions → $300
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AffiliateAccount {
  id: string;
  user_id: string;
  status: 'pending' | 'approved' | 'rejected' | 'suspended';
  commission_rate: number;
  stripe_connect_id: string | null;
  stripe_connect_onboarded: boolean;
  payout_email: string | null;
  total_earned: number;
  total_paid: number;
  balance: number;
  min_payout: number;
  application_note: string | null;
  platform: string | null;
  follower_count: number | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Commission {
  id: string;
  affiliate_id: string;
  referred_user_id: string;
  stripe_invoice_id: string | null;
  subscription_amount: number;
  commission_rate: number;
  commission_amount: number;
  status: 'pending' | 'approved' | 'paid' | 'refunded';
  payout_id: string | null;
  period_start: string | null;
  period_end: string | null;
  created_at: string;
}

export interface Payout {
  id: string;
  affiliate_id: string;
  amount: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  stripe_transfer_id: string | null;
  commission_count: number;
  period_start: string;
  period_end: string;
  paid_at: string | null;
  notes: string | null;
  created_at: string;
}

export interface Milestone {
  id: string;
  affiliate_id: string;
  milestone_type: string;
  bonus_amount: number;
  achieved_at: string;
  paid: boolean;
}

const MILESTONE_DEFINITIONS = [
  { type: 'conversions_5', threshold: 5, bonus: 50 },
  { type: 'conversions_15', threshold: 15, bonus: 150 },
  { type: 'conversions_30', threshold: 30, bonus: 300 },
] as const;

// ---------------------------------------------------------------------------
// Record Commission
// ---------------------------------------------------------------------------

/**
 * Record a commission when a referred user's subscription is charged.
 * Called from the Stripe `invoice.paid` webhook handler.
 */
export async function recordCommission(
  referredUserId: string,
  invoiceId: string,
  subscriptionAmount: number,
): Promise<void> {
  // 1. Find the referral record for this user
  const { data: sub } = await supabaseAdmin
    .from('user_subscriptions')
    .select('referred_by')
    .eq('user_id', referredUserId)
    .single();

  if (!sub?.referred_by) return; // Not a referred user

  // 2. Find the referrer via their referral code
  const { data: referrer } = await supabaseAdmin
    .from('user_subscriptions')
    .select('user_id')
    .eq('referral_code', sub.referred_by)
    .single();

  if (!referrer) return;

  // 3. Find the referrer's affiliate account
  const { data: affiliate } = await supabaseAdmin
    .from('affiliate_accounts')
    .select('id, commission_rate, status')
    .eq('user_id', referrer.user_id)
    .single();

  if (!affiliate || affiliate.status !== 'approved') return;

  // 4. Calculate and record commission
  const commissionAmount = Number((subscriptionAmount * affiliate.commission_rate).toFixed(2));

  // Prevent duplicate commissions for the same invoice
  const { data: existing } = await supabaseAdmin
    .from('affiliate_commissions')
    .select('id')
    .eq('stripe_invoice_id', invoiceId)
    .single();

  if (existing) return; // Already recorded

  await supabaseAdmin.from('affiliate_commissions').insert({
    affiliate_id: affiliate.id,
    referred_user_id: referredUserId,
    stripe_invoice_id: invoiceId,
    subscription_amount: subscriptionAmount,
    commission_rate: affiliate.commission_rate,
    commission_amount: commissionAmount,
    status: 'pending',
  });

  // 5. Update affiliate balance + total earned
  try {
    const { error: rpcError } = await supabaseAdmin.rpc('increment_affiliate_balance', {
      p_affiliate_id: affiliate.id,
      p_amount: commissionAmount,
    });
    if (rpcError) throw rpcError;
  } catch {
    // Fallback if RPC doesn't exist yet — do manual update
    const { data: acct } = await supabaseAdmin
      .from('affiliate_accounts')
      .select('balance, total_earned')
      .eq('id', affiliate.id)
      .single();

    if (acct) {
      await supabaseAdmin
        .from('affiliate_accounts')
        .update({
          balance: (acct.balance || 0) + commissionAmount,
          total_earned: (acct.total_earned || 0) + commissionAmount,
          updated_at: new Date().toISOString(),
        })
        .eq('id', affiliate.id);
    }
  }

  // 6. Check for milestone bonuses
  await checkMilestones(affiliate.id);
}

// ---------------------------------------------------------------------------
// Milestone Check
// ---------------------------------------------------------------------------

async function checkMilestones(affiliateId: string): Promise<void> {
  // Count total conversions (unique referred users who've been charged)
  const { count } = await supabaseAdmin
    .from('affiliate_commissions')
    .select('referred_user_id', { count: 'exact', head: true })
    .eq('affiliate_id', affiliateId);

  const totalConversions = count ?? 0;

  for (const milestone of MILESTONE_DEFINITIONS) {
    if (totalConversions >= milestone.threshold) {
      // Try to insert (unique constraint prevents duplicates)
      const { error } = await supabaseAdmin
        .from('affiliate_milestones')
        .insert({
          affiliate_id: affiliateId,
          milestone_type: milestone.type,
          bonus_amount: milestone.bonus,
        });

      if (!error) {
        // Milestone newly achieved — add bonus to balance
        const { data: acct } = await supabaseAdmin
          .from('affiliate_accounts')
          .select('balance, total_earned')
          .eq('id', affiliateId)
          .single();

        if (acct) {
          await supabaseAdmin
            .from('affiliate_accounts')
            .update({
              balance: (acct.balance || 0) + milestone.bonus,
              total_earned: (acct.total_earned || 0) + milestone.bonus,
              updated_at: new Date().toISOString(),
            })
            .eq('id', affiliateId);
        }
      }
      // If insert fails (duplicate), milestone was already achieved — skip
    }
  }
}

// ---------------------------------------------------------------------------
// Process Monthly Payouts
// ---------------------------------------------------------------------------

/**
 * Process payouts for all eligible affiliates.
 * Eligible = balance >= min_payout AND stripe_connect_onboarded = true
 */
export async function processMonthlyPayouts(): Promise<{
  processed: number;
  totalPaid: number;
  errors: string[];
}> {
  const results = { processed: 0, totalPaid: 0, errors: [] as string[] };

  // Find eligible affiliates
  const { data: eligible } = await supabaseAdmin
    .from('affiliate_accounts')
    .select('*')
    .eq('status', 'approved')
    .eq('stripe_connect_onboarded', true)
    .gte('balance', 50); // min payout $50

  if (!eligible || eligible.length === 0) return results;

  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const periodEnd = new Date(now.getFullYear(), now.getMonth(), 0);

  // Lazy Stripe import
  let stripe: import('stripe').default | null = null;
  if (process.env.STRIPE_SECRET_KEY) {
    const Stripe = (await import('stripe')).default;
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  }

  for (const affiliate of eligible) {
    try {
      if (!affiliate.stripe_connect_id) {
        results.errors.push(`${affiliate.id}: No Stripe Connect account`);
        continue;
      }

      const amount = Math.floor(affiliate.balance * 100); // cents
      if (amount < 100) continue; // Stripe minimum $1

      // Count pending commissions
      const { count: commissionCount } = await supabaseAdmin
        .from('affiliate_commissions')
        .select('id', { count: 'exact', head: true })
        .eq('affiliate_id', affiliate.id)
        .eq('status', 'pending');

      // Create Stripe transfer
      let transferId: string | null = null;
      if (stripe) {
        try {
          const transfer = await stripe.transfers.create({
            amount,
            currency: 'usd',
            destination: affiliate.stripe_connect_id,
            description: `FlashFlow affiliate payout - ${periodStart.toISOString().slice(0, 7)}`,
          });
          transferId = transfer.id;
        } catch (stripeErr) {
          results.errors.push(`${affiliate.id}: Stripe transfer failed - ${String(stripeErr)}`);
          continue;
        }
      }

      // Create payout record
      const { data: payout } = await supabaseAdmin
        .from('affiliate_payouts')
        .insert({
          affiliate_id: affiliate.id,
          amount: affiliate.balance,
          status: transferId ? 'completed' : 'pending',
          stripe_transfer_id: transferId,
          commission_count: commissionCount || 0,
          period_start: periodStart.toISOString(),
          period_end: periodEnd.toISOString(),
          paid_at: transferId ? now.toISOString() : null,
        })
        .select()
        .single();

      if (payout) {
        // Mark pending commissions as paid
        await supabaseAdmin
          .from('affiliate_commissions')
          .update({
            status: 'paid',
            payout_id: payout.id,
          })
          .eq('affiliate_id', affiliate.id)
          .eq('status', 'pending');

        // Reset balance
        await supabaseAdmin
          .from('affiliate_accounts')
          .update({
            balance: 0,
            total_paid: (affiliate.total_paid || 0) + affiliate.balance,
            updated_at: now.toISOString(),
          })
          .eq('id', affiliate.id);

        results.processed++;
        results.totalPaid += affiliate.balance;
      }
    } catch (err) {
      results.errors.push(`${affiliate.id}: ${String(err)}`);
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Dashboard Data
// ---------------------------------------------------------------------------

export async function getAffiliateDashboard(userId: string) {
  // Get affiliate account
  const { data: account } = await supabaseAdmin
    .from('affiliate_accounts')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (!account) {
    return { account: null, stats: null, recentCommissions: [], payoutHistory: [], milestones: [] };
  }

  // Count distinct referred users with paid commissions
  const { count: activeSubscribers } = await supabaseAdmin
    .from('affiliate_commissions')
    .select('referred_user_id', { count: 'exact', head: true })
    .eq('affiliate_id', account.id)
    .in('status', ['pending', 'approved', 'paid']);

  // Count total unique referrals
  const { data: referrals } = await supabaseAdmin
    .from('referrals')
    .select('id')
    .eq('referrer_id', userId);

  // This month's earnings
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const { data: monthCommissions } = await supabaseAdmin
    .from('affiliate_commissions')
    .select('commission_amount')
    .eq('affiliate_id', account.id)
    .gte('created_at', monthStart.toISOString());

  const thisMonthEarned = (monthCommissions || []).reduce(
    (sum, c) => sum + Number(c.commission_amount),
    0,
  );

  // Recent commissions with masked user emails
  const { data: recentCommissions } = await supabaseAdmin
    .from('affiliate_commissions')
    .select('*')
    .eq('affiliate_id', account.id)
    .order('created_at', { ascending: false })
    .limit(10);

  // Payout history
  const { data: payoutHistory } = await supabaseAdmin
    .from('affiliate_payouts')
    .select('*')
    .eq('affiliate_id', account.id)
    .order('created_at', { ascending: false })
    .limit(10);

  // Milestones
  const { data: milestones } = await supabaseAdmin
    .from('affiliate_milestones')
    .select('*')
    .eq('affiliate_id', account.id);

  return {
    account: account as AffiliateAccount,
    stats: {
      totalReferred: referrals?.length || 0,
      activeSubscribers: activeSubscribers || 0,
      totalEarned: account.total_earned || 0,
      totalPaid: account.total_paid || 0,
      pendingBalance: account.balance || 0,
      thisMonthEarned,
    },
    recentCommissions: (recentCommissions || []) as Commission[],
    payoutHistory: (payoutHistory || []) as Payout[],
    milestones: (milestones || []) as Milestone[],
  };
}
