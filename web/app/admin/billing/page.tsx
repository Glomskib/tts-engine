'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { EmptyState } from '../components/AdminPageLayout';

interface OrgInvoicePreview {
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

interface BillingData {
  year: number;
  month: number;
  period_label: string;
  orgs: OrgInvoicePreview[];
  totals: {
    org_count: number;
    total_posted_videos: number;
    total_overage_videos: number;
    total_base_fee_cents: number;
    total_overage_fee_cents: number;
    total_estimated_cents: number;
  };
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function getMonthOptions(): { year: number; month: number; label: string }[] {
  const options: { year: number; month: number; label: string }[] = [];
  const now = new Date();

  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    options.push({
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      label: d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    });
  }

  return options;
}

export default function AdminBillingPage() {
  const router = useRouter();
  const [authLoading, setAuthLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState<BillingData | null>(null);
  const [exporting, setExporting] = useState(false);

  const monthOptions = getMonthOptions();
  const [selectedPeriod, setSelectedPeriod] = useState(monthOptions[0]);

  // Fetch authenticated user and check admin status
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const supabase = createBrowserSupabaseClient();
        const { data: { user }, error } = await supabase.auth.getUser();

        if (error || !user) {
          router.push('/login?redirect=/admin/billing');
          return;
        }

        // Check if admin
        const roleRes = await fetch('/api/auth/me');
        const roleData = await roleRes.json();

        if (roleData.role !== 'admin') {
          router.push('/admin/pipeline');
          return;
        }

        setIsAdmin(true);
      } catch (err) {
        console.error('Auth error:', err);
        router.push('/login?redirect=/admin/billing');
      } finally {
        setAuthLoading(false);
      }
    };

    checkAuth();
  }, [router]);

  // Fetch billing data
  const fetchData = async (year: number, month: number) => {
    setLoading(true);
    setError('');

    try {
      const res = await fetch(`/api/admin/billing/orgs?year=${year}&month=${month}`);
      const result = await res.json();

      if (result.ok) {
        setData(result.data);
      } else {
        setError(result.error || 'Failed to load billing data');
      }
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      fetchData(selectedPeriod.year, selectedPeriod.month);
    }
  }, [isAdmin, selectedPeriod]);

  // Export CSV
  const exportCsv = async () => {
    setExporting(true);
    try {
      const res = await fetch(
        `/api/admin/billing/export?year=${selectedPeriod.year}&month=${selectedPeriod.month}&type=csv`
      );
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const monthStr = selectedPeriod.month.toString().padStart(2, '0');
        a.download = `billing-${selectedPeriod.year}-${monthStr}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } else {
        alert('Export failed');
      }
    } catch {
      alert('Export error');
    } finally {
      setExporting(false);
    }
  };

  if (authLoading) {
    return <div style={{ padding: '20px' }}>Checking access...</div>;
  }

  if (!isAdmin) {
    return <div style={{ padding: '20px' }}>Redirecting...</div>;
  }

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }} className="pb-24 lg:pb-6">

      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '20px',
        flexWrap: 'wrap',
        gap: '10px',
      }}>
        <h1 style={{ margin: 0 }}>Billing</h1>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {/* Month Selector */}
          <select
            value={`${selectedPeriod.year}-${selectedPeriod.month}`}
            onChange={(e) => {
              const [y, m] = e.target.value.split('-').map(Number);
              const opt = monthOptions.find((o) => o.year === y && o.month === m);
              if (opt) setSelectedPeriod(opt);
            }}
            style={{
              padding: '8px 12px',
              borderRadius: '4px',
              border: '1px solid #dee2e6',
              fontSize: '14px',
            }}
          >
            {monthOptions.map((opt) => (
              <option key={`${opt.year}-${opt.month}`} value={`${opt.year}-${opt.month}`}>
                {opt.label}
              </option>
            ))}
          </select>

          {/* Export Button */}
          <button type="button"
            onClick={exportCsv}
            disabled={exporting || loading}
            style={{
              padding: '8px 16px',
              backgroundColor: exporting ? '#adb5bd' : '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: exporting ? 'not-allowed' : 'pointer',
              fontSize: '13px',
            }}
          >
            {exporting ? 'Exporting...' : 'Export CSV'}
          </button>
        </div>
      </div>

      {/* Loading/Error */}
      {loading && (
        <div style={{ padding: '40px', textAlign: 'center', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
          Loading billing data...
        </div>
      )}

      {error && (
        <div style={{
          padding: '20px',
          backgroundColor: '#f8d7da',
          borderRadius: '4px',
          color: '#721c24',
          marginBottom: '20px',
        }}>
          {error}
        </div>
      )}

      {!loading && !error && data && (
        <>
          {/* Summary Cards */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '15px',
            marginBottom: '20px',
          }}>
            {[
              { label: 'Organizations', value: data.totals.org_count, color: '#495057' },
              { label: 'Total Videos', value: data.totals.total_posted_videos, color: '#1971c2' },
              { label: 'Overage Videos', value: data.totals.total_overage_videos, color: '#e67700' },
              { label: 'Total Revenue', value: formatCents(data.totals.total_estimated_cents), color: '#2b8a3e' },
            ].map((item) => (
              <div
                key={item.label}
                style={{
                  padding: '15px',
                  backgroundColor: '#f8f9fa',
                  borderRadius: '8px',
                  border: '1px solid #dee2e6',
                  textAlign: 'center',
                }}
              >
                <div style={{
                  fontSize: typeof item.value === 'number' ? '28px' : '24px',
                  fontWeight: 'bold',
                  color: item.color,
                }}>
                  {item.value}
                </div>
                <div style={{ fontSize: '13px', color: '#6c757d' }}>{item.label}</div>
              </div>
            ))}
          </div>

          {/* Orgs Table */}
          <div style={{
            border: '1px solid #dee2e6',
            borderRadius: '8px',
            overflow: 'hidden',
          }}>
            <div style={{
              padding: '12px 16px',
              backgroundColor: '#f8f9fa',
              borderBottom: '1px solid #dee2e6',
              fontWeight: 'bold',
            }}>
              Organization Billing - {data.period_label}
            </div>

            {data.orgs.length === 0 ? (
              <EmptyState
                title="No organizations"
                description="No organizations found for this billing period."
              />
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '900px' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f8f9fa' }}>
                      <th style={{ padding: '10px 16px', textAlign: 'left', borderBottom: '1px solid #dee2e6' }}>Organization</th>
                      <th style={{ padding: '10px 16px', textAlign: 'left', borderBottom: '1px solid #dee2e6' }}>Plan</th>
                      <th style={{ padding: '10px 16px', textAlign: 'left', borderBottom: '1px solid #dee2e6' }}>Status</th>
                      <th style={{ padding: '10px 16px', textAlign: 'right', borderBottom: '1px solid #dee2e6' }}>Included</th>
                      <th style={{ padding: '10px 16px', textAlign: 'right', borderBottom: '1px solid #dee2e6' }}>Posted</th>
                      <th style={{ padding: '10px 16px', textAlign: 'right', borderBottom: '1px solid #dee2e6' }}>Overage</th>
                      <th style={{ padding: '10px 16px', textAlign: 'right', borderBottom: '1px solid #dee2e6' }}>Base Fee</th>
                      <th style={{ padding: '10px 16px', textAlign: 'right', borderBottom: '1px solid #dee2e6' }}>Overage Fee</th>
                      <th style={{ padding: '10px 16px', textAlign: 'right', borderBottom: '1px solid #dee2e6' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.orgs.map((org) => (
                      <tr key={org.org_id} style={{ borderBottom: '1px solid #dee2e6' }}>
                        <td style={{ padding: '10px 16px' }}>
                          <div style={{ fontWeight: 'bold', fontSize: '13px' }}>{org.org_name}</div>
                          <div style={{ fontSize: '11px', color: '#adb5bd', fontFamily: 'monospace' }}>
                            {org.org_id.slice(0, 8)}...
                          </div>
                        </td>
                        <td style={{ padding: '10px 16px' }}>
                          <span style={{
                            padding: '3px 8px',
                            backgroundColor: org.plan === 'enterprise' ? '#f3d9fa' :
                              org.plan === 'pro' ? '#d3f9d8' : '#e9ecef',
                            color: org.plan === 'enterprise' ? '#862e9c' :
                              org.plan === 'pro' ? '#2b8a3e' : '#495057',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 'bold',
                            textTransform: 'capitalize',
                          }}>
                            {org.plan}
                          </span>
                        </td>
                        <td style={{ padding: '10px 16px' }}>
                          <span style={{
                            padding: '3px 8px',
                            backgroundColor: org.billing_status === 'active' ? '#d3f9d8' :
                              org.billing_status === 'trial' ? '#e7f5ff' :
                              org.billing_status === 'past_due' ? '#f8d7da' : '#e9ecef',
                            color: org.billing_status === 'active' ? '#2b8a3e' :
                              org.billing_status === 'trial' ? '#1971c2' :
                              org.billing_status === 'past_due' ? '#c92a2a' : '#495057',
                            borderRadius: '4px',
                            fontSize: '11px',
                            textTransform: 'capitalize',
                          }}>
                            {org.billing_status.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td style={{ padding: '10px 16px', textAlign: 'right', fontSize: '13px' }}>
                          {org.effective_included_videos}
                          {org.rollover_in_videos > 0 && (
                            <span style={{ color: '#adb5bd', fontSize: '11px' }}>
                              {' '}(+{org.rollover_in_videos})
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '10px 16px', textAlign: 'right', fontSize: '13px', fontWeight: 'bold' }}>
                          {org.posted_videos}
                        </td>
                        <td style={{
                          padding: '10px 16px',
                          textAlign: 'right',
                          fontSize: '13px',
                          color: org.overage_videos > 0 ? '#e67700' : '#adb5bd',
                        }}>
                          {org.overage_videos || '-'}
                        </td>
                        <td style={{ padding: '10px 16px', textAlign: 'right', fontSize: '13px', fontFamily: 'monospace' }}>
                          {formatCents(org.base_fee_cents)}
                        </td>
                        <td style={{
                          padding: '10px 16px',
                          textAlign: 'right',
                          fontSize: '13px',
                          fontFamily: 'monospace',
                          color: org.overage_fee_cents > 0 ? '#e67700' : '#adb5bd',
                        }}>
                          {org.overage_fee_cents > 0 ? formatCents(org.overage_fee_cents) : '-'}
                        </td>
                        <td style={{ padding: '10px 16px', textAlign: 'right', fontSize: '14px', fontWeight: 'bold', fontFamily: 'monospace' }}>
                          {formatCents(org.estimated_total_cents)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ backgroundColor: '#f8f9fa', fontWeight: 'bold' }}>
                      <td colSpan={4} style={{ padding: '10px 16px', textAlign: 'right' }}>Totals:</td>
                      <td style={{ padding: '10px 16px', textAlign: 'right' }}>{data.totals.total_posted_videos}</td>
                      <td style={{ padding: '10px 16px', textAlign: 'right', color: '#e67700' }}>
                        {data.totals.total_overage_videos || '-'}
                      </td>
                      <td style={{ padding: '10px 16px', textAlign: 'right', fontFamily: 'monospace' }}>
                        {formatCents(data.totals.total_base_fee_cents)}
                      </td>
                      <td style={{ padding: '10px 16px', textAlign: 'right', fontFamily: 'monospace', color: '#e67700' }}>
                        {data.totals.total_overage_fee_cents > 0 ? formatCents(data.totals.total_overage_fee_cents) : '-'}
                      </td>
                      <td style={{ padding: '10px 16px', textAlign: 'right', fontFamily: 'monospace', fontSize: '16px', color: '#2b8a3e' }}>
                        {formatCents(data.totals.total_estimated_cents)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
