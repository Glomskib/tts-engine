import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';

export const runtime = 'nodejs';

/**
 * POST /api/import — import data from JSON export
 * Body: { type: 'products' | 'winners', data: [...] }
 */
export async function POST(request: NextRequest) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

  try {
    const authContext = await getApiAuthContext(request);
    if (!authContext.user) {
      return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
    }

    const body = await request.json();
    const { type, data } = body;

    if (!type || !Array.isArray(data)) {
      return createApiErrorResponse('BAD_REQUEST', 'Required: type (string) and data (array)', 400, correlationId);
    }

    if (data.length > 500) {
      return createApiErrorResponse('BAD_REQUEST', 'Maximum 500 records per import', 400, correlationId);
    }

    let imported = 0;
    let skipped = 0;

    if (type === 'products') {
      for (const item of data) {
        if (!item.name) { skipped++; continue; }
        const { error } = await supabaseAdmin.from('products').upsert({
          name: item.name,
          brand: item.brand || null,
          category: item.category || null,
          description: item.description || null,
          price: item.price ? parseFloat(item.price) : null,
          is_active: item.active !== false,
        }, { onConflict: 'name' });
        if (error) { skipped++; } else { imported++; }
      }
    } else if (type === 'winners') {
      for (const item of data) {
        if (!item.hook && !item.video_url) { skipped++; continue; }
        const { error } = await supabaseAdmin.from('winners_bank').insert({
          hook: item.hook || '',
          video_url: item.video_url || null,
          view_count: item.views ? parseInt(item.views) : null,
          source_type: item.source_type || 'external',
          notes: item.notes || null,
          patterns: item.patterns ? (typeof item.patterns === 'string' ? item.patterns.split(';').map((s: string) => s.trim()) : item.patterns) : null,
          user_id: authContext.user.id,
        });
        if (error) { skipped++; } else { imported++; }
      }
    } else {
      return createApiErrorResponse('BAD_REQUEST', 'Import type must be: products or winners', 400, correlationId);
    }

    return NextResponse.json({
      ok: true,
      data: { imported, skipped, total: data.length },
      correlation_id: correlationId,
    });
  } catch (error) {
    console.error(`[${correlationId}] Import error:`, error);
    return createApiErrorResponse('INTERNAL', 'Import failed', 500, correlationId);
  }
}
