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

  // Execute SQL via Supabase's SQL endpoint
  const sql = `ALTER TABLE public.products ADD COLUMN IF NOT EXISTS notes text;`;

  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({ query: sql }),
    });

    if (!response.ok) {
      // If exec_sql doesn't exist, try the query endpoint
      const queryResponse = await fetch(`${supabaseUrl}/pg/query`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({ query: sql }),
      });

      if (!queryResponse.ok) {
        return NextResponse.json({
          ok: false,
          error: "Cannot execute SQL directly. Please run manually in Supabase Dashboard:",
          sql: sql,
        });
      }
    }

    return NextResponse.json({ ok: true, message: "Migration executed", sql });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      error: "Failed to execute migration",
      sql: sql,
      details: String(err),
    });
  }
}
