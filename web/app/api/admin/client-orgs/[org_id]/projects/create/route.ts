import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";
import { apiError, generateCorrelationId } from "@/lib/api-errors";
import { PROJECT_EVENT_TYPES, listOrgProjects } from "@/lib/client-projects";
import { getOrgPlan, isPaidOrgPlan } from "@/lib/subscription";
import { randomUUID } from "crypto";

// Free org project limit
const FREE_ORG_MAX_PROJECTS = 1;

export const runtime = "nodejs";

/**
 * POST /api/admin/client-orgs/[org_id]/projects/create
 * Create a new project for an organization
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ org_id: string }> }
) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();
  const { org_id: orgId } = await params;

  // Require authentication
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    const err = apiError("UNAUTHORIZED", "Authentication required", 401);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  // Check admin role
  if (authContext.role !== "admin") {
    const err = apiError("FORBIDDEN", "Admin access required", 403);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  // Validate org_id format
  if (!orgId || !orgId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
    const err = apiError("BAD_REQUEST", "Invalid organization ID format", 400);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  try {
    const body = await request.json();
    const { project_name } = body;

    if (!project_name || typeof project_name !== "string" || project_name.trim().length === 0) {
      const err = apiError("BAD_REQUEST", "project_name is required", 400);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    const trimmedName = project_name.trim();
    if (trimmedName.length > 100) {
      const err = apiError("BAD_REQUEST", "project_name must be 100 characters or less", 400);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    // Check org plan for project limits
    const orgPlanInfo = await getOrgPlan(supabaseAdmin, orgId);
    const isPaidOrg = isPaidOrgPlan(orgPlanInfo.plan);

    // Free orgs are limited to 1 active project
    if (!isPaidOrg) {
      const existingProjects = await listOrgProjects(supabaseAdmin, orgId, { includeArchived: false });
      if (existingProjects.length >= FREE_ORG_MAX_PROJECTS) {
        return NextResponse.json({
          ok: false,
          error: "org_plan_limit",
          message: `Free plan allows ${FREE_ORG_MAX_PROJECTS} active project. Upgrade to Pro for unlimited projects.`,
          correlation_id: correlationId,
        }, { status: 403 });
      }
    }

    // Generate a new project ID
    const projectId = randomUUID();

    // Insert project creation event in events_log
    const { error: eventError } = await supabaseAdmin
      .from("events_log")
      .insert({
        entity_type: "client_project",
        entity_id: projectId,
        event_type: PROJECT_EVENT_TYPES.PROJECT_CREATED,
        payload: {
          org_id: orgId,
          project_name: trimmedName,
          created_by_user_id: authContext.user.id,
        },
      });

    if (eventError) {
      console.error("[admin/projects/create] Event insert error:", eventError);
      const err = apiError("DB_ERROR", "Failed to create project", 500);
      return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
    }

    return NextResponse.json({
      ok: true,
      data: {
        project_id: projectId,
        project_name: trimmedName,
        org_id: orgId,
      },
    });
  } catch (err) {
    console.error("[admin/projects/create] Error:", err);
    const apiErr = apiError("DB_ERROR", "Internal server error", 500);
    return NextResponse.json({ ...apiErr.body, correlation_id: correlationId }, { status: apiErr.status });
  }
}
