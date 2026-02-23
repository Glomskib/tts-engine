/**
 * POST /api/affiliates/click
 * Internal endpoint for recording affiliate link clicks.
 * Called fire-and-forget from middleware — no auth required.
 */

import { recordAffiliateClick } from '@/lib/affiliate-tracking';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const { code, ip, userAgent, referrer } = await request.json();

    if (!code || typeof code !== 'string') {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    await recordAffiliateClick(
      code,
      ip || 'unknown',
      userAgent || 'unknown',
      referrer || null,
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[affiliates/click] Error recording click:', err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
