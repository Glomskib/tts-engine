/**
 * POST /api/editor/jobs/[id]/post-to-tiktok
 *
 * Returns a fallback payload the client uses to open TikTok's upload page
 * and paste the MP4 URL. Late.dev's Node client currently lacks a direct
 * video-upload path for edit_jobs in this repo, so we surface the MP4
 * public URL + tiktok upload URL and let the user drop it in.
 *
 * If LATE_API_KEY is set we mark `late_configured: true` so the UI can
 * later switch to a true "schedule now" flow once a video-upload helper
 * lands — but we still return the fallback for honesty.
 */
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getApiAuthContext } from '@/lib/supabase/api-auth';

export const runtime = 'nodejs';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await getApiAuthContext(request);
  if (!auth.user) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const { id } = await params;

  const { data: job, error } = await supabaseAdmin
    .from('edit_jobs')
    .select('id,user_id,status,output_url')
    .eq('id', id)
    .eq('user_id', auth.user.id)
    .single();

  if (error || !job) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  if (job.status !== 'completed' || !job.output_url) {
    return NextResponse.json({ error: 'NOT_READY' }, { status: 409 });
  }

  const lateConfigured = !!process.env.LATE_API_KEY;

  return NextResponse.json({
    ok: true,
    fallback: true,
    late_configured: lateConfigured,
    tiktok_upload_url: 'https://www.tiktok.com/upload',
    mp4_url: job.output_url,
  });
}
