import { NextRequest, NextResponse } from 'next/server';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

const MAX_ROWS = 500;

/**
 * POST /api/products/import
 * Import products from CSV text.
 * Body: { csv: string } — CSV with headers: name, brand, category, price, url
 */
export async function POST(request: NextRequest) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();
  try {
    const authContext = await getApiAuthContext(request);
    if (!authContext.user) {
      return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
    }

    let body: { csv: string };
    try {
      body = await request.json();
    } catch {
      return createApiErrorResponse('BAD_REQUEST', 'Invalid JSON body', 400, correlationId);
    }

    if (!body.csv || typeof body.csv !== 'string') {
      return createApiErrorResponse('BAD_REQUEST', 'csv field is required as string', 400, correlationId);
    }

    const lines = body.csv.trim().split('\n');
    if (lines.length < 2) {
      return createApiErrorResponse('BAD_REQUEST', 'CSV must have a header row and at least one data row', 400, correlationId);
    }

    // Parse header
    const headerLine = lines[0].toLowerCase().trim();
    const headers = headerLine.split(',').map(h => h.replace(/"/g, '').trim());

    const nameIdx = headers.indexOf('name');
    const brandIdx = headers.indexOf('brand');
    const categoryIdx = headers.indexOf('category');
    const priceIdx = headers.indexOf('price');
    const urlIdx = headers.indexOf('url');

    if (nameIdx === -1) {
      return createApiErrorResponse('BAD_REQUEST', 'CSV must have a "name" column', 400, correlationId);
    }

    const dataLines = lines.slice(1).filter(l => l.trim());
    if (dataLines.length > MAX_ROWS) {
      return createApiErrorResponse('BAD_REQUEST', `Maximum ${MAX_ROWS} rows per import`, 400, correlationId);
    }

    const products = [];
    const errors: { row: number; error: string }[] = [];

    for (let i = 0; i < dataLines.length; i++) {
      const cols = parseCSVLine(dataLines[i]);
      const name = cols[nameIdx]?.trim();
      if (!name) {
        errors.push({ row: i + 2, error: 'Missing name' });
        continue;
      }
      products.push({
        name,
        brand: brandIdx >= 0 ? cols[brandIdx]?.trim() || null : null,
        category: categoryIdx >= 0 ? cols[categoryIdx]?.trim() || null : null,
        price: priceIdx >= 0 ? parseFloat(cols[priceIdx]) || null : null,
        product_url: urlIdx >= 0 ? cols[urlIdx]?.trim() || null : null,
        user_id: authContext.user.id,
      });
    }

    if (products.length === 0) {
      return createApiErrorResponse('BAD_REQUEST', 'No valid products found in CSV', 400, correlationId);
    }

    const { data, error } = await supabaseAdmin
      .from('products')
      .insert(products)
      .select('id, name');

    if (error) {
      return createApiErrorResponse('DB_ERROR', error.message, 500, correlationId);
    }

    return NextResponse.json({
      ok: true,
      correlation_id: correlationId,
      data: {
        imported: data?.length || 0,
        errors: errors.length > 0 ? errors : undefined,
      },
    });
  } catch (err) {
    return createApiErrorResponse('INTERNAL', (err as Error).message, 500, correlationId);
  }
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        result.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
  }
  result.push(current);
  return result;
}
