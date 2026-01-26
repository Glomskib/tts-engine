import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";

export const runtime = "nodejs";

export async function GET() {
  const authContext = await getApiAuthContext();

  if (!authContext.user) {
    return NextResponse.json(
      { ok: false, error: "Not authenticated" },
      { status: 401 }
    );
  }

  return NextResponse.json({
    ok: true,
    user: {
      id: authContext.user.id,
      email: authContext.user.email,
    },
    role: authContext.role,
    isAdmin: authContext.isAdmin,
    isUploader: authContext.isUploader,
  });
}
