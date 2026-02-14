import { NextResponse } from 'next/server';
import { validateApiAccess } from '@/lib/auth/validateApiAccess';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

/**
 * POST /api/transcribe/save-to-studio
 *
 * Saves a transcriber AI rewrite as a concept + script in the content pipeline.
 * Requires authenticated paid user.
 */
export async function POST(request: Request) {
  const auth = await validateApiAccess(request);
  if (!auth) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  let body: {
    rewritten_hook?: string;
    rewritten_script?: string;
    on_screen_text?: string[];
    cta?: string;
    persona_used?: string;
    tone_used?: string;
    source_url?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request body' }, { status: 400 });
  }

  const { rewritten_hook, rewritten_script, on_screen_text, cta, persona_used, tone_used, source_url } = body;

  if (!rewritten_script) {
    return NextResponse.json({ ok: false, error: 'Rewritten script is required' }, { status: 400 });
  }

  try {
    // 1. Create concept
    const conceptTitle = source_url
      ? `Rewrite of ${source_url.replace('https://www.tiktok.com/', '').slice(0, 60)}`
      : `AI Rewrite — ${persona_used || 'Custom'}`;

    const { data: concept, error: conceptErr } = await supabaseAdmin
      .from('concepts')
      .insert({
        title: conceptTitle,
        core_angle: `${persona_used || 'Custom'} × ${tone_used || 'Conversational'}`,
        source_url: source_url || null,
        notes: `Generated via Transcriber AI Rewrite. Persona: ${persona_used}, Tone: ${tone_used}`,
        user_id: auth.userId,
      })
      .select('id')
      .single();

    if (conceptErr || !concept) {
      console.error('[save-to-studio] Concept insert error:', conceptErr);
      return NextResponse.json({ ok: false, error: 'Failed to create concept' }, { status: 500 });
    }

    // 2. Auto-generate caption and hashtags from script
    const words = rewritten_script.split(/\s+/).slice(0, 20).join(' ');
    const caption = words.length > 100 ? words.slice(0, 100) + '...' : words;
    const hashtags = ['#tiktok', '#ugc', '#fyp'];
    if (persona_used) hashtags.push(`#${persona_used.toLowerCase().replace(/\s+/g, '')}`);

    // 3. Create script
    const { error: scriptErr } = await supabaseAdmin
      .from('scripts')
      .insert({
        concept_id: concept.id,
        user_id: auth.userId,
        title: rewritten_hook ? `"${rewritten_hook.slice(0, 60)}"` : conceptTitle,
        spoken_script: rewritten_script,
        on_screen_text: on_screen_text?.join(' | ') || null,
        cta: cta || null,
        caption,
        hashtags,
        status: 'DRAFT',
        version: 1,
        created_by: auth.userId,
      });

    if (scriptErr) {
      console.error('[save-to-studio] Script insert error:', scriptErr);
      return NextResponse.json({ ok: false, error: 'Failed to create script' }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      concept_id: concept.id,
    });
  } catch (err) {
    console.error('[save-to-studio] Error:', err);
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 });
  }
}
