export type GuidedStep = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface GuidedModeState {
  active: boolean;
  step: GuidedStep;
  contentItemId: string | null;
  startedAt: string;
}

export interface StepConditionInput {
  item: {
    script_text?: string | null;
    raw_video_url?: string | null;
    transcript_status?: string | null;
    edit_plan_json?: unknown | null;
    edit_status?: string | null;
    rendered_video_url?: string | null;
  } | null;
  recordingAcknowledged: boolean;
}

export interface GuidedStepDef {
  step: GuidedStep;
  title: string;
  instruction: string;
  hint: string;
  cta: string;
  isComplete: (input: StepConditionInput) => boolean;
  notCompleteReason: (input: StepConditionInput) => string;
}
