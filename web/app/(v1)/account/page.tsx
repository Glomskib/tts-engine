'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Loader2, ExternalLink, LogOut, Gauge, CreditCard, Mail, Shield, ArrowRight,
} from 'lucide-react';
import { V1_LIMITS, type UsageSnapshot } from '@/lib/v1/usage-limits';
import { useAuth } from '@/contexts/AuthContext';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';

export default function AccountPage() {
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const [usage, setUsage] = useState<UsageSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    fetch('/api/clips/usage')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.usage) setUsage(d.usage); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      const supabase = createBrowserSupabaseClient();
      await supabase.auth.signOut();
      router.push('/login');
    } finally {
      setSigningOut(false);
    }
  }

  const limits = usage ? V1_LIMITS[usage.tier] : V1_LIMITS.free;
  const isFree = !loading && usage?.tier === 'free';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-[28px] font-semibold tracking-tight">Account</h1>
        <p className="text-zinc-400 mt-1 text-sm">Plan, usage, and access.</p>
      </div>

      {/* Profile */}
      <Card icon={Mail} title="Signed in as">
        <div className="text-zinc-100">{user?.email ?? '—'}</div>
      </Card>

      {/* Plan + usage */}
      <Card icon={Gauge} title="Plan & usage">
        {loading ? (
          <div className="flex items-center gap-2 text-zinc-500 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="flex items-center gap-2">
                  <div className="text-lg font-semibold">{limits.label}</div>
                  {isFree && (
                    <span className="text-[10px] uppercase tracking-wider rounded bg-white/5 border border-white/10 px-1.5 py-0.5 text-zinc-400">
                      current
                    </span>
                  )}
                </div>
                <div className="text-xs text-zinc-500 mt-0.5">
                  {limits.perDay != null && <>Up to {limits.perDay} clips/day · </>}
                  {limits.perMonth != null && <>{limits.perMonth} clips/month · </>}
                  Batches up to {limits.batchMax}
                </div>
              </div>
              <Link
                href="/pricing"
                className={`
                  inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold no-underline transition-colors
                  ${isFree
                    ? 'bg-gradient-to-b from-amber-300 to-amber-400 text-black hover:from-amber-200 hover:to-amber-300 shadow-lg shadow-amber-500/20'
                    : 'border border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10'}
                `}
              >
                {isFree ? <>Upgrade <ArrowRight className="w-3.5 h-3.5" /></> : 'Change plan'}
              </Link>
            </div>

            {usage && (
              <div className="grid grid-cols-2 gap-3 pt-3 border-t border-white/5">
                <Stat label="Today" value={usage.usedToday} cap={limits.perDay} />
                <Stat label="This month" value={usage.usedThisMonth} cap={limits.perMonth} />
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Billing */}
      <Card icon={CreditCard} title="Billing">
        <Link
          href="/admin/billing"
          className="inline-flex items-center gap-1.5 text-sm text-zinc-300 hover:text-white no-underline group"
        >
          Manage billing
          <ExternalLink className="w-3.5 h-3.5 opacity-60 group-hover:opacity-100" />
        </Link>
      </Card>

      {/* Advanced access — admins only */}
      {isAdmin && (
        <Card icon={Shield} title="Advanced">
          <p className="text-xs text-zinc-500 mb-3">The full admin surface is still available if you need it.</p>
          <Link
            href="/admin/today"
            className="inline-flex items-center gap-1.5 text-sm text-zinc-300 hover:text-white no-underline group"
          >
            Open advanced dashboard
            <ExternalLink className="w-3.5 h-3.5 opacity-60 group-hover:opacity-100" />
          </Link>
        </Card>
      )}

      {/* Sign out */}
      <div className="pt-2">
        <button
          type="button"
          onClick={handleSignOut}
          disabled={signingOut}
          className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-red-300 disabled:opacity-50"
        >
          {signingOut ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
          Sign out
        </button>
      </div>
    </div>
  );
}

function Card({
  icon: Icon, title, children,
}: {
  icon: typeof Gauge;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-gradient-to-b from-zinc-900/40 to-zinc-950/60 p-5">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-3.5 h-3.5 text-zinc-400" />
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Stat({ label, value, cap }: { label: string; value: number; cap: number | null }) {
  const pct = cap ? Math.min(100, Math.round((value / cap) * 100)) : 0;
  const tone =
    cap == null ? 'bg-zinc-600' : pct >= 90 ? 'bg-red-400' : pct >= 70 ? 'bg-amber-400' : 'bg-emerald-400';
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <div className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">{label}</div>
        <div className="text-sm text-zinc-200">
          {value}
          {cap ? <span className="text-zinc-500"> / {cap}</span> : <span className="text-zinc-500"> used</span>}
        </div>
      </div>
      <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
        {cap != null && <div className={`h-full ${tone} transition-all`} style={{ width: `${pct}%` }} />}
      </div>
    </div>
  );
}
