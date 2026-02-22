/**
 * GET /api/finops/export?start=YYYY-MM-DD&end=YYYY-MM-DD
 *
 * Owner-only CSV export of ff_usage_events for a date range.
 * Max 10,000 rows per request.
 */
import { NextRequest } from 'next/server';
import { requireOwner } from '@/lib/command-center/owner-guard';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

const CSV_COLUMNS = [
  'id', 'created_at', 'source', 'lane', 'provider', 'model',
  'input_tokens', 'output_tokens', 'cache_read_tokens', 'cache_write_tokens',
  'cost_usd', 'estimated', 'endpoint', 'template_key', 'agent_id', 'latency_ms',
];

function escapeCSV(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function GET(request: NextRequest) {
  const ownerCheck = await requireOwner(request);
  if (ownerCheck) return ownerCheck;

  const { searchParams } = request.nextUrl;
  const start = searchParams.get('start');
  const end = searchParams.get('end');

  if (!start || !end || !/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    return new Response('start and end query params required (YYYY-MM-DD)', { status: 400 });
  }

  const startTs = new Date(start + 'T00:00:00Z').toISOString();
  const endTs = new Date(end + 'T23:59:59.999Z').toISOString();

  const { data: rows, error } = await supabaseAdmin
    .from('ff_usage_events')
    .select('*')
    .gte('created_at', startTs)
    .lte('created_at', endTs)
    .order('created_at')
    .limit(10000);

  if (error) {
    return new Response(`Query error: ${error.message}`, { status: 500 });
  }

  const allRows = rows ?? [];

  // Build CSV
  const header = CSV_COLUMNS.join(',');
  const lines = allRows.map((row) =>
    CSV_COLUMNS.map((col) => escapeCSV(row[col])).join(',')
  );
  const csv = [header, ...lines].join('\n');

  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="finops_${start}_${end}.csv"`,
    },
  });
}
