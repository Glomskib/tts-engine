/**
 * POST /api/admin/finance/import-csv
 *
 * Owner-only. Imports CSV transactions into finance_transactions.
 *
 * Accepts JSON body:
 * {
 *   csv_text: string,
 *   account_id: string (uuid),
 *   mapping: { date: string, description: string, amount: string, debit?: string, credit?: string, category?: string },
 *   initiative_id?: string,
 *   rows: ParsedRow[]  // optional: pre-mapped rows from frontend preview
 * }
 */
import { NextResponse } from 'next/server';
import { requireOwner } from '@/lib/command-center/owner-guard';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import Papa from 'papaparse';
import { suggestCategory, detectDirection } from '@/lib/command-center/csv-category-rules';
import crypto from 'crypto';

export const runtime = 'nodejs';

interface ColumnMapping {
  date: string;
  description: string;
  amount: string;
  debit?: string;
  credit?: string;
  category?: string;
}

interface ImportRow {
  date: string;
  description: string;
  amount: number;
  direction: 'in' | 'out';
  category: string;
  initiative_id?: string | null;
}

function txHash(date: string, amount: number, description: string): string {
  return crypto
    .createHash('sha256')
    .update(`${date}|${amount}|${description}`)
    .digest('hex')
    .slice(0, 32);
}

function parseAmount(raw: string): number {
  if (!raw) return 0;
  // Remove currency symbols, commas, parentheses (accounting negatives)
  let cleaned = raw.replace(/[$,\s]/g, '');
  if (cleaned.startsWith('(') && cleaned.endsWith(')')) {
    cleaned = '-' + cleaned.slice(1, -1);
  }
  return parseFloat(cleaned) || 0;
}

function parseDate(raw: string): string | null {
  if (!raw) return null;
  // Try ISO first
  const d = new Date(raw);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  // Try MM/DD/YYYY
  const parts = raw.split(/[\/\-]/);
  if (parts.length === 3) {
    const [a, b, c] = parts.map(Number);
    // MM/DD/YYYY
    if (a <= 12 && b <= 31 && c > 100) {
      const dt = new Date(c, a - 1, b);
      if (!isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
    }
    // YYYY-MM-DD already handled above
  }
  return null;
}

export async function POST(request: Request) {
  const denied = await requireOwner(request);
  if (denied) return denied;

  let body: {
    csv_text: string;
    account_id: string;
    mapping: ColumnMapping;
    initiative_id?: string;
    rows?: ImportRow[];
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { csv_text, account_id, mapping, initiative_id } = body;

  if (!csv_text || !account_id || !mapping) {
    return NextResponse.json({ error: 'Missing csv_text, account_id, or mapping' }, { status: 400 });
  }

  // Validate account exists
  const { data: account } = await supabaseAdmin
    .from('finance_accounts')
    .select('id')
    .eq('id', account_id)
    .single();

  if (!account) {
    return NextResponse.json({ error: 'Account not found' }, { status: 400 });
  }

  // Parse CSV
  const parsed = Papa.parse<Record<string, string>>(csv_text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h: string) => h.trim(),
  });

  if (parsed.errors.length > 0 && parsed.data.length === 0) {
    return NextResponse.json({
      error: 'CSV parse failed',
      details: parsed.errors.slice(0, 5),
    }, { status: 400 });
  }

  // If pre-mapped rows provided by frontend, use those directly
  let rows: ImportRow[];

  if (body.rows && body.rows.length > 0) {
    rows = body.rows;
  } else {
    // Map CSV rows using column mapping
    rows = [];
    for (const csvRow of parsed.data) {
      const rawDate = csvRow[mapping.date] || '';
      const rawDesc = csvRow[mapping.description] || '';
      const rawAmount = csvRow[mapping.amount] || '';
      const rawDebit = mapping.debit ? csvRow[mapping.debit] : null;
      const rawCredit = mapping.credit ? csvRow[mapping.credit] : null;
      const rawCategory = mapping.category ? csvRow[mapping.category] : null;

      const date = parseDate(rawDate);
      if (!date) continue; // skip rows without valid date

      const amount = parseAmount(rawAmount || rawDebit || rawCredit || '0');
      if (amount === 0 && !rawDebit && !rawCredit) continue;

      const direction = detectDirection(amount, rawDebit ?? null, rawCredit ?? null);
      const suggestion = suggestCategory(rawDesc);

      rows.push({
        date,
        description: rawDesc.trim(),
        amount: Math.abs(amount || parseAmount(rawDebit || '') || parseAmount(rawCredit || '')),
        direction,
        category: rawCategory || suggestion?.category || 'other',
        initiative_id: initiative_id || null,
      });
    }
  }

  if (rows.length === 0) {
    return NextResponse.json({ error: 'No valid rows found in CSV' }, { status: 400 });
  }

  // Compute hashes for duplicate detection
  const hashes = rows.map((r) => txHash(r.date, r.amount, r.description));

  // Check for existing duplicates
  const { data: existing } = await supabaseAdmin
    .from('finance_transactions')
    .select('meta')
    .eq('account_id', account_id)
    .not('meta->import_hash', 'is', null);

  const existingHashes = new Set(
    (existing || [])
      .map((e: { meta: Record<string, unknown> }) => e.meta?.import_hash as string)
      .filter(Boolean)
  );

  // Build inserts, skip duplicates
  const inserts: Record<string, unknown>[] = [];
  const skipped: number[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const hash = hashes[i];

    if (existingHashes.has(hash)) {
      skipped.push(i);
      continue;
    }

    inserts.push({
      account_id,
      ts: `${row.date}T12:00:00Z`,
      direction: row.direction,
      amount: row.amount,
      category: row.category,
      vendor: null,
      memo: row.description,
      project_id: null,
      initiative_id: row.initiative_id || null,
      source: 'bank_csv',
      meta: { import_hash: hash },
    });
  }

  if (inserts.length === 0) {
    return NextResponse.json({
      ok: true,
      imported: 0,
      skipped_duplicates: skipped.length,
      total_rows: rows.length,
    });
  }

  // Batch insert (Supabase handles up to 1000 rows per insert)
  const batchSize = 500;
  let totalImported = 0;

  for (let i = 0; i < inserts.length; i += batchSize) {
    const batch = inserts.slice(i, i + batchSize);
    const { error } = await supabaseAdmin
      .from('finance_transactions')
      .insert(batch);

    if (error) {
      console.error('[import-csv] batch insert error:', error);
      return NextResponse.json({
        error: 'Database insert failed',
        detail: error.message,
        imported_so_far: totalImported,
      }, { status: 500 });
    }
    totalImported += batch.length;
  }

  return NextResponse.json({
    ok: true,
    imported: totalImported,
    skipped_duplicates: skipped.length,
    total_rows: rows.length,
  });
}
