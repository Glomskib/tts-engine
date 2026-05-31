/**
 * GET /api/debug/render-secret
 *
 * Reports presence + first/last chars of RENDER_NODE_SECRET and
 * RENDER_NODE_SECRET_PUBLIC env vars in the deployed runtime. NEVER returns
 * the full value. Locked to ?ts=... within 10 min so it can't be casually
 * scraped if someone finds the URL.
 *
 * 2026-05-31: added to debug a stuck Vercel env-var handshake issue. Remove
 * once render-node auth is confirmed working.
 */
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

function mask(v: string | undefined): string {
  if (!v) return '<undefined>';
  if (v.length === 0) return '<empty>';
  if (v.length <= 8) return `<short:len=${v.length}>`;
  return `${v.slice(0, 6)}...${v.slice(-4)} (len=${v.length})`;
}

export async function GET(request: NextRequest) {
  // Light gate: require recent timestamp param so a one-off probe URL expires.
  const tsParam = request.nextUrl.searchParams.get('ts');
  if (!tsParam) {
    return NextResponse.json({ ok: false, error: 'missing ts param' }, { status: 400 });
  }
  const ts = parseInt(tsParam, 10);
  const now = Date.now();
  if (!Number.isFinite(ts) || Math.abs(now - ts) > 10 * 60 * 1000) {
    return NextResponse.json({ ok: false, error: 'stale ts (need within 10 min)', now }, { status: 400 });
  }

  const v1 = process.env.RENDER_NODE_SECRET;
  const v2 = process.env.RENDER_NODE_SECRET_PUBLIC;

  return NextResponse.json({
    ok: true,
    runtime_now: now,
    RENDER_NODE_SECRET: mask(v1),
    RENDER_NODE_SECRET_PUBLIC: mask(v2),
    both_undefined: !v1 && !v2,
    note: 'Values are masked — only first 6 and last 4 chars shown.',
  });
}
