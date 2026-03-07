/**
 * Build an EditPlan from editing instructions and editor notes.
 *
 * MVP: converts EditorNotesJSON suggestions into a structured EditPlan.
 * Future: will call an LLM to interpret free-form editing_instructions.
 */

import type { EditorNotesJSON } from '../content-items/editor-notes-schema';
import type { EditPlan, EditPlanAction } from './types';

interface BuildEditPlanInput {
  source_duration_sec: number;
  editing_instructions?: string | null;
  editor_notes_json?: EditorNotesJSON | null;
}

/**
 * Build a structured EditPlan from available editing context.
 * Currently uses editor_notes_json to derive actions; editing_instructions
 * will be interpreted by an LLM in a future iteration.
 */
export function buildEditPlan(input: BuildEditPlanInput): EditPlan {
  const { source_duration_sec, editor_notes_json } = input;
  const actions: EditPlanAction[] = [];

  if (editor_notes_json) {
    // Convert timeline segments into edit actions
    if (editor_notes_json.timeline) {
      for (const seg of editor_notes_json.timeline) {
        if (seg.label === 'cut') {
          actions.push({
            type: 'cut',
            start_sec: seg.start_sec,
            end_sec: seg.end_sec,
            reason: seg.note,
          });
        } else if (seg.label === 'keep') {
          actions.push({
            type: 'keep',
            start_sec: seg.start_sec,
            end_sec: seg.end_sec,
          });
        } else if (seg.label === 'broll' && seg.broll) {
          actions.push({
            type: 'broll',
            start_sec: seg.start_sec,
            end_sec: seg.end_sec,
            asset_url: null,
            prompt: seg.broll,
          });
        } else if (seg.label === 'text' && seg.on_screen_text) {
          actions.push({
            type: 'text_overlay',
            start_sec: seg.start_sec,
            end_sec: seg.end_sec,
            text: seg.on_screen_text,
            position: 'bottom',
          });
        }
      }
    }

    // Convert broll_pack items (point-in-time suggestions → 3s broll overlays)
    if (editor_notes_json.broll_pack) {
      for (const b of editor_notes_json.broll_pack) {
        actions.push({
          type: 'broll',
          start_sec: b.at_sec,
          end_sec: b.at_sec + 3,
          asset_url: null,
          prompt: b.prompt,
        });
      }
    }
  }

  // If no actions were derived, create a single keep for the full duration
  if (actions.length === 0) {
    actions.push({
      type: 'keep',
      start_sec: 0,
      end_sec: source_duration_sec,
    });
  }

  return {
    version: 1,
    source_duration_sec,
    actions,
    output: {
      format: 'mp4',
      resolution: '1080x1920',
      fps: 30,
    },
  };
}
