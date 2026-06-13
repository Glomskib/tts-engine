import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";
import { createApiErrorResponse, generateCorrelationId } from "@/lib/api-errors";
import { getApiAuthContext } from "@/lib/supabase/api-auth";

export const runtime = "nodejs";

/**
 * GET /api/teleprompter/scripts
 *
 * Lists the logged-in user's saved scripts for the in-studio teleprompter
 * picker. Thin, stable contract — `[{ id, title, text }]`, newest first —
 * so the studio overlay never has to know about the wider `scripts` row
 * shape (script_json / on_screen_text / hashtags / status…).
 *
 * Source of truth: the user-scoped `scripts` table (NOT `script_library`,
 * which is brand-keyed and shared, not "my saved scripts"). Ownership +
 * ordering mirror GET /api/scripts exactly: rows are filtered by
 * `created_by = user.id` (admins see all) and ordered created_at desc.
 *
 * `text` prefers `spoken_script` (the plain words to read aloud — what
 * save-to-studio writes) and falls back to `script_text` (the rendered
 * full script) so older rows that predate spoken_script still load.
 */
export async function GET(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  const auth = await getApiAuthContext(request);
  if (!auth.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  // Only the columns the picker needs — keeps the payload small even when a
  // user has dozens of long scripts saved.
  let query = supabaseAdmin
    .from("scripts")
    .select("id, title, spoken_script, script_text, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  // Same ownership rule as GET /api/scripts: admins see all, everyone else
  // only their own scripts.
  if (!auth.isAdmin) {
    query = query.eq("created_by", auth.user.id);
  }

  const { data, error } = await query;

  if (error) {
    return createApiErrorResponse("DB_ERROR", error.message, 500, correlationId);
  }

  type ScriptRow = {
    id: string;
    title: string | null;
    spoken_script: string | null;
    script_text: string | null;
    created_at: string | null;
  };

  // Map to the picker contract and drop rows with no readable text at all
  // (a script with neither spoken_script nor script_text can't be loaded).
  const scripts = ((data ?? []) as ScriptRow[])
    .map((row) => ({
      id: row.id,
      title: (row.title || "").trim() || "Untitled script",
      text: (row.spoken_script || row.script_text || "").trim(),
    }))
    .filter((s) => s.text.length > 0);

  return NextResponse.json({
    ok: true,
    data: scripts,
    correlation_id: correlationId,
  });
}
