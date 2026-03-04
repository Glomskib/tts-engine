/**
 * Enhanced Editor Notes JSON schema — structured output from Claude
 * for the content-item-processing pipeline.
 *
 * Validated at runtime via zod to ensure Claude output conforms.
 */

import { z } from 'zod';

// ─────────────────────────────────────────────────────
// Zod Schema
// ─────────────────────────────────────────────────────

const TimelineItemSchema = z.object({
  start_sec: z.number(),
  end_sec: z.number(),
  label: z.enum(['keep', 'cut', 'tighten', 'broll', 'text', 'retake']),
  note: z.string(),
  broll: z.string().nullable().optional().default(null),
  on_screen_text: z.string().nullable().optional().default(null),
});

const MistakeRetakeSchema = z.object({
  at_sec: z.number(),
  issue: z.string(),
  fix: z.string(),
});

const BrollPackItemSchema = z.object({
  at_sec: z.number(),
  type: z.enum(['product', 'lifestyle', 'meme', 'screen', 'stock']),
  prompt: z.string(),
});

const EditingStyleSchema = z.object({
  pace: z.enum(['fast', 'medium', 'slow']),
  jump_cut_recommendation: z.string(),
  music_sfx_notes: z.string(),
});

const CaptionSchema = z.object({
  primary: z.string(),
  alt: z.string(),
});

const CTASchema = z.object({
  at_sec: z.number(),
  line: z.string(),
});

const CommentBaitSchema = z.object({
  safe: z.array(z.string()).min(2),
  spicy: z.array(z.string()).min(2),
  chaotic: z.array(z.string()).min(2),
});

export const EditorNotesJSONSchema = z.object({
  summary: z.string(),
  editing_style: EditingStyleSchema,
  timeline: z.array(TimelineItemSchema),
  mistakes_retakes: z.array(MistakeRetakeSchema),
  broll_pack: z.array(BrollPackItemSchema),
  caption: CaptionSchema,
  hashtags: z.array(z.string()).min(5).max(12),
  cta: CTASchema,
  comment_bait: CommentBaitSchema,
});

// ─────────────────────────────────────────────────────
// TypeScript types (inferred from schema)
// ─────────────────────────────────────────────────────

export type EditorNotesJSON = z.infer<typeof EditorNotesJSONSchema>;
export type TimelineItem = z.infer<typeof TimelineItemSchema>;
export type MistakeRetake = z.infer<typeof MistakeRetakeSchema>;
export type BrollPackItem = z.infer<typeof BrollPackItemSchema>;
export type EditingStyle = z.infer<typeof EditingStyleSchema>;
export type CommentBait = z.infer<typeof CommentBaitSchema>;

// ─────────────────────────────────────────────────────
// Validation helper
// ─────────────────────────────────────────────────────

/**
 * Validate and coerce a raw Claude response into EditorNotesJSON.
 * Throws ZodError if the response doesn't match the schema.
 * Uses .passthrough() to not strip extra fields Claude might add.
 */
export function validateEditorNotesJSON(raw: unknown): EditorNotesJSON {
  return EditorNotesJSONSchema.parse(raw);
}

/**
 * Safe validation that returns { ok, data, error } instead of throwing.
 */
export function safeValidateEditorNotesJSON(raw: unknown): {
  ok: boolean;
  data?: EditorNotesJSON;
  error?: string;
} {
  const result = EditorNotesJSONSchema.safeParse(raw);
  if (result.success) {
    return { ok: true, data: result.data };
  }
  return {
    ok: false,
    error: result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; '),
  };
}

/**
 * Convert structured EditorNotesJSON to human-readable markdown summary.
 */
export function editorNotesToMarkdown(notes: EditorNotesJSON): string {
  const lines: string[] = [];

  lines.push(`## Editor Notes\n`);
  lines.push(`**Summary:** ${notes.summary}\n`);

  // Style
  lines.push(`### Editing Style`);
  lines.push(`- **Pace:** ${notes.editing_style.pace}`);
  lines.push(`- **Jump Cuts:** ${notes.editing_style.jump_cut_recommendation}`);
  lines.push(`- **Music/SFX:** ${notes.editing_style.music_sfx_notes}\n`);

  // Timeline
  if (notes.timeline.length > 0) {
    lines.push(`### Timeline`);
    for (const t of notes.timeline) {
      const ts = `${formatSec(t.start_sec)}–${formatSec(t.end_sec)}`;
      lines.push(`- **[${ts}]** \`${t.label}\` — ${t.note}`);
      if (t.broll) lines.push(`  - B-Roll: ${t.broll}`);
      if (t.on_screen_text) lines.push(`  - On-Screen: ${t.on_screen_text}`);
    }
    lines.push('');
  }

  // Mistakes
  if (notes.mistakes_retakes.length > 0) {
    lines.push(`### Mistakes / Retakes`);
    for (const m of notes.mistakes_retakes) {
      lines.push(`- **${formatSec(m.at_sec)}** — ${m.issue} → ${m.fix}`);
    }
    lines.push('');
  }

  // B-Roll Pack
  if (notes.broll_pack.length > 0) {
    lines.push(`### B-Roll Pack`);
    for (const b of notes.broll_pack) {
      lines.push(`- **${formatSec(b.at_sec)}** [${b.type}] ${b.prompt}`);
    }
    lines.push('');
  }

  // Caption
  lines.push(`### Caption`);
  lines.push(`**Primary:** ${notes.caption.primary}`);
  lines.push(`**Alt:** ${notes.caption.alt}\n`);

  // Hashtags
  lines.push(`### Hashtags`);
  lines.push(notes.hashtags.join(' ') + '\n');

  // CTA
  lines.push(`### CTA`);
  lines.push(`At ${formatSec(notes.cta.at_sec)}: "${notes.cta.line}"\n`);

  // Comment Bait
  lines.push(`### Comment Bait`);
  lines.push(`**Safe:** ${notes.comment_bait.safe.join(' | ')}`);
  lines.push(`**Spicy:** ${notes.comment_bait.spicy.join(' | ')}`);
  lines.push(`**Chaotic:** ${notes.comment_bait.chaotic.join(' | ')}`);

  return lines.join('\n');
}

function formatSec(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
