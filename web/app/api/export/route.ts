import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';

export const runtime = 'nodejs';

type ExportType = 'videos' | 'scripts' | 'winners' | 'products' | 'all';
type ExportFormat = 'json' | 'csv';

function escapeCSV(val: unknown): string {
  const str = val === null || val === undefined ? '' : String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCSV(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map(h => escapeCSV(row[h])).join(','));
  }
  return lines.join('\n');
}

/**
 * GET /api/export?type=<type>&format=<json|csv>
 * Export data in JSON or CSV format
 */
export async function GET(request: NextRequest) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

  try {
    const authContext = await getApiAuthContext(request);
    if (!authContext.user) {
      return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
    }

    const { searchParams } = new URL(request.url);
    const type = (searchParams.get('type') || 'all') as ExportType;
    const format = (searchParams.get('format') || 'json') as ExportFormat;

    if (!['videos', 'scripts', 'winners', 'products', 'all'].includes(type)) {
      return createApiErrorResponse('BAD_REQUEST', 'Invalid type. Use: videos, scripts, winners, products, all', 400, correlationId);
    }

    const exportData: Record<string, unknown[]> = {};
    const timestamp = new Date().toISOString();

    // Videos
    if (type === 'videos' || type === 'all') {
      const { data: videos } = await supabaseAdmin
        .from('videos')
        .select('id, title, status, recording_status, priority_score, scheduled_date, tiktok_url, views_total, likes_total, comments_total, shares_total, created_at, last_status_changed_at, product:product_id(name,brand)')
        .order('created_at', { ascending: false })
        .limit(5000);

      exportData.videos = (videos || []).map(v => ({
        id: v.id,
        title: v.title,
        status: v.status,
        recording_status: v.recording_status,
        priority_score: v.priority_score,
        scheduled_date: v.scheduled_date,
        tiktok_url: v.tiktok_url,
        views: v.views_total,
        likes: v.likes_total,
        comments: v.comments_total,
        shares: v.shares_total,
        product: (v.product as any)?.name || '',
        brand: (v.product as any)?.brand || '',
        created_at: v.created_at,
        last_status_changed_at: v.last_status_changed_at,
      }));
    }

    // Scripts
    if (type === 'scripts' || type === 'all') {
      const { data: scripts } = await supabaseAdmin
        .from('saved_skits')
        .select('id, title, skit_data, product:product_id(name), created_at')
        .order('created_at', { ascending: false })
        .limit(5000);

      exportData.scripts = (scripts || []).map(s => ({
        id: s.id,
        title: s.title,
        product: (s.product as any)?.name || '',
        hook: (s.skit_data as any)?.hook || '',
        script_text: (s.skit_data as any)?.script || (s.skit_data as any)?.body || '',
        created_at: s.created_at,
      }));
    }

    // Winners
    if (type === 'winners' || type === 'all') {
      const { data: winners } = await supabaseAdmin
        .from('winners_bank')
        .select('id, hook, video_url, view_count, source_type, notes, patterns, created_at')
        .order('created_at', { ascending: false })
        .limit(5000);

      exportData.winners = (winners || []).map(w => ({
        id: w.id,
        hook: w.hook,
        video_url: w.video_url,
        views: w.view_count,
        source_type: w.source_type,
        notes: w.notes,
        patterns: Array.isArray(w.patterns) ? w.patterns.join('; ') : w.patterns || '',
        created_at: w.created_at,
      }));
    }

    // Products
    if (type === 'products' || type === 'all') {
      const { data: products } = await supabaseAdmin
        .from('products')
        .select('id, name, brand, category, description, price, is_active, created_at')
        .order('created_at', { ascending: false })
        .limit(5000);

      exportData.products = (products || []).map(p => ({
        id: p.id,
        name: p.name,
        brand: p.brand,
        category: p.category,
        description: p.description,
        price: p.price,
        active: p.is_active,
        created_at: p.created_at,
      }));
    }

    // JSON format
    if (format === 'json') {
      const output = {
        exported_at: timestamp,
        type,
        ...exportData,
      };

      return new NextResponse(JSON.stringify(output, null, 2), {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="flashflow-export-${type}-${timestamp.slice(0, 10)}.json"`,
          'x-correlation-id': correlationId,
        },
      });
    }

    // CSV format — if exporting 'all', combine into sections
    if (type === 'all') {
      // For 'all' CSV, return a zip-like concatenation with section headers
      const sections: string[] = [];
      for (const [key, rows] of Object.entries(exportData)) {
        if (rows.length > 0) {
          sections.push(`# ${key.toUpperCase()} (${rows.length} records)\n${toCSV(rows as Record<string, unknown>[])}`);
        }
      }

      return new NextResponse(sections.join('\n\n'), {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="flashflow-export-all-${timestamp.slice(0, 10)}.csv"`,
          'x-correlation-id': correlationId,
        },
      });
    }

    // Single type CSV
    const rows = exportData[type] || [];
    return new NextResponse(toCSV(rows as Record<string, unknown>[]), {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="flashflow-${type}-${timestamp.slice(0, 10)}.csv"`,
        'x-correlation-id': correlationId,
      },
    });
  } catch (error) {
    console.error(`[${correlationId}] Export error:`, error);
    return createApiErrorResponse('INTERNAL', 'Export failed', 500, correlationId);
  }
}
