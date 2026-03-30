/**
 * FlashFlow Render Entitlement
 *
 * Single source of truth for "can this user render a video right now?"
 *
 * Plans:
 *   ff_creator — $29/mo — 30 renders/mo
 *   ff_pro     — $79/mo — 100 renders/mo
 *   legacy plans (creator_pro, business, brand, agency) — unlimited
 *   free / no subscription — blocked
 *
 * Usage:
 *   const ent = await getRenderEntitlement(userId);
 *   if (!ent.canRender) return blocked(ent.upgradeMessage);
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { FF_RENDER_LIMITS } from '@/lib/plans';

export interface RenderEntitlement {
  canRender: boolean;
  planId: string;
  /** null = unlimited */
  rendersPerMonth: number | null;
  rendersUsed: number;
  /** null = unlimited */
  rendersRemaining: number | null;
  /** Set when canRender = false */
  upgradeMessage?: string;
  upgradeUrl?: string;
}

/**
 * Fetch the render entitlement for a user.
 * Queries user_subscriptions once. Fast path for active paid subscribers.
 */
export async function getRenderEntitlement(userId: string): Promise<RenderEntitlement> {
  const { data: sub, error } = await supabaseAdmin
    .from('user_subscriptions')
    .select('plan_id, status, ff_renders_per_month, ff_renders_used_this_month')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('[render-entitlement] DB error:', error.message);
  }

  // No subscription found — block with upgrade prompt
  if (!sub) {
    return noSubscription();
  }

  // Inactive subscription — block
  if (sub.status && !['active', 'trialing'].includes(sub.status)) {
    return {
      canRender: false,
      planId: sub.plan_id || 'free',
      rendersPerMonth: 0,
      rendersUsed: 0,
      rendersRemaining: 0,
      upgradeMessage: `Your subscription is ${sub.status}. Please update your billing to continue rendering.`,
      upgradeUrl: '/admin/billing',
    };
  }

  const planId = sub.plan_id || 'free';
  const limitFromPlan = FF_RENDER_LIMITS[planId];

  // Plan not in render limits map — treat as blocked (free users, unknown plans)
  if (limitFromPlan === undefined || limitFromPlan === 0) {
    return noSubscription(planId);
  }

  // Unlimited — no tracking needed
  if (limitFromPlan === -1) {
    return {
      canRender: true,
      planId,
      rendersPerMonth: null,
      rendersUsed: sub.ff_renders_used_this_month ?? 0,
      rendersRemaining: null,
    };
  }

  // Metered plan: use DB column if available, fall back to plan definition
  const limit: number = sub.ff_renders_per_month ?? limitFromPlan;
  const used: number = sub.ff_renders_used_this_month ?? 0;
  const remaining = Math.max(0, limit - used);
  const canRender = remaining > 0;

  return {
    canRender,
    planId,
    rendersPerMonth: limit,
    rendersUsed: used,
    rendersRemaining: remaining,
    ...(canRender
      ? {}
      : {
          upgradeMessage: `You've used all ${limit} renders for this billing period. Upgrade to Pro for 100 renders/month, or wait for your period to reset.`,
          upgradeUrl: '/upgrade',
        }),
  };
}

/**
 * Atomically increment the render count after a successful render.
 * Non-fatal — logs error but does not throw.
 */
export async function incrementRenderCount(userId: string): Promise<void> {
  const { error } = await supabaseAdmin.rpc('increment_ff_render', {
    p_user_id: userId,
  });
  if (error) {
    console.error('[render-entitlement] Failed to increment render count:', error.message);
  }
}

/**
 * Reset the monthly render count (called from webhook on invoice.paid).
 * Non-fatal.
 */
export async function resetRenderCount(userId: string): Promise<void> {
  const { error } = await supabaseAdmin.rpc('reset_ff_renders', {
    p_user_id: userId,
  });
  if (error) {
    console.error('[render-entitlement] Failed to reset render count:', error.message);
  }
}

// ─── helpers ───────────────────────────────────────────────────────────────

function noSubscription(planId = 'free'): RenderEntitlement {
  return {
    canRender: false,
    planId,
    rendersPerMonth: 0,
    rendersUsed: 0,
    rendersRemaining: 0,
    upgradeMessage:
      'A FlashFlow Creator or Pro plan is required to render videos. Choose a plan to get started.',
    upgradeUrl: '/upgrade',
  };
}
