/**
 * POST /api/video-engine/runs/from-youtube
 *
 * Stub route — returns a clean 404 with helpful message until YouTube ingest
 * pipeline is built (download via Cobalt → upload to Supabase → /api/video-engine/runs).
 *
 * Without this stub, the frontend YouTubeClipperForm hits a non-existent route
 * and Next.js returns a misleading "405 Method Not Allowed" error.
 *
 * Replace this stub with the real implementation when the queued ingest
 * pipeline is in place.
 */
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error: {
        code: 'YOUTUBE_INGEST_NOT_AVAILABLE',
        message:
          "YouTube-link ingest isn't wired on this environment yet. " +
          'For now, download the video locally and upload it directly from /video-engine, ' +
          'or use /transcribe to get the captions.',
      },
    },
    { status: 404 },
  );
}

// Explicit 405 fallback for non-POST methods so Next.js doesn't synthesize one.
export async function GET() {
  return NextResponse.json(
    { ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'POST only.' } },
    { status: 405 },
  );
}
