/**
 * Build a Recording Pack — everything a creator needs before filming.
 * Works with partial data; omits sections that have no content.
 */

export interface RecordingPackVideo {
  id: string;
  video_code?: string | null;
  brand_name?: string | null;
  product_name?: string | null;
  product_sku?: string | null;
  script_locked_text?: string | null;
  blocked_reason?: string | null;
  recording_status?: string | null;
  // From /api/videos/[id]/details
  concept?: {
    title?: string | null;
    core_angle?: string | null;
    hook_options?: string[] | null;
    visual_hook?: string | null;
    on_screen_text_hook?: string | null;
    on_screen_text_mid?: string | null;
    on_screen_text_cta?: string | null;
    hook_type?: string | null;
    notes?: string | null;
    tone_preset?: string | null;
  } | null;
  // From creator brief if available
  brief?: {
    one_liner?: string;
    setting?: string;
    plot?: string;
    emotional_arc?: string;
    performance_tone?: string;
    recording_notes?: string[];
    scenes?: { scene_number: number; framing: string; action: string; spoken_lines: string; on_screen_text: string }[];
    captions_pack?: { ctas?: string[] };
  } | null;
}

export interface RecordingPack {
  title: string;
  brand: string;
  script: string | null;
  hookLine: string | null;
  overlays: string[];
  ctaLine: string | null;
  scenes: { scene: number; framing: string; action: string; lines: string; overlay: string }[];
  filmingNotes: string[];
  blockedReason: string | null;
  setting: string | null;
  tone: string | null;
  emotionalArc: string | null;
}

export function buildRecordingPack(video: RecordingPackVideo): RecordingPack {
  const concept = video.concept;
  const brief = video.brief;

  const overlays: string[] = [];
  if (concept?.on_screen_text_hook) overlays.push(`Hook: ${concept.on_screen_text_hook}`);
  if (concept?.on_screen_text_mid) overlays.push(`Mid: ${concept.on_screen_text_mid}`);
  if (concept?.on_screen_text_cta) overlays.push(`CTA: ${concept.on_screen_text_cta}`);

  const scenes = (brief?.scenes || []).map(s => ({
    scene: s.scene_number,
    framing: s.framing,
    action: s.action,
    lines: s.spoken_lines,
    overlay: s.on_screen_text,
  }));

  const hookLine = concept?.visual_hook
    || (concept?.hook_options && concept.hook_options.length > 0 ? concept.hook_options[0] : null)
    || null;

  const ctaLine = brief?.captions_pack?.ctas?.[0]
    || concept?.on_screen_text_cta
    || null;

  return {
    title: concept?.title || video.video_code || video.id,
    brand: video.brand_name || 'Unknown Brand',
    script: video.script_locked_text || null,
    hookLine,
    overlays,
    ctaLine,
    scenes,
    filmingNotes: brief?.recording_notes || (concept?.notes ? [concept.notes] : []),
    blockedReason: video.blocked_reason || null,
    setting: brief?.setting || null,
    tone: brief?.performance_tone || concept?.tone_preset || null,
    emotionalArc: brief?.emotional_arc || null,
  };
}

/** Format a single recording pack as Markdown text */
export function formatRecordingPackMarkdown(pack: RecordingPack): string {
  const lines: string[] = [];

  lines.push(`# Recording Pack: ${pack.title}`);
  lines.push(`**Brand:** ${pack.brand}`);
  lines.push('');

  if (pack.blockedReason) {
    lines.push(`> ⚠️ BLOCKED: ${pack.blockedReason}`);
    lines.push('');
  }

  if (pack.hookLine) {
    lines.push(`## Hook`);
    lines.push(pack.hookLine);
    lines.push('');
  }

  if (pack.script) {
    lines.push(`## Script`);
    lines.push(pack.script);
    lines.push('');
  }

  if (pack.scenes.length > 0) {
    lines.push(`## Scenes`);
    for (const s of pack.scenes) {
      lines.push(`### Scene ${s.scene}`);
      lines.push(`- **Framing:** ${s.framing}`);
      lines.push(`- **Action:** ${s.action}`);
      lines.push(`- **Lines:** ${s.lines}`);
      if (s.overlay) lines.push(`- **Overlay:** ${s.overlay}`);
      lines.push('');
    }
  }

  if (pack.overlays.length > 0) {
    lines.push(`## On-Screen Text`);
    for (const o of pack.overlays) lines.push(`- ${o}`);
    lines.push('');
  }

  if (pack.ctaLine) {
    lines.push(`## CTA`);
    lines.push(pack.ctaLine);
    lines.push('');
  }

  if (pack.setting || pack.tone || pack.emotionalArc) {
    lines.push(`## Direction`);
    if (pack.setting) lines.push(`- **Setting:** ${pack.setting}`);
    if (pack.tone) lines.push(`- **Tone:** ${pack.tone}`);
    if (pack.emotionalArc) lines.push(`- **Arc:** ${pack.emotionalArc}`);
    lines.push('');
  }

  if (pack.filmingNotes.length > 0) {
    lines.push(`## Filming Notes`);
    for (const n of pack.filmingNotes) lines.push(`- ${n}`);
    lines.push('');
  }

  return lines.join('\n');
}

/** Format multiple recording packs as a merged markdown document */
export function formatRecordingPacksBatch(packs: RecordingPack[]): string {
  const sections = packs.map((p, i) => {
    const md = formatRecordingPackMarkdown(p);
    return i < packs.length - 1 ? md + '\n---\n' : md;
  });
  return sections.join('\n');
}
