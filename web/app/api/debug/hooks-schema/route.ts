import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  // Test all possible hook columns to find the real schema
  const testColumns = [
    "id", "concept_id", "hook_text", "hook_style", "angle", "created_at", 
    "updated_at", "status", "performance_score", "a_b_test_id", "variant_id"
  ];

  const columnTests: Record<string, boolean> = {};
  
  for (const col of testColumns) {
    const { error } = await supabaseAdmin
      .from("hooks")
      .select(col)
      .limit(1);
    columnTests[col] = !error;
  }

  // Try minimal insert to see what's actually required
  const { error: insertError } = await supabaseAdmin
    .from("hooks")
    .insert({ concept_id: "00000000-0000-0000-0000-000000000000", hook_text: "test" })
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
