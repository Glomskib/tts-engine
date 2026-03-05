/**
 * Job Queue Types
 */

export type JobType = 'detect_winners' | 'analyze_transcript' | 'generate_script' | 'refresh_metrics' | 'replicate_pattern' | 'generate_editor_notes';
export type JobStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface Job {
  id: string;
  workspace_id: string;
  type: JobType;
  payload: Record<string, unknown>;
  status: JobStatus;
  attempts: number;
  max_attempts: number;
  result: Record<string, unknown> | null;
  error: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface JobHandler {
  (job: Job): Promise<Record<string, unknown>>;
}
