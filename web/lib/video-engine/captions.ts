/**
 * Caption styles for /create — 6 presets + brand-profile override.
 *
 * We generate Advanced SubStation Alpha (.ass) subtitle files because they
 * support animated styling, font weight, outline, shadow, position, word-level
 * highlighting (karaoke). Burned in via ffmpeg `-vf subtitles=...:force_style=...`
 * or the `ass` filter for the karaoke preset.
 *
 * Each preset is opinionated about font, size, color, outline, position, and
 * how words animate. Brand profile can override font + primary color globally.
 */
import type { TranscriptSegment } from './types';

export type CaptionStyleKey = 'bold_yellow' | 'subtle_white' | 'mr_beast' | 'karaoke' | 'newscast' | 'slow_reader';

export interface CaptionStyle {
  key: CaptionStyleKey;
  label: string;
  preview: string;
  /** Font family (must be available on the render server). */
  font: string;
  /** Font size in points (relative to a 1080-tall video). */
  size_pt: number;
  /** Primary fill color (hex). */
  fill: string;
  /** Outline color. */
  outline: string;
  /** Outline width. */
  outline_pt: number;
  /** Shadow distance. 0 = no shadow. */
  shadow_pt: number;
  /** Vertical position: 'top' | 'mid' | 'bottom' as fraction (0=top, 1=bottom). */
  v_pos: number;
  /** Max words per line. */
  max_words_per_line: number;
  /** Karaoke = highlight current word as audio plays. */
  karaoke: boolean;
  /** Bold weight. */
  bold: boolean;
  /** Uppercase all letters. */
  uppercase: boolean;
}

export const CAPTION_STYLES: Record<CaptionStyleKey, CaptionStyle> = {
  bold_yellow: {
    key: 'bold_yellow',
    label: 'Bold Yellow',
    preview: 'Big bold yellow over a black outline — punchy and obvious',
    font: 'Inter',
    size_pt: 64,
    fill: '#FFEB3B',
    outline: '#000000',
    outline_pt: 4,
    shadow_pt: 2,
    v_pos: 0.78,
    max_words_per_line: 4,
    karaoke: false,
    bold: true,
    uppercase: true,
  },
  subtle_white: {
    key: 'subtle_white',
    label: 'Subtle White',
    preview: 'Clean white captions, soft shadow, never shouts',
    font: 'Inter',
    size_pt: 44,
    fill: '#FFFFFF',
    outline: '#000000',
    outline_pt: 2,
    shadow_pt: 1,
    v_pos: 0.85,
    max_words_per_line: 6,
    karaoke: false,
    bold: false,
    uppercase: false,
  },
  mr_beast: {
    key: 'mr_beast',
    label: 'MrBeast Big',
    preview: 'Massive bold with thick outline — designed for thumbnails',
    font: 'Inter',
    size_pt: 84,
    fill: '#FFFFFF',
    outline: '#000000',
    outline_pt: 8,
    shadow_pt: 4,
    v_pos: 0.5,
    max_words_per_line: 3,
    karaoke: false,
    bold: true,
    uppercase: true,
  },
  karaoke: {
    key: 'karaoke',
    label: 'Karaoke',
    preview: 'Word-by-word color shift as audio plays — high retention',
    font: 'Inter',
    size_pt: 56,
    fill: '#FFFFFF',
    outline: '#000000',
    outline_pt: 3,
    shadow_pt: 2,
    v_pos: 0.78,
    max_words_per_line: 5,
    karaoke: true,
    bold: true,
    uppercase: false,
  },
  newscast: {
    key: 'newscast',
    label: 'Two-Line News',
    preview: 'Bottom 2-line newscast feel — professional and steady',
    font: 'Inter',
    size_pt: 40,
    fill: '#FFFFFF',
    outline: '#0F172A',
    outline_pt: 1,
    shadow_pt: 0,
    v_pos: 0.9,
    max_words_per_line: 8,
    karaoke: false,
    bold: false,
    uppercase: false,
  },
  slow_reader: {
    key: 'slow_reader',
    label: 'Slow Reader',
    preview: 'Bigger text, fewer words at a time — accessible pace',
    font: 'Inter',
    size_pt: 60,
    fill: '#FFFFFF',
    outline: '#000000',
    outline_pt: 3,
    shadow_pt: 2,
    v_pos: 0.8,
    max_words_per_line: 3,
    karaoke: false,
    bold: true,
    uppercase: false,
  },
};

export interface CaptionBuildOptions {
  segments: TranscriptSegment[];
  style: CaptionStyleKey;
  /** Brand profile overrides (font, primary color). Optional. */
  brand_override?: {
    font?: string;
    primary_color?: string;
  };
  /** Output video dimensions — used to scale font size proportionally. */
  output_width: number;
  output_height: number;
}

/**
 * Build an .ass subtitle file (string) from transcript segments + style preset.
 *
 * Output can be passed to ffmpeg as `-vf subtitles=<path>` to burn in.
 */
export function buildAssSubtitles(opts: CaptionBuildOptions): string {
  const baseStyle = CAPTION_STYLES[opts.style];
  if (!baseStyle) throw new Error(`Unknown caption style: ${opts.style}`);

  // Apply brand overrides
  const font = opts.brand_override?.font || baseStyle.font;
  const fillHex = (opts.brand_override?.primary_color || baseStyle.fill).replace('#', '');
  const outlineHex = baseStyle.outline.replace('#', '');

  // Scale font size to output height (preset assumes 1080)
  const sizeScale = opts.output_height / 1080;
  const size = Math.round(baseStyle.size_pt * sizeScale);

  // Convert hex to .ass color format (&HBBGGRR&)
  const hexToAss = (hex: string): string => {
    const rgb = hex.match(/.{2}/g) || ['FF', 'FF', 'FF'];
    return `&H00${rgb[2]}${rgb[1]}${rgb[0]}`;
  };
  const primaryAss = hexToAss(fillHex);
  const outlineAss = hexToAss(outlineHex);

  // Vertical alignment: in .ass, MarginV is the offset from bottom (Alignment=2).
  // We compute marginV from v_pos.
  const marginV = Math.round((1 - baseStyle.v_pos) * opts.output_height);

  const styleLine = [
    'Default',
    font,
    String(size),
    primaryAss,                                          // PrimaryColour (fill)
    primaryAss,                                          // SecondaryColour (karaoke pre-highlight)
    outlineAss,                                          // OutlineColour
    '&H80000000',                                        // BackColour (50% black drop shadow)
    baseStyle.bold ? '1' : '0',                          // Bold
    '0',                                                 // Italic
    '0',                                                 // Underline
    '0',                                                 // StrikeOut
    '100',                                               // ScaleX
    '100',                                               // ScaleY
    '0',                                                 // Spacing
    '0',                                                 // Angle
    '1',                                                 // BorderStyle (outline)
    String(baseStyle.outline_pt),                        // Outline
    String(baseStyle.shadow_pt),                         // Shadow
    '2',                                                 // Alignment (bottom-center)
    '40', '40',                                          // MarginL, MarginR
    String(marginV),                                     // MarginV
    '1',                                                 // Encoding
  ].join(',');

  // Generate dialog lines from segments
  // For non-karaoke styles, split each segment into max_words_per_line groups.
  const dialogLines: string[] = [];
  for (const seg of opts.segments) {
    const words = seg.text.trim().split(/\s+/);
    const groups: string[][] = [];
    for (let i = 0; i < words.length; i += baseStyle.max_words_per_line) {
      groups.push(words.slice(i, i + baseStyle.max_words_per_line));
    }

    const groupDur = (seg.end - seg.start) / Math.max(1, groups.length);
    groups.forEach((g, gi) => {
      const start = seg.start + groupDur * gi;
      const end = Math.min(seg.end, start + groupDur);
      let line = g.join(' ');
      if (baseStyle.uppercase) line = line.toUpperCase();

      // Karaoke effect: per-word \k tag
      if (baseStyle.karaoke) {
        const perWordCs = Math.max(10, Math.round((groupDur * 100) / g.length));
        line = g.map((w) => `{\\k${perWordCs}}${baseStyle.uppercase ? w.toUpperCase() : w}`).join(' ');
      }

      dialogLines.push(
        `Dialogue: 0,${assTime(start)},${assTime(end)},Default,,0,0,0,,${line}`
      );
    });
  }

  return [
    '[Script Info]',
    'ScriptType: v4.00+',
    'WrapStyle: 0', // smart auto-wrap so long lines never run off the frame
    `PlayResX: ${opts.output_width}`,
    `PlayResY: ${opts.output_height}`,
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: ${styleLine}`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    ...dialogLines,
  ].join('\n');
}

function assTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec - h * 3600 - m * 60;
  return `${h}:${m.toString().padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`;
}

/**
 * Convenience: return the list of styles for the /create UI.
 */
export function listCaptionStyles(): Array<Pick<CaptionStyle, 'key' | 'label' | 'preview'>> {
  return Object.values(CAPTION_STYLES).map((s) => ({
    key: s.key,
    label: s.label,
    preview: s.preview,
  }));
}
