import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  // Test all possible concept columns to find the real schema
  const testColumns = [
    "id", "product_id", "concept_title", "title", "core_angle", "source_url", 
    "notes", "created_at", "updated_at", "hook_type", "target_audience", 
    "emotional_trigger", "content_style", "duration_seconds"
  ];

  const columnTests: Record<string, boolean> = {};
  
  for (const col of testColumns) {
    const { error } = await supabaseAdmin
      .from("concepts")
      .select(col)
      .limit(1);
    columnTests[col] = !error;
  }

  // Try minimal insert to see what's actually required
  const { error: insertError } = await supabaseAdmin
    .from("concepts")
    .insert({ product_id: "test-minimal" })
    .select()
    .single();

  return NextResponse.json({
    ok: true,
    columnTests,
    existingColumns: Object.entries(columnTests)
      .filter(([, exists]) => exists)
      .map(([col]) => col),
    missingColumns: Object.entries(columnTests)
      .filter(([, exists]) => !exists)
      .map(([col]) => col),
    insertError: insertError?.message,
    requiredFields: insertError?.message ? 
      insertError.message.match(/column "([^"]+)"/g)?.map(m => m.replace(/column "|"/g, '')) : []
  });
}
