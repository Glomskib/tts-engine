'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import ClientNav from '../components/ClientNav';
import { EffectiveOrgBranding, getDefaultOrgBranding } from '@/lib/org-branding';

interface AuthUser {
  id: string;
  email: string | null;
}

interface BillingSummary {
  org_id: string;
  org_name: string;
  plan: string;
  billing_status: string;
  period_start: string;
  period_end: string;
  included_videos: number;
  posted_videos: number;
  base_fee_cents: number;
  overage_videos: number;
  overage_fee_cents: number;
  rollover_in_videos: number;
  rollover_out_videos: number;
  effective_included_videos: number;
  estimated_total_cents: number;
  notes: string[];
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function getMonthOptions(): { year: number; month: number; label: string }[] {
  const options: { year: number; month: number; label: string }[] = [];
  const now = new Date();

  for (let i = 0; i < 3; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    options.push({
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      label: d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    });
  }

  return options;
}

export default function ClientBillingPage() {
  const router = useRouter();
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [orgRequired, setOrgRequired] = useState(false);
  const [branding, setBranding] = useState<EffectiveOrgBranding | null>(null);

  const monthOptions = getMonthOptions();
  const [selectedPeriod, setSelectedPeriod] = useState(monthOptions[0]);

  // Fetch authenticated user
  useEffect(() => {
    const fetchAuthUser = async () => {
      try {
        const supabase = createBrowserSupabaseClient();
        const { data: { user }, error } = await supabase.auth.getUser();

        if (error || !user) {
          router.push('/login?redirect=/client/billing');
          return;
        }

        setAuthUser({
          id: user.id,
          email: user.email || null,
        });
      } catch (err) {
        console.error('Auth error:', err);
        router.push('/login?redirect=/client/billing');
      } finally {
        setAuthLoading(false);
      }
    };

    fetchAuthUser();
  }, [router]);

  // Fetch branding
  useEffect(() => {
    if (!authUser) return;

    const fetchBranding = async () => {
      try {
        const res = await fetch('/api/client/branding');
        const data = await res.json();

        if (res.ok && data.ok && data.data?.branding) {
          setBranding(data.data.branding);
        } else {
          setBranding(getDefaultOrgBranding());
        }
      } catch (err) {
        console.error('Failed to fetch branding:', err);
        setBranding(getDefaultOrgBranding());
      }
    };

    fetchBranding();
  }, [authUser]);

  // Fetch billing summary
  useEffect(() => {
    if (!authUser) return;

    const fetchSummary = async () => {
      setLoading(true);
      setError('');

      try {
        const res = await fetch(`/api/client/billing/summary?year=${selectedPeriod.year}&month=${selectedPeriod.month}`);
        const data = await res.json();

        if (res.status === 403 && data.error === 'client_org_required') {
          setOrgRequired(true);
        } else if (res.ok && data.ok) {
          setSummary(data.data);
          setOrgRequired(false);
        } else {
          setError(data.error || 'Failed to load billing summary');
        }
      } catch (err) {
        console.error('Failed to fetch billing summary:', err);
        setError('Network error');
      } finally {
        setLoading(false);
      }
    };

    fetchSummary();
  }, [authUser, selectedPeriod]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-slate-500">Checking access...</div>
      </div>
    );
  }

  if (!authUser) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-slate-500">Redirecting to login...</div>
      </div>
    );
  }

  // Get accent classes for styling
  const accentText = branding?.accent_text_class || 'text-slate-800';
  const accentBg = branding?.accent_bg_class || 'bg-slate-800';

  // Calculate usage percentage for the bar
  const usagePercent = summary
    ? Math.min(100, (summary.posted_videos / summary.effective_included_videos) * 100)
    : 0;
  const isOverage = summary ? summary.posted_videos > summary.effective_included_videos : false;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        <ClientNav userName={authUser.email || undefined} branding={branding} />

        {/* Header */}
        <div className="mb-6 flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className={`text-2xl font-semibold ${accentText}`}>Billing</h1>
            <p className="mt-1 text-sm text-slate-500">
              View your usage and estimated charges.
            </p>
          </div>

          {/* Month Selector */}
          <select
            value={`${selectedPeriod.year}-${selectedPeriod.month}`}
            onChange={(e) => {
              const [y, m] = e.target.value.split('-').map(Number);
              const opt = monthOptions.find((o) => o.year === y && o.month === m);
              if (opt) setSelectedPeriod(opt);
            }}
            className="px-3 py-2 border border-slate-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-400"
          >
            {monthOptions.map((opt) => (
              <option key={`${opt.year}-${opt.month}`} value={`${opt.year}-${opt.month}`}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Org Required State */}
        {orgRequired ? (
          <div className="bg-white rounded-lg border border-amber-200 shadow-sm p-8 text-center">
            <div className="text-amber-600 mb-2 text-lg font-medium">Portal Not Connected</div>
            <p className="text-slate-600 mb-4">
              Your portal is not yet connected to an organization.
            </p>
            <p className="text-sm text-slate-500">
              Please contact support to get started.
            </p>
          </div>
        ) : (
          <>
            {/* Error */}
            {error && (
              <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {error}
              </div>
            )}

            {/* Loading */}
            {loading ? (
              <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-8 text-center text-slate-500">
                Loading billing summary...
              </div>
            ) : summary ? (
              <div className="space-y-6">
                {/* Plan & Status Card */}
                <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-6">
                  <div className="flex items-center justify-between flex-wrap gap-4">
                    <div>
                      <div className="text-sm text-slate-500 mb-1">Current Plan</div>
                      <div className={`text-xl font-semibold ${accentText} capitalize`}>
                        {summary.plan}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-slate-500 mb-1">Billing Status</div>
                      <div className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium ${
                        summary.billing_status === 'active' ? 'bg-green-100 text-green-800' :
                        summary.billing_status === 'trial' ? 'bg-blue-100 text-blue-800' :
                        summary.billing_status === 'past_due' ? 'bg-red-100 text-red-800' :
                        'bg-slate-100 text-slate-800'
                      }`}>
                        {summary.billing_status.replace(/_/g, ' ')}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-slate-500 mb-1">Billing Period</div>
                      <div className="text-sm text-slate-700">
                        {summary.period_start} to {summary.period_end}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Usage Bar Card */}
                <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-6">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-sm font-medium text-slate-700">Video Usage</div>
                    <div className="text-sm text-slate-500">
                      {summary.posted_videos} / {summary.effective_included_videos} videos
                      {summary.rollover_in_videos > 0 && (
                        <span className="text-slate-400 ml-1">
                          (includes {summary.rollover_in_videos} rollover)
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="h-4 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        isOverage ? 'bg-red-500' : accentBg
                      }`}
                      style={{ width: `${usagePercent}%` }}
                    />
                  </div>

                  {isOverage && (
                    <div className="mt-2 text-sm text-red-600">
                      {summary.overage_videos} overage videos
                    </div>
                  )}

                  {summary.rollover_out_videos > 0 && (
                    <div className="mt-2 text-sm text-slate-500">
                      {summary.rollover_out_videos} unused videos will roll over to next month
                    </div>
                  )}
                </div>

                {/* Invoice Breakdown Card */}
                <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-6">
                  <div className="text-sm font-medium text-slate-700 mb-4">Estimated Invoice</div>

                  <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600">Base fee ({summary.included_videos} videos included)</span>
                      <span className="text-slate-800">{formatCents(summary.base_fee_cents)}</span>
                    </div>

                    {summary.overage_videos > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-600">Overage ({summary.overage_videos} videos)</span>
                        <span className="text-slate-800">{formatCents(summary.overage_fee_cents)}</span>
                      </div>
                    )}

                    <div className="border-t border-slate-200 pt-3 flex justify-between">
                      <span className="font-medium text-slate-700">Estimated Total</span>
                      <span className={`font-semibold text-lg ${accentText}`}>
                        {formatCents(summary.estimated_total_cents)}
                      </span>
                    </div>
                  </div>

                  {summary.notes.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-slate-100">
                      <div className="text-xs text-slate-500 space-y-1">
                        {summary.notes.map((note, i) => (
                          <div key={i}>{note}</div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
