import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { ok: false, error: "Missing Supabase credentials" },
      { status: 500 }
    );
  }

  const migrations = [
    "ALTER TABLE public.concepts ADD COLUMN IF NOT EXISTS title text NOT NULL DEFAULT '';",
    "ALTER TABLE public.concepts ADD COLUMN IF NOT EXISTS source_url text;",
    "ALTER TABLE public.concepts ADD COLUMN IF NOT EXISTS notes text;",
    "UPDATE public.concepts SET title = 'Untitled Concept' WHERE title = '' OR title IS NULL;"
  ];

  const results = [];

  for (const sql of migrations) {
    try {
      // Try Supabase's query endpoint
      const response = await fetch(`${supabaseUrl}/rest/v1/rpc/query`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({ query: sql }),
      });

      results.push({
        sql,
        success: response.ok,
        status: response.status,
      });
    } catch (err) {
      results.push({
        sql,
        success: false,
        error: String(err),
      });
    }
  }

  return NextResponse.json({
    ok: true,
    message: "Schema migration attempted",
    results,
    manualSql: migrations.join('\n'),
  });
}
