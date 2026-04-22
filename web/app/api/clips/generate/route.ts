import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  generateClips,
  isValidMode,
  isValidTone,
  type ClipInput,
  type Tone,
} from '@/lib/v1/clip-generation';
import { getUsageSnapshot, recordGeneration } from '@/lib/v1/usage-server';
import { gateRequest } from '@/lib/v1/usage-limits';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const mode = body.mode;
  const value = typeof body.value === 'string' ? body.value.trim() : '';
  const niche = typeof body.niche === 'string' ? body.niche.trim() : null;
  const tone: Tone = isValidTone(body.tone) ? body.tone : 'bought_because';
  const count = Number.isFinite(body.count) ? Math.floor(Number(body.count)) : 10;
  const seedAngle = typeof body.seedAngle === 'string' ? body.seedAngle.trim() : null;

  if (!isValidMode(mode)) return NextResponse.json({ error: 'invalid_mode' }, { status: 400 });
  if (!value) return NextResponse.json({ error: 'missing_value' }, { status: 400 });
  if (count < 1 || count > 20) return NextResponse.json({ error: 'invalid_count' }, { status: 400 });

  const snapshot = await getUsageSnapshot(user.id);
  const gate = gateRequest(snapshot, count);
  if (!gate.allowed) {
    return NextResponse.json(
      { error: 'limit_reached', reason: gate.reason, message: gate.message, usage: snapshot },
      { status: 402 },
    );
  }

  const input: ClipInput = { mode, value, niche, tone, count };

  try {
    const { clips, source } = await generateClips(input, seedAngle);
    await recordGeneration(user.id, count, clips.length, mode, source);

    const updated = await getUsageSnapshot(user.id);
    return NextResponse.json({ ok: true, clips, source, usage: updated });
  } catch (err) {
    console.error('[api/clips/generate] failed:', err);
    return NextResponse.json({ error: 'generation_failed' }, { status: 500 });
  }
}
