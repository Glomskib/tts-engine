import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";

export const runtime = "nodejs";

export async function GET() {
  const authContext = await getApiAuthContext();
  if (!authContext.user) {
    return NextResponse.json({ enabled: false });
  }

  // In development, admin UI is always enabled
  // In production, require ADMIN_UI_ENABLED=true
  const isProduction = process.env.NODE_ENV === "production";
  const adminEnabled = process.env.ADMIN_UI_ENABLED === "true";

  const enabled = !isProduction || adminEnabled;

  return NextResponse.json({ enabled });
}
