import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from("accounts")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("GET /api/accounts Supabase error:", error);
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, data });

  } catch (err) {
    console.error("GET /api/accounts error:", err);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON" },
      { status: 400 }
    );
  }

  const { name, platform } = body as Record<string, unknown>;

  // Validate name is required
  if (typeof name !== "string" || name.trim() === "") {
    return NextResponse.json(
      { ok: false, error: "name is required and must be a non-empty string" },
      { status: 400 }
    );
  }

  // Validate platform if provided
  if (platform !== undefined && typeof platform !== "string") {
    return NextResponse.json(
      { ok: false, error: "platform must be a string" },
      { status: 400 }
    );
  }

  try {
    const insertPayload: Record<string, unknown> = {
      name: name.trim(),
      platform: platform || "tiktok"
    };

    const { data, error } = await supabaseAdmin
      .from("accounts")
      .insert(insertPayload)
      .select()
      .single();

    if (error) {
      console.error("POST /api/accounts Supabase error:", error);
      console.error("POST /api/accounts insert payload:", insertPayload);

      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, data });

  } catch (err) {
    console.error("POST /api/accounts error:", err);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
