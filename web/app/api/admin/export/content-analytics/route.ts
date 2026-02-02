/**
 * Content Analytics Export API
 * Export content analytics data as CSV for admin users.
 */

import { NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const authContext = await getApiAuthContext();
  if (!authContext.user || !authContext.isAdmin) {
    return NextResponse.json({ ok: false, error: 'Admin access required' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const days = parseInt(searchParams.get('days') || '30');
  const type = searchParams.get('type') || 'scripts';

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const startDateStr = startDate.toISOString();

  try {
    let csvContent: string;
    let filename: string;

    switch (type) {
      case 'scripts': {
        // Scripts by day
        const { data: scriptsData } = await supabaseAdmin
          .from('scripts')
          .select('created_at')
          .gte('created_at', startDateStr)
          .order('created_at', { ascending: true });

        const scriptsByDay = groupByDay(scriptsData || [], 'created_at', days);

        csvContent = [
          'Date,Scripts Created',
          ...scriptsByDay.map(d => `${d.date},${d.count}`),
        ].join('\n');

        filename = `scripts_by_day_${days}d_${new Date().toISOString().split('T')[0]}.csv`;
        break;
      }

      case 'videos': {
        // Videos completed by day
        const { data: videoData } = await supabaseAdmin
          .from('video_requests')
          .select('completed_at, status')
          .eq('status', 'completed')
          .gte('created_at', startDateStr);

        const videosByDay = groupByDay(
          (videoData || []).filter((v: Record<string, unknown>) => v.completed_at),
          'completed_at',
          days
        );

        csvContent = [
          'Date,Videos Completed',
          ...videosByDay.map(d => `${d.date},${d.count}`),
        ].join('\n');

        filename = `videos_completed_${days}d_${new Date().toISOString().split('T')[0]}.csv`;
        break;
      }

      case 'credits': {
        // Credit usage by day
        const { data: creditData } = await supabaseAdmin
          .from('credit_transactions')
          .select('created_at, amount, type')
          .eq('type', 'debit')
          .gte('created_at', startDateStr);

        const creditsByDay: { date: string; credits: number; calls: number }[] = [];
        const creditMap = new Map<string, { credits: number; calls: number }>();

        (creditData || []).forEach((tx: Record<string, unknown>) => {
          const date = (tx.created_at as string).split('T')[0];
          const existing = creditMap.get(date) || { credits: 0, calls: 0 };
          existing.credits += Math.abs(tx.amount as number);
          existing.calls += 1;
          creditMap.set(date, existing);
        });

        for (let i = 0; i < days; i++) {
          const d = new Date();
          d.setDate(d.getDate() - (days - 1 - i));
          const dateStr = d.toISOString().split('T')[0];
          const data = creditMap.get(dateStr) || { credits: 0, calls: 0 };
          creditsByDay.push({ date: dateStr, credits: data.credits, calls: data.calls });
        }

        csvContent = [
          'Date,Credits Used,AI Calls',
          ...creditsByDay.map(d => `${d.date},${d.credits},${d.calls}`),
        ].join('\n');

        filename = `credit_usage_${days}d_${new Date().toISOString().split('T')[0]}.csv`;
        break;
      }

      case 'content-types': {
        // Content type breakdown
        const { data: contentTypeData } = await supabaseAdmin
          .from('scripts')
          .select('hook_style')
          .gte('created_at', startDateStr);

        const typeCount = new Map<string, number>();
        (contentTypeData || []).forEach((s: Record<string, unknown>) => {
          const hookType = (s.hook_style as string) || 'unknown';
          typeCount.set(hookType, (typeCount.get(hookType) || 0) + 1);
        });

        const totalScripts = contentTypeData?.length || 0;
        const contentTypes = Array.from(typeCount.entries())
          .map(([hookType, count]) => ({
            type: hookType,
            count,
            percentage: totalScripts > 0 ? Math.round((count / totalScripts) * 100) : 0,
          }))
          .sort((a, b) => b.count - a.count);

        csvContent = [
          'Content Type,Count,Percentage',
          ...contentTypes.map(ct => `${escapeCSV(ct.type)},${ct.count},${ct.percentage}%`),
        ].join('\n');

        filename = `content_types_${days}d_${new Date().toISOString().split('T')[0]}.csv`;
        break;
      }

      default:
        return NextResponse.json({
          ok: false,
          error: 'Invalid type. Valid types: scripts, videos, credits, content-types',
        }, { status: 400 });
    }

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Content analytics export error:', error);
    return NextResponse.json({ ok: false, error: 'Failed to export analytics' }, { status: 500 });
  }
}

function groupByDay(
  data: Record<string, unknown>[],
  dateField: string,
  days: number
): { date: string; count: number }[] {
  const countMap = new Map<string, number>();

  data.forEach(item => {
    const dateValue = item[dateField] as string | null;
    if (!dateValue) return;
    const date = dateValue.split('T')[0];
    countMap.set(date, (countMap.get(date) || 0) + 1);
  });

  const result: { date: string; count: number }[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - (days - 1 - i));
    const dateStr = d.toISOString().split('T')[0];
    result.push({
      date: dateStr,
      count: countMap.get(dateStr) || 0,
    });
  }

  return result;
}

function escapeCSV(str: string): string {
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}
