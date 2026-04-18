/**
 * GET /api/auth/whop/start
 *
 * Kicks off the "Sign in with Whop" OAuth flow. Generates a CSRF state token,
 * stores it in an httpOnly cookie, and 302-redirects the browser to Whop's
 * authorize URL. Whop then redirects back to /api/auth/whop/callback with
 * ?code=...&state=... once the user approves.
 *
 * Required env:
 *   WHOP_CLIENT_ID
 *   WHOP_OAUTH_REDIRECT_URL  — must match the callback URL registered in Whop
 */

import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { getWhopEnv } from "@/lib/whop/config";

export const runtime = "nodejs";

const WHOP_AUTHORIZE_URL = "https://whop.com/oauth";
const STATE_COOKIE = "whop_oauth_state";
const STATE_TTL_SECONDS = 10 * 60; // 10 minutes

export async function GET(request: NextRequest) {
  const env = getWhopEnv();
  if (!env.clientId || !env.oauthRedirectUrl) {
    return NextResponse.json(
      { error: "Whop OAuth not configured — set WHOP_CLIENT_ID and WHOP_OAUTH_REDIRECT_URL." },
      { status: 500 }
    );
  }

  const state = crypto.randomBytes(24).toString("base64url");
  const returnTo = request.nextUrl.searchParams.get("return_to") ?? "/dashboard";

  const authorize = new URL(WHOP_AUTHORIZE_URL);
  authorize.searchParams.set("client_id", env.clientId);
  authorize.searchParams.set("redirect_uri", env.oauthRedirectUrl);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("scope", "openid profile email");
  authorize.searchParams.set("state", state);

  const res = NextResponse.redirect(authorize.toString(), 302);
  // Stash state + return_to in an httpOnly cookie so the callback can verify.
  res.cookies.set(STATE_COOKIE, `${state}:${encodeURIComponent(returnTo)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: STATE_TTL_SECONDS,
  });
  return res;
}
