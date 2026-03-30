import type { GuidedStepDef } from './types';

export const GUIDED_STEPS: GuidedStepDef[] = [
  {
    step: 1,
    title: 'Create a Content Item',
    instruction: 'A Content Item is the container for your entire TikTok video. Start by creating one.',
    hint: 'Give it a descriptive title like "Unboxing Product X" or "Review of [product name]".',
    cta: 'Create Content Item',
    isComplete: ({ item }) => item !== null,
    notCompleteReason: () => 'Create a content item to begin.',
  },
  {
    step: 2,
    title: 'Generate Your Script',
    instruction: 'Write or generate a script for this video. This becomes your recording guide.',
    hint: 'A strong hook in the first 3 seconds makes or breaks TikTok performance.',
    cta: 'Generate Script',
    isComplete: ({ item }) => !!(item?.script_text),
    notCompleteReason: () => 'Add a script to this content item before recording.',
  },
  {
    step: 3,
    title: 'Record Your Video',
    instruction: 'Film your TikTok using the script above. Keep it natural — raw footage is fine.',
    hint: 'Record in portrait (9:16). Good lighting matters more than a perfect background. Aim for 30-90 seconds.',
    cta: "I've Recorded My Video",
    isComplete: ({ recordingAcknowledged }) => recordingAcknowledged,
    notCompleteReason: () => "Confirm you've recorded your video to continue.",
  },
  {
    step: 4,
    title: 'Upload Your Raw Video',
    instruction: 'Upload the raw footage you just recorded. FlashFlow will transcribe and analyze it.',
    hint: 'MP4 format works best. Files under 500MB recommended.',
    cta: 'Upload Video',
    isComplete: ({ item }) => !!(item?.raw_video_url),
    notCompleteReason: () => 'Upload your raw video file using the uploader below.',
  },
  {
    step: 5,
    title: 'Analyze the Video',
    instruction: 'Click Analyze to transcribe your video and generate AI editor notes. Required before planning.',
    hint: 'Analysis takes 30–90 seconds. The AI reads your transcript and identifies what to keep or cut.',
    cta: 'Analyze Video',
    isComplete: ({ item }) => item?.transcript_status === 'completed',
    notCompleteReason: ({ item }) => {
      if (item?.transcript_status === 'processing') return 'Analysis is running — please wait a moment.';
      if (item?.transcript_status === 'failed') return 'Analysis failed. Check the error message and retry.';
      return 'Click the Analyze button to transcribe your video.';
    },
  },
  {
    step: 6,
    title: 'Generate Edit Plan',
    instruction: 'FlashFlow AI will create an edit plan: what to cut, keep, caption, speed up, and more.',
    hint: 'You can add editing instructions first to guide the AI (e.g. "keep under 45 seconds, add captions").',
    cta: 'Generate Edit Plan',
    isComplete: ({ item }) => !!(item?.edit_plan_json),
    notCompleteReason: () => 'Click Generate Plan to create your AI-powered edit plan.',
  },
  {
    step: 7,
    title: 'Render Your Video',
    instruction: 'Apply the edit plan to produce your final TikTok-ready video.',
    hint: 'Rendering takes 1–3 minutes depending on video length. The output appears below when done.',
    cta: 'Render Video',
    isComplete: ({ item }) => item?.edit_status === 'rendered',
    notCompleteReason: ({ item }) => {
      if (item?.edit_status === 'rendering') return 'Render in progress — this takes 1–3 minutes.';
      if (item?.edit_status === 'failed') return 'Render failed. Check the error message and try again.';
      return 'Click Render Video to generate your final edited video.';
    },
  },
];

export const TOTAL_STEPS = GUIDED_STEPS.length;
