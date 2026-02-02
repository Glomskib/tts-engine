'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Loader2, ExternalLink, Download, Upload,
  User, Calendar, Clock, CheckCircle2, AlertTriangle,
  Play, Eye, RotateCcw, MessageSquare, FileText,
  Users, Send, X, Edit3
} from 'lucide-react';
import { useToast } from '@/contexts/ToastContext';

type RequestStatus = 'pending' | 'assigned' | 'in_progress' | 'review' | 'revision' | 'completed' | 'cancelled';

interface VideoRequest {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  script_id: string | null;
  source_drive_link: string;
  edited_drive_link: string | null;
  status: RequestStatus;
  assigned_editor_id: string | null;
  assigned_at: string | null;
  priority: number;
  due_date: string | null;
  completed_at: string | null;
  revision_count: number;
  revision_notes: string | null;
  created_at: string;
  updated_at: string;
  user_email?: string;
  editor_email?: string;
  script_title?: string;
  script_content?: string;
  activity?: Array<{
    action: string;
    timestamp: string;
    actor?: string;
    details?: string;
  }>;
}

interface Editor {
  id: string;
  email: string;
  assigned_count: number;
  completed_count: number;
}

const STATUS_CONFIG: Record<RequestStatus, { label: string; color: string; bgColor: string }> = {
  pending: { label: 'Pending', color: '#6b7280', bgColor: 'bg-zinc-700' },
  assigned: { label: 'Assigned', color: '#3b82f6', bgColor: 'bg-blue-600' },
  in_progress: { label: 'In Progress', color: '#f59e0b', bgColor: 'bg-amber-600' },
  review: { label: 'In Review', color: '#8b5cf6', bgColor: 'bg-purple-600' },
  revision: { label: 'Needs Revision', color: '#f97316', bgColor: 'bg-orange-600' },
  completed: { label: 'Completed', color: '#10b981', bgColor: 'bg-green-600' },
  cancelled: { label: 'Cancelled', color: '#ef4444', bgColor: 'bg-red-600' },
};

const PRIORITY_CONFIG: Record<number, { label: string; color: string }> = {
  0: { label: 'Normal', color: 'text-zinc-400 bg-zinc-700' },
  1: { label: 'High', color: 'text-amber-400 bg-amber-900/50' },
  2: { label: 'Urgent', color: 'text-red-400 bg-red-900/50' },
};

export default function VideoRequestDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { showSuccess, showError } = useToast();
  const requestId = params.id as string;

  const [request, setRequest] = useState<VideoRequest | null>(null);
  const [editors, setEditors] = useState<Editor[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  // Modals
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showDeliveryModal, setShowDeliveryModal] = useState(false);
  const [showRevisionModal, setShowRevisionModal] = useState(false);

  // Form state
  const [selectedEditor, setSelectedEditor] = useState<string>('');
  const [deliveryLink, setDeliveryLink] = useState('');
  const [revisionNotes, setRevisionNotes] = useState('');
  const [editingDeadline, setEditingDeadline] = useState(false);
  const [newDeadline, setNewDeadline] = useState('');
  const [editingPriority, setEditingPriority] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [requestRes, editorsRes] = await Promise.all([
        fetch(`/api/admin/video-requests/${requestId}`),
        fetch('/api/admin/editors'),
      ]);

      const requestData = await requestRes.json();
      const editorsData = await editorsRes.json();

      if (requestData.ok) {
        setRequest(requestData.data);
        setNewDeadline(requestData.data.due_date?.split('T')[0] || '');
      } else {
        showError('Request not found');
        router.push('/admin/video-editing');
      }

      if (editorsData.ok) {
        setEditors(editorsData.data);
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
      showError('Failed to load request');
    } finally {
      setLoading(false);
    }
  }, [requestId, router, showError]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const updateRequest = async (updates: Record<string, unknown>) => {
    setUpdating(true);
    try {
      const res = await fetch(`/api/admin/video-requests/${requestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      if (res.ok) {
        const data = await res.json();
        setRequest(prev => prev ? { ...prev, ...data.data } : prev);
        showSuccess('Request updated');
        return true;
      } else {
        showError('Failed to update request');
        return false;
      }
    } catch (error) {
      console.error('Update error:', error);
      showError('Failed to update request');
      return false;
    } finally {
      setUpdating(false);
    }
  };

  const handleAssign = async () => {
    if (!selectedEditor) return;
    const success = await updateRequest({
      assigned_editor_id: selectedEditor,
      status: 'assigned',
    });
    if (success) {
      const editor = editors.find(e => e.id === selectedEditor);
      setRequest(prev => prev ? {
        ...prev,
        assigned_editor_id: selectedEditor,
        status: 'assigned',
        editor_email: editor?.email,
      } : prev);
      setShowAssignModal(false);
    }
  };

  const handleStatusChange = async (newStatus: RequestStatus) => {
    await updateRequest({ status: newStatus });
    setRequest(prev => prev ? { ...prev, status: newStatus } : prev);
  };

  const handleDelivery = async () => {
    if (!deliveryLink) return;
    const success = await updateRequest({
      edited_drive_link: deliveryLink,
      status: 'review',
    });
    if (success) {
      setRequest(prev => prev ? {
        ...prev,
        edited_drive_link: deliveryLink,
        status: 'review',
      } : prev);
      setShowDeliveryModal(false);
      setDeliveryLink('');
    }
  };

  const handleRevision = async () => {
    const success = await updateRequest({
      status: 'revision',
      revision_notes: revisionNotes,
    });
    if (success) {
      setRequest(prev => prev ? {
        ...prev,
        status: 'revision',
        revision_notes: revisionNotes,
        revision_count: (prev.revision_count || 0) + 1,
      } : prev);
      setShowRevisionModal(false);
      setRevisionNotes('');
    }
  };

  const handleDeadlineUpdate = async () => {
    const success = await updateRequest({
      due_date: newDeadline ? new Date(newDeadline).toISOString() : null,
    });
    if (success) {
      setRequest(prev => prev ? {
        ...prev,
        due_date: newDeadline ? new Date(newDeadline).toISOString() : null,
      } : prev);
      setEditingDeadline(false);
    }
  };

  const handlePriorityUpdate = async (priority: number) => {
    const success = await updateRequest({ priority });
    if (success) {
      setRequest(prev => prev ? { ...prev, priority } : prev);
      setEditingPriority(false);
    }
  };

  if (loading || !request) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-teal-500" />
      </div>
    );
  }

  const statusConfig = STATUS_CONFIG[request.status];
  const priorityConfig = PRIORITY_CONFIG[request.priority] || PRIORITY_CONFIG[0];
  const isOverdue = request.due_date && new Date(request.due_date) < new Date() && request.status !== 'completed';

  return (
    <div className="pb-24 lg:pb-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link
          href="/admin/video-editing"
          className="p-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-zinc-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-white">{request.title}</h1>
          <p className="text-sm text-zinc-400">Request #{request.id.slice(0, 8)}</p>
        </div>
        <span className={`px-3 py-1 rounded-full text-sm font-medium ${statusConfig.bgColor} text-white`}>
          {statusConfig.label}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Description */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <h2 className="text-sm font-semibold text-zinc-400 mb-3">Description</h2>
            <p className="text-white whitespace-pre-wrap">
              {request.description || 'No description provided'}
            </p>
          </div>

          {/* Script Preview */}
          {request.script_content && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-zinc-400 flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Script: {request.script_title}
                </h2>
              </div>
              <div className="bg-zinc-800 rounded-lg p-4 max-h-64 overflow-y-auto">
                <pre className="text-sm text-zinc-300 whitespace-pre-wrap font-mono">
                  {request.script_content}
                </pre>
              </div>
            </div>
          )}

          {/* Revision Notes */}
          {request.revision_notes && (
            <div className="bg-orange-900/20 border border-orange-500/30 rounded-xl p-4">
              <h2 className="text-sm font-semibold text-orange-400 flex items-center gap-2 mb-3">
                <RotateCcw className="w-4 h-4" />
                Revision Notes (#{request.revision_count})
              </h2>
              <p className="text-orange-200 whitespace-pre-wrap">
                {request.revision_notes}
              </p>
            </div>
          )}

          {/* Drive Links */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <h2 className="text-sm font-semibold text-zinc-400 mb-3">Files</h2>
            <div className="space-y-3">
              <a
                href={request.source_drive_link}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 p-3 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors"
              >
                <ExternalLink className="w-5 h-5 text-blue-400" />
                <div className="flex-1">
                  <p className="text-white font-medium">Source Files</p>
                  <p className="text-xs text-zinc-500">Raw footage from client</p>
                </div>
                <span className="text-xs text-zinc-500">Open →</span>
              </a>

              {request.edited_drive_link ? (
                <a
                  href={request.edited_drive_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-3 bg-green-900/20 hover:bg-green-900/30 border border-green-500/30 rounded-lg transition-colors"
                >
                  <Download className="w-5 h-5 text-green-400" />
                  <div className="flex-1">
                    <p className="text-green-400 font-medium">Edited Video</p>
                    <p className="text-xs text-green-400/60">Ready for review</p>
                  </div>
                  <span className="text-xs text-green-400/60">Download →</span>
                </a>
              ) : (
                <div className="flex items-center gap-3 p-3 bg-zinc-800/50 rounded-lg border border-dashed border-zinc-700">
                  <Upload className="w-5 h-5 text-zinc-600" />
                  <div className="flex-1">
                    <p className="text-zinc-500 font-medium">Edited Video</p>
                    <p className="text-xs text-zinc-600">Not yet delivered</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Activity Timeline */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <h2 className="text-sm font-semibold text-zinc-400 mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Activity
            </h2>
            <div className="space-y-3">
              {(request.activity || []).filter(Boolean).map((event, idx) => (
                <div key={idx} className="flex gap-3 text-sm">
                  <div className="w-2 h-2 mt-2 rounded-full bg-zinc-600" />
                  <div>
                    <p className="text-white capitalize">{event.action.replace(/_/g, ' ')}</p>
                    {event.details && <p className="text-zinc-500">{event.details}</p>}
                    <p className="text-xs text-zinc-600">
                      {new Date(event.timestamp).toLocaleString()}
                      {event.actor && ` • ${event.actor}`}
                    </p>
                  </div>
                </div>
              ))}
              <div className="flex gap-3 text-sm">
                <div className="w-2 h-2 mt-2 rounded-full bg-zinc-600" />
                <div>
                  <p className="text-white">Request Created</p>
                  <p className="text-xs text-zinc-600">
                    {new Date(request.created_at).toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Quick Actions */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-zinc-400 mb-3">Actions</h3>
            <div className="space-y-2">
              {request.status === 'pending' && (
                <button
                  onClick={() => setShowAssignModal(true)}
                  className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2"
                >
                  <Users className="w-4 h-4" />
                  Assign Editor
                </button>
              )}

              {request.status === 'assigned' && (
                <button
                  onClick={() => handleStatusChange('in_progress')}
                  disabled={updating}
                  className="w-full px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <Play className="w-4 h-4" />
                  Start Editing
                </button>
              )}

              {(request.status === 'in_progress' || request.status === 'revision') && (
                <button
                  onClick={() => setShowDeliveryModal(true)}
                  className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 flex items-center justify-center gap-2"
                >
                  <Send className="w-4 h-4" />
                  Submit for Review
                </button>
              )}

              {request.status === 'review' && (
                <>
                  <button
                    onClick={() => handleStatusChange('completed')}
                    disabled={updating}
                    className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Approve & Complete
                  </button>
                  <button
                    onClick={() => setShowRevisionModal(true)}
                    className="w-full px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 flex items-center justify-center gap-2"
                  >
                    <RotateCcw className="w-4 h-4" />
                    Request Revision
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Details */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-zinc-400 mb-3">Details</h3>
            <div className="space-y-3">
              {/* Client */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-zinc-500 flex items-center gap-2">
                  <User className="w-4 h-4" />
                  Client
                </span>
                <span className="text-sm text-white">{request.user_email || 'Unknown'}</span>
              </div>

              {/* Editor */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-zinc-500 flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  Editor
                </span>
                {request.editor_email ? (
                  <span className="text-sm text-white">{request.editor_email}</span>
                ) : (
                  <button
                    onClick={() => setShowAssignModal(true)}
                    className="text-sm text-blue-400 hover:text-blue-300"
                  >
                    Assign
                  </button>
                )}
              </div>

              {/* Priority */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-zinc-500 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  Priority
                </span>
                {editingPriority ? (
                  <div className="flex gap-1">
                    {[0, 1, 2].map(p => (
                      <button
                        key={p}
                        onClick={() => handlePriorityUpdate(p)}
                        className={`px-2 py-0.5 text-xs rounded ${PRIORITY_CONFIG[p].color}`}
                      >
                        {PRIORITY_CONFIG[p].label}
                      </button>
                    ))}
                  </div>
                ) : (
                  <button
                    onClick={() => setEditingPriority(true)}
                    className={`px-2 py-0.5 text-xs rounded ${priorityConfig.color}`}
                  >
                    {priorityConfig.label}
                  </button>
                )}
              </div>

              {/* Deadline */}
              <div className="flex items-center justify-between">
                <span className={`text-sm flex items-center gap-2 ${isOverdue ? 'text-red-400' : 'text-zinc-500'}`}>
                  <Calendar className="w-4 h-4" />
                  Deadline
                </span>
                {editingDeadline ? (
                  <div className="flex gap-1">
                    <input
                      type="date"
                      value={newDeadline}
                      onChange={(e) => setNewDeadline(e.target.value)}
                      className="px-2 py-0.5 text-xs bg-zinc-800 border border-zinc-700 rounded text-white"
                    />
                    <button
                      onClick={handleDeadlineUpdate}
                      className="px-2 py-0.5 text-xs bg-teal-600 text-white rounded"
                    >
                      Save
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setEditingDeadline(true)}
                    className={`text-sm ${isOverdue ? 'text-red-400' : 'text-white'}`}
                  >
                    {request.due_date
                      ? new Date(request.due_date).toLocaleDateString()
                      : 'Set deadline'}
                  </button>
                )}
              </div>

              {/* Created */}
              <div className="flex items-center justify-between">
                <span className="text-sm text-zinc-500 flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Created
                </span>
                <span className="text-sm text-white">
                  {new Date(request.created_at).toLocaleDateString()}
                </span>
              </div>

              {/* Completed */}
              {request.completed_at && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-green-500 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" />
                    Completed
                  </span>
                  <span className="text-sm text-green-400">
                    {new Date(request.completed_at).toLocaleDateString()}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Assign Modal */}
      {showAssignModal && (
        <Modal title="Assign Editor" onClose={() => setShowAssignModal(false)}>
          <div className="space-y-3">
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
              onClick={() => setShowAssignModal(false)}
              className="px-4 py-2 bg-zinc-800 text-zinc-300 rounded-lg hover:bg-zinc-700"
            >
              Cancel
            </button>
            <button
              onClick={handleAssign}
              disabled={!selectedEditor || updating}
              className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 flex items-center gap-2"
            >
              {updating && <Loader2 className="w-4 h-4 animate-spin" />}
              Assign
            </button>
          </div>
        </Modal>
      )}

      {/* Delivery Modal */}
      {showDeliveryModal && (
        <Modal title="Submit for Review" onClose={() => setShowDeliveryModal(false)}>
          <p className="text-sm text-zinc-400 mb-4">
            Enter the Google Drive link to the edited video file.
          </p>
          <input
            type="url"
            value={deliveryLink}
            onChange={(e) => setDeliveryLink(e.target.value)}
            placeholder="https://drive.google.com/..."
            className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500"
          />
          <div className="flex justify-end gap-3 mt-6">
            <button
              onClick={() => setShowDeliveryModal(false)}
              className="px-4 py-2 bg-zinc-800 text-zinc-300 rounded-lg hover:bg-zinc-700"
            >
              Cancel
            </button>
            <button
              onClick={handleDelivery}
              disabled={!deliveryLink || updating}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2"
            >
              {updating && <Loader2 className="w-4 h-4 animate-spin" />}
              Submit
            </button>
          </div>
        </Modal>
      )}

      {/* Revision Modal */}
      {showRevisionModal && (
        <Modal title="Request Revision" onClose={() => setShowRevisionModal(false)}>
          <p className="text-sm text-zinc-400 mb-4">
            Describe what changes are needed for this video.
          </p>
          <textarea
            value={revisionNotes}
            onChange={(e) => setRevisionNotes(e.target.value)}
            placeholder="Please make the following changes..."
            rows={4}
            className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 resize-none"
          />
          <div className="flex justify-end gap-3 mt-6">
            <button
              onClick={() => setShowRevisionModal(false)}
              className="px-4 py-2 bg-zinc-800 text-zinc-300 rounded-lg hover:bg-zinc-700"
            >
              Cancel
            </button>
            <button
              onClick={handleRevision}
              disabled={!revisionNotes || updating}
              className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 flex items-center gap-2"
            >
              {updating && <Loader2 className="w-4 h-4 animate-spin" />}
              Request Revision
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// Modal Component
function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-xl shadow-xl">
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          <button onClick={onClose} className="p-1 hover:bg-zinc-800 rounded">
            <X className="w-5 h-5 text-zinc-400" />
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}
