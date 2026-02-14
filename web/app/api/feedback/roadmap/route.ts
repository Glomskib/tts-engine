import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

/**
 * Public endpoint — returns planned/in_progress/done feedback items.
 * No user info exposed.
 */
export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("user_feedback")
    .select("id, type, title, status, updated_at")
    .in("status", ["planned", "in_progress", "done"])
    .order("updated_at", { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json({ ok: false, data: [] }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data: data || [] });
}
