export type RenderStatus =
  | 'pending'
  | 'claimed'
  | 'rendering'
  | 'uploading'
  | 'done'
  | 'failed'
  | 'fallback_shotstack';

export interface OutputSpec {
  format?: 'mp4' | 'mov' | 'webm';
  resolution?: 'sd' | 'hd' | '1080' | 'fhd';
  aspectRatio?: '9:16' | '16:9' | '1:1' | '4:5';
  fps?: 24 | 30 | 60;
}

export interface ShotstackTimeline {
  background?: string;
  soundtrack?: { src: string; effect?: string };
  tracks: Array<{
    clips: Array<Record<string, unknown>>;
  }>;
}

export interface RenderJob {
  id: string;
  created_at: string;
  user_id: string | null;
  correlation_id: string | null;
  kind: string;
  status: RenderStatus;
  timeline: ShotstackTimeline;
  output_spec: OutputSpec;
  output_url: string | null;
  output_bytes: number | null;
  duration_ms: number | null;
  error: string | null;
  shotstack_render_id: string | null;
  attempts: number;
  max_attempts: number;
}

export interface EnqueueRenderInput {
  timeline: ShotstackTimeline;
  output?: OutputSpec;
  userId?: string;
  correlationId?: string;
  kind?: string;
  priority?: number;
}

export interface EnqueueRenderResult {
  jobId: string;
  provider: 'local' | 'shotstack';
  status: RenderStatus;
  shotstackRenderId?: string;
}
