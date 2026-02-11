'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import AdminPageLayout, { AdminCard, AdminButton } from '../../components/AdminPageLayout';
import {
  Upload,
  Link as LinkIcon,
  Plus,
  Check,
  AlertTriangle,
  Loader2,
  Package,
  ExternalLink,
  Trash2,
} from 'lucide-react';
import { useToast } from '@/contexts/ToastContext';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ImportResultItem {
  url: string;
  status: 'created' | 'exists' | 'error';
  product?: {
    id: string;
    name: string;
    brand: string;
    category: string;
  };
  error?: string;
}

interface ImportResponse {
  ok: boolean;
  data: {
    results: ImportResultItem[];
    summary: {
      created: number;
      exists: number;
      errors: number;
    };
  };
  error?: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const CATEGORY_OPTIONS = [
  'Beauty',
  'Health & Wellness',
  'Fashion',
  'Home & Garden',
  'Electronics',
  'Food & Beverage',
  'Pet Supplies',
  'Baby & Kids',
  'Sports & Outdoors',
  'Accessories',
  'Other',
];

function parseUrls(raw: string): string[] {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/* ------------------------------------------------------------------ */
/*  Page Component                                                     */
/* ------------------------------------------------------------------ */

export default function ImportProductsPage() {
  const { showSuccess, showError } = useToast();

  // Form state
  const [urlText, setUrlText] = useState('');
  const [brand, setBrand] = useState('');
  const [category, setCategory] = useState('');

  // Import state
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<ImportResultItem[]>([]);
  const [summary, setSummary] = useState<{ created: number; exists: number; errors: number } | null>(null);

  // Update state for individual "exists" items
  const [updatingIds, setUpdatingIds] = useState<Set<string>>(new Set());

  const urls = parseUrls(urlText);
  const hasUrls = urls.length > 0;

  /* ---------------------------------------------------------------- */
  /*  Import handler                                                   */
  /* ---------------------------------------------------------------- */

  const handleImport = useCallback(async () => {
    if (!hasUrls) return;

    setImporting(true);
    setResults([]);
    setSummary(null);

    try {
      const res = await fetch('/api/products/import-urls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          urls,
          brand: brand || undefined,
          category: category || undefined,
        }),
      });

      const data: ImportResponse = await res.json();

      if (!res.ok || !data.ok) {
        showError(data.error || 'Import failed. Please check the URLs and try again.');
        return;
      }

      setResults(data.data.results);
      setSummary(data.data.summary);

      if (data.data.summary.created > 0) {
        showSuccess(`Successfully imported ${data.data.summary.created} product${data.data.summary.created > 1 ? 's' : ''}`);
      }
    } catch (err) {
      showError('Network error. Please check your connection and try again.');
    } finally {
      setImporting(false);
    }
  }, [hasUrls, urls, brand, category, showSuccess, showError]);

  /* ---------------------------------------------------------------- */
  /*  Update existing product handler                                  */
  /* ---------------------------------------------------------------- */

  const handleUpdate = useCallback(
    async (item: ImportResultItem) => {
      if (!item.product) return;

      setUpdatingIds((prev) => new Set(prev).add(item.product!.id));

      try {
        const res = await fetch('/api/products/import-urls', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            urls: [item.url],
            brand: brand || undefined,
            category: category || undefined,
            forceUpdate: true,
          }),
        });

        const data: ImportResponse = await res.json();

        if (!res.ok || !data.ok) {
          showError(data.error || 'Failed to update product.');
          return;
        }

        // Update the item in results
        setResults((prev) =>
          prev.map((r) =>
            r.url === item.url && data.data.results[0]
              ? { ...data.data.results[0], status: 'created' as const }
              : r
          )
        );

        // Update summary
        setSummary((prev) =>
          prev
            ? {
                created: prev.created + 1,
                exists: Math.max(0, prev.exists - 1),
                errors: prev.errors,
              }
            : prev
        );

        showSuccess(`Updated "${item.product.name}"`);
      } catch {
        showError('Network error while updating product.');
      } finally {
        setUpdatingIds((prev) => {
          const next = new Set(prev);
          next.delete(item.product!.id);
          return next;
        });
      }
    },
    [brand, category, showSuccess, showError]
  );

  /* ---------------------------------------------------------------- */
  /*  Remove URL from text area                                        */
  /* ---------------------------------------------------------------- */

  const removeUrl = useCallback(
    (urlToRemove: string) => {
      const remaining = urls.filter((u) => u !== urlToRemove);
      setUrlText(remaining.join('\n'));
    },
    [urls]
  );

  /* ---------------------------------------------------------------- */
  /*  Derived data                                                     */
  /* ---------------------------------------------------------------- */

  const createdProducts = results.filter((r) => r.status === 'created' && r.product);
  const createdIds = createdProducts.map((r) => r.product!.id);

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  return (
    <AdminPageLayout
      title="Import Products"
      subtitle="Import products from TikTok Shop URLs or paste product details"
      headerActions={
        <Link href="/admin/products">
          <AdminButton variant="secondary" size="sm">
            <Package size={16} className="mr-1.5" />
            All Products
          </AdminButton>
        </Link>
      }
    >
      {/* ---------------------------------------------------------- */}
      {/*  URL Input Section                                          */}
      {/* ---------------------------------------------------------- */}
      <AdminCard title="Paste Multiple URLs" subtitle="Add one TikTok Shop product URL per line">
        <div className="space-y-4">
          {/* URL textarea */}
          <div>
            <label htmlFor="urls" className="block text-sm font-medium text-zinc-300 mb-1.5">
              <LinkIcon size={14} className="inline mr-1.5 -mt-0.5" />
              Product URLs
            </label>
            <textarea
              id="urls"
              value={urlText}
              onChange={(e) => setUrlText(e.target.value)}
              placeholder={
                'https://www.tiktok.com/@shop/product/12345\nhttps://www.tiktok.com/@shop/product/67890\nhttps://shop.tiktok.com/view/product/12345'
              }
              rows={6}
              className="w-full rounded-lg border border-white/10 bg-zinc-800/60 px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 resize-y font-mono"
            />
            {hasUrls && (
              <p className="mt-1.5 text-xs text-zinc-500">
                {urls.length} URL{urls.length !== 1 ? 's' : ''} detected
              </p>
            )}
          </div>

          {/* Brand & Category row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="brand" className="block text-sm font-medium text-zinc-300 mb-1.5">
                Brand (optional)
              </label>
              <input
                id="brand"
                type="text"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="e.g. GlowUp Skincare"
                className="w-full rounded-lg border border-white/10 bg-zinc-800/60 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
              />
            </div>
            <div>
              <label htmlFor="category" className="block text-sm font-medium text-zinc-300 mb-1.5">
                Category (optional)
              </label>
              <select
                id="category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-zinc-800/60 px-4 py-2.5 text-sm text-zinc-100 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
              >
                <option value="">Select category...</option>
                {CATEGORY_OPTIONS.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* URL preview chips */}
          {hasUrls && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">URLs to import</p>
              <div className="flex flex-wrap gap-2">
                {urls.map((url, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1.5 rounded-full bg-zinc-800 border border-white/5 px-3 py-1 text-xs text-zinc-300 max-w-[320px]"
                  >
                    <LinkIcon size={12} className="shrink-0 text-zinc-500" />
                    <span className="truncate">{url}</span>
                    <button
                      type="button"
                      onClick={() => removeUrl(url)}
                      className="shrink-0 text-zinc-500 hover:text-red-400 transition-colors"
                      aria-label={`Remove ${url}`}
                    >
                      <Trash2 size={12} />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Import button */}
          <div className="flex items-center gap-3 pt-2">
            <AdminButton onClick={handleImport} disabled={!hasUrls || importing}>
              {importing ? (
                <>
                  <Loader2 size={16} className="mr-1.5 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <Upload size={16} className="mr-1.5" />
                  Import {hasUrls ? `${urls.length} Product${urls.length !== 1 ? 's' : ''}` : 'Products'}
                </>
              )}
            </AdminButton>
            {importing && (
              <span className="text-xs text-zinc-500">This may take a moment...</span>
            )}
          </div>
        </div>
      </AdminCard>

      {/* ---------------------------------------------------------- */}
      {/*  Summary Bar                                                */}
      {/* ---------------------------------------------------------- */}
      {summary && (
        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-white/10 bg-zinc-900/50 px-5 py-3">
          <span className="text-sm font-medium text-zinc-300">Import Results:</span>
          {summary.created > 0 && (
            <span className="inline-flex items-center gap-1.5 text-sm text-emerald-400">
              <Check size={14} />
              {summary.created} imported
            </span>
          )}
          {summary.exists > 0 && (
            <span className="inline-flex items-center gap-1.5 text-sm text-amber-400">
              <AlertTriangle size={14} />
              {summary.exists} already exist{summary.exists !== 1 ? '' : 's'}
            </span>
          )}
          {summary.errors > 0 && (
            <span className="inline-flex items-center gap-1.5 text-sm text-red-400">
              <AlertTriangle size={14} />
              {summary.errors} error{summary.errors !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      )}

      {/* ---------------------------------------------------------- */}
      {/*  Results List                                                */}
      {/* ---------------------------------------------------------- */}
      {results.length > 0 && (
        <AdminCard title="Import Details">
          <div className="divide-y divide-white/5">
            {results.map((item, idx) => (
              <div
                key={idx}
                className="flex flex-col sm:flex-row items-start sm:items-center gap-3 py-3 first:pt-0 last:pb-0"
              >
                {/* Status icon */}
                <div className="shrink-0">
                  {item.status === 'created' && (
                    <div className="w-7 h-7 rounded-full bg-emerald-500/15 flex items-center justify-center">
                      <Check size={14} className="text-emerald-400" />
                    </div>
                  )}
                  {item.status === 'exists' && (
                    <div className="w-7 h-7 rounded-full bg-amber-500/15 flex items-center justify-center">
                      <AlertTriangle size={14} className="text-amber-400" />
                    </div>
                  )}
                  {item.status === 'error' && (
                    <div className="w-7 h-7 rounded-full bg-red-500/15 flex items-center justify-center">
                      <AlertTriangle size={14} className="text-red-400" />
                    </div>
                  )}
                </div>

                {/* Product info */}
                <div className="flex-1 min-w-0">
                  {item.product ? (
                    <>
                      <p className="text-sm font-medium text-zinc-100 truncate">
                        {item.product.name}
                      </p>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        {item.product.brand && (
                          <span className="mr-2">{item.product.brand}</span>
                        )}
                        {item.product.category && (
                          <span className="text-zinc-600">{item.product.category}</span>
                        )}
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-zinc-400 truncate font-mono">{item.url}</p>
                  )}
                  {item.error && (
                    <p className="text-xs text-red-400 mt-0.5">{item.error}</p>
                  )}
                </div>

                {/* Status label + actions */}
                <div className="shrink-0 flex items-center gap-2">
                  {item.status === 'created' && (
                    <span className="text-xs font-medium text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full">
                      Imported
                    </span>
                  )}
                  {item.status === 'exists' && (
                    <>
                      <span className="text-xs font-medium text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-full">
                        Already Exists
                      </span>
                      <button
                        type="button"
                        onClick={() => handleUpdate(item)}
                        disabled={!!(item.product && updatingIds.has(item.product.id))}
                        className="inline-flex items-center gap-1 text-xs font-medium text-violet-400 hover:text-violet-300 bg-violet-500/10 hover:bg-violet-500/20 px-2.5 py-1 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {item.product && updatingIds.has(item.product.id) ? (
                          <>
                            <Loader2 size={12} className="animate-spin" />
                            Updating...
                          </>
                        ) : (
                          <>
                            <Plus size={12} />
                            Update
                          </>
                        )}
                      </button>
                    </>
                  )}
                  {item.status === 'error' && (
                    <span className="text-xs font-medium text-red-400 bg-red-500/10 px-2.5 py-1 rounded-full">
                      Failed
                    </span>
                  )}

                  {/* Link to product page */}
                  {item.product && (
                    <Link
                      href={`/admin/products`}
                      className="text-zinc-500 hover:text-zinc-300 transition-colors"
                      title="View product"
                    >
                      <ExternalLink size={14} />
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        </AdminCard>
      )}

      {/* ---------------------------------------------------------- */}
      {/*  Generate Scripts CTA                                        */}
      {/* ---------------------------------------------------------- */}
      {createdIds.length > 0 && (
        <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 px-5 py-4 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="flex-1">
            <p className="text-sm font-medium text-zinc-100">
              Ready to create content?
            </p>
            <p className="text-xs text-zinc-400 mt-0.5">
              Generate scripts for your {createdIds.length} newly imported product{createdIds.length !== 1 ? 's' : ''}.
            </p>
          </div>
          <Link
            href={`/admin/content-studio?products=${createdIds.join(',')}`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 text-white px-4 py-2 text-sm font-medium hover:bg-violet-700 transition-colors"
          >
            <Package size={16} />
            Generate {createdIds.length > 5 ? 5 : createdIds.length} Script{createdIds.length !== 1 ? 's' : ''} for These Products?
          </Link>
        </div>
      )}
    </AdminPageLayout>
  );
}
