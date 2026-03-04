/**
 * Drive Intake Cost Estimation
 *
 * Estimates per-job cost based on:
 *   - Whisper transcription (per-minute)
 *   - Supabase Storage (per-GB)
 *   - Compute/bandwidth overhead (flat per-job)
 *
 * Default rates (configurable via env vars):
 *   Transcribe: $0.006/min (OpenAI Whisper)
 *   Storage:    $0.02/GB   (Supabase Storage)
 *   Overhead:   $0.01/job  (compute + bandwidth)
 */

function getRate(envKey: string, fallback: number): number {
  return Number(process.env[envKey]) || fallback;
}

export interface IntakeCostEstimate {
  transcribe_usd: number;
  storage_usd: number;
  overhead_usd: number;
  total_usd: number;
  duration_seconds: number;
  file_bytes: number;
}

/**
 * Estimate cost for a single drive intake job.
 */
export function estimateIntakeCost(input: {
  durationSeconds: number;
  fileBytes: number;
}): IntakeCostEstimate {
  const usdPerMinTranscribe = getRate('INTAKE_USD_PER_MIN_TRANSCRIBE', 0.006);
  const usdPerGBStorage = getRate('INTAKE_USD_PER_GB_STORAGE', 0.02);
  const usdPerJobOverhead = getRate('INTAKE_USD_PER_JOB_OVERHEAD', 0.01);

  const minutes = Math.max(input.durationSeconds / 60, 0);
  const gigabytes = Math.max(input.fileBytes / (1024 * 1024 * 1024), 0);

  const transcribe_usd = Math.round(minutes * usdPerMinTranscribe * 1_000_000) / 1_000_000;
  const storage_usd = Math.round(gigabytes * usdPerGBStorage * 1_000_000) / 1_000_000;
  const overhead_usd = usdPerJobOverhead;
  const total_usd = Math.round((transcribe_usd + storage_usd + overhead_usd) * 1_000_000) / 1_000_000;

  return {
    transcribe_usd,
    storage_usd,
    overhead_usd,
    total_usd,
    duration_seconds: input.durationSeconds,
    file_bytes: input.fileBytes,
  };
}
