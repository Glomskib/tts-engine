import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";

export const runtime = "nodejs";

/**
 * POST /api/admin/init-credits
 *
 * Admin-only endpoint to initialize credits for existing users who don't have
 * user_credits records. This is a one-time migration for users who signed up
 * before the credits system was implemented.
 */
export async function POST(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  // Get authentication context
  const authContext = await getApiAuthContext();
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  // Admin-only
  if (!authContext.isAdmin) {
    return createApiErrorResponse("FORBIDDEN", "Admin access required", 403, correlationId);
  }

  try {
    // Get all users from auth.users
    const { data: authUsers, error: authError } = await supabaseAdmin.auth.admin.listUsers();

    if (authError) {
      console.error(`[${correlationId}] Failed to list auth users:`, authError);
      return createApiErrorResponse("DB_ERROR", "Failed to list users", 500, correlationId);
    }

    const users = authUsers?.users || [];

    // Get all user_ids that already have credits
    const { data: existingCredits, error: creditsError } = await supabaseAdmin
      .from("user_credits")
      .select("user_id");

    if (creditsError) {
      console.error(`[${correlationId}] Failed to fetch existing credits:`, creditsError);
      return createApiErrorResponse("DB_ERROR", "Failed to fetch existing credits", 500, correlationId);
    }

    const existingUserIds = new Set((existingCredits || []).map(c => c.user_id));

    // Find users without credits
    const usersWithoutCredits = users.filter(u => !existingUserIds.has(u.id));

    if (usersWithoutCredits.length === 0) {
      return NextResponse.json({
        ok: true,
        message: "All users already have credits initialized",
        initialized: 0,
        total_users: users.length,
        correlation_id: correlationId,
      });
    }

    // Initialize credits for each user
    let initialized = 0;
    const errors: { user_id: string; email: string | undefined; error: string }[] = [];

    for (const user of usersWithoutCredits) {
      try {
        // Create subscription record (free plan)
        const { error: subError } = await supabaseAdmin
          .from("user_subscriptions")
          .upsert({
            user_id: user.id,
            plan_id: "free",
            status: "active",
          }, { onConflict: "user_id" });

        if (subError) {
          errors.push({ user_id: user.id, email: user.email, error: `Subscription: ${subError.message}` });
          continue;
        }

        // Create credits record
        const { error: creditError } = await supabaseAdmin
          .from("user_credits")
          .upsert({
            user_id: user.id,
            credits_remaining: 5,
            credits_used_this_period: 0,
            lifetime_credits_used: 0,
            free_credits_total: 5,
            free_credits_used: 0,
          }, { onConflict: "user_id" });

        if (creditError) {
          errors.push({ user_id: user.id, email: user.email, error: `Credits: ${creditError.message}` });
          continue;
        }

        // Log the initial credit grant
        await supabaseAdmin
          .from("credit_transactions")
          .insert({
            user_id: user.id,
            type: "bonus",
            amount: 5,
            balance_after: 5,
            description: "Welcome bonus - 5 free generations (migration)",
          });

        initialized++;
      } catch (err) {
        errors.push({
          user_id: user.id,
          email: user.email,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    return NextResponse.json({
      ok: true,
      message: `Initialized credits for ${initialized} users`,
      initialized,
      total_users: users.length,
      users_already_initialized: existingUserIds.size,
      errors: errors.length > 0 ? errors : undefined,
      correlation_id: correlationId,
    });
  } catch (err) {
    console.error(`[${correlationId}] Init credits error:`, err);
    return createApiErrorResponse("INTERNAL", "Failed to initialize credits", 500, correlationId);
  }
}

/**
 * GET /api/admin/init-credits
 *
 * Check the status of credits initialization
 */
export async function GET(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  // Get authentication context
  const authContext = await getApiAuthContext();
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  // Admin-only
  if (!authContext.isAdmin) {
    return createApiErrorResponse("FORBIDDEN", "Admin access required", 403, correlationId);
  }

  try {
    // Get all users from auth.users
    const { data: authUsers, error: authError } = await supabaseAdmin.auth.admin.listUsers();

    if (authError) {
      console.error(`[${correlationId}] Failed to list auth users:`, authError);
      return createApiErrorResponse("DB_ERROR", "Failed to list users", 500, correlationId);
    }

    const users = authUsers?.users || [];

    // Get all user_ids that have credits
    const { data: existingCredits, error: creditsError } = await supabaseAdmin
      .from("user_credits")
      .select("user_id");

    if (creditsError) {
      console.error(`[${correlationId}] Failed to fetch credits:`, creditsError);
      return createApiErrorResponse("DB_ERROR", "Failed to fetch credits", 500, correlationId);
    }

    const existingUserIds = new Set((existingCredits || []).map(c => c.user_id));
    const usersWithoutCredits = users.filter(u => !existingUserIds.has(u.id));

    return NextResponse.json({
      ok: true,
      total_users: users.length,
      users_with_credits: existingUserIds.size,
      users_without_credits: usersWithoutCredits.length,
      needs_migration: usersWithoutCredits.length > 0,
      users_needing_credits: usersWithoutCredits.map(u => ({
        id: u.id,
        email: u.email,
        created_at: u.created_at,
      })),
      correlation_id: correlationId,
    });
  } catch (err) {
    console.error(`[${correlationId}] Check credits status error:`, err);
    return createApiErrorResponse("INTERNAL", "Failed to check credits status", 500, correlationId);
  }
}
