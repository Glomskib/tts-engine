import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";

export const runtime = "nodejs";

export async function GET() {
  const authContext = await getApiAuthContext();
  if (!authContext.user) {
    return NextResponse.json({ enabled: false });
  }

  // Admin UI is enabled for all authenticated users.
  // The admin layout already handles role-based access control.
  return NextResponse.json({ enabled: true });
}
