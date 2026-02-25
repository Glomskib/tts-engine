import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import {
  createApiErrorResponse,
  generateCorrelationId,
} from "@/lib/api-errors";
import { getEditorHealthSummary } from "@/lib/ops/editorStats";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const correlationId =
    request.headers.get("x-correlation-id") || generateCorrelationId();

  const auth = await getApiAuthContext(request);
  if (!auth.user) {
    return createApiErrorResponse(
      "UNAUTHORIZED",
      "Authentication required",
      401,
      correlationId,
    );
  }
  if (!auth.isAdmin) {
    return createApiErrorResponse(
      "FORBIDDEN",
      "Admin access required",
      403,
      correlationId,
    );
  }

  try {
    const summary = await getEditorHealthSummary();

    return NextResponse.json({
      ok: true,
      data: summary,
      correlation_id: correlationId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return createApiErrorResponse("INTERNAL", message, 500, correlationId);
  }
}
