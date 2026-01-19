import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  // Try to get column info by selecting with specific columns
  const tests: Record<string, boolean> = {};

  // Test each column individually
  const columns = ["id", "name", "brand", "category_risk", "category", "notes", "created_at"];
  
  for (const col of columns) {
    const { error } = await supabaseAdmin
      .from("products")
      .select(col)
      .limit(1);
    tests[col] = !error;
  }

  // Get full table info
  const { data, error } = await supabaseAdmin
    .from("products")
    .select("*")
    .limit(1);

  return NextResponse.json({
    ok: true,
    columnTests: tests,
    sampleData: data,
    selectError: error?.message,
    missingColumns: Object.entries(tests)
      .filter(([, exists]) => !exists)
      .map(([col]) => col),
    sqlToRun: `
-- Run this in Supabase Dashboard > SQL Editor:
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS brand text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS category_risk text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS notes text;
    `.trim(),
  });
}
