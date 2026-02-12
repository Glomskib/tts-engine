import { createApiErrorResponse, generateCorrelationId } from "@/lib/api-errors";
import { NextResponse } from "next/server";
import { createVideoFromProduct, CreateVideoParams } from "@/lib/createVideoFromProduct";
import { getApiAuthContext } from "@/lib/supabase/api-auth";

export const runtime = "nodejs";

/**
 * POST /api/videos/create-from-product
 *
 * Creates a new video task from a product selection.
 * This is the main entrypoint for creating videos from the pipeline UI.
 */
export async function POST(request: Request) {
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse("BAD_REQUEST", "Invalid JSON", 400, correlationId);
  }

  const params = body as CreateVideoParams;
  const result = await createVideoFromProduct(params, correlationId);

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
