/**
 * Edit Notes Generator for Drive Intake.
 *
 * Produces a structured editing brief from a transcript.
 * Uses Claude Haiku for AI sections, with deterministic fallback.
 *
 * Output structure: summary, chapters, hook_candidates, cut_list,
 * b_roll, caption_variants, cta_variants, export_checklist.
 */

const LOG = '[intake:edit-notes]';

export interface EditNotes {
  summary: string;
  chapters: Array<{ start: string; end: string; title: string }>;
  hook_candidates: string[];
  cut_list: Array<{ timestamp: string; action: string; reason: string }>;
  b_roll_suggestions: string[];
  caption_variants: Array<{ platform: string; caption: string }>;
  cta_variants: string[];
  export_checklist: Array<{ item: string; done: boolean }>;
  generated_at: string;
  method: 'ai' | 'template';
}

interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Generate edit notes from transcript + segments.
 * Tries AI first, falls back to deterministic template.
 */
export async function generateEditNotes(
  transcript: string,
  segments: TranscriptSegment[],
  fileName: string,
  durationSeconds: number,
): Promise<EditNotes> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (apiKey && transcript.length > 50) {
    try {
      return await generateWithAI(transcript, segments, fileName, durationSeconds, apiKey);
    } catch (err) {
      console.warn(`${LOG} AI generation failed, using template:`, err instanceof Error ? err.message : err);
    }
  }

  return generateFromTemplate(transcript, segments, fileName, durationSeconds);
}

async function generateWithAI(
  transcript: string,
  segments: TranscriptSegment[],
  fileName: string,
  durationSeconds: number,
  apiKey: string,
): Promise<EditNotes> {
  const systemPrompt = `You are a video editor's assistant. Given a video transcript, produce a structured editing brief as JSON.

Respond with ONLY a JSON object (no markdown fences):
{
  "summary": "1-2 sentence summary of the video content",
  "chapters": [{"start": "0:00", "end": "0:30", "title": "Intro/Hook"}],
  "hook_candidates": ["Best opening line options for social clips"],
  "cut_list": [{"timestamp": "0:15", "action": "trim_dead_air", "reason": "Long pause"}],
  "b_roll_suggestions": ["Relevant B-roll ideas to enhance the video"],
  "caption_variants": [
    {"platform": "tiktok", "caption": "Short punchy caption"},
    {"platform": "youtube", "caption": "Longer descriptive caption"},
    {"platform": "instagram", "caption": "Engaging IG caption"}
  ],
  "cta_variants": ["Subscribe for more!", "Drop a comment below!"]
}

Keep it practical and actionable. Focus on what an editor needs.`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: `File: ${fileName}\nDuration: ${formatTimestamp(durationSeconds)}\n\nTranscript:\n${transcript.slice(0, 6000)}`,
      }],
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) throw new Error(`Haiku HTTP ${res.status}`);

  const data = await res.json();
  const text = data.content?.[0]?.text || '';
  const jsonStr = text.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
  const parsed = JSON.parse(jsonStr);

  return {
    summary: parsed.summary || '',
    chapters: Array.isArray(parsed.chapters) ? parsed.chapters : [],
    hook_candidates: Array.isArray(parsed.hook_candidates) ? parsed.hook_candidates : [],
    cut_list: Array.isArray(parsed.cut_list) ? parsed.cut_list : [],
    b_roll_suggestions: Array.isArray(parsed.b_roll_suggestions) ? parsed.b_roll_suggestions : [],
    caption_variants: Array.isArray(parsed.caption_variants) ? parsed.caption_variants : [],
    cta_variants: Array.isArray(parsed.cta_variants) ? parsed.cta_variants : [],
    export_checklist: defaultChecklist(),
    generated_at: new Date().toISOString(),
    method: 'ai',
  };
}

function generateFromTemplate(
  transcript: string,
  segments: TranscriptSegment[],
  fileName: string,
  durationSeconds: number,
): EditNotes {
  // Build chapters from segments (group every ~30 seconds)
  const chapters: EditNotes['chapters'] = [];
  const chunkSize = 30;
  for (let i = 0; i < durationSeconds; i += chunkSize) {
    const end = Math.min(i + chunkSize, durationSeconds);
    const chapterSegments = segments.filter(s => s.start >= i && s.start < end);
    const title = chapterSegments.length > 0
      ? chapterSegments[0].text.slice(0, 40) + '...'
      : `Section ${Math.floor(i / chunkSize) + 1}`;
    chapters.push({
      start: formatTimestamp(i),
      end: formatTimestamp(end),
      title,
    });
  }

  // Extract first sentence as hook candidate
  const firstSentence = transcript.split(/[.!?]/)[0]?.trim() || transcript.slice(0, 100);

  return {
    summary: `Video "${fileName}" — ${formatTimestamp(durationSeconds)} duration. ${segments.length} transcript segments.`,
    chapters,
    hook_candidates: [firstSentence],
    cut_list: [],
    b_roll_suggestions: ['[Review transcript for product shots or context B-roll opportunities]'],
    caption_variants: [
      { platform: 'tiktok', caption: firstSentence.slice(0, 150) },
      { platform: 'youtube', caption: transcript.slice(0, 300) },
      { platform: 'instagram', caption: firstSentence.slice(0, 200) },
    ],
    cta_variants: ['Watch the full video!', 'Follow for more content like this!'],
    export_checklist: defaultChecklist(),
    generated_at: new Date().toISOString(),
    method: 'template',
  };
}

function defaultChecklist(): EditNotes['export_checklist'] {
  return [
    { item: 'Review raw footage quality', done: false },
    { item: 'Trim dead air and pauses', done: false },
    { item: 'Add intro/hook within first 3 seconds', done: false },
    { item: 'Add captions/subtitles', done: false },
    { item: 'Color grade and stabilize', done: false },
    { item: 'Add background music', done: false },
    { item: 'Add CTA overlay at end', done: false },
    { item: 'Export in 9:16 (TikTok/Reels) and 16:9 (YouTube)', done: false },
    { item: 'Final review before posting', done: false },
  ];
}
