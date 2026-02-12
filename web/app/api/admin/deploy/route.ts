import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { generateCorrelationId } from '@/lib/api-errors';

export const runtime = 'nodejs';

/**
 * POST /api/admin/deploy — Trigger a Vercel deploy via deploy hook
 * This is a placeholder that returns a message about manual deployment.
 * In production, you'd set up a Vercel Deploy Hook URL and POST to it.
 */
export async function POST(request: Request) {
  const correlationId = generateCorrelationId();

  try {
    const auth = await getApiAuthContext(request);
    if (!auth.user) {
      return NextResponse.json({ ok: false, error: 'Authentication required' }, { status: 401 });
    }

    // For now, any authenticated user can trigger (admin layout already gates access)
    const deployHook = process.env.VERCEL_DEPLOY_HOOK;
    if (deployHook) {
      // If a deploy hook is configured, trigger it
      const res = await fetch(deployHook, { method: 'POST' });
      if (res.ok) {
        return NextResponse.json({
          ok: true,
          message: 'Deploy triggered via Vercel hook',
          correlation_id: correlationId,
        });
      }
      return NextResponse.json({
        ok: false,
        error: 'Deploy hook returned error',
        correlation_id: correlationId,
      }, { status: 502 });
    }

    // No deploy hook configured — return instructions
    return NextResponse.json({
      ok: true,
      message: 'No deploy hook configured. Deploy manually: cd web && npx vercel --prod --yes',
      correlation_id: correlationId,
    });
  } catch (error) {
    console.error('[deploy] Error:', error);
    return NextResponse.json({
      ok: false,
      error: 'Deploy failed',
      correlation_id: correlationId,
    }, { status: 500 });
  }
}
