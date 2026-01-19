import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  // Test all possible video columns to find the real schema
  const expectedColumns = [
    "id", "variant_id", "account_id", "final_video_url", "caption_used", 
    "hashtags_used", "tt_post_url", "posted_at", "status", "notes",
    "created_at", "updated_at", "video_title", "duration_seconds",
    "thumbnail_url", "performance_score", "views", "likes", "shares",
    "comments", "engagement_rate", "upload_date", "platform"
  ];

  const columnTests: Record<string, boolean> = {};
  
  for (const col of expectedColumns) {
    const { error } = await supabaseAdmin
      .from("videos")
      .select(col)
      .limit(1);
    columnTests[col] = !error;
  }

  const existingColumns = Object.entries(columnTests)
    .filter(([, exists]) => exists)
    .map(([col]) => col);

  const missingColumns = Object.entries(columnTests)
    .filter(([, exists]) => !exists)
    .map(([col]) => col);

  // Try minimal insert to see what's actually required
  const { error: insertError } = await supabaseAdmin
    .from("videos")
    .insert({ 
      variant_id: "00000000-0000-0000-0000-000000000000"
    })
    .select()
    .single();

  // Get sample data if any exists
  const { data: sampleData } = await supabaseAdmin
    .from("videos")
    .select("*")
    .limit(1);

  // Generate fix SQL for missing critical columns
  const criticalColumns = ["variant_id", "final_video_url", "caption_used", "hashtags_used", "tt_post_url", "posted_at", "status"];
  const missingCritical = criticalColumns.filter(col => !existingColumns.includes(col));
  
  let fixSql = "";
  if (missingCritical.length > 0) {
    const alterStatements = missingCritical.map(col => {
      const columnDefs: Record<string, string> = {
        "variant_id": "uuid REFERENCES public.variants(id) ON DELETE CASCADE",
        "final_video_url": "text",
        "caption_used": "text",
        "hashtags_used": "text", 
        "tt_post_url": "text",
        "posted_at": "timestamp with time zone",
        "status": "text DEFAULT 'draft'"
      };
      return `ALTER TABLE public.videos ADD COLUMN IF NOT EXISTS ${col} ${columnDefs[col] || 'text'};`;
    });
    
    fixSql = alterStatements.join('\n');
  }

  return NextResponse.json({
    ok: true,
    existingColumns,
    missingColumns,
    sampleData: sampleData?.[0] || null,
    insertError: insertError?.message,
    requiredFields: insertError?.message ? 
      insertError.message.match(/column "([^"]+)"/g)?.map(m => m.replace(/column "|"/g, '')) : [],
    recommendations: {
      required: ["variant_id"],
      optional: ["final_video_url", "caption_used", "hashtags_used", "tt_post_url", "posted_at", "status", "notes"],
      defaultStatus: "draft"
    },
    fixSql: missingCritical.length > 0 ? fixSql : null,
    missingCritical
  });
}
