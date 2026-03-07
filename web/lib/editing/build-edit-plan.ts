/**
 * Build an EditPlan from content item fields.
 *
 * Sources (in priority order):
 * 1. editor_notes_json — structured AI analysis (timeline, broll_pack)
 * 2. editing_instructions — free-text human/AI instructions
 * 3. content item metadata — primary_hook, caption, hashtags
 *
 * Defaults applied:
 * - normalize_audio: on (unless explicitly disabled)
 * - hook text overlay: from primary_hook if available
 * - end card: from CTA or brand info if available
 */

import type { EditorNotesJSON } from '../content-items/editor-notes-schema';
import type { EditPlan, EditPlanAction } from './types';

// ── Public interface ────────────────────────────────────────────

export interface BuildEditPlanInput {
  source_duration_sec: number;
  editing_instructions?: string | null;
  editor_notes_json?: EditorNotesJSON | null;
  primary_hook?: string | null;
  caption?: string | null;
  cta_text?: string | null;
  brand_handle?: string | null;
}

export interface BuildEditPlanResult {
  plan: EditPlan;
  warnings: string[];
}

/**
 * Build a structured EditPlan from available editing context.
 * Returns the plan plus any warnings about ambiguous instructions.
 */
export function buildEditPlan(input: BuildEditPlanInput): BuildEditPlanResult {
  const { source_duration_sec, editor_notes_json, editing_instructions } = input;
  const actions: EditPlanAction[] = [];
  const warnings: string[] = [];

  // ── 1. Process editor notes (structured source) ─────────
  if (editor_notes_json) {
    processEditorNotes(editor_notes_json, actions);
  }

  // ── 2. Parse editing instructions (free text) ───────────
  if (editing_instructions) {
    parseEditingInstructions(editing_instructions, source_duration_sec, actions, warnings);
  }

  // ── 3. Default: hook overlay ────────────────────────────
  if (input.primary_hook) {
    const hasHookOverlay = actions.some(
      a => a.type === 'text_overlay' && a.start_sec < 3
    );
    if (!hasHookOverlay) {
      actions.push({
        type: 'text_overlay',
        start_sec: 0,
        end_sec: Math.min(4, source_duration_sec),
        text: input.primary_hook,
        position: 'center',
      });
    }
  }

  // ── 4. Default: normalize audio (always unless disabled) ──
  const hasNormalize = actions.some(a => a.type === 'normalize_audio');
  const normalizeDisabled = editing_instructions?.toLowerCase().includes('no normalize')
    || editing_instructions?.toLowerCase().includes('skip audio')
    || editing_instructions?.toLowerCase().includes('raw audio');
  if (!hasNormalize && !normalizeDisabled) {
    actions.push({ type: 'normalize_audio', target_lufs: -14, enabled: true });
  }

  // ── 5. Default: end card from CTA ──────────────────────
  const hasEndCard = actions.some(a => a.type === 'end_card');
  if (!hasEndCard && (input.cta_text || input.brand_handle)) {
    actions.push({
      type: 'end_card',
      duration_sec: 2,
      text: input.cta_text || undefined,
      subtext: input.brand_handle || undefined,
      bg_color: '#000000',
      text_color: '#FFFFFF',
    });
  }

  // ── 6. Fallback: keep full duration ─────────────────────
  const hasTimedAction = actions.some(
    a => a.type === 'keep' || a.type === 'cut'
  );
  if (!hasTimedAction) {
    actions.push({
      type: 'keep',
      start_sec: 0,
      end_sec: source_duration_sec,
    });
  }

  return {
    plan: {
      version: 1,
      source_duration_sec,
      actions,
      output: { format: 'mp4', resolution: '1080x1920', fps: 30 },
    },
    warnings,
  };
}

// ── Editor Notes Processing ─────────────────────────────────────

function processEditorNotes(notes: EditorNotesJSON, actions: EditPlanAction[]): void {
  if (notes.timeline) {
    for (const seg of notes.timeline) {
      if (seg.label === 'cut') {
        actions.push({ type: 'cut', start_sec: seg.start_sec, end_sec: seg.end_sec, reason: seg.note });
      } else if (seg.label === 'keep') {
        actions.push({ type: 'keep', start_sec: seg.start_sec, end_sec: seg.end_sec });
      } else if (seg.label === 'broll' && seg.broll) {
        actions.push({ type: 'broll', start_sec: seg.start_sec, end_sec: seg.end_sec, asset_url: null, prompt: seg.broll });
      } else if (seg.label === 'text' && seg.on_screen_text) {
        actions.push({ type: 'text_overlay', start_sec: seg.start_sec, end_sec: seg.end_sec, text: seg.on_screen_text, position: 'bottom' });
      }
    }
  }

  if (notes.broll_pack) {
    for (const b of notes.broll_pack) {
      actions.push({ type: 'broll', start_sec: b.at_sec, end_sec: b.at_sec + 3, asset_url: null, prompt: b.prompt });
    }
  }
}

// ── Instruction Parsing ─────────────────────────────────────────

/** Match patterns in free-text editing instructions to actions. */
function parseEditingInstructions(
  instructions: string,
  duration: number,
  actions: EditPlanAction[],
  warnings: string[],
): void {
  const lower = instructions.toLowerCase();
  // Split on newlines and semicolons, but NOT periods (to preserve "12.5s")
  const lines = instructions.split(/\n|;/).map(l => l.trim()).filter(Boolean);

  for (const line of lines) {
    const ln = line.toLowerCase();

    // ── Cut patterns ──────────────────────────────────────
    const cutMatch = ln.match(/cut\s+(?:from\s+)?(\d+(?:\.\d+)?)\s*(?:s|sec|seconds?)?\s*(?:to|-)\s*(\d+(?:\.\d+)?)\s*(?:s|sec|seconds?)?/);
    if (cutMatch) {
      const start = parseFloat(cutMatch[1]);
      const end = parseFloat(cutMatch[2]);
      if (start < end && end <= duration + 0.5) {
        actions.push({ type: 'cut', start_sec: start, end_sec: end, reason: line });
      } else {
        warnings.push(`Cut range invalid or out of bounds: "${line}"`);
      }
      continue;
    }

    // ── Keep patterns ─────────────────────────────────────
    const keepMatch = ln.match(/keep\s+(?:from\s+)?(\d+(?:\.\d+)?)\s*(?:s|sec|seconds?)?\s*(?:to|-)\s*(\d+(?:\.\d+)?)\s*(?:s|sec|seconds?)?/);
    if (keepMatch) {
      const start = parseFloat(keepMatch[1]);
      const end = parseFloat(keepMatch[2]);
      if (start < end && end <= duration + 0.5) {
        actions.push({ type: 'keep', start_sec: start, end_sec: end });
      }
      continue;
    }

    // ── Speed patterns ────────────────────────────────────
    const speedMatch = ln.match(/(?:speed|fast|slow)\s*(?:up|down)?\s*(?:to\s+)?(\d+(?:\.\d+)?)\s*x?\s*(?:from\s+)?(\d+(?:\.\d+)?)\s*(?:s|sec)?\s*(?:to|-)\s*(\d+(?:\.\d+)?)\s*(?:s|sec)?/);
    if (speedMatch) {
      const factor = parseFloat(speedMatch[1]);
      const start = parseFloat(speedMatch[2]);
      const end = parseFloat(speedMatch[3]);
      if (factor >= 0.25 && factor <= 4 && start < end) {
        actions.push({ type: 'speed', start_sec: start, end_sec: end, factor });
      }
      continue;
    }

    // ── Text overlay patterns ─────────────────────────────
    const textMatch = ln.match(/(?:text|overlay|show)\s*[:"'](.+?)['""]?\s*(?:at|from)\s+(\d+(?:\.\d+)?)\s*(?:s|sec)?\s*(?:to|-)\s*(\d+(?:\.\d+)?)/);
    if (textMatch) {
      actions.push({
        type: 'text_overlay',
        start_sec: parseFloat(textMatch[2]),
        end_sec: parseFloat(textMatch[3]),
        text: textMatch[1].trim(),
        position: 'bottom',
      });
      continue;
    }

    // ── Remove pauses / silence ───────────────────────────
    if (/remove\s+(?:all\s+)?(?:pauses?|silence|dead\s*air)/i.test(ln)) {
      const hasRemoveSilence = actions.some(a => a.type === 'remove_silence');
      if (!hasRemoveSilence) {
        actions.push({ type: 'remove_silence', threshold_db: -35, min_duration_ms: 600, padding_ms: 100, enabled: true });
      }
      continue;
    }

    // ── Tight / fast paced ────────────────────────────────
    if (/(?:tight\s+edit|fast\s*paced?|snappy|punch(?:y|ier))/i.test(ln)) {
      const hasRemoveSilence = actions.some(a => a.type === 'remove_silence');
      if (!hasRemoveSilence) {
        actions.push({ type: 'remove_silence', threshold_db: -30, min_duration_ms: 400, padding_ms: 80, enabled: true });
      }
      continue;
    }

    // ── Add captions ──────────────────────────────────────
    if (/(?:add|burn|include)\s*(?:auto\s*)?captions?|subtitles?/i.test(ln)) {
      const hasCaptions = actions.some(a => a.type === 'burn_captions');
      if (!hasCaptions) {
        const isBold = /bold/i.test(ln);
        actions.push({
          type: 'burn_captions',
          style: isBold ? 'bold' : 'bold',
          position: 'bottom',
          font_size: 42,
          enabled: true,
        });
      }
      continue;
    }

    // ── End card / outro ──────────────────────────────────
    if (/(?:end\s*card|outro|closing\s*(?:card|screen|frame))/i.test(ln)) {
      const hasEndCard = actions.some(a => a.type === 'end_card');
      if (!hasEndCard) {
        // Try to extract CTA text from the instruction
        const ctaMatch = ln.match(/(?:saying|text|with)\s*[:"'](.+?)['""]?$/);
        actions.push({
          type: 'end_card',
          duration_sec: 2,
          text: ctaMatch ? ctaMatch[1].trim() : undefined,
          bg_color: '#000000',
          text_color: '#FFFFFF',
        });
      }
      continue;
    }

    // ── Normalize audio ───────────────────────────────────
    if (/normalize\s*audio|audio\s*normalize|level\s*audio|loudness/i.test(ln)) {
      // Already added as default, skip
      continue;
    }

    // ── Watermark / branding ──────────────────────────────
    const wmMatch = ln.match(/(?:watermark|brand(?:ing)?|handle)\s*[:"']?(.+)/);
    if (wmMatch && /watermark|brand|handle/i.test(ln)) {
      const hasWatermark = actions.some(a => a.type === 'watermark');
      if (!hasWatermark) {
        actions.push({
          type: 'watermark',
          text: wmMatch[1].replace(/['"]/g, '').trim() || undefined,
          position: 'bottom-right',
          opacity: 0.7,
        });
      }
      continue;
    }

    // ── Aspect ratio ──────────────────────────────────────
    // These are noted as warnings since they affect output config, not actions
    if (/(?:square|1:1|1x1)/i.test(ln)) {
      warnings.push(`Aspect ratio hint: square (1080x1080). Set output.resolution in plan.`);
      continue;
    }
    if (/(?:landscape|16:9|horizontal)/i.test(ln)) {
      warnings.push(`Aspect ratio hint: landscape (1920x1080). Set output.resolution in plan.`);
      continue;
    }
    if (/(?:vertical|9:16|portrait)/i.test(ln)) {
      // Default, no warning needed
      continue;
    }

    // ── Unrecognized instruction ──────────────────────────
    if (ln.length > 10) {
      warnings.push(`Could not parse instruction: "${line}"`);
    }
  }
}
