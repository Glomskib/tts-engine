/**
 * Competitor Spy Report API
 *
 * Takes a TikTok URL → downloads video → transcribes → runs deep Claude
 * analysis → generates 3 "steal this" script variations → returns full report.
 *
 * Stripe products:
 *   Single report ($9):  price_1T4CylKXraIWnC5DC6tRky7u
 *   Three-pack ($19):    price_1T4CylKXraIWnC5DsX6ctgpw
 */

import { NextResponse } from 'next/server';
import { tmpdir } from 'os';
import { join } from 'path';
import { stat, unlink, writeFile } from 'fs/promises';
import { createReadStream, existsSync } from 'fs';
import { randomUUID } from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import OpenAI from 'openai';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { downloadTikTokVideo } from '@/lib/tiktok-downloader';
import { assertFeature } from '@/lib/openclaw-gate';

export const runtime = 'nodejs';
export const maxDuration = 120; // 2 min — spy reports are heavier than basic transcripts

const execFileAsync = promisify(execFile);
const WHISPER_MAX_SIZE = 24 * 1024 * 1024;

// ============================================================================
// Auth — simple API token check for now
// ============================================================================

function validateAuth(request: Request): boolean {
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  return token === process.env.FF_API_TOKEN || token === process.env.MC_API_TOKEN;
}

// ============================================================================
// Audio preparation (same as transcribe route)
// ============================================================================

async function prepareAudioFile(videoPath: string): Promise<string> {
  const fileSize = (await stat(videoPath)).size;
  if (fileSize <= WHISPER_MAX_SIZE) return videoPath;

  const audioPath = videoPath.replace('.mp4', '.mp3');
  await execFileAsync(ffmpegInstaller.path, [
    '-i', videoPath, '-vn', '-acodec', 'libmp3lame',
    '-ab', '128k', '-ar', '44100', '-y', audioPath,
  ], { timeout: 15000 });

  if (!existsSync(audioPath)) throw new Error('Audio extraction failed');
  return audioPath;
}

// ============================================================================
// Deep Analysis Prompt (much richer than the basic transcribe analysis)
// ============================================================================

function buildSpyReportPrompt(transcript: string, duration: number): string {
  return `You are a TikTok content strategist. Analyze this competitor's video and produce a comprehensive teardown report.

TRANSCRIPT:
${transcript}

VIDEO DURATION: ${duration}s

Return ONLY valid JSON with this exact structure:
{
  "executive_summary": "2-3 sentence overview of what this video does and why it works (or doesn't)",

  "hook_breakdown": {
    "hook_text": "The exact opening line(s) — first 3 seconds",
    "hook_type": "question | shock | relatable | controversial | curiosity | story | instruction | trend",
    "hook_strength": 8,
    "why_it_works": "Specific analysis of the psychological trigger",
    "pattern": "The underlying formula (e.g., 'Curiosity gap + personal stake')",
    "reusable_template": "A fill-in-the-blank version you can adapt: 'I [unexpected action] and [result]...'"
  },

  "script_structure": {
    "format": "tutorial | story time | product review | skit | rant | educational | day-in-life | comparison | unboxing",
    "pacing": "Description of pacing and why it works",
    "story_arc": "How the content flows: setup → conflict → resolution",
    "transitions": ["Key transition phrases or moments that keep viewers watching"],
    "cta_analysis": {
      "cta_text": "The exact call-to-action used",
      "cta_style": "soft | medium | hard",
      "effectiveness": "Why this CTA works (or doesn't) for this content"
    }
  },

  "audience_psychology": {
    "target_audience": "Who this content is made for",
    "primary_emotion": "The dominant emotion targeted",
    "emotional_triggers": ["3-5 specific emotions the content hits"],
    "sharing_motivation": "Why someone would share or save this",
    "comment_bait": "What makes people want to comment"
  },

  "content_tactics": {
    "power_words": ["5-8 specific high-impact words/phrases from the script"],
    "persuasion_techniques": ["2-4 persuasion principles used (scarcity, social proof, authority, etc.)"],
    "retention_tricks": ["2-3 specific techniques keeping viewers watching"],
    "product_integration": "How naturally the product/pitch is woven into content"
  },

  "competitive_intel": {
    "strengths": ["3-4 things this creator does exceptionally well"],
    "weaknesses": ["2-3 things that could be improved or are missing"],
    "differentiation_opportunities": ["2-3 ways you could do this BETTER for your own product"]
  },

  "overall_score": {
    "hook": 8,
    "content": 7,
    "cta": 6,
    "virality_potential": 7,
    "total": 7
  }
}

Be brutally specific and actionable. No generic advice. Every insight should reference the actual transcript.`;
}

// ============================================================================
// Script Variation Prompt
// ============================================================================

function buildVariationPrompt(
  transcript: string,
  analysis: SpyAnalysis,
  variationIndex: number,
): string {
  const personas = [
    { name: 'The Skeptic Convert', voice: 'Starts doubtful, ends convinced. "I thought this was BS but..." Relatable skepticism that builds trust.' },
    { name: 'The Hype Friend', voice: 'High energy, sharing with their bestie. "BRO you NEED to see this." Infectious excitement, rapid-fire delivery.' },
    { name: 'The Educator', voice: 'Calm authority. Drops knowledge. "Here\'s what 90% of people don\'t know..." Makes viewers feel smarter.' },
  ];

  const persona = personas[variationIndex % personas.length];

  return `You're a UGC script writer. Using the competitor analysis below, write a "steal this" script variation that uses the SAME winning patterns but with a different angle.

ORIGINAL TRANSCRIPT:
${transcript}

WINNING PATTERNS IDENTIFIED:
- Hook pattern: ${analysis.hook_breakdown?.reusable_template || 'N/A'}
- Content format: ${analysis.script_structure?.format || 'N/A'}
- CTA style: ${analysis.script_structure?.cta_analysis?.cta_style || 'N/A'}
- Primary emotion: ${analysis.audience_psychology?.primary_emotion || 'N/A'}
- Power words: ${analysis.content_tactics?.power_words?.join(', ') || 'N/A'}

YOUR PERSONA: ${persona.name} — ${persona.voice}

Write a 30-60 second UGC script that a TikTok Shop seller could film TODAY using the same psychological patterns but with their OWN product. Use [PRODUCT] as a placeholder.

Return ONLY valid JSON:
{
  "persona": "${persona.name}",
  "hook": "The scroll-stopping opening line (3 seconds max)",
  "setup": "5-10 seconds of context/problem",
  "body": "15-30 seconds of pitch/demo/story with [stage directions]",
  "cta": "Natural call to action (3-5 seconds)",
  "on_screen_text": ["overlay 1", "overlay 2", "overlay 3"],
  "filming_notes": "Angle, energy, props, background tips",
  "why_this_works": "1-2 sentences on which competitor patterns this borrows"
}`;
}

// ============================================================================
// Types
// ============================================================================

interface SpyAnalysis {
  executive_summary?: string;
  hook_breakdown?: {
    hook_text?: string;
    hook_type?: string;
    hook_strength?: number;
    why_it_works?: string;
    pattern?: string;
    reusable_template?: string;
  };
  script_structure?: {
    format?: string;
    pacing?: string;
    story_arc?: string;
    transitions?: string[];
    cta_analysis?: {
      cta_text?: string;
      cta_style?: string;
      effectiveness?: string;
    };
  };
  audience_psychology?: {
    target_audience?: string;
    primary_emotion?: string;
    emotional_triggers?: string[];
    sharing_motivation?: string;
    comment_bait?: string;
  };
  content_tactics?: {
    power_words?: string[];
    persuasion_techniques?: string[];
    retention_tricks?: string[];
    product_integration?: string;
  };
  competitive_intel?: {
    strengths?: string[];
    weaknesses?: string[];
    differentiation_opportunities?: string[];
  };
  overall_score?: {
    hook?: number;
    content?: number;
    cta?: number;
    virality_potential?: number;
    total?: number;
  };
}

interface ScriptVariation {
  persona: string;
  hook: string;
  setup: string;
  body: string;
  cta: string;
  on_screen_text: string[];
  filming_notes: string;
  why_this_works: string;
}

// ============================================================================
// Claude API helper
// ============================================================================

async function callClaude(prompt: string, model = 'claude-sonnet-4-5-20250929', maxTokens = 3000): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature: 0.4,
      messages: [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Claude API error ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  return data.content?.[0]?.text || '';
}

function parseJSON<T>(text: string): T {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON object found in response');
  return JSON.parse(match[0]) as T;
}

// ============================================================================
// POST /api/spy-report
// ============================================================================

export async function POST(request: Request) {
  const gate = assertFeature('external_research');
  if (!gate.ok) {
    return NextResponse.json(
      { ok: false, error: gate.message, code: gate.code },
      { status: gate.status ?? 200 },
    );
  }

  // Auth check
  if (!validateAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { url?: string; customer_email?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { url, customer_email } = body;
  if (!url || typeof url !== 'string') {
    return NextResponse.json({ error: 'TikTok URL is required' }, { status: 400 });
  }

  // Validate TikTok URL
  try {
    const parsed = new URL(url);
    const validHosts = ['www.tiktok.com', 'tiktok.com', 'vm.tiktok.com', 'm.tiktok.com', 'vt.tiktok.com'];
    if (!validHosts.includes(parsed.hostname)) {
      return NextResponse.json({ error: 'Please provide a valid TikTok URL' }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 });
  }

  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    return NextResponse.json({ error: 'Transcription service not configured' }, { status: 500 });
  }

  const id = randomUUID();
  const videoPath = join(tmpdir(), `spy-${id}.mp4`);
  const filesToClean: string[] = [videoPath];

  try {
    // ── Step 1: Download video ──────────────────────────────────────────
    console.log('[spy-report] Downloading:', url);
    const videoBuffer = await downloadTikTokVideo(url);
    await writeFile(videoPath, videoBuffer);
    console.log('[spy-report] Downloaded:', (videoBuffer.length / 1024 / 1024).toFixed(1), 'MB');

    // ── Step 2: Prepare audio & transcribe ──────────────────────────────
    const whisperInputPath = await prepareAudioFile(videoPath);
    if (whisperInputPath !== videoPath) filesToClean.push(whisperInputPath);

    console.log('[spy-report] Transcribing with Whisper...');
    const openai = new OpenAI({ apiKey: openaiKey });
    const transcription = await openai.audio.transcriptions.create({
      file: createReadStream(whisperInputPath),
      model: 'whisper-1',
      response_format: 'verbose_json',
      timestamp_granularities: ['segment'],
    });

    const transcript = transcription.text || '';
    const duration = transcription.duration || 0;
    const segments = (transcription.segments || []).map((s) => ({
      start: s.start, end: s.end, text: s.text,
    }));

    if (transcript.length < 10) {
      return NextResponse.json(
        { error: 'Could not extract enough speech from this video. Try a video with clear spoken content.' },
        { status: 422 },
      );
    }

    // ── Step 3: Deep analysis (Claude Sonnet) ───────────────────────────
    console.log('[spy-report] Running deep analysis...');
    const analysisPrompt = buildSpyReportPrompt(transcript, duration);
    const analysisRaw = await callClaude(analysisPrompt);
    const analysis = parseJSON<SpyAnalysis>(analysisRaw);

    // ── Step 4: Generate 3 script variations (parallel) ─────────────────
    console.log('[spy-report] Generating script variations...');
    const variationPromises = [0, 1, 2].map(async (i) => {
      const prompt = buildVariationPrompt(transcript, analysis, i);
      const raw = await callClaude(prompt, 'claude-haiku-4-5-20251001', 1500);
      try {
        return parseJSON<ScriptVariation>(raw);
      } catch {
        console.warn(`[spy-report] Variation ${i} parse failed, skipping`);
        return null;
      }
    });

    const variations = (await Promise.all(variationPromises)).filter(Boolean) as ScriptVariation[];

    // ── Clean up temp files ─────────────────────────────────────────────
    cleanupFiles(filesToClean);

    // ── Build final report ──────────────────────────────────────────────
    const report = {
      id,
      url,
      customer_email: customer_email || null,
      generated_at: new Date().toISOString(),
      video: {
        transcript,
        duration,
        segments,
        word_count: transcript.split(/\s+/).length,
      },
      analysis,
      script_variations: variations,
    };

    console.log('[spy-report] Report generated successfully:', id);

    return NextResponse.json(report);
  } catch (err) {
    cleanupFiles(filesToClean);
    console.error('[spy-report] Error:', err);

    const message = err instanceof Error ? err.message : 'Unknown error';

    if (message.includes('timed out') || message.includes('ETIMEDOUT') || message.includes('AbortError')) {
      return NextResponse.json({ error: 'Download timed out. The video may be too long.' }, { status: 504 });
    }
    if (message.includes('All download services failed')) {
      return NextResponse.json({ error: 'TikTok download service temporarily unavailable. Try again shortly.' }, { status: 503 });
    }
    if (message.includes('Claude API error')) {
      return NextResponse.json({ error: 'AI analysis service error. Please try again.' }, { status: 502 });
    }

    return NextResponse.json({ error: 'Failed to generate spy report. Please try again.' }, { status: 500 });
  }
}

function cleanupFiles(paths: string[]) {
  for (const p of paths) {
    try {
      if (existsSync(p)) unlink(p).catch(() => {});
    } catch { /* ignore */ }
  }
}
