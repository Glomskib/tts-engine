/**
 * POST /api/transcribe/vibe
 *
 * Runs vibe analysis on transcript data.
 * Called after transcription completes — does NOT re-download the video.
 *
 * Input: { transcript, segments, duration, analysis?, frames? }
 * Output: { vibe: VibeAnalysis }
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { extractPacingSignals } from '@/lib/vibe-analysis/signals';
import { interpretVibe } from '@/lib/vibe-analysis/interpret';
import type { VibeAnalysis } from '@/lib/vibe-analysis/types';
import { logUsageEventAsync } from '@/lib/finops/log-usage';
import { aiRouteGuard } from '@/lib/ai-route-guard';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(request: Request) {
  const guard = await aiRouteGuard(request, { creditCost: 2, userLimit: 6 });
  if (guard.error) return guard.error;

  const auth = await getApiAuthContext(request);

  let body: {
    transcript?: string;
    segments?: Array<{ start: number; end: number; text: string }>;
    duration?: number;
    analysis?: Record<string, unknown> | null;
    frames?: Array<{ timestamp_seconds: number; base64_jpeg: string }>;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { transcript, segments, duration, analysis, frames } = body;

  if (!transcript || !segments || !duration) {
    return NextResponse.json(
      { error: 'transcript, segments, and duration are required' },
      { status: 400 },
    );
  }

  if (!Array.isArray(segments) || segments.length === 0) {
    return NextResponse.json(
      { error: 'segments must be a non-empty array' },
      { status: 400 },
    );
  }

  if (typeof duration !== 'number' || duration <= 0) {
    return NextResponse.json(
      { error: 'duration must be a positive number' },
      { status: 400 },
    );
  }

  try {
    const startMs = Date.now();

    // Step 1: Extract pacing signals (deterministic, instant)
    const signals = extractPacingSignals(segments, duration);

    // Step 2: AI interpretation (Claude Haiku, ~2-5s)
    const vibe: VibeAnalysis = await interpretVibe({
      transcript,
      segments,
      duration,
      signals,
      existingAnalysis: analysis ?? null,
      frames: frames?.map((f) => ({
        timestamp_seconds: f.timestamp_seconds,
        base64_jpeg: f.base64_jpeg,
      })),
    });

    // Log usage (fire-and-forget)
    logUsageEventAsync({
      source: 'flashflow',
      lane: 'FlashFlow',
      provider: 'anthropic',
      model: 'claude-haiku-4-5-20251001',
      input_tokens: 0, // Estimated — actual tracked by interpretVibe
      output_tokens: 0,
      user_id: auth.user?.id,
      endpoint: '/api/transcribe/vibe',
      template_key: 'vibe_analysis',
      agent_id: 'flash',
      metadata: {
        duration_seconds: duration,
        segment_count: segments.length,
        has_frames: !!(frames && frames.length > 0),
        processing_ms: Date.now() - startMs,
      },
    });

    return NextResponse.json({ vibe });
  } catch (err) {
    console.error('[vibe-analysis] Error:', err);
    return NextResponse.json(
      { error: 'Vibe analysis failed. Please try again.' },
      { status: 500 },
    );
  }
}
