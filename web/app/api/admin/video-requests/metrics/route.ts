/**
 * Admin Video Request Metrics API
 * Compute editing throughput, SLA compliance, and editor utilization
 * from existing video_requests timestamps. Read-only — no schema changes.
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function GET(request: Request) {
  const authContext = await getApiAuthContext(request);
  if (!authContext.user || !authContext.isAdmin) {
    return NextResponse.json({ ok: false, error: 'Admin access required' }, { status: 403 });
  }

  // Fetch all non-cancelled requests from the last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { data: requests, error } = await supabaseAdmin
    .from('video_requests')
    .select('id, status, priority, created_at, assigned_at, updated_at, completed_at, due_date, assigned_editor_id')
    .neq('status', 'cancelled')
    .gte('created_at', thirtyDaysAgo.toISOString())
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to fetch metrics:', error);
    return NextResponse.json({ ok: false, error: 'Failed to compute metrics' }, { status: 500 });
  }

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  // --- Throughput ---
  const submittedToday = (requests || []).filter(r =>
    r.status === 'review' && r.updated_at && new Date(r.updated_at) >= todayStart
  ).length;

  const approvedToday = (requests || []).filter(r =>
    r.status === 'completed' && r.completed_at && new Date(r.completed_at) >= todayStart
  ).length;

  // Avg turnaround (last 7 days): created_at → completed_at for completed requests
  const recentCompleted = (requests || []).filter(r =>
    r.status === 'completed' && r.completed_at && new Date(r.completed_at) >= sevenDaysAgo
  );
  const turnaroundHours = recentCompleted.map(r => {
    const created = new Date(r.created_at).getTime();
    const completed = new Date(r.completed_at!).getTime();
    return (completed - created) / (1000 * 60 * 60);
  });
  const avgTurnaround7d = turnaroundHours.length > 0
    ? Math.round(turnaroundHours.reduce((a, b) => a + b, 0) / turnaroundHours.length)
    : null;

  // --- SLA Compliance ---
  // % of completed requests finished within 24h of assignment
  const completedWithAssignment = recentCompleted.filter(r => r.assigned_at);
  const under24h = completedWithAssignment.filter(r => {
    const assigned = new Date(r.assigned_at!).getTime();
    const completed = new Date(r.completed_at!).getTime();
    return (completed - assigned) < 24 * 60 * 60 * 1000;
  });
  const slaComplianceRate = completedWithAssignment.length > 0
    ? Math.round((under24h.length / completedWithAssignment.length) * 100)
    : null;

  // Avg queue time: created_at → assigned_at
  const assignedRequests = (requests || []).filter(r => r.assigned_at);
  const queueHours = assignedRequests.map(r => {
    const created = new Date(r.created_at).getTime();
    const assigned = new Date(r.assigned_at!).getTime();
    return (assigned - created) / (1000 * 60 * 60);
  });
  const avgQueueTime = queueHours.length > 0
    ? Math.round((queueHours.reduce((a, b) => a + b, 0) / queueHours.length) * 10) / 10
    : null;

  // Avg editing time: assigned_at → completed_at
  const editingHours = completedWithAssignment.map(r => {
    const assigned = new Date(r.assigned_at!).getTime();
    const completed = new Date(r.completed_at!).getTime();
    return (completed - assigned) / (1000 * 60 * 60);
  });
  const avgEditingTime = editingHours.length > 0
    ? Math.round((editingHours.reduce((a, b) => a + b, 0) / editingHours.length) * 10) / 10
    : null;

  // --- Editor Utilization (anonymous) ---
  const editorMap = new Map<string, { claimed: number; completed: number }>();
  for (const r of requests || []) {
    if (!r.assigned_editor_id) continue;
    const entry = editorMap.get(r.assigned_editor_id) || { claimed: 0, completed: 0 };
    entry.claimed += 1;
    if (r.status === 'completed') entry.completed += 1;
    editorMap.set(r.assigned_editor_id, entry);
  }

  // Anonymous utilization: just counts, no IDs
  const editorStats = Array.from(editorMap.values());
  const totalEditors = editorStats.length;
  const totalClaimed = editorStats.reduce((a, e) => a + e.claimed, 0);
  const totalEditorCompleted = editorStats.reduce((a, e) => a + e.completed, 0);

  return NextResponse.json({
    ok: true,
    data: {
      throughput: {
        submitted_today: submittedToday,
        approved_today: approvedToday,
        avg_turnaround_7d_hours: avgTurnaround7d,
        completed_7d: recentCompleted.length,
      },
      sla: {
        compliance_rate_pct: slaComplianceRate,
        avg_queue_time_hours: avgQueueTime,
        avg_editing_time_hours: avgEditingTime,
        under_24h_count: under24h.length,
        total_measured: completedWithAssignment.length,
      },
      editors: {
        active_editors: totalEditors,
        total_claimed_30d: totalClaimed,
        total_completed_30d: totalEditorCompleted,
      },
    },
  });
}
