import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { createApiErrorResponse, generateCorrelationId } from "@/lib/api-errors";
import { getUserPlan, type PlanType } from "@/lib/subscription";

export const runtime = "nodejs";

interface UserWithPlan {
  user_id: string;
  email: string | null;
  role: string | null;
  created_at: string | null;
  plan: PlanType;
  is_active: boolean;
}

/**
 * GET /api/admin/users
 * Admin-only endpoint to list all users with their subscription plan status.
 */
export async function GET(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  // Get authentication context
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  // Admin-only
  if (!authContext.isAdmin) {
    return createApiErrorResponse("FORBIDDEN", "Admin access required", 403, correlationId);
  }

  try {
    // Fetch all user profiles
    const { data: profiles, error: profilesError } = await supabaseAdmin
      .from("user_profiles")
      .select("user_id, role, created_at")
      .order("created_at", { ascending: false });

    if (profilesError) {
      console.error("Failed to fetch user profiles:", profilesError);
      return createApiErrorResponse("DB_ERROR", "Failed to fetch users", 500, correlationId);
    }

    // Get email for each user and their plan status
    const usersWithPlans: UserWithPlan[] = [];

    for (const profile of profiles || []) {
      let email: string | null = null;

      // Try to get email from Supabase auth
      try {
        const { data: { user } } = await supabaseAdmin.auth.admin.getUserById(profile.user_id);
        email = user?.email || null;
      } catch {
        // Ignore auth lookup errors
      }

      // Get plan status
      const planStatus = await getUserPlan(profile.user_id);

      usersWithPlans.push({
        user_id: profile.user_id,
        email,
        role: profile.role,
        created_at: profile.created_at,
        plan: planStatus.plan as PlanType,
        is_active: planStatus.isActive,
      });
    }

    return NextResponse.json({
      ok: true,
      data: {
        users: usersWithPlans,
      },
      correlation_id: correlationId,
    });
  } catch (err) {
    console.error("GET /api/admin/users error:", err);
    return createApiErrorResponse("DB_ERROR", "Internal server error", 500, correlationId);
  }
}
