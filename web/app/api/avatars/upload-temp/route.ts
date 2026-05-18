// /api/avatars/upload-temp
//
// Three modes:
//   POST { action: 'sign', filename, contentType }
//     → { signedUrl, token, path } – client PUTs file directly to Supabase Storage
//     → bypasses Vercel's 4.5MB body cap entirely (the 413 root cause)
//
//   POST { action: 'commit', path }
//     → { public_url } – confirms upload landed, returns the public URL
//
//   POST (multipart, with file)
//     → legacy path; small files (≤ ~4MB on Vercel) still work via direct multipart
//
// Used by /avatars/new BEFORE an avatar record exists. The public_url goes
// into avatar_visual_reference_url on create.

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { randomUUID } from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const BUCKET = 'avatar-assets';

async function getUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (all) => all.forEach((c) => cookieStore.set(c.name, c.value, c.options)),
      },
    },
  );
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

function safeExt(fromName: string, fromType: string): string {
  const m = fromName.match(/\.([a-z0-9]{1,5})$/i);
  if (m) return m[1].toLowerCase();
  const t = (fromType || '').split('/')[1] || 'jpg';
  return t.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 5) || 'jpg';
}

export async function POST(req: NextRequest) {
  try {
    const userId = await getUserId();
    if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const ct = req.headers.get('content-type') || '';

    // ── JSON mode: sign or commit ────────────────────────────────────
    if (ct.includes('application/json')) {
      const body = await req.json().catch(() => ({} as Record<string, unknown>));
      const action = String(body?.action || '');
      const admin = adminClient();

      if (action === 'sign') {
        const filename = String(body?.filename || 'photo.jpg');
        const ctype = String(body?.contentType || 'image/jpeg');
        const ext = safeExt(filename, ctype);
        const path = `${userId}/temp/${randomUUID()}.${ext}`;
        const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
        if (error || !data) {
          return NextResponse.json({ error: 'sign failed', detail: error?.message }, { status: 500 });
        }
        return NextResponse.json({ ok: true, signedUrl: data.signedUrl, token: data.token, path });
      }

      if (action === 'commit') {
        const path = String(body?.path || '');
        if (!path || !path.startsWith(userId + '/')) {
          return NextResponse.json({ error: 'bad path' }, { status: 400 });
        }
        const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path);
        return NextResponse.json({ ok: true, public_url: pub.publicUrl, path });
      }

      return NextResponse.json({ error: 'unknown action' }, { status: 400 });
    }

    // ── Legacy multipart path (small files only) ─────────────────────
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'file required' }, { status: 400 });
    }
    if (file.size > 12 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'file too large (max 12MB) — use signed URL for larger files' },
        { status: 413 },
      );
    }
    const ext = safeExt((file as File).name || '', file.type);
    const path = `${userId}/temp/${randomUUID()}.${ext}`;
    const admin = adminClient();
    const buf = Buffer.from(await file.arrayBuffer());
    const { error: upErr } = await admin.storage
      .from(BUCKET)
      .upload(path, buf, { contentType: file.type, cacheControl: '3600', upsert: false });
    if (upErr) {
      return NextResponse.json({ error: 'storage upload failed', detail: upErr.message }, { status: 500 });
    }
    const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path);
    return NextResponse.json({ ok: true, public_url: pub.publicUrl, path });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: 'upload-temp failed', detail: msg }, { status: 500 });
  }
}
