import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';

export const runtime = 'nodejs';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const correlationId = generateCorrelationId();
  const auth = await getApiAuthContext(req).catch(() => null);
  if (!auth?.user?.id) return createApiErrorResponse('UNAUTHORIZED', 'Sign in', 401, correlationId);

  let body: { filename?: string; mime?: string; size?: number };
  try { body = await req.json(); }
  catch { return createApiErrorResponse('BAD_REQUEST', 'Invalid JSON', 400, correlationId); }

  const filename = (body.filename || 'photo.jpg').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
  const mime = body.mime || 'image/jpeg';
  if (!mime.startsWith('image/')) return createApiErrorResponse('VALIDATION_ERROR', 'image only', 400, correlationId);

  const path = `${auth.user.id}/avatars/${id}/ref-${Date.now()}-${filename}`;
  const { data: buckets } = await supabaseAdmin.storage.listBuckets();
  if (!buckets?.some(b => b.name === 'avatar-assets')) {
    await supabaseAdmin.storage.createBucket('avatar-assets', { public: true }).catch(() => {});
  }
  const { data, error } = await supabaseAdmin.storage.from('avatar-assets').createSignedUploadUrl(path);
  if (error || !data) return createApiErrorResponse('STORAGE_ERROR', error?.message || 'mint failed', 500, correlationId);
  const { data: pub } = supabaseAdmin.storage.from('avatar-assets').getPublicUrl(path);

  return NextResponse.json({
    ok: true,
    signed_url: data.signedUrl,
    storage_path: path,
    public_url: pub?.publicUrl,
    correlation_id: correlationId,
  });
}
