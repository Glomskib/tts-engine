'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, Building2, Mail, Phone, Calendar, Video,
  FileText, CreditCard, Edit, Trash2, Clock, TrendingUp,
  MoreVertical, ExternalLink, Send, Globe, User, Loader2, X,
  Download, BarChart3, Timer, CheckCircle2, RefreshCw
} from 'lucide-react';
import Link from 'next/link';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

interface Client {
  id: string;
  company_name: string;
  contact_name: string;
  email: string;
  phone?: string;
  website?: string;
  status: 'active' | 'paused' | 'churned';
  plan_name: string;
  videos_quota: number;
  videos_used: number;
  notes?: string;
  created_at: string;
  updated_at: string;
}

interface VideoRequest {
  id: string;
  title: string;
  status: string;
  created_at: string;
}

interface ClientReport {
  client: { id: string; company_name: string; contact_name: string; plan_name: string };
  period_days: number;
  generated_at: string;
  video_metrics: {
    total_delivered: number;
    total_in_progress: number;
    total_pending: number;
    by_status: Record<string, number>;
  };
  turnaround_metrics: {
    average_hours: number;
    median_hours: number;
    fastest_hours: number;
    slowest_hours: number;
    by_month: { month: string; avg_hours: number; count: number }[];
  };
  content_breakdown: { type: string; count: number; percentage: number }[];
  videos_by_week: { week: string; count: number }[];
  revision_rate: number;
  total_requests: number;
}

export default function ClientDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [client, setClient] = useState<Client | null>(null);
  const [videos, setVideos] = useState<VideoRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'videos' | 'reports' | 'billing'>('overview');
  const [report, setReport] = useState<ClientReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportPeriod, setReportPeriod] = useState(90);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editData, setEditData] = useState<Partial<Client>>({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchClient();
  }, [id]);

  const fetchClient = async () => {
    try {
      const response = await fetch(`/api/admin/clients/${id}`);
      if (response.ok) {
        const data = await response.json();
        setClient(data.client);
        setVideos(data.videos || []);
        setEditData(data.client);
      } else {
        router.push('/admin/clients');
      }
    } catch (error) {
      console.error('Failed to fetch client:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async () => {
    if (!client) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/admin/clients/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editData),
      });

      if (response.ok) {
        const data = await response.json();
        setClient(data.client);
        setShowEditModal(false);
      }
    } catch (error) {
      console.error('Failed to update client:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const response = await fetch(`/api/admin/clients/${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        router.push('/admin/clients');
      }
    } catch (error) {
      console.error('Failed to delete client:', error);
    } finally {
      setDeleting(false);
    }
  };

  const fetchReport = async (days: number) => {
    setReportLoading(true);
    try {
      const response = await fetch(`/api/admin/clients/${id}/reports?days=${days}`);
      if (response.ok) {
        const data = await response.json();
        setReport(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch report:', error);
    } finally {
      setReportLoading(false);
    }
  };

  // Fetch report when tab changes to reports
  useEffect(() => {
    if (activeTab === 'reports' && !report) {
      fetchReport(reportPeriod);
    }
  }, [activeTab]);

  const formatHours = (hours: number): string => {
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
  };

  const exportToPdf = () => {
    // Create a printable view and trigger print dialog
    const printContent = document.getElementById('report-content');
    if (!printContent) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${client?.company_name} - Performance Report</title>
          <style>
            body { font-family: system-ui, -apple-system, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; }
            h1 { font-size: 24px; margin-bottom: 8px; }
            h2 { font-size: 18px; margin-top: 24px; margin-bottom: 12px; border-bottom: 1px solid #ddd; padding-bottom: 8px; }
            .subtitle { color: #666; font-size: 14px; margin-bottom: 24px; }
            .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin: 16px 0; }
            .stat-card { padding: 16px; background: #f5f5f5; border-radius: 8px; text-align: center; }
            .stat-value { font-size: 28px; font-weight: bold; }
            .stat-label { font-size: 12px; color: #666; margin-top: 4px; }
            .breakdown-item { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; }
            table { width: 100%; border-collapse: collapse; margin: 16px 0; }
            th, td { padding: 8px; text-align: left; border-bottom: 1px solid #ddd; }
            th { background: #f5f5f5; }
            .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; }
            @media print { body { padding: 0; } }
          </style>
        </head>
        <body>
          <h1>${client?.company_name}</h1>
          <p class="subtitle">Performance Report - Last ${report?.period_days} Days | Generated ${new Date().toLocaleDateString()}</p>

          <h2>Video Delivery Summary</h2>
          <div class="stats-grid">
            <div class="stat-card">
              <div class="stat-value" style="color: #22c55e">${report?.video_metrics.total_delivered}</div>
              <div class="stat-label">Delivered</div>
            </div>
            <div class="stat-card">
              <div class="stat-value" style="color: #3b82f6">${report?.video_metrics.total_in_progress}</div>
              <div class="stat-label">In Progress</div>
            </div>
            <div class="stat-card">
              <div class="stat-value" style="color: #6b7280">${report?.video_metrics.total_pending}</div>
              <div class="stat-label">Pending</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">${report?.total_requests}</div>
              <div class="stat-label">Total Requests</div>
            </div>
          </div>

          <h2>Turnaround Time</h2>
          <div class="stats-grid">
            <div class="stat-card">
              <div class="stat-value">${formatHours(report?.turnaround_metrics.average_hours || 0)}</div>
              <div class="stat-label">Average</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">${formatHours(report?.turnaround_metrics.median_hours || 0)}</div>
              <div class="stat-label">Median</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">${formatHours(report?.turnaround_metrics.fastest_hours || 0)}</div>
              <div class="stat-label">Fastest</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">${report?.revision_rate}%</div>
              <div class="stat-label">Revision Rate</div>
            </div>
          </div>

          ${report?.content_breakdown && report.content_breakdown.length > 0 ? `
            <h2>Content Breakdown</h2>
            ${report.content_breakdown.map(ct => `
              <div class="breakdown-item">
                <span style="text-transform: capitalize">${ct.type.replace(/_/g, ' ')}</span>
                <span>${ct.count} (${ct.percentage}%)</span>
              </div>
            `).join('')}
          ` : ''}

          ${report?.turnaround_metrics.by_month && report.turnaround_metrics.by_month.length > 0 ? `
            <h2>Monthly Turnaround</h2>
            <table>
              <thead>
                <tr><th>Month</th><th>Videos</th><th>Avg Turnaround</th></tr>
              </thead>
              <tbody>
                ${report.turnaround_metrics.by_month.map(m => `
                  <tr>
                    <td>${m.month}</td>
                    <td>${m.count}</td>
                    <td>${formatHours(m.avg_hours)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          ` : ''}

          <div class="footer">
            <p>Report generated by FlashFlow AI on ${new Date().toLocaleString()}</p>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  const handleStatusChange = async (newStatus: 'active' | 'paused' | 'churned') => {
    try {
      const response = await fetch(`/api/admin/clients/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      if (response.ok) {
        const data = await response.json();
        setClient(data.client);
      }
    } catch (error) {
      console.error('Failed to update status:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-zinc-500" />
      </div>
    );
  }

  if (!client) {
    return (
      <div className="px-4 py-6 text-center">
        <p className="text-zinc-400">Client not found</p>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 pb-24 lg:pb-8 max-w-5xl mx-auto">
        {/* Back button */}
        <Link
          href="/admin/clients"
          className="inline-flex items-center gap-2 text-zinc-400 hover:text-white mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Clients
        </Link>

        {/* Client header */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-teal-500 to-purple-500 flex items-center justify-center text-white font-bold text-2xl">
                {client.company_name[0]}
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">{client.company_name}</h1>
                <p className="text-zinc-400">{client.contact_name}</p>
                <div className="flex items-center gap-4 mt-2 text-sm text-zinc-500">
                  <span className="flex items-center gap-1">
                    <Mail className="w-4 h-4" />
                    {client.email}
                  </span>
                  {client.phone && (
                    <span className="flex items-center gap-1">
                      <Phone className="w-4 h-4" />
                      {client.phone}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={client.status}
                onChange={(e) => handleStatusChange(e.target.value as 'active' | 'paused' | 'churned')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                  client.status === 'active' ? 'bg-green-500/20 text-green-400' :
                  client.status === 'paused' ? 'bg-amber-500/20 text-amber-400' :
                  'bg-red-500/20 text-red-400'
                }`}
              >
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="churned">Churned</option>
              </select>
              <button
                onClick={() => setShowEditModal(true)}
                className="p-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg"
              >
                <Edit className="w-4 h-4 text-zinc-400" />
              </button>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="p-2 bg-zinc-800 hover:bg-red-500/20 rounded-lg"
              >
                <Trash2 className="w-4 h-4 text-zinc-400 hover:text-red-400" />
              </button>
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-4 mt-6 pt-6 border-t border-zinc-800">
            <div>
              <p className="text-sm text-zinc-500">Plan</p>
              <p className="text-lg font-semibold text-white capitalize">{client.plan_name}</p>
            </div>
            <div>
              <p className="text-sm text-zinc-500">Videos This Month</p>
              <p className="text-lg font-semibold text-white">{client.videos_used} / {client.videos_quota}</p>
            </div>
            <div>
              <p className="text-sm text-zinc-500">Member Since</p>
              <p className="text-lg font-semibold text-white">
                {new Date(client.created_at).toLocaleDateString()}
              </p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          {(['overview', 'videos', 'reports', 'billing'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${
                activeTab === tab
                  ? 'bg-teal-600 text-white'
                  : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Contact Info */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
              <h2 className="text-lg font-semibold text-white mb-4">Contact Information</h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-3">
                  <User className="w-5 h-5 text-zinc-500" />
                  <div>
                    <p className="text-sm text-zinc-500">Contact Name</p>
                    <p className="text-white">{client.contact_name}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Mail className="w-5 h-5 text-zinc-500" />
                  <div>
                    <p className="text-sm text-zinc-500">Email</p>
                    <a href={`mailto:${client.email}`} className="text-teal-400 hover:text-teal-300">
                      {client.email}
                    </a>
                  </div>
                </div>
                {client.phone && (
                  <div className="flex items-center gap-3">
                    <Phone className="w-5 h-5 text-zinc-500" />
                    <div>
                      <p className="text-sm text-zinc-500">Phone</p>
                      <p className="text-white">{client.phone}</p>
                    </div>
                  </div>
                )}
                {client.website && (
                  <div className="flex items-center gap-3">
                    <Globe className="w-5 h-5 text-zinc-500" />
                    <div>
                      <p className="text-sm text-zinc-500">Website</p>
                      <a href={client.website} target="_blank" rel="noopener noreferrer" className="text-teal-400 hover:text-teal-300 flex items-center gap-1">
                        {client.website.replace(/^https?:\/\//, '')}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                )}
              </div>
              {client.notes && (
                <div className="mt-4 pt-4 border-t border-zinc-800">
                  <p className="text-sm text-zinc-500 mb-1">Notes</p>
                  <p className="text-zinc-300">{client.notes}</p>
                </div>
              )}
            </div>

            {/* Recent Videos */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white">Recent Videos</h2>
                <button
                  onClick={() => setActiveTab('videos')}
                  className="text-sm text-teal-400 hover:text-teal-300"
                >
                  View all
                </button>
              </div>
              {videos.length === 0 ? (
                <p className="text-zinc-500 text-center py-8">No videos yet</p>
              ) : (
                <div className="space-y-3">
                  {videos.slice(0, 5).map((video) => (
                    <div key={video.id} className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <Video className="w-5 h-5 text-zinc-500" />
                        <div>
                          <p className="text-white">{video.title}</p>
                          <p className="text-xs text-zinc-500">
                            {new Date(video.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        video.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                        video.status === 'in_progress' ? 'bg-blue-500/20 text-blue-400' :
                        'bg-zinc-700 text-zinc-400'
                      }`}>
                        {video.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'videos' && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-4">All Videos</h2>
            {videos.length === 0 ? (
              <p className="text-zinc-500 text-center py-8">No videos yet</p>
            ) : (
              <div className="space-y-3">
                {videos.map((video) => (
                  <div key={video.id} className="flex items-center justify-between p-4 bg-zinc-800/50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <Video className="w-5 h-5 text-zinc-500" />
                      <div>
                        <p className="text-white font-medium">{video.title}</p>
                        <p className="text-sm text-zinc-500">
                          Created {new Date(video.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      video.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                      video.status === 'in_progress' ? 'bg-blue-500/20 text-blue-400' :
                      'bg-zinc-700 text-zinc-400'
                    }`}>
                      {video.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'reports' && (
          <div id="report-content" className="space-y-6">
            {/* Report Controls */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-sm text-zinc-400">Period:</span>
                {[30, 60, 90].map((days) => (
                  <button
                    key={days}
                    onClick={() => { setReportPeriod(days); fetchReport(days); }}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      reportPeriod === days
                        ? 'bg-teal-600 text-white'
                        : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                    }`}
                  >
                    {days} Days
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => fetchReport(reportPeriod)}
                  disabled={reportLoading}
                  className="px-3 py-1.5 bg-zinc-800 text-zinc-300 rounded-lg hover:bg-zinc-700 flex items-center gap-2 text-sm"
                >
                  <RefreshCw className={`w-4 h-4 ${reportLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
                <button
                  onClick={exportToPdf}
                  disabled={!report}
                  className="px-4 py-1.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 flex items-center gap-2 text-sm disabled:opacity-50"
                >
                  <Download className="w-4 h-4" />
                  Export PDF
                </button>
              </div>
            </div>

            {reportLoading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-zinc-500" />
              </div>
            )}

            {!reportLoading && report && (
              <>
                {/* Video Delivery Summary */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Video className="w-5 h-5 text-teal-400" />
                    <h2 className="text-lg font-semibold text-white">Video Delivery Summary</h2>
                  </div>
                  <div className="grid grid-cols-4 gap-4">
                    <div className="bg-zinc-800/50 rounded-xl p-4 text-center">
                      <div className="text-3xl font-bold text-green-400">{report.video_metrics.total_delivered}</div>
                      <div className="text-sm text-zinc-400 mt-1 flex items-center justify-center gap-1">
                        <CheckCircle2 className="w-4 h-4" />
                        Delivered
                      </div>
                    </div>
                    <div className="bg-zinc-800/50 rounded-xl p-4 text-center">
                      <div className="text-3xl font-bold text-blue-400">{report.video_metrics.total_in_progress}</div>
                      <div className="text-sm text-zinc-400 mt-1">In Progress</div>
                    </div>
                    <div className="bg-zinc-800/50 rounded-xl p-4 text-center">
                      <div className="text-3xl font-bold text-zinc-400">{report.video_metrics.total_pending}</div>
                      <div className="text-sm text-zinc-400 mt-1">Pending</div>
                    </div>
                    <div className="bg-zinc-800/50 rounded-xl p-4 text-center">
                      <div className="text-3xl font-bold text-white">{report.total_requests}</div>
                      <div className="text-sm text-zinc-400 mt-1">Total Requests</div>
                    </div>
                  </div>
                </div>

                {/* Turnaround Time */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Timer className="w-5 h-5 text-amber-400" />
                    <h2 className="text-lg font-semibold text-white">Average Turnaround Time</h2>
                  </div>
                  <div className="grid grid-cols-4 gap-4">
                    <div className="bg-zinc-800/50 rounded-xl p-4 text-center">
                      <div className="text-3xl font-bold text-amber-400">{formatHours(report.turnaround_metrics.average_hours)}</div>
                      <div className="text-sm text-zinc-400 mt-1">Average</div>
                    </div>
                    <div className="bg-zinc-800/50 rounded-xl p-4 text-center">
                      <div className="text-3xl font-bold text-white">{formatHours(report.turnaround_metrics.median_hours)}</div>
                      <div className="text-sm text-zinc-400 mt-1">Median</div>
                    </div>
                    <div className="bg-zinc-800/50 rounded-xl p-4 text-center">
                      <div className="text-3xl font-bold text-green-400">{formatHours(report.turnaround_metrics.fastest_hours)}</div>
                      <div className="text-sm text-zinc-400 mt-1">Fastest</div>
                    </div>
                    <div className="bg-zinc-800/50 rounded-xl p-4 text-center">
                      <div className="text-3xl font-bold text-orange-400">{report.revision_rate}%</div>
                      <div className="text-sm text-zinc-400 mt-1">Revision Rate</div>
                    </div>
                  </div>

                  {/* Monthly breakdown */}
                  {report.turnaround_metrics.by_month.length > 0 && (
                    <div className="mt-6 pt-6 border-t border-zinc-800">
                      <h3 className="text-sm font-medium text-zinc-400 mb-3">Monthly Breakdown</h3>
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="text-left text-xs text-zinc-500 border-b border-zinc-800">
                              <th className="pb-2">Month</th>
                              <th className="pb-2 text-right">Videos</th>
                              <th className="pb-2 text-right">Avg Turnaround</th>
                            </tr>
                          </thead>
                          <tbody>
                            {report.turnaround_metrics.by_month.map((m) => (
                              <tr key={m.month} className="border-b border-zinc-800/50">
                                <td className="py-2 text-white">{m.month}</td>
                                <td className="py-2 text-right text-zinc-300">{m.count}</td>
                                <td className="py-2 text-right text-zinc-300">{formatHours(m.avg_hours)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>

                {/* Content Breakdown */}
                {report.content_breakdown.length > 0 && (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                    <div className="flex items-center gap-2 mb-4">
                      <BarChart3 className="w-5 h-5 text-purple-400" />
                      <h2 className="text-lg font-semibold text-white">Content Type Breakdown</h2>
                    </div>
                    <div className="space-y-3">
                      {report.content_breakdown.map((ct) => (
                        <div key={ct.type}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm text-white capitalize">{ct.type.replace(/_/g, ' ')}</span>
                            <span className="text-sm text-zinc-400">{ct.count} ({ct.percentage}%)</span>
                          </div>
                          <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-teal-500 to-purple-500 rounded-full"
                              style={{ width: `${ct.percentage}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Videos by Week Chart (simplified) */}
                {report.videos_by_week.length > 0 && (
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                    <div className="flex items-center gap-2 mb-4">
                      <TrendingUp className="w-5 h-5 text-teal-400" />
                      <h2 className="text-lg font-semibold text-white">Videos Completed by Week</h2>
                    </div>
                    <div className="flex items-end gap-1 h-32">
                      {report.videos_by_week.map((w, idx) => {
                        const maxCount = Math.max(...report.videos_by_week.map(v => v.count), 1);
                        const height = (w.count / maxCount) * 100;
                        return (
                          <div
                            key={idx}
                            className="flex-1 group relative"
                            title={`Week of ${w.week}: ${w.count} videos`}
                          >
                            <div
                              className="bg-gradient-to-t from-teal-600 to-teal-400 rounded-t hover:from-teal-500 hover:to-teal-300 transition-colors cursor-pointer"
                              style={{ height: `${Math.max(height, 4)}%` }}
                            />
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10">
                              <div className="bg-zinc-800 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                                {w.week}: {w.count}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex justify-between mt-2 text-xs text-zinc-500">
                      <span>{report.videos_by_week[0]?.week}</span>
                      <span>{report.videos_by_week[report.videos_by_week.length - 1]?.week}</span>
                    </div>
                  </div>
                )}

                {/* Report Footer */}
                <div className="text-center text-sm text-zinc-500 pt-4">
                  Report generated on {new Date(report.generated_at).toLocaleString()}
                </div>
              </>
            )}

            {!reportLoading && !report && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-12 text-center">
                <BarChart3 className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
                <p className="text-zinc-400">No report data available</p>
                <button
                  onClick={() => fetchReport(reportPeriod)}
                  className="mt-4 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700"
                >
                  Generate Report
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'billing' && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Billing Information</h2>
            <p className="text-zinc-500 text-center py-8">Billing details coming soon</p>
          </div>
        )}

        {/* Edit Modal */}
        {showEditModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60" onClick={() => setShowEditModal(false)} />
            <div className="relative w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-xl shadow-xl">
              <div className="flex items-center justify-between p-4 border-b border-zinc-800">
                <h2 className="text-lg font-semibold text-white">Edit Client</h2>
                <button onClick={() => setShowEditModal(false)} className="p-1 hover:bg-zinc-800 rounded">
                  <X className="w-5 h-5 text-zinc-400" />
                </button>
              </div>
              <div className="p-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1">Company Name</label>
                  <input
                    type="text"
                    value={editData.company_name || ''}
                    onChange={(e) => setEditData({ ...editData, company_name: e.target.value })}
                    className="w-full h-10 px-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-1">Contact Name</label>
                    <input
                      type="text"
                      value={editData.contact_name || ''}
                      onChange={(e) => setEditData({ ...editData, contact_name: e.target.value })}
                      className="w-full h-10 px-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-1">Email</label>
                    <input
                      type="email"
                      value={editData.email || ''}
                      onChange={(e) => setEditData({ ...editData, email: e.target.value })}
                      className="w-full h-10 px-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-1">Phone</label>
                    <input
                      type="tel"
                      value={editData.phone || ''}
                      onChange={(e) => setEditData({ ...editData, phone: e.target.value })}
                      className="w-full h-10 px-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-1">Website</label>
                    <input
                      type="url"
                      value={editData.website || ''}
                      onChange={(e) => setEditData({ ...editData, website: e.target.value })}
                      className="w-full h-10 px-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-1">Plan</label>
                    <select
                      value={editData.plan_name || 'starter'}
                      onChange={(e) => setEditData({ ...editData, plan_name: e.target.value })}
                      className="w-full h-10 px-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                    >
                      <option value="starter">Starter</option>
                      <option value="growth">Growth</option>
                      <option value="pro">Pro</option>
                      <option value="enterprise">Enterprise</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-1">Video Quota</label>
                    <input
                      type="number"
                      value={editData.videos_quota || 30}
                      onChange={(e) => setEditData({ ...editData, videos_quota: parseInt(e.target.value) || 30 })}
                      className="w-full h-10 px-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white"
                      min="1"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1">Notes</label>
                  <textarea
                    value={editData.notes || ''}
                    onChange={(e) => setEditData({ ...editData, notes: e.target.value })}
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white resize-none"
                    rows={3}
                  />
                </div>
                <div className="flex justify-end gap-3 pt-4">
                  <button
                    onClick={() => setShowEditModal(false)}
                    className="px-4 py-2 bg-zinc-800 text-zinc-300 rounded-lg hover:bg-zinc-700"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleUpdate}
                    disabled={saving}
                    className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 flex items-center gap-2"
                  >
                    {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                    Save Changes
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirm */}
        <ConfirmDialog
          isOpen={showDeleteConfirm}
          onClose={() => setShowDeleteConfirm(false)}
          onConfirm={handleDelete}
          title="Delete Client"
          message={`Are you sure you want to delete ${client.company_name}? This action cannot be undone.`}
          confirmText="Delete"
          variant="danger"
          isLoading={deleting}
        />
    </div>
  );
}
