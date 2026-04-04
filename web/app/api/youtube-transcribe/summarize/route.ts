import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { aiRouteGuard } from '@/lib/ai-route-guard';

export const runtime = 'nodejs';
export const maxDuration = 30;

interface VideoTranscript {
  videoId: string;
  url: string;
  transcript: string;
  label: string; // "Video 1", "Video 2", etc.
}

export async function POST(request: Request) {
  const guard = await aiRouteGuard(request, { creditCost: 2, userLimit: 5 });
  if (guard.error) return guard.error;

  const auth = await getApiAuthContext(request);
  if (!auth.user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    return NextResponse.json({ error: 'AI service not configured' }, { status: 500 });
  }

  let body: { videos?: VideoTranscript[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { videos } = body;
  if (!videos || !Array.isArray(videos) || videos.length === 0) {
    return NextResponse.json({ error: 'videos array is required' }, { status: 400 });
  }

  // Build combined transcript block with video labels
  const combinedTranscripts = videos
    .map((v) => `=== ${v.label} (${v.url}) ===\n${v.transcript.slice(0, 8000)}`)
    .join('\n\n');

  const videoCount = videos.length;

  try {
    const summaryPrompt = `You are analyzing ${videoCount} YouTube videos on the same topic. Synthesize insights across ALL videos into a unified summary. Return ONLY valid JSON with no markdown formatting or explanation.

TRANSCRIPTS:
${combinedTranscripts.slice(0, 30000)}

Return this exact JSON structure:
{
  "summary": "<2-4 paragraph synthesis across all videos. Note where videos agree, disagree, or provide unique insights. Reference videos by their labels (Video 1, Video 2, etc.) when making specific points.>",
  "keyPoints": ["<point that synthesizes across videos>", ...],
  "topics": ["<topic tag>", ...],
  "takeaways": ["<actionable takeaway combining insights from multiple videos>", ...],
  "suggestedQuestions": ["<cross-video question>", ...],
  "perVideoHighlights": [
    {"label": "Video 1", "highlight": "<1-2 sentence unique contribution of this video>"},
    ...
  ]
}

Guidelines:
- summary: Synthesize, don't just list. What's the consensus? Where do they differ? What's the complete picture?
- keyPoints: 5-10 points that combine or compare insights across videos
- topics: 3-8 topic tags covering all videos
- takeaways: 4-6 actionable items derived from the combined knowledge
- suggestedQuestions: 4-5 questions that leverage having multiple video perspectives (e.g. "Which video's approach is best for beginners?", "What do all videos agree on?")
- perVideoHighlights: One entry per video with its unique contribution`;

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 3000,
        temperature: 0.3,
        messages: [{ role: 'user', content: summaryPrompt }],
      }),
      signal: AbortSignal.timeout(25000),
    });

    if (!claudeRes.ok) {
      console.error('[youtube-summarize] Claude error:', claudeRes.status);
      return NextResponse.json({ error: 'AI analysis failed' }, { status: 502 });
    }

    const claudeData = await claudeRes.json();
    const text = claudeData.content?.[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 500 });
    }

    const analysis = JSON.parse(jsonMatch[0]);
    return NextResponse.json({ analysis });
  } catch (err) {
    console.error('[youtube-summarize] Error:', err);
    return NextResponse.json({ error: 'Failed to generate summary' }, { status: 500 });
  }
}
