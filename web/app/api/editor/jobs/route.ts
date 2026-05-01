/**
 * POST /api/editor/jobs — create a draft edit job.
 * GET  /api/editor/jobs — list current user's jobs.
 */
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { ensureEditJobsBucket } from '@/lib/editor/pipeline';

export const runtime = 'nodejs';

const VALID_MODES = new Set(['quick', 'hook', 'ugc', 'talking_head']);
const VALID_PLATFORMS = new Set(['tiktok_shop', 'tiktok', 'yt_shorts', 'yt_long', 'ig_reels']);

interface ModeOptionsInput {
  platform?: string;
  notes?: string;
  caption_style?: 'normal' | 'kinetic';
  pace?: 'normal' | 'fast';
}

export async function POST(request: Request) {
  const auth = await getApiAuthContext(request);
  if (!auth.user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  let body: { title?: string; mode?: string; script_id?: string | null; mode_options?: ModeOptionsInput } = {};
  try { body = await request.json(); } catch {}

  const mode = body.mode && VALID_MODES.has(body.mode) ? body.mode : 'quick';
  const title = (body.title ?? '').trim() || 'Untitled Edit';

  // Sanitize mode_options
  const opts: Record<string, unknown> = {};
  if (body.mode_options?.platform && VALID_PLATFORMS.has(body.mode_options.platform)) {
    opts.platform = body.mode_options.platform;
  }
  if (typeof body.mode_options?.notes === 'string') {
    opts.notes = body.mode_options.notes.slice(0, 4000); // cap at 4000 chars
  }
  if (body.mode_options?.caption_style === 'kinetic' || body.mode_options?.caption_style === 'normal') {
    opts.caption_style = body.mode_options.caption_style;
  }
  if (body.mode_options?.pace === 'fast' || body.mode_options?.pace === 'normal') {
    opts.pace = body.mode_options.pace;
  }

  await ensureEditJobsBucket().catch((e) => {
    console.error('[editor] bucket ensure failed', e);
  });

  const { data, error } = await supabaseAdmin
    .from('ai_edit_jobs')
    .insert({
      user_id: auth.user.id,
      title,
      mode,
      status: 'draft',
      script_id: body.script_id ?? null,
      assets: [],
      mode_options: opts,
    })
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ job: data });
}

export async function GET(request: Request) {
  const auth = await getApiAuthContext(request);
  if (!auth.user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from('ai_edit_jobs')
    .select('id,title,mode,status,error,output_url,preview_url,created_at,updated_at')
    .eq('user_id', auth.user.id)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ jobs: data ?? [] });
}
