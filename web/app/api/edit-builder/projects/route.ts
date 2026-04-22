/**
 * GET  /api/edit-builder/projects — list current user's edit projects
 * POST /api/edit-builder/projects — create a new edit project
 *
 * Phase 1 scope: real reads/writes against edit_projects. No file upload
 * wiring yet — that comes with the source-clips routes in a later phase.
 */
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { z } from 'zod';

export const runtime = 'nodejs';

const CreateBodySchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  aspect_ratio: z.enum(['9:16', '1:1', '16:9']).optional(),
  target_platform: z.string().max(40).optional(),
});

export async function GET(request: Request) {
  const auth = await getApiAuthContext(request);
  if (!auth.user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from('edit_projects')
    .select('id,title,status,aspect_ratio,target_platform,created_at,updated_at')
    .eq('user_id', auth.user.id)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ projects: data ?? [] });
}

export async function POST(request: Request) {
  const auth = await getApiAuthContext(request);
  if (!auth.user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  let raw: unknown = {};
  try { raw = await request.json(); } catch {}
  const parsed = CreateBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'INVALID_BODY', details: parsed.error.issues }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('edit_projects')
    .insert({
      user_id: auth.user.id,
      title: parsed.data.title ?? 'Untitled Project',
      aspect_ratio: parsed.data.aspect_ratio ?? '9:16',
      target_platform: parsed.data.target_platform ?? 'tiktok',
      status: 'draft',
    })
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ project: data });
}
