/**
 * Video Requests Export API
 * Export video request history as CSV for admin users.
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const authContext = await getApiAuthContext(request);
  if (!authContext.user || !authContext.isAdmin) {
    return NextResponse.json({ ok: false, error: 'Admin access required' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const days = parseInt(searchParams.get('days') || '90');
  const status = searchParams.get('status');
  const clientId = searchParams.get('client_id');
  const format = searchParams.get('format') || 'csv';

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const startDateStr = startDate.toISOString();

  try {
    let query = supabaseAdmin
      .from('video_requests')
      .select(`
        id,
        title,
        description,
        status,
        priority,
        due_date,
        completed_at,
        revision_count,
        source_drive_link,
        edited_drive_link,
        created_at,
        user_id,
        assigned_editor_id,
        script_id,
        client:user_id(email),
        editor:assigned_editor_id(email),
        script:script_id(title)
      `)
      .gte('created_at', startDateStr)
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    if (clientId) {
      query = query.eq('user_id', clientId);
    }

    const { data: requests, error } = await query;

    if (error) {
      throw error;
    }

    if (format === 'json') {
      return NextResponse.json({
        ok: true,
        data: requests,
        export_date: new Date().toISOString(),
        period_days: days,
        total_count: requests?.length || 0,
      });
    }

    // Generate CSV
    const headers = [
      'ID',
      'Title',
      'Status',
      'Priority',
      'Client Email',
      'Editor Email',
      'Script Title',
      'Revisions',
      'Due Date',
      'Completed At',
      'Turnaround (Hours)',
      'Created At',
      'Source Link',
      'Edited Link',
    ];

    const rows = (requests || []).map((r: Record<string, unknown>) => {
      const client = r.client as { email: string } | null;
      const editor = r.editor as { email: string } | null;
      const script = r.script as { title: string } | null;

      // Calculate turnaround time
      let turnaround = '';
      if (r.completed_at && r.created_at) {
        const created = new Date(r.created_at as string).getTime();
        const completed = new Date(r.completed_at as string).getTime();
        const hours = Math.round((completed - created) / (1000 * 60 * 60));
        turnaround = hours.toString();
      }

      return [
        escapeCSV(String(r.id || '')),
        escapeCSV(String(r.title || '')),
        escapeCSV(String(r.status || '')),
        String(r.priority || ''),
        escapeCSV(client?.email || ''),
        escapeCSV(editor?.email || ''),
        escapeCSV(script?.title || ''),
        String(r.revision_count || 0),
        r.due_date ? new Date(r.due_date as string).toISOString().split('T')[0] : '',
        r.completed_at ? new Date(r.completed_at as string).toISOString() : '',
        turnaround,
        r.created_at ? new Date(r.created_at as string).toISOString() : '',
        escapeCSV(String(r.source_drive_link || '')),
        escapeCSV(String(r.edited_drive_link || '')),
      ];
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(',')),
    ].join('\n');

    const filename = `video_requests_export_${days}d_${new Date().toISOString().split('T')[0]}.csv`;

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Video requests export error:', error);
    return NextResponse.json({ ok: false, error: 'Failed to export video requests' }, { status: 500 });
  }
}

function escapeCSV(str: string): string {
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}
