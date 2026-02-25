'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Loader2, Video, Clock, CheckCircle2, AlertCircle,
  ChevronRight, Eye, Calendar
} from 'lucide-react';

type RequestStatus = 'pending' | 'assigned' | 'in_progress' | 'review' | 'revision' | 'completed' | 'cancelled';

interface VideoRequest {
  id: string;
  title: string;
  status: RequestStatus;
  priority: number;
  due_date: string | null;
  created_at: string;
  completed_at: string | null;
  edited_drive_link: string | null;
}

interface Stats {
  total: number;
  pending: number;
  in_progress: number;
  review: number;
  completed: number;
}

interface Quota {
  submitted_today: number;
  daily_limit: number;
  videos_per_month: number;
  videos_used_this_month: number;
  videos_remaining: number;
}

const PRIORITY_CONFIG: Record<number, { label: string; color: string; bgColor: string }> = {
  0: { label: 'Pool', color: 'text-slate-600', bgColor: 'bg-slate-100' },
  1: { label: 'Dedicated', color: 'text-blue-600', bgColor: 'bg-blue-100' },
  2: { label: 'Scale', color: 'text-violet-600', bgColor: 'bg-violet-100' },
};

const STATUS_CONFIG: Record<RequestStatus, { label: string; color: string; bgColor: string; icon: typeof Clock }> = {
  pending: { label: 'Queued', color: 'text-violet-600', bgColor: 'bg-violet-100', icon: Clock },
  assigned: { label: 'Editor Assigned', color: 'text-indigo-600', bgColor: 'bg-indigo-100', icon: Clock },
  in_progress: { label: 'Editing', color: 'text-blue-600', bgColor: 'bg-blue-100', icon: Clock },
  review: { label: 'Ready for Review', color: 'text-orange-600', bgColor: 'bg-orange-100', icon: Eye },
  revision: { label: 'Changes Requested', color: 'text-red-600', bgColor: 'bg-red-100', icon: Clock },
  completed: { label: 'Approved', color: 'text-green-600', bgColor: 'bg-green-100', icon: CheckCircle2 },
  cancelled: { label: 'Cancelled', color: 'text-slate-500', bgColor: 'bg-slate-100', icon: AlertCircle },
};

function formatSlaTimer(dueDate: string | null, status: RequestStatus): { text: string; color: string; bgColor: string } | null {
  if (!dueDate || ['completed', 'cancelled'].includes(status)) return null;
  const due = new Date(dueDate);
  const now = new Date();
  const diff = due.getTime() - now.getTime();
  const totalMinutes = Math.floor(Math.abs(diff) / (1000 * 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (diff < 0) {
    // Overdue
    const text = hours > 0 ? `Overdue by ${hours}h ${minutes}m` : `Overdue by ${minutes}m`;
    return { text, color: 'text-red-700', bgColor: 'bg-red-100' };
  }

  if (hours >= 48) {
    const days = Math.floor(hours / 24);
    return { text: `Due in ${days}d`, color: 'text-green-700', bgColor: 'bg-green-100' };
  }

  if (hours >= 1) {
    const color = hours < 24 ? 'text-amber-700' : 'text-green-700';
    const bgColor = hours < 24 ? 'bg-amber-100' : 'bg-green-100';
    return { text: `Due in ${hours}h ${minutes}m`, color, bgColor };
  }

  return { text: `Due in ${minutes}m`, color: 'text-amber-700', bgColor: 'bg-amber-100' };
}

export default function ClientMyVideosPage() {
  const [requests, setRequests] = useState<VideoRequest[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [quota, setQuota] = useState<Quota | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    const fetchRequests = async () => {
      try {
        const res = await fetch('/api/client/my-videos');
        const data = await res.json();

        if (data.ok) {
          setRequests(data.data);
          setStats(data.stats);
          if (data.quota) setQuota(data.quota);
        }
      } catch (err) {
        console.error('Failed to fetch requests:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchRequests();
  }, []);

  const filteredRequests = requests.filter(r => {
    if (filter === 'all') return true;
    if (filter === 'active') return !['completed', 'cancelled'].includes(r.status);
    if (filter === 'review') return r.status === 'review';
    if (filter === 'completed') return r.status === 'completed';
    return true;
  });

  // Count needing review
  const needsReviewCount = requests.filter(r => r.status === 'review').length;

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="h-7 w-32 bg-slate-200 rounded animate-pulse" />
              <div className="h-4 w-56 bg-slate-200 rounded animate-pulse mt-2" />
            </div>
            <div className="h-10 w-28 bg-slate-200 rounded-lg animate-pulse" />
          </div>
          <div className="grid grid-cols-4 gap-4 mb-6">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="bg-white rounded-xl border border-slate-200 p-4">
                <div className="h-8 w-8 bg-slate-200 rounded animate-pulse mx-auto" />
                <div className="h-3 w-12 bg-slate-200 rounded animate-pulse mx-auto mt-2" />
              </div>
            ))}
          </div>
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-white rounded-xl border border-slate-200 p-5">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-slate-200 animate-pulse shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-48 bg-slate-200 rounded animate-pulse" />
                    <div className="h-3 w-32 bg-slate-200 rounded animate-pulse" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">My Videos</h1>
            <p className="text-slate-500">Track your video editing requests</p>
          </div>
          <Link
            href="/client/requests/new"
            className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors"
          >
            New Request
          </Link>
        </div>

        {/* Daily Usage Bar */}
        {quota && (
          <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-slate-700">
                {quota.submitted_today} / {quota.daily_limit} videos today
              </span>
              <span className="text-xs text-slate-500">
                {quota.videos_remaining} of {quota.videos_per_month} monthly remaining
              </span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all ${
                  quota.submitted_today / quota.daily_limit >= 1
                    ? 'bg-red-500'
                    : quota.submitted_today / quota.daily_limit >= 0.8
                      ? 'bg-amber-500'
                      : 'bg-teal-500'
                }`}
                style={{ width: `${Math.min(100, (quota.submitted_today / quota.daily_limit) * 100)}%` }}
              />
            </div>
          </div>
        )}

        {/* Review Alert */}
        {needsReviewCount > 0 && (
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 mb-6 flex items-center gap-3">
            <Eye className="w-5 h-5 text-orange-600" />
            <div className="flex-1">
              <p className="font-medium text-orange-900">
                {needsReviewCount} video{needsReviewCount !== 1 ? 's' : ''} ready for review
              </p>
              <p className="text-sm text-orange-700">Please review and approve your edited videos</p>
            </div>
            <button type="button"
              onClick={() => setFilter('review')}
              className="px-3 py-1.5 bg-orange-600 text-white text-sm rounded-lg hover:bg-orange-700"
            >
              View
            </button>
          </div>
        )}

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
              <p className="text-2xl font-bold text-slate-900">{stats.total}</p>
              <p className="text-sm text-slate-500">Total</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
              <p className="text-2xl font-bold text-blue-600">{stats.in_progress}</p>
              <p className="text-sm text-slate-500">Editing</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
              <p className="text-2xl font-bold text-orange-600">{stats.review}</p>
              <p className="text-sm text-slate-500">Needs Review</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
              <p className="text-2xl font-bold text-green-600">{stats.completed}</p>
              <p className="text-sm text-slate-500">Approved</p>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex gap-2 mb-6">
          {[
            { key: 'all', label: 'All' },
            { key: 'active', label: 'Active' },
            { key: 'review', label: 'Needs Review' },
            { key: 'completed', label: 'Completed' },
          ].map(f => (
            <button type="button"
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === f.key
                  ? 'bg-teal-600 text-white'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Request List */}
        {filteredRequests.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
            <Video className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-600 mb-4">No video requests found</p>
            <Link
              href="/client/requests/new"
              className="inline-block px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700"
            >
              Submit Your First Request
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredRequests.map(request => {
              const statusConfig = STATUS_CONFIG[request.status];
              const StatusIcon = statusConfig.icon;

              return (
                <Link
                  key={request.id}
                  href={`/client/my-videos/${request.id}`}
                  className={`block bg-white rounded-xl border p-5 hover:shadow-md transition-all ${
                    request.status === 'review'
                      ? 'border-orange-300 bg-orange-50/30'
                      : 'border-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${statusConfig.bgColor}`}>
                      <StatusIcon className={`w-5 h-5 ${statusConfig.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-slate-900 truncate">{request.title}</h3>
                      <div className="flex items-center gap-3 mt-1.5 text-sm">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusConfig.bgColor} ${statusConfig.color}`}>
                          {statusConfig.label}
                        </span>
                        {PRIORITY_CONFIG[request.priority] && request.priority > 0 && (
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${PRIORITY_CONFIG[request.priority].bgColor} ${PRIORITY_CONFIG[request.priority].color}`}>
                            {PRIORITY_CONFIG[request.priority].label}
                          </span>
                        )}
                        {(() => {
                          const sla = formatSlaTimer(request.due_date, request.status);
                          if (!sla) return null;
                          return (
                            <span className={`flex items-center gap-1 text-xs font-medium ${sla.color}`}>
                              <Calendar className="w-3 h-3" />
                              {sla.text}
                            </span>
                          );
                        })()}
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-400 shrink-0" />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
