// /api/avatars/upload-temp
// Returns a signed Supabase Storage upload URL so the browser uploads the
// file DIRECTLY to storage. Bypasses Vercel's serverless function body cap
// (~4.5MB) which was rejecting iPhone photo uploads.
//
// Request:  POST { filename, mime, size }
// Response: { ok, signed_url, public_url, path }
//
// Client flow:
//   1. POST tiny JSON to get a signed_url
//   2. PUT the file body directly to signed_url
//   3. Use public_url as the avatar's reference image URL

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { randomUUID } from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 50 * 1024 * 1024; // 50MB

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const filename = String(body?.filename || 'upload').slice(0, 200);
    const mime = String(body?.mime || 'image/jpeg');
    const size = Number(body?.size || 0);

    if (size > MAX_BYTES) {
      return NextResponse.json(
        { error: 'file too large (max 50MB)', size, max: MAX_BYTES },
        { status: 413 },
      );
    }

    const extPart = (mime.split('/')[1] || 'jpg').replace(/[^a-z0-9]/gi, '').slice(0, 8);
    const ext = extPart || 'jpg';
    const id = randomUUID();
    const path = `${user.id}/temp/${id}.${ext}`;

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const signedRes = await admin.storage
      .from('avatar-assets')
      .createSignedUploadUrl(path);

    if (signedRes.error || !signedRes.data?.signedUrl) {
      return NextResponse.json(
        { error: 'could not sign upload', detail: signedRes.error?.message },
        { status: 500 },
      );
    }

    const pubRes = admin.storage.from('avatar-assets').getPublicUrl(path);

    return NextResponse.json({
      ok: true,
      signed_url: signedRes.data.signedUrl,
      public_url: pubRes.data.publicUrl,
      path,
      filename,
      mime,
      size,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: 'upload-temp failed', detail: msg }, { status: 500 });
  }
}
