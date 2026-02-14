import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getApiAuthContext } from "@/lib/supabase/api-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const authContext = await getApiAuthContext(request);

    if (!authContext.user) {
      return NextResponse.json(
        { ok: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    // Check email confirmation status from Supabase session
    let emailConfirmed = true; // default to true for API key / JWT auth
    try {
      const cookieStore = await cookies();
      const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          cookies: {
            getAll() { return cookieStore.getAll(); },
            setAll() { /* read-only here */ },
          },
        }
      );
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        emailConfirmed = !!user.email_confirmed_at;
      }
    } catch {
      // Non-fatal — default to true
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
      emailConfirmed,
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
