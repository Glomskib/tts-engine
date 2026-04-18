/**
 * GET /api/auth/whop/callback
 *
 * Completes the "Sign in with Whop" OAuth flow:
 *   1. Verify the `state` cookie matches the query param (CSRF).
 *   2. Exchange the authorization code for a Whop access token.
 *   3. Fetch the authenticated Whop user (id + email).
 *   4. Find or create the matching Supabase user.
 *   5. Stamp the whop_user_id onto ff_entitlements so future webhooks can
 *      resolve this user without an email lookup.
 *   6. Hand the browser a Supabase magic link to finish sign-in.
 *
 * Whop OAuth docs: https://dev.whop.com/api-reference/oauth/intro
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getWhopEnv } from "@/lib/whop/config";

export const runtime = "nodejs";

const STATE_COOKIE = "whop_oauth_state";
const WHOP_TOKEN_URL = "https://api.whop.com/api/v5/oauth/token";
const WHOP_ME_URL = "https://api.whop.com/api/v5/me";

export async function GET(request: NextRequest) {
  const env = getWhopEnv();
  if (!env.clientId || !env.clientSecret || !env.oauthRedirectUrl) {
    return NextResponse.json(
      { error: "Whop OAuth not configured." },
      { status: 500 }
    );
  }

  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return redirectHome(request, `/login?whop_error=${encodeURIComponent(error)}`);
  }
  if (!code || !state) {
    return redirectHome(request, "/login?whop_error=missing_params");
  }

  const cookieValue = request.cookies.get(STATE_COOKIE)?.value;
  if (!cookieValue) {
    return redirectHome(request, "/login?whop_error=state_expired");
  }
  const [storedState, returnToEnc] = cookieValue.split(":");
  if (storedState !== state) {
    return redirectHome(request, "/login?whop_error=state_mismatch");
  }
  const returnTo = returnToEnc ? decodeURIComponent(returnToEnc) : "/dashboard";

  // ── 1. Exchange code → access_token ────────────────────
  const tokenRes = await fetch(WHOP_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: env.clientId,
      client_secret: env.clientSecret,
      redirect_uri: env.oauthRedirectUrl,
    }).toString(),
  });
  if (!tokenRes.ok) {
    const body = await tokenRes.text().catch(() => "");
    console.error("[whop/oauth] token exchange failed", tokenRes.status, body.slice(0, 200));
    return redirectHome(request, "/login?whop_error=token_exchange");
  }
  const token = (await tokenRes.json()) as { access_token?: string };
  if (!token.access_token) {
    return redirectHome(request, "/login?whop_error=no_access_token");
  }

  // ── 2. Fetch Whop user ─────────────────────────────────
  const meRes = await fetch(WHOP_ME_URL, {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  if (!meRes.ok) {
    console.error("[whop/oauth] me fetch failed", meRes.status);
    return redirectHome(request, "/login?whop_error=user_fetch");
  }
  const me = (await meRes.json()) as { id?: string; email?: string; user?: { id?: string; email?: string } };
  const whopUserId = me.id ?? me.user?.id ?? null;
  const email = me.email ?? me.user?.email ?? null;

  if (!whopUserId || !email) {
    return redirectHome(request, "/login?whop_error=no_profile");
  }

  // ── 3. Find or create Supabase user ────────────────────
  const supabaseUserId = await findOrCreateSupabaseUser(email, whopUserId);
  if (!supabaseUserId) {
    return redirectHome(request, "/login?whop_error=provision_failed");
  }

  // ── 4. Link whop_user_id on entitlement (idempotent) ──
  await supabaseAdmin
    .from("ff_entitlements")
    .upsert(
      { user_id: supabaseUserId, whop_user_id: whopUserId, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );

  // ── 5. Issue magic link → browser finishes sign-in ────
  const redirectTo = new URL(returnTo, request.url).toString();
  const { data: link, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo },
  });
  if (linkErr || !link.properties?.action_link) {
    console.error("[whop/oauth] magic link generation failed", linkErr);
    return redirectHome(request, "/login?whop_error=magic_link");
  }

  const res = NextResponse.redirect(link.properties.action_link, 302);
  res.cookies.delete(STATE_COOKIE);
  return res;
}

async function findOrCreateSupabaseUser(email: string, whopUserId: string): Promise<string | null> {
  const normalized = email.trim().toLowerCase();

  // First pass: any ff_entitlements row already linked to this whop_user_id.
  const { data: ent } = await supabaseAdmin
    .from("ff_entitlements")
    .select("user_id")
    .eq("whop_user_id", whopUserId)
    .maybeSingle();
  if (ent?.user_id) return ent.user_id;

  // Second pass: email match via paged listUsers (same pattern as sync.ts).
  let page = 1;
  const perPage = 200;
  for (let i = 0; i < 50; i++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) return null;
    const match = data.users.find((u) => (u.email ?? "").toLowerCase() === normalized);
    if (match) return match.id;
    if (data.users.length < perPage) break;
    page += 1;
  }

  // Third pass: create a fresh Supabase user.
  const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { whop_user_id: whopUserId, source: "whop_oauth" },
  });
  if (error || !created.user) {
    console.error("[whop/oauth] createUser failed", error);
    return null;
  }
  return created.user.id;
}

function redirectHome(request: NextRequest, path: string): NextResponse {
  const url = new URL(path, request.url);
  return NextResponse.redirect(url.toString(), 302);
}
