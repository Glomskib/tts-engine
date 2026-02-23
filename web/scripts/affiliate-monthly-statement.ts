/**
 * Affiliate Monthly Statement Generator
 *
 * For each approved affiliate, calculates commissions for the previous month
 * and upserts a payout record in affiliate_payouts.
 *
 * Usage: npm run job:affiliate-statement
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function run() {
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const periodEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
  const monthKey = `${periodStart.getFullYear()}-${String(periodStart.getMonth() + 1).padStart(2, '0')}`;

  console.log(`[affiliate-statement] Generating statements for ${monthKey}`);
  console.log(`  Period: ${periodStart.toISOString()} → ${periodEnd.toISOString()}`);

  // Get all approved affiliates
  const { data: affiliates, error: affErr } = await supabase
    .from('affiliate_accounts')
    .select('id, user_id, balance')
    .eq('status', 'approved');

  if (affErr) {
    console.error('Failed to fetch affiliates:', affErr.message);
    process.exit(1);
  }

  if (!affiliates || affiliates.length === 0) {
    console.log('No approved affiliates found.');
    return;
  }

  console.log(`Found ${affiliates.length} approved affiliate(s)`);

  let created = 0;
  let skipped = 0;

  for (const affiliate of affiliates) {
    // Count active_paid attributions for this month
    const { count: attrCount } = await supabase
      .from('ff_affiliate_attributions')
      .select('id', { count: 'exact', head: true })
      .eq('affiliate_user_id', affiliate.user_id)
      .eq('status', 'active_paid')
      .gte('signup_ts', periodStart.toISOString())
      .lte('signup_ts', periodEnd.toISOString());

    // Sum commissions for this month
    const { data: commissions } = await supabase
      .from('affiliate_commissions')
      .select('commission_amount')
      .eq('affiliate_id', affiliate.id)
      .gte('created_at', periodStart.toISOString())
      .lte('created_at', periodEnd.toISOString());

    const totalCommissions = (commissions || []).reduce(
      (sum, c) => sum + Number(c.commission_amount),
      0,
    );

    const commissionCount = commissions?.length || 0;

    if (totalCommissions === 0 && (attrCount || 0) === 0) {
      skipped++;
      continue;
    }

    // Check if payout record already exists for this period
    const { data: existing } = await supabase
      .from('affiliate_payouts')
      .select('id')
      .eq('affiliate_id', affiliate.id)
      .gte('period_start', periodStart.toISOString())
      .lte('period_start', new Date(periodStart.getTime() + 24 * 60 * 60 * 1000).toISOString())
      .single();

    if (existing) {
      // Update existing
      await supabase
        .from('affiliate_payouts')
        .update({
          amount: totalCommissions,
          commission_count: commissionCount,
          notes: `${attrCount || 0} paid attributions in ${monthKey}`,
        })
        .eq('id', existing.id);

      console.log(`  Updated payout for affiliate ${affiliate.id}: $${totalCommissions.toFixed(2)} (${commissionCount} commissions, ${attrCount || 0} attributions)`);
    } else {
      // Create new
      await supabase
        .from('affiliate_payouts')
        .insert({
          affiliate_id: affiliate.id,
          amount: totalCommissions,
          status: 'pending',
          commission_count: commissionCount,
          period_start: periodStart.toISOString(),
          period_end: periodEnd.toISOString(),
          notes: `${attrCount || 0} paid attributions in ${monthKey}`,
        });

      console.log(`  Created payout for affiliate ${affiliate.id}: $${totalCommissions.toFixed(2)} (${commissionCount} commissions, ${attrCount || 0} attributions)`);
    }

    created++;
  }

  console.log(`\nDone: ${created} statement(s) created/updated, ${skipped} skipped (no activity)`);
}

run().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
