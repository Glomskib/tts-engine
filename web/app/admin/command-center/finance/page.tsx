'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { ArrowLeft, Plus, RefreshCw, TrendingUp, TrendingDown, DollarSign, Upload, ChevronRight, X } from 'lucide-react';
import Link from 'next/link';
import InitiativeFilter from '../_components/InitiativeFilter';

interface FinanceSummary {
  from: string;
  to: string;
  total_in: number;
  total_out: number;
  net: number;
  by_category: Record<string, { in: number; out: number }>;
  by_project: Record<string, { in: number; out: number; project_name: string }>;
}

interface ProfitData {
  from: string;
  to: string;
  total_revenue_cents: number;
  total_expense_cents: number;
  total_profit_cents: number;
  daily_series: { day: string; revenue_cents: number; expense_cents: number; profit_cents: number }[];
  top_revenue_categories: { category: string; amount_cents: number }[];
  top_expense_categories: { category: string; amount_cents: number }[];
}

interface Transaction {
  id: string;
  ts: string;
  direction: string;
  amount: number;
  category: string;
  vendor: string | null;
  memo: string | null;
  project_id: string | null;
  finance_accounts?: { name: string } | null;
}

interface Account {
  id: string;
  name: string;
  type: string;
  currency: string;
}

interface Initiative {
  id: string;
  title: string;
}

// CSV import types
interface CsvPreviewRow {
  date: string;
  description: string;
  amount: number;
  direction: 'in' | 'out';
  category: string;
  initiative_id?: string | null;
}

const CATEGORY_OPTIONS = [
  'revenue', 'shopify_payout', 'tiktok_payout', 'sponsorship', 'saas',
  'ads', 'software', 'payroll', 'contractor', 'shipping', 'cogs', 'event_supplies', 'other',
];

// Client-side category suggestion (mirrors server rules)
const CATEGORY_RULES: { keywords: string[]; category: string; direction: 'in' | 'out' }[] = [
  { keywords: ['shopify payout', 'shopify payment'], category: 'shopify_payout', direction: 'in' },
  { keywords: ['tiktok payout', 'tiktok payment'], category: 'tiktok_payout', direction: 'in' },
  { keywords: ['stripe payout', 'stripe transfer'], category: 'revenue', direction: 'in' },
  { keywords: ['deposit', 'direct dep'], category: 'revenue', direction: 'in' },
  { keywords: ['facebook', 'meta ads', 'fb ads', 'instagram'], category: 'ads', direction: 'out' },
  { keywords: ['google ads', 'adwords'], category: 'ads', direction: 'out' },
  { keywords: ['tiktok ads'], category: 'ads', direction: 'out' },
  { keywords: ['openai', 'anthropic', 'claude'], category: 'software', direction: 'out' },
  { keywords: ['vercel', 'supabase', 'netlify', 'aws', 'azure', 'gcp'], category: 'software', direction: 'out' },
  { keywords: ['github', 'slack', 'notion', 'figma', 'canva', 'adobe'], category: 'software', direction: 'out' },
  { keywords: ['usps', 'ups', 'fedex', 'dhl', 'shipping'], category: 'shipping', direction: 'out' },
  { keywords: ['inventory', 'wholesale', 'supplier'], category: 'cogs', direction: 'out' },
  { keywords: ['contractor', 'freelance', 'upwork', 'fiverr'], category: 'contractor', direction: 'out' },
  { keywords: ['payroll', 'gusto', 'salary', 'wages'], category: 'payroll', direction: 'out' },
  { keywords: ['event', 'venue', 'catering'], category: 'event_supplies', direction: 'out' },
];

function suggestCategory(desc: string): { category: string; direction: 'in' | 'out' } | null {
  const lower = desc.toLowerCase();
  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some((kw) => lower.includes(kw))) return rule;
  }
  return null;
}

function formatCurrency(n: number) {
  return `$${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function centsToDisplay(cents: number) {
  return formatCurrency(cents / 100);
}

function parseAmount(raw: string): number {
  if (!raw) return 0;
  let cleaned = raw.replace(/[$,\s]/g, '');
  if (cleaned.startsWith('(') && cleaned.endsWith(')')) cleaned = '-' + cleaned.slice(1, -1);
  return parseFloat(cleaned) || 0;
}

function parseDate(raw: string): string | null {
  if (!raw) return null;
  const d = new Date(raw);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  const parts = raw.split(/[\/\-]/);
  if (parts.length === 3) {
    const [a, b, c] = parts.map(Number);
    if (a <= 12 && b <= 31 && c > 100) {
      const dt = new Date(c, a - 1, b);
      if (!isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
    }
  }
  return null;
}

// Auto-detect column mapping from CSV headers
function autoDetectMapping(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = { date: '', description: '', amount: '' };
  const lower = headers.map((h) => h.toLowerCase().trim());

  // Date
  const dateIdx = lower.findIndex((h) => /^(date|trans.*date|post.*date|occurred|effective)/.test(h));
  if (dateIdx >= 0) mapping.date = headers[dateIdx];

  // Description
  const descIdx = lower.findIndex((h) => /^(desc|memo|narr|detail|payee|merchant|name)/.test(h));
  if (descIdx >= 0) mapping.description = headers[descIdx];

  // Amount (single column)
  const amtIdx = lower.findIndex((h) => /^(amount|total|sum)$/.test(h));
  if (amtIdx >= 0) mapping.amount = headers[amtIdx];

  // Debit/Credit separate columns
  const debitIdx = lower.findIndex((h) => /^(debit|withdrawal|charge)/.test(h));
  const creditIdx = lower.findIndex((h) => /^(credit|deposit|payment)/.test(h));
  if (debitIdx >= 0) mapping.debit = headers[debitIdx];
  if (creditIdx >= 0) mapping.credit = headers[creditIdx];

  // Category
  const catIdx = lower.findIndex((h) => /^(category|type|class)/.test(h));
  if (catIdx >= 0) mapping.category = headers[catIdx];

  return mapping;
}

// ── CSV Import Wizard Component ──────────────────────────────────
function CsvImportWizard({
  accounts,
  onClose,
  onComplete,
}: {
  accounts: Account[];
  onClose: () => void;
  onComplete: () => void;
}) {
  const [step, setStep] = useState(1);
  const [accountId, setAccountId] = useState('');
  const [csvText, setCsvText] = useState('');
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [previewRows, setPreviewRows] = useState<CsvPreviewRow[]>([]);
  const [bulkInitiativeId, setBulkInitiativeId] = useState('');
  const [initiatives, setInitiatives] = useState<Initiative[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ imported: number; skipped_duplicates: number } | null>(null);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // Fetch initiatives for linking
  useEffect(() => {
    fetch('/api/admin/command-center/finance/profit')
      .then(() =>
        fetch('/api/admin/finance/accounts')
      )
      .catch(() => {});
    // Fetch initiatives from the filter endpoint
    fetch('/api/admin/command-center/initiatives')
      .then((r) => r.ok ? r.json() : { data: [] })
      .then((json) => setInitiatives(json.data || []))
      .catch(() => {});
  }, []);

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setCsvText(text);
      parseCsvPreview(text);
    };
    reader.readAsText(file);
  }

  function parseCsvPreview(text: string) {
    // Dynamic import not needed - parse on client using simple split
    const lines = text.split('\n').filter((l) => l.trim());
    if (lines.length < 2) { setError('CSV must have a header row and at least one data row'); return; }

    // Simple CSV parse (handles basic quoting)
    function parseLine(line: string): string[] {
      const result: string[] = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') { inQuotes = !inQuotes; continue; }
        if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ''; continue; }
        current += ch;
      }
      result.push(current.trim());
      return result;
    }

    const hdrs = parseLine(lines[0]);
    setHeaders(hdrs);

    const rows: Record<string, string>[] = [];
    for (let i = 1; i < lines.length; i++) {
      const vals = parseLine(lines[i]);
      const row: Record<string, string> = {};
      hdrs.forEach((h, idx) => { row[h] = vals[idx] || ''; });
      rows.push(row);
    }
    setRawRows(rows);

    const detected = autoDetectMapping(hdrs);
    setMapping(detected);
    setError('');
  }

  function buildPreview() {
    const rows: CsvPreviewRow[] = [];
    for (const raw of rawRows) {
      const rawDate = mapping.date ? raw[mapping.date] : '';
      const rawDesc = mapping.description ? raw[mapping.description] : '';
      const rawAmount = mapping.amount ? raw[mapping.amount] : '';
      const rawDebit = mapping.debit ? raw[mapping.debit] : null;
      const rawCredit = mapping.credit ? raw[mapping.credit] : null;
      const rawCategory = mapping.category ? raw[mapping.category] : null;

      const date = parseDate(rawDate);
      if (!date) continue;

      let amount = parseAmount(rawAmount);
      const debitAmt = rawDebit ? parseAmount(rawDebit) : 0;
      const creditAmt = rawCredit ? parseAmount(rawCredit) : 0;

      let direction: 'in' | 'out';
      if (rawDebit != null && rawCredit != null && (debitAmt > 0 || creditAmt > 0)) {
        amount = debitAmt > 0 ? debitAmt : creditAmt;
        direction = debitAmt > 0 ? 'out' : 'in';
      } else {
        direction = amount < 0 ? 'out' : 'in';
        amount = Math.abs(amount);
      }

      if (amount === 0) continue;

      const suggestion = suggestCategory(rawDesc);

      rows.push({
        date,
        description: rawDesc.trim(),
        amount,
        direction,
        category: rawCategory || suggestion?.category || 'other',
        initiative_id: bulkInitiativeId || null,
      });
    }
    setPreviewRows(rows);
    setStep(3);
  }

  function updatePreviewRow(idx: number, field: keyof CsvPreviewRow, value: string) {
    setPreviewRows((prev) => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  }

  function applyBulkInitiative(id: string) {
    setBulkInitiativeId(id);
    setPreviewRows((prev) => prev.map((r) => ({ ...r, initiative_id: id || null })));
  }

  async function doImport() {
    setImporting(true);
    setError('');
    try {
      const res = await fetch('/api/admin/finance/import-csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          csv_text: csvText,
          account_id: accountId,
          mapping,
          initiative_id: bulkInitiativeId || undefined,
          rows: previewRows,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Import failed');
      } else {
        setResult({ imported: json.imported, skipped_duplicates: json.skipped_duplicates });
        setStep(4);
      }
    } catch (err) {
      setError('Network error');
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <Upload className="w-5 h-5 text-emerald-400" />
            <h2 className="text-lg font-semibold text-white">Import CSV</h2>
            <div className="flex items-center gap-1 text-xs text-zinc-500 ml-3">
              {[1, 2, 3, 4].map((s) => (
                <span key={s} className="flex items-center gap-1">
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                    step === s ? 'bg-emerald-600 text-white' : step > s ? 'bg-emerald-800 text-emerald-300' : 'bg-zinc-800 text-zinc-500'
                  }`}>{s}</span>
                  {s < 4 && <ChevronRight className="w-3 h-3 text-zinc-600" />}
                </span>
              ))}
            </div>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {/* Step 1: Choose account */}
          {step === 1 && (
            <div className="space-y-4">
              <p className="text-sm text-zinc-400">Select the account this CSV belongs to:</p>
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 text-zinc-300 rounded px-3 py-2.5 text-sm"
              >
                <option value="">Select account...</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name} ({a.type})</option>
                ))}
              </select>
            </div>
          )}

          {/* Step 2: Upload CSV */}
          {step === 2 && (
            <div className="space-y-4">
              <p className="text-sm text-zinc-400">Upload your bank or statement CSV:</p>
              <div
                onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-zinc-700 hover:border-zinc-500 rounded-lg p-8 text-center cursor-pointer transition-colors"
              >
                <Upload className="w-8 h-8 text-zinc-500 mx-auto mb-2" />
                <p className="text-sm text-zinc-400">{fileName || 'Click to select CSV file'}</p>
                <p className="text-xs text-zinc-600 mt-1">Supports .csv files</p>
              </div>
              <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={handleFileUpload} className="hidden" />
              {csvText && headers.length > 0 && (
                <div className="space-y-3 mt-4">
                  <p className="text-sm text-zinc-300">Detected {headers.length} columns, {rawRows.length} rows</p>
                  <p className="text-sm text-zinc-400 font-medium">Column mapping:</p>
                  <div className="grid grid-cols-2 gap-3">
                    {['date', 'description', 'amount', 'debit', 'credit', 'category'].map((field) => (
                      <div key={field} className="flex items-center gap-2">
                        <label className="text-xs text-zinc-500 w-20 capitalize">{field}:</label>
                        <select
                          value={mapping[field] || ''}
                          onChange={(e) => setMapping({ ...mapping, [field]: e.target.value })}
                          className="flex-1 bg-zinc-800 border border-zinc-700 text-zinc-300 rounded px-2 py-1.5 text-xs"
                        >
                          <option value="">{field === 'debit' || field === 'credit' || field === 'category' ? '(none)' : 'Select...'}</option>
                          {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {error && <p className="text-sm text-red-400">{error}</p>}
            </div>
          )}

          {/* Step 3: Preview */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-zinc-400">{previewRows.length} rows to import. Review and edit below:</p>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-500">Bulk initiative:</span>
                  <select
                    value={bulkInitiativeId}
                    onChange={(e) => applyBulkInitiative(e.target.value)}
                    className="bg-zinc-800 border border-zinc-700 text-zinc-300 rounded px-2 py-1 text-xs"
                  >
                    <option value="">None</option>
                    {initiatives.map((i) => (
                      <option key={i.id} value={i.id}>{i.title}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="border border-zinc-800 rounded-lg overflow-x-auto max-h-[400px]">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-zinc-900">
                    <tr className="border-b border-zinc-800 text-zinc-500 text-left">
                      <th className="px-3 py-2 font-medium w-8">#</th>
                      <th className="px-3 py-2 font-medium">Date</th>
                      <th className="px-3 py-2 font-medium">Description</th>
                      <th className="px-3 py-2 font-medium text-right">Amount</th>
                      <th className="px-3 py-2 font-medium">Dir</th>
                      <th className="px-3 py-2 font-medium">Category</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800">
                    {previewRows.slice(0, 50).map((row, i) => (
                      <tr key={i} className="hover:bg-zinc-800/50">
                        <td className="px-3 py-1.5 text-zinc-600">{i + 1}</td>
                        <td className="px-3 py-1.5 text-zinc-400 font-mono">{row.date}</td>
                        <td className="px-3 py-1.5 text-zinc-300 max-w-[250px] truncate">{row.description}</td>
                        <td className="px-3 py-1.5 text-right font-mono text-zinc-300">{formatCurrency(row.amount)}</td>
                        <td className="px-3 py-1.5">
                          <select
                            value={row.direction}
                            onChange={(e) => updatePreviewRow(i, 'direction', e.target.value)}
                            className="bg-zinc-800 border border-zinc-700 text-zinc-300 rounded px-1 py-0.5 text-xs"
                          >
                            <option value="in">In</option>
                            <option value="out">Out</option>
                          </select>
                        </td>
                        <td className="px-3 py-1.5">
                          <select
                            value={row.category}
                            onChange={(e) => updatePreviewRow(i, 'category', e.target.value)}
                            className="bg-zinc-800 border border-zinc-700 text-zinc-300 rounded px-1 py-0.5 text-xs"
                          >
                            {CATEGORY_OPTIONS.map((c) => (
                              <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {previewRows.length > 50 && (
                  <p className="text-xs text-zinc-600 px-3 py-2">Showing first 50 of {previewRows.length} rows</p>
                )}
              </div>
              {error && <p className="text-sm text-red-400">{error}</p>}
            </div>
          )}

          {/* Step 4: Result */}
          {step === 4 && result && (
            <div className="text-center py-8">
              <div className="text-4xl mb-3 text-emerald-400">&#10003;</div>
              <h3 className="text-lg font-semibold text-white mb-2">Import Complete</h3>
              <p className="text-sm text-zinc-400">
                <span className="text-emerald-400 font-semibold">{result.imported}</span> transactions imported
                {result.skipped_duplicates > 0 && (
                  <>, <span className="text-amber-400">{result.skipped_duplicates}</span> duplicates skipped</>
                )}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-zinc-800">
          <div>
            {step > 1 && step < 4 && (
              <button onClick={() => setStep(step - 1)} className="px-4 py-2 text-sm text-zinc-400 hover:text-white">
                Back
              </button>
            )}
          </div>
          <div className="flex gap-2">
            {step === 4 ? (
              <button onClick={() => { onComplete(); onClose(); }} className="px-4 py-2 text-sm bg-emerald-600 hover:bg-emerald-500 text-white rounded">
                Done
              </button>
            ) : step === 3 ? (
              <button onClick={doImport} disabled={importing || previewRows.length === 0} className="px-4 py-2 text-sm bg-emerald-600 hover:bg-emerald-500 text-white rounded disabled:opacity-50">
                {importing ? 'Importing...' : `Import ${previewRows.length} rows`}
              </button>
            ) : step === 2 ? (
              <button
                onClick={buildPreview}
                disabled={!csvText || !mapping.date || !mapping.description || (!mapping.amount && !mapping.debit)}
                className="px-4 py-2 text-sm bg-emerald-600 hover:bg-emerald-500 text-white rounded disabled:opacity-50"
              >
                Preview
              </button>
            ) : (
              <button onClick={() => setStep(2)} disabled={!accountId} className="px-4 py-2 text-sm bg-emerald-600 hover:bg-emerald-500 text-white rounded disabled:opacity-50">
                Next
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Finance Page ──────────────────────────────────────────────
export default function FinancePage() {
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [profit, setProfit] = useState<ProfitData | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(1); // first of month
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [initiativeId, setInitiativeId] = useState<string>('');
  const [showAddTx, setShowAddTx] = useState(false);
  const [showCsvImport, setShowCsvImport] = useState(false);
  const [newTx, setNewTx] = useState({
    account_id: '',
    direction: 'out' as 'in' | 'out',
    amount: '',
    category: 'software',
    vendor: '',
    memo: '',
  });

  const fetchSummary = useCallback(async () => {
    const params = new URLSearchParams({ from, to });
    if (initiativeId) params.set('initiative_id', initiativeId);
    const res = await fetch(`/api/admin/finance/summary?${params}`);
    if (res.ok) {
      const json = await res.json();
      setSummary(json.data);
    }
  }, [from, to, initiativeId]);

  const fetchProfit = useCallback(async () => {
    const params = new URLSearchParams({ from, to });
    if (initiativeId) params.set('initiative_id', initiativeId);
    const res = await fetch(`/api/admin/command-center/finance/profit?${params}`);
    if (res.ok) {
      const json = await res.json();
      setProfit(json.data);
    }
  }, [from, to, initiativeId]);

  const fetchTransactions = useCallback(async () => {
    const res = await fetch(`/api/admin/finance/transaction?from=${from}&to=${to}&limit=100`);
    if (res.ok) {
      const json = await res.json();
      setTransactions(json.data || []);
    }
  }, [from, to]);

  const fetchAccounts = useCallback(async () => {
    const res = await fetch('/api/admin/finance/accounts');
    if (res.ok) {
      const json = await res.json();
      setAccounts(json.data || []);
    }
  }, []);

  const refreshAll = useCallback(() => {
    setLoading(true);
    Promise.all([fetchSummary(), fetchProfit(), fetchTransactions(), fetchAccounts()])
      .finally(() => setLoading(false));
  }, [fetchSummary, fetchProfit, fetchTransactions, fetchAccounts]);

  useEffect(() => { refreshAll(); }, [refreshAll]);

  async function addTransaction() {
    if (!newTx.account_id || !newTx.amount) return;
    const res = await fetch('/api/admin/finance/transaction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        account_id: newTx.account_id,
        direction: newTx.direction,
        amount: parseFloat(newTx.amount),
        category: newTx.category,
        vendor: newTx.vendor || null,
        memo: newTx.memo || null,
      }),
    });
    if (res.ok) {
      setShowAddTx(false);
      setNewTx({ account_id: '', direction: 'out', amount: '', category: 'software', vendor: '', memo: '' });
      fetchSummary();
      fetchProfit();
      fetchTransactions();
    }
  }

  // Compute max bar height for profit trend chart
  const maxDailyVal = profit?.daily_series.reduce(
    (mx, d) => Math.max(mx, Math.abs(d.revenue_cents), Math.abs(d.expense_cents)),
    1,
  ) ?? 1;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/admin/command-center" className="text-zinc-500 hover:text-zinc-300">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-white">Finance & Profit</h1>
          <p className="text-sm text-zinc-500">Profitability, cashflow & transaction ledger</p>
        </div>
        <button onClick={() => setShowCsvImport(true)} className="flex items-center gap-2 px-3 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-lg">
          <Upload className="w-4 h-4" /> Import CSV
        </button>
        <button onClick={() => setShowAddTx(true)} className="flex items-center gap-2 px-3 py-2 text-sm bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg">
          <Plus className="w-4 h-4" /> Add Transaction
        </button>
      </div>

      {/* Date range + initiative filter */}
      <div className="flex items-center gap-3 flex-wrap">
        <InitiativeFilter value={initiativeId} onChange={setInitiativeId} />
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="bg-zinc-800 border border-zinc-700 text-zinc-300 rounded px-3 py-1.5 text-sm" />
        <span className="text-zinc-600">to</span>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="bg-zinc-800 border border-zinc-700 text-zinc-300 rounded px-3 py-1.5 text-sm" />
        <button onClick={() => { fetchSummary(); fetchProfit(); fetchTransactions(); }} className="p-2 text-zinc-400 hover:text-white">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* CSV Import Modal */}
      {showCsvImport && (
        <CsvImportWizard
          accounts={accounts}
          onClose={() => setShowCsvImport(false)}
          onComplete={refreshAll}
        />
      )}

      {/* ═══ Profit View ═══ */}
      {profit && (
        <>
          {/* Profit cards */}
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="w-4 h-4 text-emerald-400" />
                <span className="text-xs text-zinc-500 uppercase">Revenue</span>
              </div>
              <div className="text-2xl font-bold text-emerald-400">{centsToDisplay(profit.total_revenue_cents)}</div>
            </div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
              <div className="flex items-center gap-2 mb-1">
                <TrendingDown className="w-4 h-4 text-red-400" />
                <span className="text-xs text-zinc-500 uppercase">Expenses (incl. API)</span>
              </div>
              <div className="text-2xl font-bold text-red-400">{centsToDisplay(profit.total_expense_cents)}</div>
            </div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="w-4 h-4 text-amber-400" />
                <span className="text-xs text-zinc-500 uppercase">Profit</span>
              </div>
              <div className={`text-2xl font-bold ${profit.total_profit_cents >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {profit.total_profit_cents >= 0 ? '+' : '-'}{centsToDisplay(profit.total_profit_cents)}
              </div>
            </div>
          </div>

          {/* Daily profit trend (bar chart) */}
          {profit.daily_series.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-zinc-300 mb-2">Daily Profit Trend</h3>
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
                <div className="flex items-end gap-1 h-32">
                  {profit.daily_series.map((d) => {
                    const revH = Math.max(1, (d.revenue_cents / maxDailyVal) * 100);
                    const expH = Math.max(1, (d.expense_cents / maxDailyVal) * 100);
                    return (
                      <div key={d.day} className="flex-1 flex flex-col items-center gap-0.5 group relative">
                        <div className="flex items-end gap-px w-full justify-center" style={{ height: '100px' }}>
                          <div className="bg-emerald-500/70 rounded-t" style={{ width: '40%', height: `${revH}%` }} />
                          <div className="bg-red-500/70 rounded-t" style={{ width: '40%', height: `${expH}%` }} />
                        </div>
                        <span className="text-[9px] text-zinc-600 leading-none">{d.day.slice(5)}</span>
                        <div className="absolute bottom-full mb-2 hidden group-hover:block bg-zinc-800 text-xs text-zinc-300 px-2 py-1 rounded shadow-lg whitespace-nowrap z-10">
                          <div className="text-emerald-400">Rev: {centsToDisplay(d.revenue_cents)}</div>
                          <div className="text-red-400">Exp: {centsToDisplay(d.expense_cents)}</div>
                          <div className={d.profit_cents >= 0 ? 'text-emerald-300' : 'text-red-300'}>
                            P/L: {d.profit_cents >= 0 ? '+' : '-'}{centsToDisplay(d.profit_cents)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-center gap-4 mt-2 text-xs text-zinc-500">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-emerald-500/70" /> Revenue</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-red-500/70" /> Expenses</span>
                </div>
              </div>
            </div>
          )}

          {/* Top categories */}
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-sm font-semibold text-zinc-300 mb-2">Top Revenue Categories</h3>
              <div className="border border-zinc-800 rounded-lg divide-y divide-zinc-800">
                {profit.top_revenue_categories.map((c) => (
                  <div key={c.category} className="px-4 py-2 flex items-center justify-between text-sm">
                    <span className="text-zinc-300 capitalize">{c.category.replace(/_/g, ' ')}</span>
                    <span className="text-emerald-400 font-mono">{centsToDisplay(c.amount_cents)}</span>
                  </div>
                ))}
                {profit.top_revenue_categories.length === 0 && (
                  <div className="px-4 py-4 text-center text-zinc-500 text-sm">No revenue data</div>
                )}
              </div>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-zinc-300 mb-2">Top Expense Categories</h3>
              <div className="border border-zinc-800 rounded-lg divide-y divide-zinc-800">
                {profit.top_expense_categories.map((c) => (
                  <div key={c.category} className="px-4 py-2 flex items-center justify-between text-sm">
                    <span className="text-zinc-300 capitalize">{c.category.replace(/_/g, ' ')}</span>
                    <span className="text-red-400 font-mono">{centsToDisplay(c.amount_cents)}</span>
                  </div>
                ))}
                {profit.top_expense_categories.length === 0 && (
                  <div className="px-4 py-4 text-center text-zinc-500 text-sm">No expense data</div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ═══ Legacy Cashflow (by category / by project) ═══ */}
      {summary && (
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <h3 className="text-sm font-semibold text-zinc-300 mb-2">By Category (Transactions Only)</h3>
            <div className="border border-zinc-800 rounded-lg divide-y divide-zinc-800">
              {Object.entries(summary.by_category)
                .sort((a, b) => (b[1].out - b[1].in) - (a[1].out - a[1].in))
                .map(([cat, vals]) => (
                  <div key={cat} className="px-4 py-2 flex items-center justify-between text-sm">
                    <span className="text-zinc-300 capitalize">{cat}</span>
                    <div className="flex gap-4">
                      {vals.in > 0 && <span className="text-emerald-400">+{formatCurrency(vals.in)}</span>}
                      {vals.out > 0 && <span className="text-red-400">-{formatCurrency(vals.out)}</span>}
                    </div>
                  </div>
                ))}
              {Object.keys(summary.by_category).length === 0 && (
                <div className="px-4 py-4 text-center text-zinc-500 text-sm">No data</div>
              )}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-zinc-300 mb-2">By Project</h3>
            <div className="border border-zinc-800 rounded-lg divide-y divide-zinc-800">
              {Object.entries(summary.by_project).map(([, vals]) => (
                <div key={vals.project_name} className="px-4 py-2 flex items-center justify-between text-sm">
                  <span className="text-zinc-300">{vals.project_name}</span>
                  <div className="flex gap-4">
                    {vals.in > 0 && <span className="text-emerald-400">+{formatCurrency(vals.in)}</span>}
                    {vals.out > 0 && <span className="text-red-400">-{formatCurrency(vals.out)}</span>}
                  </div>
                </div>
              ))}
              {Object.keys(summary.by_project).length === 0 && (
                <div className="px-4 py-4 text-center text-zinc-500 text-sm">No data</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Quick add transaction */}
      {showAddTx && (
        <div className="border border-emerald-800/50 rounded-lg p-4 bg-zinc-900">
          <h3 className="text-sm font-semibold text-zinc-300 mb-3">Add Transaction</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <select value={newTx.account_id} onChange={(e) => setNewTx({ ...newTx, account_id: e.target.value })} className="bg-zinc-800 border border-zinc-700 text-zinc-300 rounded px-3 py-2 text-sm">
              <option value="">Select account</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.type})</option>)}
            </select>
            <select value={newTx.direction} onChange={(e) => setNewTx({ ...newTx, direction: e.target.value as 'in' | 'out' })} className="bg-zinc-800 border border-zinc-700 text-zinc-300 rounded px-3 py-2 text-sm">
              <option value="in">Income</option>
              <option value="out">Expense</option>
            </select>
            <input type="number" placeholder="Amount" step="0.01" value={newTx.amount} onChange={(e) => setNewTx({ ...newTx, amount: e.target.value })} className="bg-zinc-800 border border-zinc-700 text-zinc-300 rounded px-3 py-2 text-sm" />
            <select value={newTx.category} onChange={(e) => setNewTx({ ...newTx, category: e.target.value })} className="bg-zinc-800 border border-zinc-700 text-zinc-300 rounded px-3 py-2 text-sm">
              {CATEGORY_OPTIONS.map((c) => (
                <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>
              ))}
            </select>
            <input placeholder="Vendor (optional)" value={newTx.vendor} onChange={(e) => setNewTx({ ...newTx, vendor: e.target.value })} className="bg-zinc-800 border border-zinc-700 text-zinc-300 rounded px-3 py-2 text-sm" />
            <input placeholder="Memo (optional)" value={newTx.memo} onChange={(e) => setNewTx({ ...newTx, memo: e.target.value })} className="bg-zinc-800 border border-zinc-700 text-zinc-300 rounded px-3 py-2 text-sm" />
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={addTransaction} disabled={!newTx.account_id || !newTx.amount} className="px-4 py-2 text-sm bg-emerald-600 hover:bg-emerald-500 text-white rounded disabled:opacity-50">Add</button>
            <button onClick={() => setShowAddTx(false)} className="px-4 py-2 text-sm bg-zinc-700 text-zinc-300 rounded">Cancel</button>
          </div>
        </div>
      )}

      {/* Transactions table */}
      <div>
        <h3 className="text-sm font-semibold text-zinc-300 mb-2">Transactions</h3>
        <div className="border border-zinc-800 rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-500 text-left">
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Account</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium">Vendor</th>
                <th className="px-4 py-3 font-medium">Memo</th>
                <th className="px-4 py-3 font-medium text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {transactions.map((t) => (
                <tr key={t.id} className="hover:bg-zinc-800/50">
                  <td className="px-4 py-2 text-zinc-400 text-xs font-mono">{new Date(t.ts).toLocaleDateString()}</td>
                  <td className="px-4 py-2 text-zinc-300">{t.finance_accounts?.name || '—'}</td>
                  <td className="px-4 py-2 text-zinc-400 capitalize">{t.category}</td>
                  <td className="px-4 py-2 text-zinc-400">{t.vendor || '—'}</td>
                  <td className="px-4 py-2 text-zinc-500 truncate max-w-[200px]">{t.memo || '—'}</td>
                  <td className={`px-4 py-2 text-right font-mono ${t.direction === 'in' ? 'text-emerald-400' : 'text-red-400'}`}>
                    {t.direction === 'in' ? '+' : '-'}{formatCurrency(Number(t.amount))}
                  </td>
                </tr>
              ))}
              {transactions.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-zinc-500">{loading ? 'Loading...' : 'No transactions'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
