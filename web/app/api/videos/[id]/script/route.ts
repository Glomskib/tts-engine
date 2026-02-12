/**
 * GET/POST /api/videos/[id]/script
 *
 * GET: Returns current script version + lock status + history
 * POST: Creates a new script version
 *
 * Lock semantics:
 * - If current version is locked, POST returns SCRIPT_LOCKED error
 * - Use force_new_version=true to create new version even if locked
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createApiErrorResponse, generateCorrelationId, type ApiErrorCode } from "@/lib/api-errors";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import {
  getCurrentScriptVersion,
  getScriptVersionHistory,
  createScriptVersion,
  type ScriptVersionContent,
} from "@/lib/video-script-versions";
import { lintScriptAndCaption, isValidPolicyPack, type PolicyPack } from "@/lib/compliance-linter";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/videos/[id]/script
 *
 * Returns:
 * - current_version: Current script version (or null)
 * - is_locked: Whether current version is locked
 * - version_count: Total versions for this video
 * - history: Recent version history (optional, with ?include_history=true)
 * - compliance: Lint results (optional, with ?lint=true)
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id: videoId } = await params;
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  // Validate UUID
  if (!UUID_REGEX.test(videoId)) {
    return createApiErrorResponse("INVALID_UUID", "Invalid video ID format", 400, correlationId);
  }

  // Check video exists
  const { data: video, error: videoError } = await supabaseAdmin
    .from("videos")
    .select("id, status")
    .eq("id", videoId)
    .single();

  if (videoError || !video) {
    return createApiErrorResponse("NOT_FOUND", "Video not found", 404, correlationId);
  }

  // Get current script info
  const scriptInfo = await getCurrentScriptVersion(supabaseAdmin, videoId);

  // Parse query params
  const url = new URL(request.url);
  const includeHistory = url.searchParams.get("include_history") === "true";
  const runLint = url.searchParams.get("lint") === "true";
  const policyPack = url.searchParams.get("policy_pack") || "generic";

  // Optionally include history
  let history = undefined;
  if (includeHistory) {
    history = await getScriptVersionHistory(supabaseAdmin, videoId, 20);
  }

  // Optionally run compliance lint
  let compliance = undefined;
  if (runLint && scriptInfo.current_version) {
    const pack = isValidPolicyPack(policyPack) ? policyPack : "generic";
    compliance = lintScriptAndCaption({
      script_text: scriptInfo.current_version.script_text,
      caption: scriptInfo.current_version.caption,
      hashtags: scriptInfo.current_version.hashtags,
      policy_pack: pack,
    });
  }

  return NextResponse.json({
    ok: true,
    data: {
      video_id: videoId,
      video_status: video.status,
      current_version: scriptInfo.current_version,
      is_locked: scriptInfo.is_locked,
      version_count: scriptInfo.version_count,
      history,
      compliance,
    },
    correlation_id: correlationId,
  });
}

/**
 * POST /api/videos/[id]/script
 *
 * Request body:
 * - script_text: string (optional)
 * - caption: string (optional)
 * - hashtags: string[] (optional)
 * - product_sku: string (optional)
 * - product_link: string (optional)
 * - compliance_notes: string (optional)
 * - force_new_version: boolean (default false) - create new version even if current is locked
 * - lint: boolean (default false) - run compliance lint before saving
 * - policy_pack: string (default "generic") - policy pack for linting
 *
 * Returns the new script version.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id: videoId } = await params;
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  // Validate UUID
  if (!UUID_REGEX.test(videoId)) {
    return createApiErrorResponse("INVALID_UUID", "Invalid video ID format", 400, correlationId);
  }

  // Get auth context
  const authContext = await getApiAuthContext(request);
  const actor = authContext.user?.id || request.headers.get("x-actor") || "api";

  // Parse body
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse("BAD_REQUEST", "Invalid JSON", 400, correlationId);
  }

  const {
    script_text,
    caption,
    hashtags,
    product_sku,
    product_link,
    compliance_notes,
    force_new_version,
    lint,
    policy_pack,
  } = body;

  // Validate content - at least one field should be provided
  const content: ScriptVersionContent = {
    script_text: typeof script_text === "string" ? script_text : null,
    caption: typeof caption === "string" ? caption : null,
    hashtags: Array.isArray(hashtags) ? hashtags.filter((h): h is string => typeof h === "string") : null,
    product_sku: typeof product_sku === "string" ? product_sku : null,
    product_link: typeof product_link === "string" ? product_link : null,
    compliance_notes: typeof compliance_notes === "string" ? compliance_notes : null,
  };

  const hasContent = Object.values(content).some((v) => v !== null && (typeof v !== "object" || (v as string[]).length > 0));
  if (!hasContent) {
    return createApiErrorResponse("BAD_REQUEST", "At least one content field is required", 400, correlationId);
  }

  // Optionally run compliance lint before saving
  let compliance = undefined;
  if (lint === true) {
    const pack = (typeof policy_pack === "string" && isValidPolicyPack(policy_pack))
      ? policy_pack as PolicyPack
      : "generic";

    compliance = lintScriptAndCaption({
      script_text: content.script_text,
      caption: content.caption,
      hashtags: content.hashtags,
      policy_pack: pack,
    });

    // If lint blocks, reject the save
    if (compliance.severity === "block") {
      return createApiErrorResponse("VALIDATION_ERROR", "Content blocked by compliance linter", 400, correlationId, {
        compliance,
      });
    }
  }

  // Create the version
  const result = await createScriptVersion(supabaseAdmin, {
    video_id: videoId,
    content,
    actor,
    correlation_id: correlationId,
    force_new_version: force_new_version === true,
  });

  if (!result.ok) {
    const errorMap: Record<string, { code: ApiErrorCode; status: number }> = {
      NOT_FOUND: { code: "NOT_FOUND", status: 404 },
      SCRIPT_LOCKED: { code: "SCRIPT_ALREADY_LOCKED", status: 409 },
      DB_ERROR: { code: "DB_ERROR", status: 500 },
    };

    const errorInfo = errorMap[result.error_code || "DB_ERROR"] || { code: "DB_ERROR" as ApiErrorCode, status: 500 };
    return createApiErrorResponse(errorInfo.code, result.message, errorInfo.status, correlationId);
  }

  return NextResponse.json({
    ok: true,
    data: result.version,
    meta: {
      message: result.message,
      compliance,
    },
    correlation_id: correlationId,
  });
}
