import { apiError, generateCorrelationId } from "@/lib/api-errors";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { NextResponse } from "next/server";
import { createVideoFromProduct, type CreateVideoParams } from "@/lib/createVideoFromProduct";

export const runtime = "nodejs";

/**
 * POST /api/videos/admin
 *
 * Canonical admin endpoint for creating videos.
 * Calls the same internal function as /api/videos/create-from-product.
 *
 * This endpoint is admin-only and should be protected by middleware.
 */
export async function POST(request: Request) {
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!authContext.isAdmin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    const err = apiError("BAD_REQUEST", "Invalid JSON", 400);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
  }

  const params = body as CreateVideoParams;
  const result = await createVideoFromProduct(params, correlationId, "admin");

  if (!result.ok) {
    const statusCode = result.error_code === "NOT_FOUND" ? 404 :
                       result.error_code === "VALIDATION_ERROR" ? 400 : 500;
    return NextResponse.json({
      ok: false,
      error: result.error,
      error_code: result.error_code,
      correlation_id: correlationId,
    }, { status: statusCode });
  }

  return NextResponse.json(result);
}
