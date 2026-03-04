/**
 * Per-user intake settings.
 *
 * Loads from `drive_intake_settings` if a row exists for the user,
 * otherwise falls back to global env-var defaults from intake-limits.ts.
 */
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import {
  MAX_INTAKE_FILE_BYTES,
  MAX_INTAKE_MINUTES,
  MAX_FILES_PER_MONTH,
  MAX_MINUTES_PER_MONTH,
} from './intake-limits';

export interface IntakeSettings {
  maxFileMb: number;
  maxVideoMinutes: number;
  allowedMimePrefixes: string[];
  monthlyFileCap: number;
  monthlyMinutesCap: number;
  dailyFileCap: number;
  dailyMinutesCap: number;
  monthlyCostCapUsd: number;
  requireApprovalAboveMb: number | null;
  requireApprovalAboveMin: number | null;
  isActive: boolean;
  /** Whether the settings came from a per-user DB row */
  isCustom: boolean;
}

/** Global defaults derived from env vars / intake-limits.ts constants. */
function getGlobalDefaults(): IntakeSettings {
  return {
    maxFileMb: Math.round(MAX_INTAKE_FILE_BYTES / (1024 * 1024)),
    maxVideoMinutes: MAX_INTAKE_MINUTES,
    allowedMimePrefixes: ['video/'],
    monthlyFileCap: MAX_FILES_PER_MONTH,
    monthlyMinutesCap: MAX_MINUTES_PER_MONTH,
    dailyFileCap: 50,
    dailyMinutesCap: 300,
    monthlyCostCapUsd: 50,
    requireApprovalAboveMb: null,
    requireApprovalAboveMin: null,
    isActive: true,
    isCustom: false,
  };
}

/**
 * Fetch per-user intake settings, falling back to global defaults.
 */
export async function getUserIntakeSettings(userId: string): Promise<IntakeSettings> {
  const defaults = getGlobalDefaults();

  const { data, error } = await supabaseAdmin
    .from('drive_intake_settings')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error || !data) return defaults;

  return {
    maxFileMb: data.max_file_mb ?? defaults.maxFileMb,
    maxVideoMinutes: data.max_video_minutes ?? defaults.maxVideoMinutes,
    allowedMimePrefixes: data.allowed_mime_prefixes ?? defaults.allowedMimePrefixes,
    monthlyFileCap: data.monthly_file_cap ?? defaults.monthlyFileCap,
    monthlyMinutesCap: data.monthly_minutes_cap ?? defaults.monthlyMinutesCap,
    dailyFileCap: data.daily_file_cap ?? defaults.dailyFileCap,
    dailyMinutesCap: data.daily_minutes_cap ?? defaults.dailyMinutesCap,
    monthlyCostCapUsd: parseFloat(String(data.monthly_cost_cap_usd ?? defaults.monthlyCostCapUsd)),
    requireApprovalAboveMb: data.require_approval_above_mb ?? null,
    requireApprovalAboveMin: data.require_approval_above_min ?? null,
    isActive: data.is_active ?? true,
    isCustom: true,
  };
}
