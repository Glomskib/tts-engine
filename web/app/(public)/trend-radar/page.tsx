import { Metadata } from 'next';
import Link from 'next/link';
import { TrendingUp, ExternalLink, Sparkles, RefreshCw } from 'lucide-react';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const metadata: Metadata = {
  title: 'Trend Radar — FlashFlow',
  description: 'The latest viral products and hooks, captured daily.',
};

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface TrendRow {
  id: string;
  rank: number;
  product_name: string | null;
  category: string | null;
  hook_text: string | null;
  source_url: string | null;
  views: string | null;
  gmv_velocity: string | null;
  screenshot_urls: string[] | null;
  run_date: string;
}

async function getLatestTrending(): Promise<{ items: TrendRow[]; runDate: string | null; ageDays: number | null }> {
  const { data: latest } = await supabaseAdmin
    .from('ff_trending_items')
    .select('run_date')
    .eq('source', 'daily_virals')
    .order('run_date', { ascending: false })
    .limit(1);

  const runDate: string | null = latest?.[0]?.run_date ?? null;
  if (!runDate) return { items: [], runDate: null, ageDays: null };

  const { data } = await supabaseAdmin
    .from('ff_trending_items')
    .select('id, rank, product_name, category, hook_text, source_url, views, gmv_velocity, screenshot_urls, run_date')
    .eq('source', 'daily_virals')
    .eq('run_date', runDate)
    .order('rank', { ascending: true })
    .limit(20);

  const ageMs = Date.now() - new Date(runDate).getTime();
  const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));

  return { items: (data ?? []) as TrendRow[], runDate, ageDays };
}

export default async function TrendRadarPage() {
  const { items, runDate, ageDays } = await getLatestTrending();
  const isStale = ageDays !== null && ageDays > 2;

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="max-w-6xl mx-auto px-6 py-12">
        <header className="mb-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-600 to-teal-600 flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold">Trend Radar</h1>
              <p className="text-zinc-400 text-sm">The viral products creators are making right now.</p>
            </div>
          </div>

          {runDate && (
            <div className={`inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-full ${
              isStale ? 'bg-amber-500/10 text-amber-300 border border-amber-500/30' : 'bg-teal-500/10 text-teal-300 border border-teal-500/30'
            }`}>
              <RefreshCw className="w-3 h-3" />
              <span>
                Last capture: {runDate}
                {ageDays !== null && ageDays > 0 && ` (${ageDays}d ago)`}
                {isStale && ' — refresh pending'}
              </span>
            </div>
          )}
        </header>

        {items.length === 0 ? (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-12 text-center">
            <p className="text-zinc-400">No trending data available yet. Check back soon.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10">
              {items.map((item) => {
                const thumb = item.screenshot_urls?.[0];
                return (
                  <div
                    key={item.id}
                    className="group relative rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 hover:border-zinc-700 hover:bg-zinc-900/60 transition-all"
                  >
                    <div className="flex items-start gap-4">
                      <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-gradient-to-br from-violet-600/20 to-teal-600/20 border border-violet-500/30 flex items-center justify-center font-bold text-violet-300">
                        {item.rank}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <h3 className="font-semibold truncate">{item.product_name || 'Untitled'}</h3>
                          {item.category && (
                            <span className="text-[10px] uppercase tracking-wide text-zinc-500 border border-zinc-800 px-1.5 py-0.5 rounded">
                              {item.category}
                            </span>
                          )}
                        </div>
                        {item.hook_text && (
                          <p className="text-sm text-zinc-300 mb-2 line-clamp-2">{item.hook_text}</p>
                        )}
                        <div className="flex items-center gap-3 text-xs text-zinc-500">
                          {item.views && <span>{item.views} views</span>}
                          {item.gmv_velocity && <span>GMV {item.gmv_velocity}</span>}
                        </div>
                        <div className="mt-3 flex items-center gap-2">
                          <Link
                            href={`/script-generator?topic=${encodeURIComponent(item.product_name || '')}`}
                            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-violet-600/20 text-violet-300 border border-violet-500/30 hover:bg-violet-600/30 transition-colors"
                          >
                            <Sparkles className="w-3 h-3" />
                            Generate script
                          </Link>
                          {item.source_url && item.source_url.startsWith('http') && !item.source_url.includes('example.com') && (
                            <a
                              href={item.source_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300"
                            >
                              Source <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                      </div>
                      {thumb && (
                        <img
                          src={thumb}
                          alt=""
                          className="flex-shrink-0 w-16 h-16 rounded-lg object-cover border border-zinc-800"
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="rounded-2xl border border-zinc-800 bg-gradient-to-br from-violet-900/20 to-teal-900/20 p-8 text-center">
              <h2 className="text-xl font-bold mb-2">Turn a trend into a post</h2>
              <p className="text-zinc-400 text-sm mb-5">
                Pick a product above, or bring your own and let FlashFlow write the hook + script.
              </p>
              <Link
                href="/script-generator"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-teal-600 hover:from-violet-500 hover:to-teal-500 text-white font-semibold transition-all"
              >
                <Sparkles className="w-4 h-4" />
                Open script generator
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
