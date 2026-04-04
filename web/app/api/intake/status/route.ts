/**
 * GET /api/intake/status
 * Returns connector status, recent jobs, and activity for the current user.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { MAX_FILES_PER_MONTH, MAX_MINUTES_PER_MONTH, MAX_INTAKE_FILE_BYTES, MAX_INTAKE_MINUTES } from '@/lib/intake/intake-limits';
import { getUserIntakeSettings } from '@/lib/intake/intake-settings';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = authContext.user.id;

  // Get connector
  const { data: connector } = await supabaseAdmin
    .from('drive_intake_connectors')
    .select('*')
    .eq('user_id', userId)
    .single();

  // Get recent jobs (include new statuses)
  const { data: jobs } = await supabaseAdmin
    .from('drive_intake_jobs')
    .select('id, drive_file_name, status, attempts, last_error, result, estimated_cost_usd, created_at, finished_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20);

  // Get counts
  const { count: pendingCount } = await supabaseAdmin
    .from('drive_intake_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'PENDING');

  const { count: totalProcessed } = await supabaseAdmin
    .from('drive_intake_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'SUCCEEDED');

  const { count: approvalCount } = await supabaseAdmin
    .from('drive_intake_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'NEEDS_APPROVAL');

  const { count: deferredCount } = await supabaseAdmin
    .from('drive_intake_jobs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'DEFERRED');

  // Load per-user settings (if any)
  const settings = await getUserIntakeSettings(userId);

  // Monthly usage
  const month = new Date().toISOString().slice(0, 7);
  const { data: usageRow } = await supabaseAdmin
    .from('drive_intake_usage')
    .select('total_files, total_minutes')
    .eq('user_id', userId)
    .eq('month', month)
    .single();

  const usage = {
    files: usageRow?.total_files || 0,
    minutes: parseFloat(String(usageRow?.total_minutes || 0)),
    maxFiles: settings.monthlyFileCap,
    maxMinutes: settings.monthlyMinutesCap,
    maxFileSizeBytes: settings.maxFileMb * 1024 * 1024,
    maxDurationMinutes: settings.maxVideoMinutes,
    month,
  };

  return NextResponse.json({
    ok: true,
    connector: connector || null,
    jobs: jobs || [],
    stats: {
      pending: pendingCount || 0,
      totalProcessed: totalProcessed || 0,
      approvalCount: approvalCount || 0,
      deferredCount: deferredCount || 0,
    },
    usage,
    configured: !!(process.env.GOOGLE_DRIVE_CLIENT_ID && process.env.GOOGLE_DRIVE_CLIENT_SECRET && process.env.DRIVE_TOKEN_ENCRYPTION_KEY),
  });
}
