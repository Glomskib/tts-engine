/**
 * Creator Brief data schema — stored as JSONB in creator_briefs.data.
 */

export interface BriefScene {
  scene_number: number;
  framing: string;
  action: string;
  spoken_lines: string;
  on_screen_text: string;
  broll_suggestions: string[];
  sfx_music_note?: string;
}

export interface PurpleCowTier {
  visual_interrupts: string[];
  audio_interrupts: string[];
  behavioral_interrupts: string[];
  comment_bait: string[];
}

export interface CaptionsPack {
  captions: string[];
  hashtags: string[];
  ctas: string[];
  comment_prompts: string[];
}

export interface PurpleCow {
  tiers: {
    safe: PurpleCowTier;
    edgy: PurpleCowTier;
    unhinged: PurpleCowTier;
  };
  notes_for_creator: string[];
}

export interface CreatorBriefData {
  one_liner: string;
  goal: string;
  audience_persona: string;
  success_metric: string;
  beforehand_checklist: string[];
  setting: string;
  plot: string;
  emotional_arc: string;
  performance_tone: string;
  script_text: string;
  scenes: BriefScene[];
  recording_notes: string[];
  captions_pack: CaptionsPack;
  purple_cow: PurpleCow;
}
