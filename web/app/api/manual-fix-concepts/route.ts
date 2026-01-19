import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  // Since we can't run DDL via REST API, let's create a workaround
  // by testing if we can insert with the expected schema
  
  try {
    // Test insert to see what columns are actually missing
    const testInsert = await supabaseAdmin
      .from("concepts")
      .insert({
        product_id: "test-id",
        title: "Test Title",
        source_url: "https://example.com",
        notes: "Test notes"
      })
      .select()
      .single();

    if (testInsert.error) {
      return NextResponse.json({
        ok: false,
        error: "Concepts table missing columns. Please run this SQL in Supabase Dashboard:",
        sql: `
-- Add missing columns to concepts table
ALTER TABLE public.concepts ADD COLUMN IF NOT EXISTS title text NOT NULL DEFAULT '';
ALTER TABLE public.concepts ADD COLUMN IF NOT EXISTS source_url text;
ALTER TABLE public.concepts ADD COLUMN IF NOT EXISTS notes text;

-- Update any existing rows
UPDATE public.concepts SET title = 'Untitled Concept' WHERE title = '' OR title IS NULL;
        `.trim(),
        actualError: testInsert.error.message
      });
    }

    // Clean up test data
    if (testInsert.data) {
      await supabaseAdmin
        .from("concepts")
        .delete()
        .eq("id", testInsert.data.id);
    }

    return NextResponse.json({
      ok: true,
      message: "Concepts table schema is correct"
    });

  } catch (err) {
    return NextResponse.json({
      ok: false,
      error: "Failed to test concepts schema",
      details: String(err)
    });
  }
}
