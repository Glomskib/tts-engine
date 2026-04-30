import Link from 'next/link';
import { Handshake, Mail, ExternalLink, AlertCircle } from 'lucide-react';
import type { MmmSponsorPipeline, MmmSponsorDeal } from '@/lib/command-center/mmm/types';
import { Card, StatusPill } from './Section';

function usd(cents: number): string {
  const dollars = cents / 100;
  if (Math.abs(dollars) >= 1000) return `$${(dollars / 1000).toFixed(1)}k`;
  return `$${dollars.toFixed(0)}`;
}

export function SponsorPanel({ data }: { data: MmmSponsorPipeline }) {
  if (!data.pipeline_id) {
    return (
      <Card>
        <div className="flex items-center gap-2 text-sm text-amber-400">
          <AlertCircle className="w-4 h-4" />
          MMM Sponsors pipeline not found in <code>crm_pipelines</code>. Run the canonical CRM
          migration to provision it (slug <code>mmm-sponsors</code>).
        </div>
      </Card>
    );
  }

  return (
    <div className="grid lg:grid-cols-3 gap-3">
      {/* Aggregate stats */}
      <Card className="lg:col-span-1">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Handshake className="w-4 h-4 text-zinc-300" />
            <span className="text-sm font-semibold text-zinc-100">Sponsor goal</span>
          </div>
          <Link
            href="/admin/command-center/crm"
            className="text-[11px] text-zinc-500 hover:text-zinc-300 inline-flex items-center gap-1"
          >
            Open CRM <ExternalLink className="w-3 h-3" />
          </Link>
        </div>
        <div className="space-y-2 mb-3">
          <Metric label="Goal" value={String(data.goal)} tone="zinc" />
          <Metric label="Committed" value={`${data.committed_count}/${data.goal}`} tone="emerald" />
          <Metric label="Paid" value={String(data.paid_count)} tone="blue" />
          <Metric label="Unpaid committed" value={String(data.unpaid_committed_count)} tone="amber" />
          <Metric label="Total committed" value={usd(data.total_committed_cents)} tone="violet" />
          <Metric label="Total paid" value={usd(data.total_paid_cents)} tone="emerald" />
        </div>
        <div className="text-[10px] text-zinc-600">
          Pipeline: {data.pipeline_name} · {data.deals.length} deal{data.deals.length === 1 ? '' : 's'}
        </div>
      </Card>

      {/* Next follow-ups */}
      <Card className="lg:col-span-1">
        <div className="text-sm font-semibold text-zinc-100 mb-2">Next follow-ups</div>
        {data.next_followups.length === 0 ? (
          <div className="text-xs text-zinc-500">
            Nothing waiting on follow-up. Either everyone&apos;s answered or nothing is in motion yet.
          </div>
        ) : (
          <div className="space-y-1.5">
            {data.next_followups.map((f) => (
              <div
                key={f.id}
                className="flex items-center justify-between text-xs border border-zinc-800 rounded px-2 py-1.5"
              >
                <span className="text-zinc-200 truncate">{f.title}</span>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <StatusPill label={f.stage_label} tone="amber" />
                  {f.due_in_days !== null && f.due_in_days !== undefined ? (
                    <span className="text-[10px] text-zinc-500">{f.due_in_days}d in stage</span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Recent activities */}
      <Card className="lg:col-span-1">
        <div className="text-sm font-semibold text-zinc-100 mb-2">Recent activity</div>
        {data.recent_activities.length === 0 ? (
          <div className="text-xs text-zinc-500">
            No activities yet. Stage moves and outreach notes will appear here.
          </div>
        ) : (
          <div className="space-y-1.5">
            {data.recent_activities.slice(0, 6).map((a) => (
              <div key={a.id} className="text-[11px] border border-zinc-800 rounded px-2 py-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-200 truncate">{a.subject || a.activity_type}</span>
                  <span className="text-[10px] text-zinc-500">
                    {new Date(a.ts).toLocaleDateString()}
                  </span>
                </div>
                {a.body ? (
                  <p className="text-zinc-500 line-clamp-2 mt-0.5">{a.body}</p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Stage list */}
      <div className="lg:col-span-3">
        <Card>
          <div className="text-sm font-semibold text-zinc-100 mb-3">Stages</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
            {data.stages.map((stage) => {
              const dealsHere = data.deals.filter(
                (d) => d.stage_key === stage.key && !d.declined,
              );
              return (
                <div
                  key={stage.key}
                  className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-2"
                >
                  <div
                    className="text-[10px] uppercase tracking-wider mb-1 truncate"
                    style={{ color: stage.color }}
                  >
                    {stage.label}
                  </div>
                  <div className="text-lg font-bold text-zinc-100">{dealsHere.length}</div>
                  {dealsHere.slice(0, 2).map((d) => (
                    <div key={d.id} className="text-[10px] text-zinc-500 truncate mt-1">
                      · {d.title}
                    </div>
                  ))}
                  {dealsHere.length > 2 ? (
                    <div className="text-[10px] text-zinc-600 mt-1">
                      +{dealsHere.length - 2} more
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* Deals list */}
      <div className="lg:col-span-3">
        <Card>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-zinc-100">Deals</span>
            <span className="text-[11px] text-zinc-500">{data.deals.length} total</span>
          </div>
          {data.deals.length === 0 ? (
            <div className="text-xs text-zinc-500">
              No sponsor deals yet. Add one through the CRM dashboard or the Bolt/Miles outreach
              flow when it&apos;s wired.
            </div>
          ) : (
            <div className="space-y-2">
              {data.deals.map((deal) => (
                <DealRow key={deal.id} deal={deal} />
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function DealRow({ deal }: { deal: MmmSponsorDeal }) {
  return (
    <div className="border border-zinc-800 rounded-lg p-2.5 bg-zinc-950/40">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Handshake className="w-3.5 h-3.5 text-zinc-300 flex-shrink-0" />
          <span className="text-xs font-semibold text-zinc-100 truncate">{deal.title}</span>
          {deal.is_demo ? <StatusPill label="demo" tone="zinc" /> : null}
          {deal.declined ? <StatusPill label="declined" tone="rose" /> : null}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span
            className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border"
            style={{ color: deal.stage_color, borderColor: `${deal.stage_color}55` }}
          >
            {deal.stage_label}
          </span>
          {deal.value_cents !== null ? (
            <span className="text-xs font-mono text-zinc-300">{usd(deal.value_cents)}</span>
          ) : null}
        </div>
      </div>
      <div className="flex items-center gap-2 text-[10px] text-zinc-500 mt-1">
        {deal.contact_name ? <span>{deal.contact_name}</span> : null}
        {deal.contact_email ? (
          <span className="inline-flex items-center gap-0.5">
            <Mail className="w-3 h-3" />
            {deal.contact_email}
          </span>
        ) : null}
        {deal.stage_entered_at ? (
          <span>· in stage since {new Date(deal.stage_entered_at).toLocaleDateString()}</span>
        ) : null}
      </div>
      {deal.notes ? <p className="text-[11px] text-zinc-400 mt-1.5 line-clamp-2">{deal.notes}</p> : null}
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'emerald' | 'rose' | 'amber' | 'blue' | 'violet' | 'zinc';
}) {
  const map: Record<typeof tone, string> = {
    emerald: 'text-emerald-400',
    rose: 'text-rose-400',
    amber: 'text-amber-400',
    blue: 'text-blue-400',
    violet: 'text-violet-400',
    zinc: 'text-zinc-300',
  };
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-zinc-500">{label}</span>
      <span className={`font-mono font-semibold ${map[tone]}`}>{value}</span>
    </div>
  );
}
