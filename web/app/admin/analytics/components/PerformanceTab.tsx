'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { TrendingUp, DollarSign, Users, Eye, Zap, BarChart3 } from 'lucide-react';

/* eslint-disable @typescript-eslint/no-explicit-any */

interface PerformanceTabProps {
  days: number;
}

const COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#a855f7', '#06b6d4', '#ec4899', '#84cc16'];

const cardStyle: React.CSSProperties = {
  backgroundColor: '#18181b',
  border: '1px solid #27272a',
  borderRadius: '8px',
  overflow: 'hidden',
};

const headerStyle: React.CSSProperties = {
  padding: '12px 16px',
  borderBottom: '1px solid #27272a',
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  fontSize: '14px',
  fontWeight: 600,
  color: '#e4e4e7',
};

function formatK(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

export default function PerformanceTab({ days }: PerformanceTabProps) {
  const [throughput, setThroughput] = useState<any>(null);
  const [topContent, setTopContent] = useState<any>(null);
  const [revenue, setRevenue] = useState<any>(null);
  const [hooks, setHooks] = useState<any>(null);
  const [vaPerf, setVaPerf] = useState<any>(null);
  const [accounts, setAccounts] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const types = ['throughput', 'top-content', 'revenue', 'hooks', 'va-performance', 'accounts'];
      const results = await Promise.all(
        types.map(t => fetch(`/api/analytics?type=${t}&days=${days}`, { credentials: 'include' }).then(r => r.json()))
      );
      const [tp, tc, rv, hk, va, ac] = results;
      if (tp.ok) setThroughput(tp.data);
      if (tc.ok) setTopContent(tc.data);
      if (rv.ok) setRevenue(rv.data);
      if (hk.ok) setHooks(hk.data);
      if (va.ok) setVaPerf(va.data);
      if (ac.ok) setAccounts(ac.data);
    } catch (err) {
      console.error('Failed to load performance data:', err);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#a1a1aa' }}>
        Loading performance data...
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Content Throughput */}
      {throughput && (
        <div style={cardStyle}>
          <div style={headerStyle}>
            <BarChart3 size={16} style={{ color: '#3b82f6' }} />
            Content Throughput — Videos per Status per Day
          </div>
          <div style={{ padding: '16px' }}>
            {throughput.throughput.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#71717a', fontSize: '13px' }}>
                No throughput data for this period.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={throughput.throughput}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#71717a' }} tickFormatter={d => d.slice(5)} />
                  <YAxis tick={{ fontSize: 11, fill: '#71717a' }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '6px', fontSize: '12px' }}
                    labelStyle={{ color: '#a1a1aa' }}
                  />
                  <Line type="monotone" dataKey="SCRIPTED" stroke="#3b82f6" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="ASSIGNED" stroke="#f59e0b" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="EDITING" stroke="#a855f7" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="POSTED" stroke="#22c55e" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="RECORDED" stroke="#06b6d4" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
            <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', marginTop: '8px', flexWrap: 'wrap' }}>
              {[
                { key: 'SCRIPTED', color: '#3b82f6' },
                { key: 'ASSIGNED', color: '#f59e0b' },
                { key: 'EDITING', color: '#a855f7' },
                { key: 'POSTED', color: '#22c55e' },
                { key: 'RECORDED', color: '#06b6d4' },
              ].map(l => (
                <div key={l.key} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#a1a1aa' }}>
                  <div style={{ width: 10, height: 3, backgroundColor: l.color, borderRadius: 2 }} />
                  {l.key}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Revenue by Brand + Hook Performance row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        {/* Revenue by Brand */}
        {revenue && (
          <div style={cardStyle}>
            <div style={headerStyle}>
              <DollarSign size={16} style={{ color: '#22c55e' }} />
              Revenue by Brand
            </div>
            <div style={{ padding: '16px' }}>
              {revenue.revenue.length === 0 ? (
                <div style={{ padding: '20px', textAlign: 'center', color: '#71717a', fontSize: '13px' }}>
                  No revenue data yet.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={revenue.revenue.slice(0, 8)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                    <XAxis type="number" tick={{ fontSize: 11, fill: '#71717a' }} tickFormatter={v => `$${formatK(v)}`} />
                    <YAxis dataKey="brand" type="category" tick={{ fontSize: 11, fill: '#a1a1aa' }} width={100} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '6px', fontSize: '12px' }}
                      formatter={(value: any) => [`$${Number(value).toLocaleString()}`, 'Revenue']}
                    />
                    <Bar dataKey="revenue" radius={[0, 4, 4, 0]}>
                      {revenue.revenue.slice(0, 8).map((_: any, i: number) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        )}

        {/* Hook Performance */}
        {hooks && (
          <div style={cardStyle}>
            <div style={headerStyle}>
              <Zap size={16} style={{ color: '#f59e0b' }} />
              Hook Type Performance
            </div>
            <div style={{ padding: '16px' }}>
              {hooks.hooks.length === 0 ? (
                <div style={{ padding: '20px', textAlign: 'center', color: '#71717a', fontSize: '13px' }}>
                  No hook performance data yet. Add winners with hook types.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={hooks.hooks.slice(0, 8)}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                    <XAxis dataKey="hook_type" tick={{ fontSize: 10, fill: '#71717a' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#71717a' }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '6px', fontSize: '12px' }}
                    />
                    <Bar dataKey="avg_views" name="Avg Views" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Top Performing Content */}
      {topContent && (
        <div style={cardStyle}>
          <div style={headerStyle}>
            <Eye size={16} style={{ color: '#a855f7' }} />
            Top Performing Content
          </div>
          <div style={{ overflowX: 'auto' }}>
            {topContent.top_content.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#71717a', fontSize: '13px' }}>
                No performance data yet. Post videos and sync TikTok stats.
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #27272a' }}>
                    <th style={{ padding: '10px 16px', textAlign: 'left', color: '#71717a', fontWeight: 500 }}>#</th>
                    <th style={{ padding: '10px 16px', textAlign: 'left', color: '#71717a', fontWeight: 500 }}>Title</th>
                    <th style={{ padding: '10px 16px', textAlign: 'left', color: '#71717a', fontWeight: 500 }}>Brand</th>
                    <th style={{ padding: '10px 16px', textAlign: 'right', color: '#71717a', fontWeight: 500 }}>Views</th>
                    <th style={{ padding: '10px 16px', textAlign: 'right', color: '#71717a', fontWeight: 500 }}>Likes</th>
                    <th style={{ padding: '10px 16px', textAlign: 'right', color: '#71717a', fontWeight: 500 }}>Comments</th>
                    <th style={{ padding: '10px 16px', textAlign: 'right', color: '#71717a', fontWeight: 500 }}>Engagement</th>
                  </tr>
                </thead>
                <tbody>
                  {topContent.top_content.slice(0, 10).map((v: any, i: number) => (
                    <tr key={v.id} style={{ borderBottom: '1px solid #27272a' }}>
                      <td style={{ padding: '10px 16px', color: '#71717a' }}>{i + 1}</td>
                      <td style={{ padding: '10px 16px', color: '#e4e4e7', maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {v.tiktok_url ? (
                          <a href={v.tiktok_url} target="_blank" rel="noopener noreferrer" style={{ color: '#60a5fa', textDecoration: 'none' }}>
                            {v.title || v.id.slice(0, 8)}
                          </a>
                        ) : (
                          v.title || v.id.slice(0, 8)
                        )}
                      </td>
                      <td style={{ padding: '10px 16px', color: '#a1a1aa' }}>{v.product_brand || '-'}</td>
                      <td style={{ padding: '10px 16px', textAlign: 'right', color: '#e4e4e7', fontWeight: 600 }}>{formatK(v.views)}</td>
                      <td style={{ padding: '10px 16px', textAlign: 'right', color: '#a1a1aa' }}>{formatK(v.likes)}</td>
                      <td style={{ padding: '10px 16px', textAlign: 'right', color: '#a1a1aa' }}>{formatK(v.comments)}</td>
                      <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                        <span style={{
                          padding: '2px 8px',
                          borderRadius: '9999px',
                          fontSize: '12px',
                          fontWeight: 600,
                          backgroundColor: v.engagement_rate >= 5 ? 'rgba(34,197,94,0.2)' : v.engagement_rate >= 2 ? 'rgba(245,158,11,0.2)' : 'rgba(239,68,68,0.2)',
                          color: v.engagement_rate >= 5 ? '#4ade80' : v.engagement_rate >= 2 ? '#fbbf24' : '#f87171',
                        }}>
                          {v.engagement_rate}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* VA Productivity + Account Performance row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        {/* VA Productivity */}
        {vaPerf && (
          <div style={cardStyle}>
            <div style={headerStyle}>
              <Users size={16} style={{ color: '#06b6d4' }} />
              VA Productivity ({days}d)
            </div>
            <div style={{ padding: '16px' }}>
              {vaPerf.va_performance.length === 0 ? (
                <div style={{ padding: '20px', textAlign: 'center', color: '#71717a', fontSize: '13px' }}>
                  No VA assignment data for this period.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {vaPerf.va_performance.slice(0, 6).map((va: any) => (
                    <div key={va.va_id}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span style={{ fontSize: '13px', color: '#e4e4e7' }}>{va.va_id.slice(0, 8)}...</span>
                        <span style={{ fontSize: '12px', color: '#a1a1aa' }}>
                          {va.completed}/{va.assigned} ({va.completion_rate}%)
                        </span>
                      </div>
                      <div style={{ height: '6px', backgroundColor: '#27272a', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{
                          height: '100%',
                          width: `${va.completion_rate}%`,
                          backgroundColor: va.completion_rate >= 80 ? '#22c55e' : va.completion_rate >= 50 ? '#f59e0b' : '#ef4444',
                          borderRadius: '3px',
                        }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Account Performance */}
        {accounts && (
          <div style={cardStyle}>
            <div style={headerStyle}>
              <TrendingUp size={16} style={{ color: '#ec4899' }} />
              Account Performance
            </div>
            <div style={{ padding: '0' }}>
              {accounts.accounts.length === 0 ? (
                <div style={{ padding: '20px', textAlign: 'center', color: '#71717a', fontSize: '13px' }}>
                  No account data yet. Assign videos to TikTok accounts.
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #27272a' }}>
                      <th style={{ padding: '8px 12px', textAlign: 'left', color: '#71717a', fontWeight: 500 }}>Account</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right', color: '#71717a', fontWeight: 500 }}>Videos</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right', color: '#71717a', fontWeight: 500 }}>Views</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right', color: '#71717a', fontWeight: 500 }}>Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accounts.accounts.slice(0, 6).map((a: any) => (
                      <tr key={a.account_id} style={{ borderBottom: '1px solid #27272a' }}>
                        <td style={{ padding: '8px 12px', color: '#e4e4e7' }}>
                          <div>{a.name}</div>
                          {a.handle && <div style={{ fontSize: '11px', color: '#71717a' }}>@{a.handle}</div>}
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: '#a1a1aa' }}>{a.posted}/{a.videos}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: '#e4e4e7', fontWeight: 600 }}>{formatK(a.views)}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', color: '#22c55e' }}>${a.revenue.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
/* eslint-enable @typescript-eslint/no-explicit-any */
