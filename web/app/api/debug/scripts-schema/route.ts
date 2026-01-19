import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  // Test all possible script columns to find the real schema
  const testColumns = [
    "id", "concept_id", "hook_id", "script_v1", "script_text", "voiceover", 
    "on_screen_text", "caption", "hashtags", "cta", "editor_notes", 
    "created_at", "updated_at", "status", "style_preset", "category_risk",
    "compliance_status", "performance_score", "version"
  ];

  const columnTests: Record<string, boolean> = {};
  
  for (const col of testColumns) {
    const { error } = await supabaseAdmin
      .from("scripts")
      .select(col)
      .limit(1);
    columnTests[col] = !error;
  }

  // Try minimal insert to see what's actually required
  const { error: insertError } = await supabaseAdmin
    .from("scripts")
    .insert({ 
      concept_id: "00000000-0000-0000-0000-000000000000",
      on_screen_text: "test",
      caption: "test", 
      hashtags: "test",
      cta: "test",
      version: 1
    })
    .select()
    .single();

  // Get sample data if any exists
  const { data: sampleData } = await supabaseAdmin
    .from("scripts")
    .select("*")
    .limit(1);

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
    sampleData: sampleData?.[0] || null,
    requiredFields: insertError?.message ? 
      insertError.message.match(/column "([^"]+)"/g)?.map(m => m.replace(/column "|"/g, '')) : []
  });
}
