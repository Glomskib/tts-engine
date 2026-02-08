import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { generateApiKey } from '@/lib/api-keys';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';

export const runtime = 'nodejs';

/** List the current user's API keys (never returns hashes). */
export async function GET(request: Request) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

  // Session-only auth (no API key auth for key management)
  const authContext = await getApiAuthContext();
  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  const { data, error } = await supabaseAdmin
    .from('api_keys')
    .select('id, name, key_prefix, scopes, last_used_at, created_at, revoked_at')
    .eq('user_id', authContext.user.id)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message, correlation_id: correlationId },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, data, correlation_id: correlationId });
}

/** Create a new API key. Returns the plaintext key exactly once. */
export async function POST(request: Request) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

  // Session-only auth
  const authContext = await getApiAuthContext();
  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  let body: { name?: string; scopes?: string[] };
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse('BAD_REQUEST', 'Invalid JSON body', 400, correlationId);
  }

  const name = body.name?.trim();
  if (!name) {
    return createApiErrorResponse('BAD_REQUEST', 'name is required', 400, correlationId);
  }

  const scopes = body.scopes || ['read'];
  const { plaintext, hash } = generateApiKey();
  const keyPrefix = plaintext.slice(0, 12) + '****';

  const { data, error } = await supabaseAdmin
    .from('api_keys')
    .insert({
      user_id: authContext.user.id,
      key_hash: hash,
      key_prefix: keyPrefix,
      name,
      scopes,
    })
    .select('id, name, key_prefix, scopes, created_at')
    .single();

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message, correlation_id: correlationId },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    data: { ...data, plaintext },
    correlation_id: correlationId,
  });
}
