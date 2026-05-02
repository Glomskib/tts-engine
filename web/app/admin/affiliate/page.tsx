'use client';

/**
 * /admin/affiliate — TT Shop affiliate hub.
 *
 * Three tabs:
 *   1. Search        — discover open collaborations
 *   2. My Collabs    — list of joined / sample-requested
 *   3. Commissions   — earnings dashboard
 *
 * All endpoints return 503 with a friendly notice while FF is unapproved
 * for the TT Affiliate API. The UI surfaces the notice as an amber banner
 * but the page itself still renders.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Search, Package, DollarSign, ExternalLink } from 'lucide-react';

type Tab = 'search' | 'my' | 'commissions';

interface Collab {
  collaboration_id: string;
  product_id: string;
  product_title: string;
  product_image_url?: string;
  commission_rate: number;
  category_name?: string;
  status: string;
  sample_available: boolean;
}

interface CommissionStats {
  range_start: number;
  range_end: number;
  total_orders: number;
  total_gmv_cents: number;
  total_commission_cents: number;
  currency: string;
}

export default function AffiliateHubPage() {
  const [tab, setTab] = useState<Tab>('search');

  return (
    <div className="max-w-6xl mx-auto p-6">
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-zinc-100">Affiliate Hub</h1>
        <p className="text-sm text-zinc-400 mt-1">
          Discover TikTok Shop products, request samples, and track commissions —
          all in one place. The Helium 10 wedge for TT Shop creators.
        </p>
      </header>

      <nav className="flex gap-1 border-b border-white/5 mb-6">
        <TabButton active={tab === 'search'} onClick={() => setTab('search')} icon={<Search className="w-4 h-4" />}>
          Search
        </TabButton>
        <TabButton active={tab === 'my'} onClick={() => setTab('my')} icon={<Package className="w-4 h-4" />}>
          My Collabs
        </TabButton>
        <TabButton active={tab === 'commissions'} onClick={() => setTab('commissions')} icon={<DollarSign className="w-4 h-4" />}>
          Commissions
        </TabButton>
      </nav>

      {tab === 'search' && <SearchPane />}
      {tab === 'my' && <MyCollabsPane />}
      {tab === 'commissions' && <CommissionsPane />}
    </div>
  );
}

function TabButton({
  active, onClick, children, icon,
}: { active: boolean; onClick: () => void; children: React.ReactNode; icon: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
        active
          ? 'border-teal-500 text-teal-300'
          : 'border-transparent text-zinc-400 hover:text-zinc-200'
      }`}
    >
      {icon}{children}
    </button>
  );
}

function NotApprovedBanner({ notice }: { notice: string }) {
  return (
    <div className="mb-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-sm text-amber-200">
      <strong className="font-semibold">Pending approval — </strong>{notice}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Search
// ──────────────────────────────────────────────────────────────────────────

function SearchPane() {
  const [keyword, setKeyword] = useState('');
  const [category, setCategory] = useState('');
  const [commissionMin, setCommissionMin] = useState<number | ''>('');
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [results, setResults] = useState<Collab[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function runSearch() {
    setLoading(true); setError(null); setNotice(null); setResults([]);
    try {
      const res = await fetch('/api/affiliate/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keyword: keyword || undefined,
          category: category || undefined,
          commission_min: commissionMin === '' ? undefined : Number(commissionMin),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.notice) setNotice(data.notice);
        else setError(data.error || `HTTP ${res.status}`);
        return;
      }
      setResults((data.collaborations || []) as Collab[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'network error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      {notice && <NotApprovedBanner notice={notice} />}

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <input
          type="text"
          placeholder="Keyword (e.g. matcha)"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          className="flex-1 px-4 py-2 rounded-lg bg-zinc-900 border border-white/10 text-zinc-100 placeholder-zinc-500 focus:ring-2 focus:ring-teal-500"
        />
        <input
          type="text"
          placeholder="Category id"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="px-4 py-2 rounded-lg bg-zinc-900 border border-white/10 text-zinc-100 placeholder-zinc-500 w-full sm:w-40"
        />
        <input
          type="number"
          placeholder="Min commission %"
          value={commissionMin}
          onChange={(e) => setCommissionMin(e.target.value === '' ? '' : Number(e.target.value))}
          step="0.01"
          min="0" max="100"
          className="px-4 py-2 rounded-lg bg-zinc-900 border border-white/10 text-zinc-100 placeholder-zinc-500 w-full sm:w-44"
        />
        <button
          type="button"
          onClick={runSearch}
          disabled={loading}
          className="px-6 py-2 rounded-lg bg-teal-500 text-white font-medium hover:bg-teal-400 disabled:opacity-50"
        >
          {loading ? 'Searching…' : 'Search'}
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-red-300">
          {error}
        </div>
      )}

      {results.length === 0 && !loading && !notice && !error && (
        <p className="text-sm text-zinc-500 italic">
          No results yet — try a search above. Once FlashFlow is approved for the
          TT Shop affiliate API, results will populate live.
        </p>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {results.map((c) => (
          <Link
            key={c.collaboration_id || c.product_id}
            href={`/admin/affiliate/${c.product_id}`}
            className="block p-4 rounded-xl bg-zinc-900/60 border border-white/5 hover:border-teal-500/40 transition-colors"
          >
            {c.product_image_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={c.product_image_url} alt={c.product_title} className="w-full aspect-square object-cover rounded-lg mb-3" />
            )}
            <div className="font-medium text-zinc-100 line-clamp-2">{c.product_title}</div>
            <div className="flex items-center justify-between mt-2 text-xs text-zinc-400">
              <span>{(c.commission_rate * 100).toFixed(1)}% commission</span>
              {c.sample_available && (
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300">
                  Sample
                </span>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// My Collabs
// ──────────────────────────────────────────────────────────────────────────

interface MyCollabRow {
  id: string;
  product_id: string;
  product_title: string | null;
  status: string;
  sample_status: string;
  commission_rate: number | null;
  requested_at: string | null;
  accepted_at: string | null;
}

function MyCollabsPane() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<MyCollabRow[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch('/api/affiliate/my-collabs')
      .then(async (r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.notice) setNotice(data.notice);
        setRows((data.rows as MyCollabRow[]) || []);
      })
      .catch(() => { /* ignore */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return (
    <div>
      {notice && <NotApprovedBanner notice={notice} />}
      {loading && <p className="text-zinc-500 text-sm">Loading collabs…</p>}
      {!loading && rows.length === 0 && (
        <p className="text-zinc-500 italic text-sm">
          You haven&apos;t joined any affiliate collaborations yet. Use the Search tab
          to discover products you can promote.
        </p>
      )}
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.id} className="flex items-center justify-between p-3 rounded-lg bg-zinc-900/60 border border-white/5">
            <div>
              <div className="text-zinc-100 font-medium">{r.product_title || r.product_id}</div>
              <div className="text-xs text-zinc-500 mt-0.5">
                Status: <span className="text-zinc-300">{r.status}</span>
                {r.sample_status !== 'none' && (
                  <> · Sample: <span className="text-zinc-300">{r.sample_status}</span></>
                )}
                {r.commission_rate && (
                  <> · {(r.commission_rate * 100).toFixed(1)}% commission</>
                )}
              </div>
            </div>
            <Link href={`/admin/affiliate/${r.product_id}`} className="text-teal-400 text-xs hover:text-teal-300 inline-flex items-center gap-1">
              View <ExternalLink className="w-3 h-3" />
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Commissions
// ──────────────────────────────────────────────────────────────────────────

function CommissionsPane() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<CommissionStats | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [source, setSource] = useState<'live' | 'cache' | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch('/api/affiliate/commissions')
      .then(async (r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.notice) setNotice(data.notice);
        setStats(data.stats || null);
        setSource(data.source || null);
      })
      .catch(() => { /* ignore */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const fmt = (cents: number, currency = 'USD') =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);

  return (
    <div>
      {notice && <NotApprovedBanner notice={notice} />}
      {loading && <p className="text-zinc-500 text-sm">Loading…</p>}
      {!loading && stats && (
        <>
          {source === 'cache' && (
            <p className="text-xs text-zinc-500 mb-3">Showing cached data — connect a TT Shop account for live stats.</p>
          )}
          <div className="grid sm:grid-cols-3 gap-4">
            <StatCard label="Orders" value={String(stats.total_orders)} />
            <StatCard label="GMV" value={fmt(stats.total_gmv_cents, stats.currency)} />
            <StatCard label="Commission" value={fmt(stats.total_commission_cents, stats.currency)} highlight />
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`p-5 rounded-xl border ${highlight ? 'bg-teal-500/10 border-teal-500/30' : 'bg-zinc-900/60 border-white/5'}`}>
      <div className="text-xs uppercase tracking-wider text-zinc-500">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${highlight ? 'text-teal-300' : 'text-zinc-100'}`}>{value}</div>
    </div>
  );
}
