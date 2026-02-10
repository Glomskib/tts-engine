/**
 * Scripts Export API
 * Export all scripts as CSV for admin users.
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
  const userId = searchParams.get('user_id');
  const format = searchParams.get('format') || 'csv';

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const startDateStr = startDate.toISOString();

  try {
    let query = supabaseAdmin
      .from('saved_skits')
      .select(`
        id,
        title,
        product_name,
        product_brand,
        status,
        ai_score,
        created_at,
        updated_at,
        user_id,
        users:user_id(email)
      `)
      .gte('created_at', startDateStr)
      .order('created_at', { ascending: false });

    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data: scripts, error } = await query;

    if (error) {
      throw error;
    }

    if (format === 'json') {
      return NextResponse.json({
        ok: true,
        data: scripts,
        export_date: new Date().toISOString(),
        period_days: days,
        total_count: scripts?.length || 0,
      });
    }

    // Generate CSV
    const headers = [
      'ID',
      'Title',
      'Product Name',
      'Product Brand',
      'Status',
      'AI Score',
      'Hook Strength',
      'Virality Score',
      'User Email',
      'Created At',
      'Updated At',
    ];

    const rows = (scripts || []).map((s: Record<string, unknown>) => {
      const aiScore = s.ai_score as Record<string, number> | null;
      const user = s.users as { email: string } | null;
      return [
        escapeCSV(String(s.id || '')),
        escapeCSV(String(s.title || '')),
        escapeCSV(String(s.product_name || '')),
        escapeCSV(String(s.product_brand || '')),
        escapeCSV(String(s.status || '')),
        aiScore?.overall_score?.toString() || '',
        aiScore?.hook_strength?.toString() || '',
        aiScore?.virality_potential?.toString() || '',
        escapeCSV(user?.email || ''),
        s.created_at ? new Date(s.created_at as string).toISOString() : '',
        s.updated_at ? new Date(s.updated_at as string).toISOString() : '',
      ];
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(',')),
    ].join('\n');

    const filename = `scripts_export_${days}d_${new Date().toISOString().split('T')[0]}.csv`;

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Scripts export error:', error);
    return NextResponse.json({ ok: false, error: 'Failed to export scripts' }, { status: 500 });
  }
}

function escapeCSV(str: string): string {
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}
