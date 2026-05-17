// Temp photo upload — used by /avatars/new BEFORE an avatar record exists.
// Saves to avatar-assets/<userId>/temp/<uuid>.<ext> and returns public_url.
// The /avatars/new page can then call /api/avatars/preview to generate the AI
// preview, and on final create, the public_url goes into avatar_visual_reference_url.

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { randomUUID } from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (all) => all.forEach((c) => cookieStore.set(c.name, c.value, c.options)),
      } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'file required' }, { status: 400 });
    }
    if (file.size > 12 * 1024 * 1024) {
      return NextResponse.json({ error: 'file too large (max 12MB)' }, { status: 413 });
    }

    const ext = (file.type.split('/')[1] || 'jpg').replace(/[^a-z0-9]/g, '') || 'jpg';
    const id = randomUUID();
    const path = `${user.id}/temp/${id}.${ext}`;

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const buf = Buffer.from(await file.arrayBuffer());
    const { error: upErr } = await admin.storage
      .from('avatar-assets')
      .upload(path, buf, { contentType: file.type, cacheControl: '3600', upsert: false });
    if (upErr) {
      return NextResponse.json({ error: 'storage upload failed', detail: upErr.message }, { status: 500 });
    }
    const { data: pub } = admin.storage.from('avatar-assets').getPublicUrl(path);
    return NextResponse.json({ ok: true, public_url: pub.publicUrl, path });
  } catch (e: any) {
    return NextResponse.json({ error: 'upload-temp failed', detail: String(e?.message || e) }, { status: 500 });
  }
}
