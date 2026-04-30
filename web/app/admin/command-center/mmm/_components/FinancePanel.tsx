import { TrendingUp, TrendingDown, DollarSign } from 'lucide-react';
import type { MmmFinancialSummary } from '@/lib/command-center/mmm/types';
import { Card, StatusPill, DemoBadge } from './Section';

function usd(cents: number): string {
  const dollars = cents / 100;
  const sign = dollars < 0 ? '-' : '';
  const abs = Math.abs(dollars);
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(1)}k`;
  return `${sign}$${abs.toFixed(0)}`;
}

const CATEGORY_TONE: Record<string, 'emerald' | 'rose' | 'blue' | 'violet' | 'amber'> = {
  revenue: 'emerald',
  sponsorship: 'violet',
  donation: 'blue',
  expense: 'rose',
  projected: 'amber',
};

export function FinancePanel({ summaries }: { summaries: MmmFinancialSummary[] }) {
  return (
    <div className="grid lg:grid-cols-2 gap-4">
      {summaries.map((s) => (
        <FinanceCard key={s.event_slug} summary={s} />
      ))}
    </div>
  );
}

function FinanceCard({ summary }: { summary: MmmFinancialSummary }) {
  const { totals, lines, outstanding_targets, is_demo } = summary;
  const netPositive = totals.net_cents >= 0;
  const totalIn =
    totals.revenue_cents + totals.sponsorship_cents + totals.donations_cents;

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-zinc-300" />
          <span className="text-sm font-semibold text-zinc-100 capitalize">
            {summary.event_slug.replace('-', ' · ')}
          </span>
          <span className="text-[11px] text-zinc-500">{summary.display_date}</span>
        </div>
        {is_demo ? <DemoBadge /> : <StatusPill label="Live" tone="emerald" />}
      </div>

      <div className="grid grid-cols-3 gap-2 mb-2">
        <Metric label="Total in" value={usd(totalIn)} icon={TrendingUp} tone="emerald" />
        <Metric label="Total out" value={usd(totals.expense_cents)} icon={TrendingDown} tone="rose" />
        <Metric
          label="Net"
          value={usd(totals.net_cents)}
          icon={DollarSign}
          tone={netPositive ? 'emerald' : 'rose'}
          emphasize
        />
      </div>

      <div className="text-[10px] text-zinc-500 mb-3 flex flex-wrap gap-x-3 gap-y-1">
        <span>
          Registrations <span className="text-zinc-300 font-mono">{usd(totals.revenue_cents)}</span>
        </span>
        <span>
          Sponsorship <span className="text-zinc-300 font-mono">{usd(totals.sponsorship_cents)}</span>
        </span>
        <span>
          Donations <span className="text-zinc-300 font-mono">{usd(totals.donations_cents)}</span>
        </span>
      </div>

      <div className="space-y-1.5 mb-3">
        {lines.map((l, idx) => (
          <div
            key={idx}
            className="flex items-center justify-between text-[11px] border border-zinc-800 rounded px-2 py-1"
          >
            <div className="flex items-center gap-2 truncate">
              <StatusPill label={l.category} tone={CATEGORY_TONE[l.category]} />
              <span className="text-zinc-300 truncate">{l.label}</span>
            </div>
            <span className="text-zinc-100 font-mono">{usd(l.amount_cents)}</span>
          </div>
        ))}
      </div>

      {outstanding_targets.length > 0 ? (
        <div className="border-t border-zinc-800 pt-2">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1.5">
            Outstanding targets
          </div>
          {outstanding_targets.map((t, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between text-[11px] text-zinc-400 mb-1"
            >
              <span>{t.label}</span>
              <span className="text-amber-400 font-mono">{usd(t.remaining_cents)}</span>
            </div>
          ))}
        </div>
      ) : null}
    </Card>
  );
}

function Metric({
  label,
  value,
  icon: Icon,
  tone,
  emphasize,
}: {
  label: string;
  value: string;
  icon: typeof DollarSign;
  tone: 'emerald' | 'rose' | 'amber' | 'blue' | 'violet';
  emphasize?: boolean;
}) {
  const map: Record<typeof tone, { text: string; bg: string; border: string }> = {
    emerald: { text: 'text-emerald-400', bg: 'bg-emerald-500/[0.05]', border: 'border-emerald-500/20' },
    rose: { text: 'text-rose-400', bg: 'bg-rose-500/[0.05]', border: 'border-rose-500/20' },
    amber: { text: 'text-amber-400', bg: 'bg-amber-500/[0.05]', border: 'border-amber-500/20' },
    blue: { text: 'text-blue-400', bg: 'bg-blue-500/[0.05]', border: 'border-blue-500/20' },
    violet: { text: 'text-violet-400', bg: 'bg-violet-500/[0.05]', border: 'border-violet-500/20' },
  };
  const c = map[tone];
  return (
    <div className={`rounded-lg border ${c.border} ${c.bg} p-2`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] uppercase tracking-wider text-zinc-500">{label}</span>
        <Icon className={`w-3 h-3 ${c.text}`} />
      </div>
      <div className={`${emphasize ? 'text-lg' : 'text-sm'} font-bold ${c.text}`}>{value}</div>
    </div>
  );
}
