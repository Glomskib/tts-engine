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
  { key: 'pending', label: 'Pending', color: '#6b7280', bgColor: 'bg-zinc-800' },
  { key: 'assigned', label: 'Assigned', color: '#3b82f6', bgColor: 'bg-blue-900/30' },
  { key: 'in_progress', label: 'In Progress', color: '#f59e0b', bgColor: 'bg-amber-900/30' },
  { key: 'review', label: 'Review', color: '#8b5cf6', bgColor: 'bg-purple-900/30' },
  { key: 'completed', label: 'Completed', color: '#10b981', bgColor: 'bg-green-900/30' },
];

const PRIORITY_LABELS: Record<number, { label: string; color: string }> = {
  0: { label: 'Normal', color: 'text-zinc-400' },
  1: { label: 'High', color: 'text-amber-400' },
  2: { label: 'Urgent', color: 'text-red-400' },
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
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-teal-500" />
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
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
              showFilters ? 'bg-teal-600 text-white' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
            }`}
          >
            <Filter className="w-4 h-4" />
            Filters
          </button>
          <button
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
          <button
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
            <button
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
              <button onClick={() => setAssigningRequest(null)} className="p-1 hover:bg-zinc-800 rounded">
                <X className="w-5 h-5 text-zinc-400" />
              </button>
            </div>

            <div className="p-4">
              <p className="text-sm text-zinc-400 mb-4">
                Assigning: <span className="text-white">{assigningRequest.title}</span>
              </p>

              <div className="space-y-2">
                {editors.map(editor => (
                  <button
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
                <button
                  onClick={() => setAssigningRequest(null)}
                  className="px-4 py-2 bg-zinc-800 text-zinc-300 rounded-lg hover:bg-zinc-700"
                >
                  Cancel
                </button>
                <button
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

  return (
    <div
      className={`bg-zinc-800 border rounded-lg p-3 hover:border-zinc-600 transition-colors ${
        isOverdue ? 'border-red-500/50' : 'border-zinc-700'
      }`}
    >
      {/* Title & Priority */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <Link
          href={`/admin/video-editing/${request.id}`}
          className="text-sm font-medium text-white hover:text-teal-400 line-clamp-2"
        >
          {request.title}
        </Link>
        {request.priority > 0 && (
          <span className={`text-xs font-medium ${priority.color} shrink-0`}>
            {priority.label}
          </span>
        )}
      </div>

      {/* Client */}
      <div className="flex items-center gap-1.5 text-xs text-zinc-500 mb-2">
        <User className="w-3 h-3" />
        <span className="truncate">{request.user_email || 'Unknown'}</span>
      </div>

      {/* Revision badge */}
      {request.status === 'revision' && (
        <div className="flex items-center gap-1.5 text-xs text-amber-400 mb-2">
          <RotateCcw className="w-3 h-3" />
          <span>Revision #{request.revision_count}</span>
        </div>
      )}

      {/* Deadline */}
      {deadlineText && (
        <div className={`flex items-center gap-1.5 text-xs mb-2 ${isOverdue ? 'text-red-400' : 'text-zinc-500'}`}>
          {isOverdue ? <AlertTriangle className="w-3 h-3" /> : <Calendar className="w-3 h-3" />}
          <span>{deadlineText}</span>
        </div>
      )}

      {/* Editor */}
      {request.editor_email && (
        <div className="flex items-center gap-1.5 text-xs text-zinc-500 mb-2">
          <Users className="w-3 h-3" />
          <span className="truncate">{request.editor_email}</span>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 mt-3 pt-2 border-t border-zinc-700">
        {/* Quick Links */}
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

        {/* Status Actions */}
        {request.status === 'pending' && (
          <button
            onClick={onAssign}
            className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Assign
          </button>
        )}

        {request.status === 'assigned' && (
          <button
            onClick={() => onStatusChange(request.id, 'in_progress')}
            className="px-2 py-1 text-xs bg-amber-600 text-white rounded hover:bg-amber-700 flex items-center gap-1"
          >
            <Play className="w-3 h-3" />
            Start
          </button>
        )}

        {(request.status === 'in_progress' || request.status === 'revision') && (
          <button
            onClick={() => onStatusChange(request.id, 'review')}
            className="px-2 py-1 text-xs bg-purple-600 text-white rounded hover:bg-purple-700 flex items-center gap-1"
          >
            <Eye className="w-3 h-3" />
            Submit
          </button>
        )}

        {request.status === 'review' && (
          <button
            onClick={() => onStatusChange(request.id, 'completed')}
            className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 flex items-center gap-1"
          >
            <CheckCircle2 className="w-3 h-3" />
            Complete
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
