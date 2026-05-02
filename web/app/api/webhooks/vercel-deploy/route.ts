/**
 * POST /api/webhooks/vercel-deploy
 *
 * Receives Vercel "deployment ready" webhooks for flashflowai.com (and any
 * other Vercel project Brandon registers it on) and triggers the QA-bot
 * run on the Mac mini via the Tailnet.
 *
 * Setup steps for Brandon (also documented in QA-BOT-IMPLEMENTATION.md):
 *   1. Add env vars to the Vercel project:
 *        VERCEL_DEPLOY_HOOK_SECRET   — shared secret used to verify signature
 *        QA_BOT_TRIGGER_URL          — http://<mini-tailnet>:<port>/qa
 *        QA_BOT_TRIGGER_SECRET       — auth header for the mini endpoint
 *   2. Register the webhook in Vercel dashboard:
 *        URL:    https://flashflowai.com/api/webhooks/vercel-deploy
 *        Events: deployment.succeeded
 *        Secret: matches VERCEL_DEPLOY_HOOK_SECRET
 *
 * Signature verification: Vercel sends `x-vercel-signature` as
 * sha1(secret, body) hex. We HMAC-SHA1 the raw body and compare.
 *
 * The handler returns 200 immediately after kicking off the trigger so
 * Vercel's webhook delivery doesn't time out — actual QA results are
 * delivered asynchronously to Telegram by the bot.
 */
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { generateCorrelationId } from '@/lib/api-errors';

export const runtime = 'nodejs';

interface VercelDeployPayload {
  type?: string;
  payload?: {
    deployment?: {
      url?: string;
      meta?: Record<string, string>;
    };
    target?: string;
    name?: string;
  };
}

/** Constant-time hex compare. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

function verifySignature(rawBody: string, secret: string, signatureHeader: string | null): boolean {
  if (!signatureHeader) return false;
  const expected = crypto.createHmac('sha1', secret).update(rawBody).digest('hex');
  return safeEqual(expected, signatureHeader.replace(/^sha1=/, ''));
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();
  const secret = process.env.VERCEL_DEPLOY_HOOK_SECRET;

  if (!secret) {
    // Don't 500 — return 200 with a note so Vercel doesn't keep retrying.
    console.warn(`[${correlationId}] vercel-deploy: VERCEL_DEPLOY_HOOK_SECRET not configured`);
    return NextResponse.json({ ok: false, error: 'webhook secret not configured', correlation_id: correlationId });
  }

  const rawBody = await request.text();
  const signatureHeader = request.headers.get('x-vercel-signature');

  if (!verifySignature(rawBody, secret, signatureHeader)) {
    console.warn(`[${correlationId}] vercel-deploy: invalid signature`);
    return NextResponse.json(
      { ok: false, error: 'invalid signature', correlation_id: correlationId },
      { status: 401 },
    );
  }

  let payload: VercelDeployPayload;
  try {
    payload = JSON.parse(rawBody) as VercelDeployPayload;
  } catch {
    return NextResponse.json(
      { ok: false, error: 'invalid json', correlation_id: correlationId },
      { status: 400 },
    );
  }

  // Only fire on production "ready/succeeded" events.
  const eventType = payload.type ?? '';
  const target = payload.payload?.target ?? '';
  const isReady = eventType === 'deployment.succeeded' || eventType === 'deployment-ready';
  const isProd = target === 'production';

  if (!isReady) {
    return NextResponse.json({
      ok: true,
      ignored: `non-ready event: ${eventType}`,
      correlation_id: correlationId,
    });
  }
  if (!isProd) {
    return NextResponse.json({
      ok: true,
      ignored: `non-production target: ${target}`,
      correlation_id: correlationId,
    });
  }

  const triggerUrl = process.env.QA_BOT_TRIGGER_URL;
  const triggerSecret = process.env.QA_BOT_TRIGGER_SECRET;

  if (!triggerUrl) {
    console.warn(`[${correlationId}] vercel-deploy: QA_BOT_TRIGGER_URL not configured — skipping QA trigger`);
    return NextResponse.json({
      ok: true,
      triggered: false,
      reason: 'QA_BOT_TRIGGER_URL not configured',
      correlation_id: correlationId,
    });
  }

  // Fire-and-forget. Don't block the Vercel webhook response on the mini's reachability.
  const deployUrl = payload.payload?.deployment?.url;
  const targetForQA = deployUrl ? `https://${deployUrl}` : 'https://flashflowai.com';

  void fetch(triggerUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(triggerSecret ? { 'x-qa-trigger-secret': triggerSecret } : {}),
    },
    body: JSON.stringify({
      target: targetForQA,
      source: 'vercel-deploy',
      correlation_id: correlationId,
    }),
    signal: AbortSignal.timeout(5_000),
  }).catch((err) => {
    console.warn(`[${correlationId}] vercel-deploy: trigger fetch failed`, err);
  });

  return NextResponse.json({
    ok: true,
    triggered: true,
    target: targetForQA,
    correlation_id: correlationId,
  });
}

/** Quick health check — useful for confirming the route is wired up. */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    ok: true,
    route: '/api/webhooks/vercel-deploy',
    expects: 'POST with x-vercel-signature header',
  });
}
