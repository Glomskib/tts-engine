'use client';

import { useState } from 'react';
import { Download, FileText, BarChart, Loader2, ExternalLink } from 'lucide-react';

interface ExportOption {
  id: string;
  label: string;
  description: string;
  icon: string;
  type: 'csv' | 'report';
  endpoint: string;
}

const EXPORT_OPTIONS: ExportOption[] = [
  {
    id: 'csv_videos',
    label: 'Export Videos (CSV)',
    description: 'All pipeline videos with status, brand, views, revenue, and posting dates.',
    icon: '📊',
    type: 'csv',
    endpoint: '/api/admin/export?type=csv_videos',
  },
  {
    id: 'csv_analytics',
    label: 'Export Analytics (CSV)',
    description: 'Daily analytics summary — videos posted, views, clicks, orders, and revenue.',
    icon: '📈',
    type: 'csv',
    endpoint: '/api/admin/export?type=csv_analytics',
  },
  {
    id: 'csv_scripts',
    label: 'Export Scripts (CSV)',
    description: 'All saved scripts with AI scores, product info, and creation dates.',
    icon: '📝',
    type: 'csv',
    endpoint: '/api/admin/export/scripts',
  },
  {
    id: 'report_pdf',
    label: 'Performance Report',
    description: 'Print-ready HTML report with summary stats, top videos, and brand performance.',
    icon: '📄',
    type: 'report',
    endpoint: '/api/admin/export/report',
  },
];

const DAY_OPTIONS = [
  { value: 7, label: '7 days' },
  { value: 14, label: '14 days' },
  { value: 30, label: '30 days' },
  { value: 60, label: '60 days' },
  { value: 90, label: '90 days' },
];

export default function ExportPage() {
  const [days, setDays] = useState(30);
  const [downloading, setDownloading] = useState<string | null>(null);

  const handleExport = async (option: ExportOption) => {
    const separator = option.endpoint.includes('?') ? '&' : '?';
    const url = `${option.endpoint}${separator}days=${days}`;

    if (option.type === 'report') {
      window.open(url, '_blank');
      return;
    }

    setDownloading(option.id);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('Export failed');

      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition');
      const filenameMatch = disposition?.match(/filename="?([^"]+)"?/);
      const filename = filenameMatch?.[1] || `flashflow-export-${new Date().toISOString().split('T')[0]}.csv`;

      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      // Silent fail — toast could be added
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="pb-24 lg:pb-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">Export & Reports</h1>
        <p className="text-sm text-zinc-400 mt-1">
          Download your data as CSV or generate printable reports.
        </p>
      </div>

      {/* Date Range Picker */}
      <div className="mb-6 flex items-center gap-3">
        <span className="text-sm text-zinc-400">Time range:</span>
        <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-lg p-0.5">
          {DAY_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setDays(opt.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                days === opt.value
                  ? 'bg-teal-600 text-white'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Export Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {EXPORT_OPTIONS.map(option => {
          const isDownloading = downloading === option.id;
          const isReport = option.type === 'report';

          return (
            <div
              key={option.id}
              className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 hover:border-zinc-700 transition-colors"
            >
              <div className="flex items-start gap-3">
                <span className="text-2xl">{option.icon}</span>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-white text-sm">{option.label}</h3>
                  <p className="text-xs text-zinc-500 mt-1 leading-relaxed">{option.description}</p>
                  <div className="text-xs text-zinc-600 mt-1.5">
                    Last {days} days
                  </div>
                </div>
              </div>

              <button
                onClick={() => handleExport(option)}
                disabled={isDownloading}
                className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors min-h-[44px] bg-zinc-800 hover:bg-zinc-700 text-white disabled:opacity-50"
              >
                {isDownloading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Downloading...
                  </>
                ) : isReport ? (
                  <>
                    <ExternalLink className="w-4 h-4" />
                    Open Report
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    Download CSV
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>

      {/* Existing Exports Info */}
      <div className="mt-8 p-4 bg-zinc-900/50 border border-zinc-800 rounded-xl">
        <h3 className="text-sm font-medium text-zinc-300 mb-2">Other Exports</h3>
        <div className="space-y-1.5 text-xs text-zinc-500">
          <p>Pipeline page includes a CSV export button for the current filtered view.</p>
          <p>Analytics and billing exports are available in their respective pages.</p>
        </div>
      </div>
    </div>
  );
}
