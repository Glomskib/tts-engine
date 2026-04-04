/**
 * Build an Editing Pack — everything an editor needs to cut a video.
 * Works with partial data; omits sections that have no content.
 */

export interface EditingPackVideo {
  id: string;
  video_code?: string | null;
  brand_name?: string | null;
  product_name?: string | null;
  product_sku?: string | null;
  script_locked_text?: string | null;
  recording_status?: string | null;
  final_video_url?: string | null;
  google_drive_url?: string | null;
  posted_platform?: string | null;
  // From /api/videos/[id]/details
  concept?: {
    title?: string | null;
    on_screen_text_hook?: string | null;
    on_screen_text_mid?: string | null;
    on_screen_text_cta?: string | null;
    visual_hook?: string | null;
    notes?: string | null;
    tone_preset?: string | null;
  } | null;
  // From creator brief if available
  brief?: {
    one_liner?: string;
    scenes?: { scene_number: number; on_screen_text: string; broll_suggestions?: string[]; sfx_music_note?: string }[];
    captions_pack?: { captions?: string[]; hashtags?: string[]; ctas?: string[]; comment_prompts?: string[] };
  } | null;
  // From video_assets if available
  assets?: {
    raw_footage_url?: string | null;
    final_mp4_url?: string | null;
    thumbnail_url?: string | null;
    google_drive_url?: string | null;
    screenshots?: string[];
  } | null;
  // Posting account info
  posting_account?: {
    display_name?: string | null;
    platform?: string | null;
  } | null;
}

export interface EditingPack {
  title: string;
  brand: string;
  product: string | null;
  script: string | null;
  overlays: string[];
  ctaLine: string | null;
  captionOptions: string[];
  hashtags: string[];
  brollSuggestions: string[];
  musicNotes: string[];
  sourceFiles: { label: string; url: string }[];
  outputTarget: string | null;
  tone: string | null;
  oneLiner: string | null;
}

export function buildEditingPack(video: EditingPackVideo): EditingPack {
  const concept = video.concept;
  const brief = video.brief;
  const assets = video.assets;

  const overlays: string[] = [];
  if (concept?.on_screen_text_hook) overlays.push(`Hook: ${concept.on_screen_text_hook}`);
  if (concept?.on_screen_text_mid) overlays.push(`Mid: ${concept.on_screen_text_mid}`);
  if (concept?.on_screen_text_cta) overlays.push(`CTA: ${concept.on_screen_text_cta}`);
  // Also pull per-scene overlays
  for (const s of brief?.scenes || []) {
    if (s.on_screen_text) overlays.push(`Scene ${s.scene_number}: ${s.on_screen_text}`);
  }

  const brollSuggestions: string[] = [];
  const musicNotes: string[] = [];
  for (const s of brief?.scenes || []) {
    if (s.broll_suggestions) brollSuggestions.push(...s.broll_suggestions);
    if (s.sfx_music_note) musicNotes.push(`Scene ${s.scene_number}: ${s.sfx_music_note}`);
  }

  const sourceFiles: { label: string; url: string }[] = [];
  if (assets?.raw_footage_url) sourceFiles.push({ label: 'Raw Footage', url: assets.raw_footage_url });
  if (assets?.final_mp4_url) sourceFiles.push({ label: 'Final MP4', url: assets.final_mp4_url });
  if (assets?.google_drive_url || video.google_drive_url) {
    sourceFiles.push({ label: 'Google Drive', url: assets?.google_drive_url || video.google_drive_url! });
  }

  let outputTarget: string | null = null;
  if (video.posting_account) {
    outputTarget = `${video.posting_account.platform || 'Unknown'} — ${video.posting_account.display_name || 'Unknown'}`;
  } else if (video.posted_platform) {
    outputTarget = video.posted_platform;
  }

  return {
    title: concept?.title || video.video_code || video.id,
    brand: video.brand_name || 'Unknown Brand',
    product: video.product_name || null,
    script: video.script_locked_text || null,
    overlays,
    ctaLine: brief?.captions_pack?.ctas?.[0] || concept?.on_screen_text_cta || null,
    captionOptions: brief?.captions_pack?.captions || [],
    hashtags: brief?.captions_pack?.hashtags || [],
    brollSuggestions: [...new Set(brollSuggestions)],
    musicNotes,
    sourceFiles,
    outputTarget,
    tone: concept?.tone_preset || null,
    oneLiner: brief?.one_liner || null,
  };
}

/** Format a single editing pack as Markdown text */
export function formatEditingPackMarkdown(pack: EditingPack): string {
  const lines: string[] = [];

  lines.push(`# Editing Pack: ${pack.title}`);
  lines.push(`**Brand:** ${pack.brand}`);
  if (pack.product) lines.push(`**Product:** ${pack.product}`);
  if (pack.outputTarget) lines.push(`**Output:** ${pack.outputTarget}`);
  lines.push('');

  if (pack.oneLiner) {
    lines.push(`> ${pack.oneLiner}`);
    lines.push('');
  }

  if (pack.script) {
    lines.push(`## Script`);
    lines.push(pack.script);
    lines.push('');
  }

  if (pack.overlays.length > 0) {
    lines.push(`## On-Screen Text / Overlays`);
    for (const o of pack.overlays) lines.push(`- ${o}`);
    lines.push('');
  }

  if (pack.ctaLine) {
    lines.push(`## CTA`);
    lines.push(pack.ctaLine);
    lines.push('');
  }

  if (pack.captionOptions.length > 0) {
    lines.push(`## Caption Options`);
    for (const c of pack.captionOptions) lines.push(`- ${c}`);
    lines.push('');
  }

  if (pack.hashtags.length > 0) {
    lines.push(`## Hashtags`);
    lines.push(pack.hashtags.join(' '));
    lines.push('');
  }

  if (pack.brollSuggestions.length > 0) {
    lines.push(`## B-Roll Suggestions`);
    for (const b of pack.brollSuggestions) lines.push(`- ${b}`);
    lines.push('');
  }

  if (pack.musicNotes.length > 0) {
    lines.push(`## Music / SFX Notes`);
    for (const m of pack.musicNotes) lines.push(`- ${m}`);
    lines.push('');
  }

  if (pack.sourceFiles.length > 0) {
    lines.push(`## Source Files`);
    for (const f of pack.sourceFiles) lines.push(`- [${f.label}](${f.url})`);
    lines.push('');
  }

  if (pack.tone) {
    lines.push(`## Tone`);
    lines.push(pack.tone);
    lines.push('');
  }

  return lines.join('\n');
}

/** Format multiple editing packs as a merged markdown document */
export function formatEditingPacksBatch(packs: EditingPack[]): string {
  const sections = packs.map((p, i) => {
    const md = formatEditingPackMarkdown(p);
    return i < packs.length - 1 ? md + '\n---\n' : md;
  });
  return sections.join('\n');
}
