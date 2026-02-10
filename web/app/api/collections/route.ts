import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";
import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { z } from "zod";

export const runtime = "nodejs";

const CreateCollectionSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  icon: z.string().max(50).optional(),
});

// GET: List user's collections
export async function GET(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("collections")
      .select(`
        *,
        item_count:collection_items(count)
      `)
      .eq("user_id", authContext.user.id)
      .order("updated_at", { ascending: false });

    if (error) {
      console.error(`[${correlationId}] Failed to fetch collections:`, error);
      return createApiErrorResponse("DB_ERROR", "Failed to fetch collections", 500, correlationId);
    }

    // Transform count result
    const collections = (data || []).map(c => ({
      ...c,
      item_count: Array.isArray(c.item_count) ? c.item_count[0]?.count || 0 : 0,
    }));

    return NextResponse.json({
      ok: true,
      data: collections,
      correlation_id: correlationId,
    });
  } catch (error) {
    console.error(`[${correlationId}] Collections error:`, error);
    return createApiErrorResponse("INTERNAL", "Failed to fetch collections", 500, correlationId);
  }
}

// POST: Create a new collection
export async function POST(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse("BAD_REQUEST", "Invalid JSON", 400, correlationId);
  }

  const parseResult = CreateCollectionSchema.safeParse(body);
  if (!parseResult.success) {
    const errors = parseResult.error.issues.map(e => `${e.path.join(".")}: ${e.message}`);
    return createApiErrorResponse("VALIDATION_ERROR", errors.join(", "), 400, correlationId);
  }

  const input = parseResult.data;

  try {
    const { data, error } = await supabaseAdmin
      .from("collections")
      .insert({
        name: input.name,
        description: input.description || null,
        color: input.color || "#8B5CF6",
        icon: input.icon || "folder",
        user_id: authContext.user.id,
      })
      .select()
      .single();

    if (error) {
      console.error(`[${correlationId}] Failed to create collection:`, error);
      return createApiErrorResponse("DB_ERROR", "Failed to create collection", 500, correlationId);
    }

    return NextResponse.json({
      ok: true,
      data,
      correlation_id: correlationId,
    });
  } catch (error) {
    console.error(`[${correlationId}] Create collection error:`, error);
    return createApiErrorResponse("INTERNAL", "Failed to create collection", 500, correlationId);
  }
}
