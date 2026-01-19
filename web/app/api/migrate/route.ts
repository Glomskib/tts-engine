import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  // Add category_risk column to products table if it doesn't exist
  const { error } = await supabaseAdmin.rpc("exec_sql", {
    query: `
      ALTER TABLE public.products 
      ADD COLUMN IF NOT EXISTS category_risk text;
    `,
  });

  if (error) {
    // Try direct approach if RPC doesn't exist
    const { error: directError } = await supabaseAdmin
      .from("products")
      .select("category_risk")
      .limit(1);

    if (directError && directError.message.includes("category_risk")) {
      return NextResponse.json(
        {
          ok: false,
          error: "category_risk column missing. Please run this SQL in Supabase Dashboard:",
          sql: "ALTER TABLE public.products ADD COLUMN IF NOT EXISTS category_risk text;",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, message: "Column already exists or was added" });
  }

  return NextResponse.json({ ok: true, message: "Migration completed" });
}
