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

const STATUS_CONFIG: Record<RequestStatus, { label: string; color: string; bgColor: string; icon: typeof Clock }> = {
  pending: { label: 'Pending', color: 'text-zinc-600', bgColor: 'bg-zinc-100', icon: Clock },
  assigned: { label: 'Assigned', color: 'text-blue-600', bgColor: 'bg-blue-100', icon: Clock },
  in_progress: { label: 'In Progress', color: 'text-amber-600', bgColor: 'bg-amber-100', icon: Clock },
  review: { label: 'Ready for Review', color: 'text-purple-600', bgColor: 'bg-purple-100', icon: Eye },
  revision: { label: 'Revision', color: 'text-orange-600', bgColor: 'bg-orange-100', icon: Clock },
  completed: { label: 'Completed', color: 'text-green-600', bgColor: 'bg-green-100', icon: CheckCircle2 },
  cancelled: { label: 'Cancelled', color: 'text-red-600', bgColor: 'bg-red-100', icon: AlertCircle },
};

export default function ClientMyVideosPage() {
  const [requests, setRequests] = useState<VideoRequest[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
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
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
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
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            New Request
          </Link>
        </div>

        {/* Review Alert */}
        {needsReviewCount > 0 && (
          <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 mb-6 flex items-center gap-3">
            <Eye className="w-5 h-5 text-purple-600" />
            <div className="flex-1">
              <p className="font-medium text-purple-900">
                {needsReviewCount} video{needsReviewCount !== 1 ? 's' : ''} ready for review
              </p>
              <p className="text-sm text-purple-700">Please review and approve your edited videos</p>
            </div>
            <button type="button"
              onClick={() => setFilter('review')}
              className="px-3 py-1.5 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700"
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
              <p className="text-2xl font-bold text-amber-600">{stats.in_progress}</p>
              <p className="text-sm text-slate-500">In Progress</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
              <p className="text-2xl font-bold text-purple-600">{stats.review}</p>
              <p className="text-sm text-slate-500">Ready for Review</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
              <p className="text-2xl font-bold text-green-600">{stats.completed}</p>
              <p className="text-sm text-slate-500">Completed</p>
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
                  ? 'bg-blue-600 text-white'
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
              className="inline-block px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
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
                  className={`block bg-white rounded-xl border p-4 hover:shadow-md transition-all ${
                    request.status === 'review'
                      ? 'border-purple-300 bg-purple-50/50'
                      : 'border-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${statusConfig.bgColor}`}>
                      <StatusIcon className={`w-5 h-5 ${statusConfig.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-slate-900 truncate">{request.title}</h3>
                      <div className="flex items-center gap-4 mt-1 text-sm text-slate-500">
                        <span className={statusConfig.color}>{statusConfig.label}</span>
                        {request.due_date && (
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            Due {new Date(request.due_date).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-400" />
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
