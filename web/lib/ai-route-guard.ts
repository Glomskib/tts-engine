/**
 * AI Route Guard
 *
 * Drop-in middleware for every AI generation endpoint.
 * Enforces in one call:
 *   1. Authentication
 *   2. Per-user rate limit (configurable, default 8/min)
 *   3. Credit balance check
 *   4. Returns typed upgrade payloads so the UI knows what to show
 *
 * Usage:
 *   const guard = await aiRouteGuard(request, { creditCost: 3 });
 *   if (guard.error) return guard.error;
 *   const { userId, isAdmin } = guard;
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { enforceRateLimits } from '@/lib/rate-limit';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';

export interface AiGuardOptions {
  /** AI credit cost for this operation. Default: 1. */
  creditCost?: number;
  /** Max requests per minute per user. Default: 8. */
  userLimit?: number;
  /** Max requests per minute per org (shared with user if no org). Default: 30. */
  orgLimit?: number;
  /** Skip credit check (for admin or free-tier operations). Default: false. */
  skipCreditCheck?: boolean;
}

export interface AiGuardSuccess {
  error: null;
  userId: string;
  userEmail: string | undefined;
  isAdmin: boolean;
  planId: string;
  correlationId: string;
}

export interface AiGuardFailure {
  error: NextResponse;
}

export type AiGuardResult = AiGuardSuccess | AiGuardFailure;

export async function aiRouteGuard(
  request: Request,
  options: AiGuardOptions = {},
): Promise<AiGuardResult> {
  const {
    creditCost = 1,
    userLimit = 8,
    orgLimit = 30,
    skipCreditCheck = false,
  } = options;

  const correlationId = generateCorrelationId();

  // 1. Auth
  const auth = await getApiAuthContext(request);
  if (!auth.user) {
    return {
      error: createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId),
    };
  }

  // 2. Rate limit
  const rateLimitError = enforceRateLimits(
    { userId: auth.user.id },
    correlationId,
    { userLimit, orgLimit },
  );
  if (rateLimitError) return { error: rateLimitError };

  // 3. Plan lookup
  let planId = 'free';
  try {
    const { data: sub } = await supabaseAdmin
      .from('user_subscriptions')
      .select('plan_id')
      .eq('user_id', auth.user.id)
      .single();
    planId = sub?.plan_id ?? 'free';
  } catch {
    // non-fatal — default to free
  }

  // 4. Credit check (admin bypasses)
  if (!skipCreditCheck && !auth.isAdmin) {
    try {
      const { data: credits } = await supabaseAdmin
        .from('user_credits')
        .select('credits_remaining')
        .eq('user_id', auth.user.id)
        .single();

      const remaining = credits?.credits_remaining ?? 0;
      if (remaining < creditCost) {
        return {
          error: NextResponse.json(
            {
              ok: false,
              error: 'Insufficient credits. Upgrade your plan to continue.',
              error_code: 'INSUFFICIENT_CREDITS',
              credits_remaining: remaining,
              credits_required: creditCost,
              upgrade: true,
              upgrade_url: '/admin/billing',
              correlation_id: correlationId,
            },
            { status: 402 },
          ),
        };
      }
    } catch {
      // non-fatal — allow through if credits table is unavailable
    }
  }

  return {
    error: null,
    userId: auth.user.id,
    userEmail: auth.user.email,
    isAdmin: auth.isAdmin,
    planId,
    correlationId,
  };
}
