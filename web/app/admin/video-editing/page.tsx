'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Loader2, RefreshCw, Filter, ExternalLink, Download,
  CheckCircle2, AlertTriangle, User, Calendar,
  ChevronRight, Play, Eye, RotateCcw, X, Users
} from 'lucide-react';
import { useToast } from '@/contexts/ToastContext';
import DeadlineWidget from './components/DeadlineWidget';
import MetricsPanel from './components/MetricsPanel';

type RequestStatus = 'pending' | 'assigned' | 'in_progress' | 'review' | 'revision' | 'completed' | 'cancelled';

interface VideoRequest {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  source_drive_link: string;
  edited_drive_link: string | null;
  status: RequestStatus;
  assigned_editor_id: string | null;
  assigned_at: string | null;
  priority: number;
  due_date: string | null;
  completed_at: string | null;
  revision_count: number;
  created_at: string;
  user_email?: string;
  editor_email?: string;
}

interface Editor {
  id: string;
  email: string;
  assigned_count: number;
  completed_count: number;
}

const STATUS_COLUMNS: { key: RequestStatus; label: string; color: string; bgColor: string }[] = [
  { key: 'pending', label: 'Queued', color: '#a78bfa', bgColor: 'bg-violet-900/20' },
  { key: 'assigned', label: 'Claimed', color: '#818cf8', bgColor: 'bg-indigo-900/20' },
  { key: 'in_progress', label: 'Editing', color: '#60a5fa', bgColor: 'bg-blue-900/20' },
  { key: 'review', label: 'Submitted', color: '#fb923c', bgColor: 'bg-orange-900/20' },
  { key: 'completed', label: 'Approved', color: '#4ade80', bgColor: 'bg-green-900/20' },
];

const PRIORITY_LABELS: Record<number, { label: string; color: string }> = {
  0: { label: 'Normal', color: 'text-zinc-500' },
  1: { label: 'High', color: 'text-amber-400' },
  2: { label: 'Urgent', color: 'text-red-400' },
};

const STATUS_PILL_COLORS: Record<RequestStatus, string> = {
  pending: 'bg-violet-500/15 text-violet-400 border-violet-500/30',
  assigned: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30',
  in_progress: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  review: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  revision: 'bg-red-500/15 text-red-400 border-red-500/30',
  completed: 'bg-green-500/15 text-green-400 border-green-500/30',
  cancelled: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
};

const STATUS_LABELS: Record<RequestStatus, string> = {
  pending: 'Queued',
  assigned: 'Claimed',
  in_progress: 'Editing',
  review: 'Submitted',
  revision: 'Changes Req.',
  completed: 'Approved',
  cancelled: 'Cancelled',
};

export default function VideoEditingPipelinePage() {
  const { showSuccess, showError } = useToast();
  const [requests, setRequests] = useState<VideoRequest[]>([]);
  const [editors, setEditors] = useState<Editor[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters
  const [editorFilter, setEditorFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'created' | 'deadline' | 'priority'>('deadline');
  const [showFilters, setShowFilters] = useState(false);

  // Assignment modal
  const [assigningRequest, setAssigningRequest] = useState<VideoRequest | null>(null);
  const [selectedEditor, setSelectedEditor] = useState<string>('');
  const [assigning, setAssigning] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [requestsRes, editorsRes] = await Promise.all([
        fetch('/api/admin/video-requests'),
        fetch('/api/admin/editors'),
      ]);

      const requestsData = await requestsRes.json();
      const editorsData = await editorsRes.json();

      if (requestsData.ok) {
        setRequests(requestsData.data);
      }
      if (editorsData.ok) {
        setEditors(editorsData.data);
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
      showError('Failed to load pipeline data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showError]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const handleStatusChange = async (requestId: string, newStatus: RequestStatus) => {
    try {
      const res = await fetch(`/api/admin/video-requests/${requestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      if (res.ok) {
        setRequests(prev =>
          prev.map(r => r.id === requestId ? { ...r, status: newStatus } : r)
        );
        showSuccess(`Status updated to ${newStatus}`);
      } else {
        showError('Failed to update status');
      }
    } catch (error) {
      console.error('Status update error:', error);
      showError('Failed to update status');
    }
  };

  const handleAssign = async () => {
    if (!assigningRequest || !selectedEditor) return;

    setAssigning(true);
    try {
      const res = await fetch(`/api/admin/video-requests/${assigningRequest.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assigned_editor_id: selectedEditor,
          status: 'assigned',
        }),
      });

      if (res.ok) {
        const editor = editors.find(e => e.id === selectedEditor);
        setRequests(prev =>
          prev.map(r =>
            r.id === assigningRequest.id
              ? { ...r, assigned_editor_id: selectedEditor, status: 'assigned', editor_email: editor?.email }
              : r
          )
        );
        showSuccess('Editor assigned successfully');
        setAssigningRequest(null);
        setSelectedEditor('');
      } else {
        showError('Failed to assign editor');
      }
    } catch (error) {
      console.error('Assignment error:', error);
      showError('Failed to assign editor');
    } finally {
      setAssigning(false);
    }
  };

  // Filter requests
  const filteredRequests = requests.filter(r => {
    // Exclude cancelled
    if (r.status === 'cancelled') return false;

    // Editor filter
    if (editorFilter !== 'all') {
      if (editorFilter === 'unassigned' && r.assigned_editor_id) return false;
      if (editorFilter !== 'unassigned' && r.assigned_editor_id !== editorFilter) return false;
    }

    // Priority filter
    if (priorityFilter !== 'all' && r.priority !== parseInt(priorityFilter)) return false;

    return true;
  });

  // Sort filtered requests
  const sortedRequests = [...filteredRequests].sort((a, b) => {
    if (sortBy === 'deadline') {
      // Overdue first, then by deadline (nulls last)
      const aOverdue = a.due_date && new Date(a.due_date) < new Date();
      const bOverdue = b.due_date && new Date(b.due_date) < new Date();
      if (aOverdue && !bOverdue) return -1;
      if (!aOverdue && bOverdue) return 1;
      if (!a.due_date && b.due_date) return 1;
      if (a.due_date && !b.due_date) return -1;
      if (a.due_date && b.due_date) {
        return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
      }
      return 0;
    } else if (sortBy === 'priority') {
      return b.priority - a.priority;
    } else {
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    }
  });

  // Group by status
  const groupedRequests: Record<RequestStatus, VideoRequest[]> = {
    pending: [],
    assigned: [],
    in_progress: [],
    review: [],
    revision: [],
    completed: [],
    cancelled: [],
  };

  sortedRequests.forEach(r => {
    if (r.status === 'revision') {
      // Show revision in in_progress column
      groupedRequests['in_progress'].push(r);
    } else {
      groupedRequests[r.status].push(r);
    }
  });

  // Count overdue requests
  const overdueCount = filteredRequests.filter(r =>
    r.due_date &&
    new Date(r.due_date) < new Date() &&
    !['completed', 'cancelled'].includes(r.status)
  ).length;

  // Check if overdue
  const isOverdue = (request: VideoRequest) => {
    if (!request.due_date) return false;
    if (request.status === 'completed' || request.status === 'cancelled') return false;
    return new Date(request.due_date) < new Date();
  };

  // Time until deadline
  const getDeadlineText = (request: VideoRequest) => {
    if (!request.due_date) return null;
    const due = new Date(request.due_date);
    const now = new Date();
    const diff = due.getTime() - now.getTime();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));

    if (days < 0) return `${Math.abs(days)}d overdue`;
    if (days === 0) return 'Due today';
    if (days === 1) return 'Due tomorrow';
    return `${days}d left`;
  };

  if (loading) {
    return (
      <div className="pb-24 lg:pb-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="h-7 w-56 bg-zinc-800 rounded animate-pulse" />
            <div className="h-4 w-72 bg-zinc-800 rounded animate-pulse mt-2" />
          </div>
          <div className="flex gap-3">
            <div className="h-10 w-24 bg-zinc-800 rounded-lg animate-pulse" />
            <div className="h-10 w-24 bg-zinc-800 rounded-lg animate-pulse" />
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-3">
              <div className="h-3 w-16 bg-zinc-800 rounded animate-pulse" />
              <div className="h-8 w-10 bg-zinc-800 rounded animate-pulse mt-2" />
            </div>
          ))}
        </div>
        <div className="flex gap-4 overflow-x-auto pb-4">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="flex-shrink-0 w-72 bg-zinc-900/50 border border-zinc-800 rounded-xl">
              <div className="p-3 border-b border-zinc-800">
                <div className="h-5 w-24 bg-zinc-800 rounded animate-pulse" />
              </div>
              <div className="p-2 space-y-2">
                {[1, 2].map(j => (
                  <div key={j} className="bg-zinc-800 border border-zinc-700 rounded-lg p-4">
                    <div className="h-4 w-32 bg-zinc-700 rounded animate-pulse mb-2" />
                    <div className="h-3 w-24 bg-zinc-700 rounded animate-pulse" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="pb-24 lg:pb-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Video Editing Pipeline</h1>
          <p className="text-zinc-400">Manage video editing requests from clients</p>
        </div>
        <div className="flex items-center gap-3">
          <button type="button"
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
              showFilters ? 'bg-teal-600 text-white' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
            }`}
          >
            <Filter className="w-4 h-4" />
            Filters
          </button>
          <button type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 px-3 py-2 bg-zinc-800 text-zinc-300 rounded-lg hover:bg-zinc-700 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Overdue Warning */}
      {overdueCount > 0 && (
        <div className="bg-red-900/30 border border-red-500/30 rounded-xl p-4 mb-6 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400" />
          <div className="flex-1">
            <p className="text-red-400 font-medium">
              {overdueCount} request{overdueCount !== 1 ? 's' : ''} overdue
            </p>
            <p className="text-red-400/60 text-sm">
              These need immediate attention
            </p>
          </div>
          <button type="button"
            onClick={() => setSortBy('deadline')}
            className="px-3 py-1.5 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700"
          >
            Sort by Deadline
          </button>
        </div>
      )}

      {/* Filters */}
      {showFilters && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-6">
          <div className="flex flex-wrap gap-4">
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Editor</label>
              <select
                value={editorFilter}
                onChange={(e) => setEditorFilter(e.target.value)}
                className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm"
              >
                <option value="all">All Editors</option>
                <option value="unassigned">Unassigned</option>
                {editors.map(e => (
                  <option key={e.id} value={e.id}>{e.email} ({e.assigned_count})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Priority</label>
              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm"
              >
                <option value="all">All Priorities</option>
                <option value="0">Normal</option>
                <option value="1">High</option>
                <option value="2">Urgent</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Sort By</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm"
              >
                <option value="deadline">Deadline</option>
                <option value="priority">Priority</option>
                <option value="created">Created Date</option>
              </select>
            </div>
            <button type="button"
              onClick={() => { setEditorFilter('all'); setPriorityFilter('all'); setSortBy('deadline'); }}
              className="self-end px-3 py-2 text-sm text-zinc-400 hover:text-white"
            >
              Reset
            </button>
          </div>
        </div>
      )}

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        {STATUS_COLUMNS.map(col => (
          <div
            key={col.key}
            className={`${col.bgColor} border border-zinc-800 rounded-xl p-3`}
          >
            <p className="text-xs text-zinc-400">{col.label}</p>
            <p className="text-2xl font-bold" style={{ color: col.color }}>
              {groupedRequests[col.key].length}
            </p>
          </div>
        ))}
      </div>

      {/* Kanban Board */}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {STATUS_COLUMNS.map(column => {
          const columnRequests = groupedRequests[column.key];

          return (
            <div
              key={column.key}
              className="flex-shrink-0 w-72 bg-zinc-900/50 border border-zinc-800 rounded-xl"
            >
              {/* Column Header */}
              <div
                className="p-3 border-b border-zinc-800"
                style={{ borderBottomColor: column.color, borderBottomWidth: '2px' }}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-white">{column.label}</span>
                  <span
                    className="px-2 py-0.5 rounded-full text-xs font-medium"
                    style={{ backgroundColor: column.color + '20', color: column.color }}
                  >
                    {columnRequests.length}
                  </span>
                </div>
              </div>

              {/* Cards */}
              <div className="p-2 space-y-2 max-h-[calc(100vh-300px)] overflow-y-auto">
                {columnRequests.length === 0 ? (
                  <div className="text-center py-8 text-zinc-600 text-sm">
                    No requests
                  </div>
                ) : (
                  columnRequests.map(request => (
                    <RequestCard
                      key={request.id}
                      request={request}
                      isOverdue={isOverdue(request)}
                      deadlineText={getDeadlineText(request)}
                      onAssign={() => setAssigningRequest(request)}
                      onStatusChange={handleStatusChange}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Metrics Panel */}
      <div className="mt-6">
        <MetricsPanel />
      </div>

      {/* Deadline Widget - Hidden on mobile */}
      <div className="hidden lg:block mt-6">
        <DeadlineWidget requests={filteredRequests} />
      </div>

      {/* Assignment Modal */}
      {assigningRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setAssigningRequest(null)} />
          <div className="relative w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-xl shadow-xl">
            <div className="flex items-center justify-between p-4 border-b border-zinc-800">
              <h3 className="text-lg font-semibold text-white">Assign Editor</h3>
              <button type="button" onClick={() => setAssigningRequest(null)} className="p-1 hover:bg-zinc-800 rounded">
                <X className="w-5 h-5 text-zinc-400" />
              </button>
            </div>

            <div className="p-4">
              <p className="text-sm text-zinc-400 mb-4">
                Assigning: <span className="text-white">{assigningRequest.title}</span>
              </p>

              <div className="space-y-2">
                {editors.map(editor => (
                  <button type="button"
                    key={editor.id}
                    onClick={() => setSelectedEditor(editor.id)}
                    className={`w-full p-3 rounded-lg border text-left transition-colors ${
                      selectedEditor === editor.id
                        ? 'border-teal-500 bg-teal-500/10'
                        : 'border-zinc-700 bg-zinc-800 hover:border-zinc-600'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-white font-medium">{editor.email}</p>
                        <p className="text-xs text-zinc-500">
                          {editor.assigned_count} active • {editor.completed_count} completed
                        </p>
                      </div>
                      {selectedEditor === editor.id && (
                        <CheckCircle2 className="w-5 h-5 text-teal-500" />
                      )}
                    </div>
                  </button>
                ))}
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button type="button"
                  onClick={() => setAssigningRequest(null)}
                  className="px-4 py-2 bg-zinc-800 text-zinc-300 rounded-lg hover:bg-zinc-700"
                >
                  Cancel
                </button>
                <button type="button"
                  onClick={handleAssign}
                  disabled={!selectedEditor || assigning}
                  className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {assigning && <Loader2 className="w-4 h-4 animate-spin" />}
                  Assign
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Request Card Component
function RequestCard({
  request,
  isOverdue,
  deadlineText,
  onAssign,
  onStatusChange,
}: {
  request: VideoRequest;
  isOverdue: boolean;
  deadlineText: string | null;
  onAssign: () => void;
  onStatusChange: (id: string, status: RequestStatus) => void;
}) {
  const priority = PRIORITY_LABELS[request.priority] || PRIORITY_LABELS[0];

  const statusPill = STATUS_PILL_COLORS[request.status];
  const statusLabel = STATUS_LABELS[request.status];

  return (
    <div
      className={`bg-zinc-800 border rounded-lg p-4 hover:border-zinc-600 transition-colors ${
        isOverdue ? 'border-red-500/50' : 'border-zinc-700'
      }`}
    >
      {/* Status pill + Priority */}
      <div className="flex items-center gap-2 mb-2.5">
        <span className={`px-2 py-0.5 text-[11px] font-medium rounded-full border ${statusPill}`}>
          {statusLabel}
        </span>
        {request.priority > 0 && (
          <span className={`text-[11px] font-medium ${priority.color}`}>
            {priority.label}
          </span>
        )}
        {request.status === 'revision' && (
          <span className="flex items-center gap-1 text-[11px] text-red-400">
            <RotateCcw className="w-3 h-3" />
            #{request.revision_count}
          </span>
        )}
      </div>

      {/* Title */}
      <Link
        href={`/admin/video-editing/${request.id}`}
        className="block text-sm font-medium text-white hover:text-teal-400 line-clamp-2 mb-2.5"
      >
        {request.title}
      </Link>

      {/* Meta rows */}
      <div className="space-y-1.5 mb-3">
        <div className="flex items-center gap-1.5 text-xs text-zinc-500">
          <User className="w-3 h-3 shrink-0" />
          <span className="truncate">{request.user_email || 'Unknown'}</span>
        </div>

        {/* SLA timer */}
        {deadlineText && (
          <div className={`flex items-center gap-1.5 text-xs ${isOverdue ? 'text-red-400 font-medium' : 'text-zinc-500'}`}>
            {isOverdue ? <AlertTriangle className="w-3 h-3 shrink-0" /> : <Calendar className="w-3 h-3 shrink-0" />}
            <span>{deadlineText}</span>
          </div>
        )}

        {/* Editor assignment */}
        {request.editor_email ? (
          <div className="flex items-center gap-1.5 text-xs text-zinc-500">
            <Users className="w-3 h-3 shrink-0" />
            <span className="truncate">{request.editor_email}</span>
          </div>
        ) : request.status !== 'pending' && (
          <div className="flex items-center gap-1.5 text-xs text-zinc-600">
            <Users className="w-3 h-3 shrink-0" />
            <span>Unassigned</span>
          </div>
        )}
      </div>

      {/* Actions — right-aligned */}
      <div className="flex items-center gap-2 pt-2.5 border-t border-zinc-700">
        <a
          href={request.source_drive_link}
          target="_blank"
          rel="noopener noreferrer"
          className="p-1.5 bg-zinc-700 hover:bg-zinc-600 rounded text-zinc-300 hover:text-white"
          title="Open Drive"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </a>

        {request.edited_drive_link && (
          <a
            href={request.edited_drive_link}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 bg-green-600/20 hover:bg-green-600/30 rounded text-green-400"
            title="Download Edited"
          >
            <Download className="w-3.5 h-3.5" />
          </a>
        )}

        <div className="flex-1" />

        {request.status === 'pending' && (
          <button type="button"
            onClick={onAssign}
            className="px-2.5 py-1 text-xs bg-violet-600 text-white rounded hover:bg-violet-700 font-medium"
          >
            Assign
          </button>
        )}

        {request.status === 'assigned' && (
          <button type="button"
            onClick={() => onStatusChange(request.id, 'in_progress')}
            className="px-2.5 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center gap-1 font-medium"
          >
            <Play className="w-3 h-3" />
            Start
          </button>
        )}

        {(request.status === 'in_progress' || request.status === 'revision') && (
          <button type="button"
            onClick={() => onStatusChange(request.id, 'review')}
            className="px-2.5 py-1 text-xs bg-orange-600 text-white rounded hover:bg-orange-700 flex items-center gap-1 font-medium"
          >
            <Eye className="w-3 h-3" />
            Submit
          </button>
        )}

        {request.status === 'review' && (
          <button type="button"
            onClick={() => onStatusChange(request.id, 'completed')}
            className="px-2.5 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 flex items-center gap-1 font-medium"
          >
            <CheckCircle2 className="w-3 h-3" />
            Approve
          </button>
        )}

        <Link
          href={`/admin/video-editing/${request.id}`}
          className="p-1.5 text-zinc-400 hover:text-white"
        >
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}
