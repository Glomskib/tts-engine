import { supabaseAdmin } from '@/lib/supabaseAdmin';

// ── Interfaces ──

export interface StyleProfile {
  scripts_analyzed: number;
  built_at: string;
  voice: {
    tone: string;
    person: string;
    energy_level: string;
    formality: string;
  };
  hooks: {
    dominant_types: string[];
    avg_word_count: number;
    examples: string[];
  };
  structure: {
    typical_flow: string;
    pacing: string;
    avg_script_length_words: number;
  };
  cta: {
    style: string;
    examples: string[];
  };
  vocabulary: {
    signature_phrases: string[];
    filler_words: string[];
    power_words: string[];
    words_to_avoid: string[];
  };
  content_patterns: {
    humor_level: string;
    storytelling_style: string;
    product_integration: string;
  };
  prompt_context: string;
}

// ── Helpers ──

interface SkitBeat {
  dialogue?: string;
  action?: string;
}

interface SkitData {
  hook_line?: string;
  beats?: SkitBeat[];
  cta_line?: string;
}

/**
 * Extract full spoken text from a skit's JSON data.
 * Concatenates hook_line + all beats dialogue + cta_line.
 */
export function extractScriptText(skitData: unknown): string {
  if (!skitData || typeof skitData !== 'object') return '';

  const data = skitData as SkitData;
  const parts: string[] = [];

  if (data.hook_line) parts.push(data.hook_line);

  if (Array.isArray(data.beats)) {
    for (const beat of data.beats) {
      if (beat.dialogue) parts.push(beat.dialogue);
    }
  }

  if (data.cta_line) parts.push(data.cta_line);

  return parts.join(' ').trim();
}

// ── Main builder ──

/**
 * Build a style profile for a user from their approved scripts.
 * Analyzes all approved/produced/posted scripts and creates a reusable prompt context.
 */
export async function buildStyleProfile(userId: string): Promise<StyleProfile> {
  // 1. Fetch approved scripts
  const { data: skits, error } = await supabaseAdmin
    .from('saved_skits')
    .select('id, skit_data, product_brand, status, created_at')
    .eq('user_id', userId)
    .in('status', ['approved', 'produced', 'posted'])
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) throw new Error(`Failed to fetch scripts: ${error.message}`);

  // 2. Extract text from each script
  const scriptTexts: { text: string; brand: string | null }[] = [];
  for (const skit of skits || []) {
    const text = extractScriptText(skit.skit_data);
    if (text.length > 20) {
      scriptTexts.push({ text, brand: skit.product_brand });
    }
  }

  // 3. Minimum threshold
  if (scriptTexts.length < 3) {
    throw new Error('Need at least 3 approved scripts to build a style profile');
  }

  // 4. Send to Claude for analysis
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

  const scriptsForAnalysis = scriptTexts
    .slice(0, 30)
    .map((s, i) => `--- Script ${i + 1} ---\n${s.text}`)
    .join('\n\n');

  const analysisPrompt = `Analyze these ${scriptTexts.length} short-form video scripts written by the same creator. Extract their consistent writing style patterns.

${scriptsForAnalysis}

Return a JSON object with this exact structure (no markdown, no code fences, just raw JSON):
{
  "voice": {
    "tone": "describe their overall tone in 3-5 words",
    "person": "first person / second person direct / third person / mixed",
    "energy_level": "high energy / moderate / calm / varies",
    "formality": "very casual / casual / balanced / professional"
  },
  "hooks": {
    "dominant_types": ["list 2-4 hook types they use most, e.g. question, bold claim, relatable scenario, statistic, shock value"],
    "avg_word_count": 0,
    "examples": ["their top 3 actual hook lines from the scripts, verbatim"]
  },
  "structure": {
    "typical_flow": "describe their typical script flow, e.g. hook > problem > solution > CTA",
    "pacing": "describe their pacing style, e.g. quick punchy sentences / conversational flow / slow build",
    "avg_script_length_words": 0
  },
  "cta": {
    "style": "soft suggestion / direct command / fear of missing out / social proof / question",
    "examples": ["their top 3 actual CTA lines from the scripts, verbatim"]
  },
  "vocabulary": {
    "signature_phrases": ["3-6 recurring phrases or expressions they use"],
    "filler_words": ["casual words they pepper in, e.g. honestly, like, lowkey, literally"],
    "power_words": ["3-6 emotional or persuasive words they favor"],
    "words_to_avoid": ["words they consistently never use despite being common in UGC"]
  },
  "content_patterns": {
    "humor_level": "heavy humor / occasional wit / dry humor / serious / none",
    "storytelling_style": "personal anecdotes / hypotheticals / listicle / before-after / problem-solution",
    "product_integration": "weave in naturally / direct demo / before-after transformation / testimonial style"
  }
}

Be specific and grounded in the actual scripts. Use their real words for examples. Calculate actual averages for word counts.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 2048,
      temperature: 0.3,
      system: 'You are a writing style analyst for short-form video scripts. You return only valid JSON, no markdown formatting.',
      messages: [{ role: 'user', content: analysisPrompt }],
    }),
    signal: AbortSignal.timeout(60000),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Anthropic API error ${response.status}: ${errText.slice(0, 300)}`);
  }

  const aiData = await response.json();
  const rawText: string = aiData.content?.[0]?.text || '';

  // 5. Parse response
  let analysis: Omit<StyleProfile, 'scripts_analyzed' | 'built_at' | 'prompt_context'>;
  try {
    // Strip any markdown code fences if present
    const cleaned = rawText.replace(/^```(?:json)?\s*\n?/m, '').replace(/\n?```\s*$/m, '').trim();
    analysis = JSON.parse(cleaned);
  } catch {
    throw new Error(`Failed to parse style analysis: ${rawText.slice(0, 200)}`);
  }

  // 6. Build prompt_context
  const prompt_context = [
    `=== YOUR WRITING STYLE PROFILE (${scriptTexts.length} scripts analyzed) ===`,
    `VOICE: ${analysis.voice.tone}, ${analysis.voice.person}, ${analysis.voice.energy_level}, ${analysis.voice.formality}`,
    `HOOKS: ${analysis.hooks.dominant_types.join(' / ')} openers, avg ${analysis.hooks.avg_word_count} words`,
    `STRUCTURE: ${analysis.structure.typical_flow}, ${analysis.structure.pacing}, ~${analysis.structure.avg_script_length_words} words avg`,
    `CTA: ${analysis.cta.style}`,
    `VOCABULARY: Uses "${analysis.vocabulary.signature_phrases.slice(0, 4).join('", "')}"`,
    analysis.vocabulary.filler_words.length > 0
      ? `FILLER WORDS: ${analysis.vocabulary.filler_words.join(', ')}`
      : null,
    `HUMOR: ${analysis.content_patterns.humor_level}`,
    `STORYTELLING: ${analysis.content_patterns.storytelling_style}`,
    `PRODUCT INTEGRATION: ${analysis.content_patterns.product_integration}`,
    ``,
    `CRITICAL: Match this creator's natural voice. Use their vocabulary, pacing, and hook style.`,
    `Do NOT sanitize their language into generic marketing copy.`,
    `===`,
  ].filter(Boolean).join('\n');

  const now = new Date().toISOString();
  const profile: StyleProfile = {
    ...analysis,
    scripts_analyzed: scriptTexts.length,
    built_at: now,
    prompt_context,
  };

  // 7. Upsert into database
  const { data: existing } = await supabaseAdmin
    .from('ff_style_profiles')
    .select('version')
    .eq('user_id', userId)
    .single();

  const newVersion = (existing?.version ?? 0) + 1;

  const { error: upsertError } = await supabaseAdmin
    .from('ff_style_profiles')
    .upsert(
      {
        user_id: userId,
        profile_data: profile,
        prompt_context,
        scripts_analyzed: scriptTexts.length,
        version: newVersion,
        built_at: now,
      },
      { onConflict: 'user_id' }
    );

  if (upsertError) {
    throw new Error(`Failed to save style profile: ${upsertError.message}`);
  }

  return profile;
}
