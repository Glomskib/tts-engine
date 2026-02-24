'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import type { MetricsSummary } from '@/lib/marketplace/types';

export default function MetricsPage() {
  const [metrics, setMetrics] = useState<MetricsSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/marketplace/metrics')
      .then(r => r.json())
      .then(d => { setMetrics(d.metrics); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-zinc-500 text-sm py-12 text-center">Loading metrics...</div>;
  if (!metrics) return <div className="text-zinc-500 text-sm py-12 text-center">No metrics available. Submit some editing jobs first.</div>;

  const sections = [
    {
      title: 'Turnaround',
      cards: [
        { label: 'Avg Total (7d)', value: metrics.avg_turnaround_7d !== null ? `${metrics.avg_turnaround_7d}h` : '—' },
        { label: 'Avg Total (30d)', value: metrics.avg_turnaround_30d !== null ? `${metrics.avg_turnaround_30d}h` : '—' },
        { label: 'Avg Queue Wait', value: metrics.avg_queue_wait_hours !== null ? `${metrics.avg_queue_wait_hours}h` : '—' },
        { label: 'Avg Edit Time', value: metrics.avg_edit_time_hours !== null ? `${metrics.avg_edit_time_hours}h` : '—' },
        { label: 'Avg Review Time', value: metrics.avg_review_time_hours !== null ? `${metrics.avg_review_time_hours}h` : '—' },
      ],
    },
    {
      title: 'SLA Performance',
      cards: [
        { label: 'On-Time Rate (7d)', value: metrics.on_time_rate_7d !== null ? `${metrics.on_time_rate_7d}%` : '—' },
        { label: 'On-Time Rate (30d)', value: metrics.on_time_rate_30d !== null ? `${metrics.on_time_rate_30d}%` : '—' },
      ],
    },
    {
      title: 'Queue Health',
      cards: [
        { label: 'In Queue', value: String(metrics.queue_count) },
        { label: 'In Progress', value: String(metrics.in_progress_count) },
        { label: 'Oldest in Queue', value: metrics.oldest_in_queue_hours !== null ? `${metrics.oldest_in_queue_hours}h` : '—' },
        { label: 'Completed (7d)', value: String(metrics.completed_7d) },
        { label: 'Completed (30d)', value: String(metrics.completed_30d) },
      ],
    },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Metrics</h1>
      <div className="space-y-8">
        {sections.map(section => (
          <div key={section.title}>
            <h2 className="text-sm font-medium text-zinc-500 uppercase tracking-wide mb-3">{section.title}</h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {section.cards.map(c => (
                <Card key={c.label}>
                  <CardContent>
                    <p className="text-xs text-zinc-500">{c.label}</p>
                    <p className="text-3xl font-bold text-white mt-1">{c.value}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
