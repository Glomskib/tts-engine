import { apiError, generateCorrelationId } from "@/lib/api-errors";
import { NextResponse } from "next/server";
import { createVideoFromProduct, CreateVideoParams } from "@/lib/createVideoFromProduct";

export const runtime = "nodejs";

/**
 * POST /api/videos/create-from-product
 *
 * Creates a new video task from a product selection.
 * This is the main entrypoint for creating videos from the pipeline UI.
 */
export async function POST(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    const err = apiError("BAD_REQUEST", "Invalid JSON", 400);
    return NextResponse.json({ ...err.body, correlation_id: correlationId }, { status: err.status });
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
