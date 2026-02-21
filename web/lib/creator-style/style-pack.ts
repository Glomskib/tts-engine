/**
 * StylePack aggregation — compile per-video analyses into a creator-level
 * style fingerprint that can be injected into script generation prompts.
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import type { VisualObservation, StyleAnalysis } from './ai-analysis';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StylePack {
  handle: string;
  platform: string;
  videos_analyzed: number;
  aggregated_at: string;

  visual: {
    primary_settings: string[];
    lighting_style: string;
    camera_styles: string[];
    text_overlay_usage: string;
    color_palette: string;
    production_level: string;
  };

  hooks: {
    dominant_types: string[];
    avg_word_count: number;
    templates: string[];
  };

  structure: {
    dominant_format: string;
    typical_flow: string;
    avg_duration_seconds: number;
    pacing: string;
  };

  voice: {
    tone: string;
    person: string;
    transition_phrases: string[];
    signature_cadence: string;
  };

  cta: {
    style: string;
    placement: string;
    template: string;
  };

  content_dna: {
    niche_signals: string[];
    emotional_range: string[];
    audience_relationship: string;
    unique_angle: string;
  };

  /** Ready-to-inject prompt context string */
  prompt_context: string;
}

// ---------------------------------------------------------------------------
// Frequency counter helper
// ---------------------------------------------------------------------------

function topItems(items: string[], limit: number = 3): string[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    const normalized = item.toLowerCase().trim();
    if (normalized) counts.set(normalized, (counts.get(normalized) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([item]) => item);
}

function mostCommon(items: string[]): string {
  const top = topItems(items, 1);
  return top[0] || 'unknown';
}

// ---------------------------------------------------------------------------
// Build StylePack
// ---------------------------------------------------------------------------

export async function buildStylePack(creatorId: string): Promise<StylePack> {
  // Fetch creator info
  const { data: creator, error: creatorErr } = await supabaseAdmin
    .from('style_creators')
    .select('handle, platform')
    .eq('id', creatorId)
    .single();

  if (creatorErr || !creator) {
    throw new Error(`Creator not found: ${creatorId}`);
  }

  // Fetch all completed video analyses
  const { data: videos, error: videosErr } = await supabaseAdmin
    .from('style_creator_videos')
    .select('visual_observation, style_analysis, duration_seconds')
    .eq('creator_id', creatorId)
    .eq('status', 'completed')
    .order('created_at', { ascending: true });

  if (videosErr) throw new Error(`Failed to fetch videos: ${videosErr.message}`);
  if (!videos || videos.length === 0) {
    throw new Error('No completed video analyses found for this creator');
  }

  // Collect all observations and analyses
  const visuals: VisualObservation[] = videos
    .map((v) => v.visual_observation as VisualObservation)
    .filter(Boolean);
  const styles: StyleAnalysis[] = videos
    .map((v) => v.style_analysis as StyleAnalysis)
    .filter(Boolean);

  // Aggregate visuals
  const allSettings = visuals.flatMap((v) => v.visual_patterns?.primary_settings || []);
  const allLighting = visuals.map((v) => v.visual_patterns?.lighting_style).filter(Boolean) as string[];
  const allCamera = visuals.map((v) => v.visual_patterns?.camera_style).filter(Boolean) as string[];
  const allOverlay = visuals.map((v) => v.visual_patterns?.text_overlay_usage).filter(Boolean) as string[];
  const allPalette = visuals.map((v) => v.visual_patterns?.color_palette).filter(Boolean) as string[];
  const allProduction = visuals.map((v) => v.visual_patterns?.production_level).filter(Boolean) as string[];

  // Aggregate hooks
  const allHookTypes = styles.map((s) => s.hook_pattern?.type).filter(Boolean) as string[];
  const allHookWordCounts = styles.map((s) => s.hook_pattern?.avg_word_count).filter(Boolean) as number[];
  const allHookTemplates = styles.map((s) => s.hook_pattern?.template).filter(Boolean) as string[];

  // Aggregate structure
  const allFormats = styles.map((s) => s.structure_pattern?.format).filter(Boolean) as string[];
  const allFlows = styles.map((s) => s.structure_pattern?.flow).filter(Boolean) as string[];
  const allDurations = videos.map((v) => Number(v.duration_seconds)).filter((d) => d > 0);
  const allPacing = styles.map((s) => s.structure_pattern?.pacing).filter(Boolean) as string[];

  // Aggregate voice
  const allTones = styles.map((s) => s.voice_patterns?.tone).filter(Boolean) as string[];
  const allPerson = styles.map((s) => s.voice_patterns?.person).filter(Boolean) as string[];
  const allTransitions = styles.flatMap((s) => s.voice_patterns?.transition_phrases || []);
  const allCadence = styles.map((s) => s.voice_patterns?.signature_cadence).filter(Boolean) as string[];

  // Aggregate CTA
  const allCtaStyles = styles.map((s) => s.cta_pattern?.style).filter(Boolean) as string[];
  const allCtaPlacements = styles.map((s) => s.cta_pattern?.placement).filter(Boolean) as string[];
  const allCtaTemplates = styles.map((s) => s.cta_pattern?.template).filter(Boolean) as string[];

  // Aggregate content DNA
  const allNiche = styles.flatMap((s) => s.content_dna?.niche_signals || []);
  const allEmotional = styles.flatMap((s) => s.content_dna?.emotional_range || []);
  const allRelationship = styles.map((s) => s.content_dna?.audience_relationship).filter(Boolean) as string[];
  const allAngle = styles.map((s) => s.content_dna?.unique_angle).filter(Boolean) as string[];

  const avgWordCount = allHookWordCounts.length > 0
    ? Math.round(allHookWordCounts.reduce((a, b) => a + b, 0) / allHookWordCounts.length)
    : 0;
  const avgDuration = allDurations.length > 0
    ? Math.round(allDurations.reduce((a, b) => a + b, 0) / allDurations.length)
    : 0;

  const visual = {
    primary_settings: topItems(allSettings),
    lighting_style: mostCommon(allLighting),
    camera_styles: topItems(allCamera),
    text_overlay_usage: mostCommon(allOverlay),
    color_palette: mostCommon(allPalette),
    production_level: mostCommon(allProduction),
  };

  const hooks = {
    dominant_types: topItems(allHookTypes),
    avg_word_count: avgWordCount,
    templates: [...new Set(allHookTemplates)].slice(0, 4),
  };

  const structure = {
    dominant_format: mostCommon(allFormats),
    typical_flow: mostCommon(allFlows),
    avg_duration_seconds: avgDuration,
    pacing: mostCommon(allPacing),
  };

  const voice = {
    tone: mostCommon(allTones),
    person: mostCommon(allPerson),
    transition_phrases: topItems(allTransitions, 5),
    signature_cadence: mostCommon(allCadence),
  };

  const cta = {
    style: mostCommon(allCtaStyles),
    placement: mostCommon(allCtaPlacements),
    template: mostCommon(allCtaTemplates),
  };

  const content_dna = {
    niche_signals: topItems(allNiche),
    emotional_range: topItems(allEmotional, 4),
    audience_relationship: mostCommon(allRelationship),
    unique_angle: mostCommon(allAngle),
  };

  // Build prompt_context string
  const prompt_context = [
    `=== STYLE REFERENCE: @${creator.handle} (${videos.length} videos analyzed) ===`,
    `VISUAL: ${visual.production_level}, ${visual.lighting_style}, ${visual.camera_styles.join(' / ')}`,
    `HOOKS: ${hooks.dominant_types.join(' / ')} openers, avg ${hooks.avg_word_count} words`,
    `STRUCTURE: ${structure.typical_flow}, ${structure.pacing}, ~${structure.avg_duration_seconds}s`,
    `VOICE: ${voice.tone}, ${voice.person}, uses "${voice.transition_phrases.slice(0, 3).join('", "')}" transitions`,
    `CTA: ${cta.style} at ${cta.placement}`,
    `DNA: ${content_dna.audience_relationship}, ${content_dna.unique_angle}`,
    `===`,
  ].join('\n');

  const stylePack: StylePack = {
    handle: creator.handle,
    platform: creator.platform,
    videos_analyzed: videos.length,
    aggregated_at: new Date().toISOString(),
    visual,
    hooks,
    structure,
    voice,
    cta,
    content_dna,
    prompt_context,
  };

  // Save to style_creators
  await supabaseAdmin
    .from('style_creators')
    .update({
      style_fingerprint: stylePack,
      fingerprint_version: (await supabaseAdmin
        .from('style_creators')
        .select('fingerprint_version')
        .eq('id', creatorId)
        .single()
        .then(r => (r.data?.fingerprint_version || 0)) ) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', creatorId);

  return stylePack;
}
