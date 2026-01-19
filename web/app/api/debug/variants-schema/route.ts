import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  // Test all possible variant columns to find the real schema
  const testColumns = [
    "id", "concept_id", "hook_id", "script_id", "change_type", "title", "label", 
    "notes", "status", "created_at", "updated_at", "performance_score", 
    "conversion_rate", "engagement_rate", "test_group", "control_group",
    "variant_data", "metadata", "active", "winner", "confidence_score"
  ];

  const columnTests: Record<string, boolean> = {};
  
  for (const col of testColumns) {
    const { error } = await supabaseAdmin
      .from("variants")
      .select(col)
      .limit(1);
    columnTests[col] = !error;
  }

  // Try minimal insert to see what's actually required
  const { error: insertError } = await supabaseAdmin
    .from("variants")
    .insert({ 
      concept_id: "00000000-0000-0000-0000-000000000000",
      change_type: "hook"
    })
    .select()
    .single();

  // Get sample data if any exists
  const { data: sampleData } = await supabaseAdmin
    .from("variants")
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
