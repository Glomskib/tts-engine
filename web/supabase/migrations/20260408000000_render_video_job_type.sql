-- Add render_video to the jobs type CHECK constraint
ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_type_check;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_type_check
  CHECK (type IN (
    'detect_winners', 'analyze_transcript', 'generate_script',
    'refresh_metrics', 'replicate_pattern', 'generate_editor_notes',
    'render_video'
  ));
