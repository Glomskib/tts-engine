'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Loader2, ExternalLink, Download,
  CheckCircle2, RotateCcw, Clock, Calendar,
  FileText, AlertTriangle, User, Timer
} from 'lucide-react';
import { useToast } from '@/contexts/ToastContext';

type RequestStatus = 'pending' | 'assigned' | 'in_progress' | 'review' | 'revision' | 'completed' | 'cancelled';

interface VideoRequest {
  id: string;
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
  revision_notes: string | null;
  created_at: string;
  updated_at: string;
  script_title?: string;
}

const PRIORITY_CONFIG: Record<number, { label: string; color: string; bgColor: string }> = {
  0: { label: 'Pool', color: 'text-slate-600', bgColor: 'bg-slate-100' },
  1: { label: 'Dedicated', color: 'text-blue-600', bgColor: 'bg-blue-100' },
  2: { label: 'Scale', color: 'text-violet-600', bgColor: 'bg-violet-100' },
};

const STATUS_CONFIG: Record<RequestStatus, { label: string; color: string; bgColor: string; borderColor: string }> = {
  pending: { label: 'Queued', color: 'text-violet-600', bgColor: 'bg-violet-100', borderColor: 'border-violet-200' },
  assigned: { label: 'Editor Assigned', color: 'text-indigo-600', bgColor: 'bg-indigo-100', borderColor: 'border-indigo-200' },
  in_progress: { label: 'Editing', color: 'text-blue-600', bgColor: 'bg-blue-100', borderColor: 'border-blue-200' },
  review: { label: 'Ready for Review', color: 'text-orange-600', bgColor: 'bg-orange-100', borderColor: 'border-orange-200' },
  revision: { label: 'Changes Requested', color: 'text-red-600', bgColor: 'bg-red-100', borderColor: 'border-red-200' },
  completed: { label: 'Approved', color: 'text-green-600', bgColor: 'bg-green-100', borderColor: 'border-green-200' },
  cancelled: { label: 'Cancelled', color: 'text-slate-500', bgColor: 'bg-slate-100', borderColor: 'border-slate-200' },
};

// Pipeline steps for the progress tracker
const PIPELINE_STEPS: { key: RequestStatus | 'revision'; label: string }[] = [
  { key: 'pending', label: 'Queued' },
  { key: 'assigned', label: 'Assigned' },
  { key: 'in_progress', label: 'Editing' },
  { key: 'review', label: 'Review' },
  { key: 'completed', label: 'Approved' },
];

const STATUS_ORDER: Record<string, number> = {
  pending: 0,
  assigned: 1,
  in_progress: 2,
  revision: 2, // same visual position as editing
  review: 3,
  completed: 4,
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

export default function ClientVideoReviewPage() {
  const params = useParams();
  const requestId = params.id as string;

  const { showError, showInfo } = useToast();
  const [request, setRequest] = useState<VideoRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Revision form state
  const [showRevisionForm, setShowRevisionForm] = useState(false);
  const [revisionNotes, setRevisionNotes] = useState('');

  useEffect(() => {
    const fetchRequest = async () => {
      try {
        const res = await fetch(`/api/client/my-videos/${requestId}`);
        const data = await res.json();

        if (data.ok) {
          setRequest(data.data);
        } else {
          setError(data.error || 'Request not found');
        }
      } catch (err) {
        console.error('Failed to fetch request:', err);
        setError('Failed to load request');
      } finally {
        setLoading(false);
      }
    };

    fetchRequest();
  }, [requestId]);

  const handleApprove = async () => {
    if (!confirm('Are you sure you want to approve this video? This will mark the request as complete.')) {
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/client/my-videos/${requestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve' }),
      });

      const data = await res.json();

      if (data.ok) {
        setRequest(data.data);
      } else {
        showError(data.error || 'Failed to approve');
      }
    } catch (err) {
      console.error('Approve error:', err);
      showError('Failed to approve video');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRevision = async () => {
    if (!revisionNotes.trim()) {
      showInfo('Please describe the changes you need');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/client/my-videos/${requestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'revision', revision_notes: revisionNotes }),
      });

      const data = await res.json();

      if (data.ok) {
        setRequest(data.data);
        setShowRevisionForm(false);
        setRevisionNotes('');
      } else {
        showError(data.error || 'Failed to request revision');
      }
    } catch (err) {
      console.error('Revision error:', err);
      showError('Failed to request revision');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="max-w-3xl mx-auto px-4 py-8">
          <div className="h-6 w-32 bg-slate-200 rounded animate-pulse mb-6" />
          <div className="h-8 w-64 bg-slate-200 rounded animate-pulse mb-3" />
          <div className="h-4 w-48 bg-slate-200 rounded animate-pulse mb-8" />
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <div className="flex gap-3 mb-6">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="flex-1">
                  <div className="h-2 bg-slate-200 rounded-full animate-pulse" />
                  <div className="h-3 w-12 bg-slate-200 rounded animate-pulse mt-2 mx-auto" />
                </div>
              ))}
            </div>
            <div className="space-y-4">
              <div className="h-20 bg-slate-100 rounded-lg animate-pulse" />
              <div className="h-20 bg-slate-100 rounded-lg animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !request) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="max-w-3xl mx-auto px-4 py-8">
          <Link
            href="/client/my-videos"
            className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to My Videos
          </Link>
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
            <AlertTriangle className="w-8 h-8 text-red-500 mx-auto mb-3" />
            <p className="text-red-700">{error || 'Request not found'}</p>
          </div>
        </div>
      </div>
    );
  }

  const statusConfig = STATUS_CONFIG[request.status];
  const canReview = request.status === 'review';
  const sla = formatSlaTimer(request.due_date, request.status);
  const currentStep = STATUS_ORDER[request.status] ?? 0;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Header */}
        <Link
          href="/client/my-videos"
          className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to My Videos
        </Link>

        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{request.title}</h1>
            <p className="text-sm text-slate-500 mt-1">
              Submitted {new Date(request.created_at).toLocaleDateString()}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {sla && (
              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${sla.color} ${sla.bgColor}`}>
                <Timer className="w-3 h-3" />
                {sla.text}
              </span>
            )}
            {PRIORITY_CONFIG[request.priority] && request.priority > 0 && (
              <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${PRIORITY_CONFIG[request.priority].bgColor} ${PRIORITY_CONFIG[request.priority].color}`}>
                {PRIORITY_CONFIG[request.priority].label}
              </span>
            )}
            <span className={`px-3 py-1.5 rounded-full text-sm font-medium ${statusConfig.bgColor} ${statusConfig.color}`}>
              {statusConfig.label}
            </span>
          </div>
        </div>

        {/* Editing Status Panel — Pipeline Progress Tracker */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 mb-6">
          <div className="flex items-center gap-1">
            {PIPELINE_STEPS.map((step, idx) => {
              const isCompleted = idx < currentStep;
              const isCurrent = idx === currentStep;
              const isRevision = isCurrent && request.status === 'revision';

              return (
                <div key={step.key} className="flex-1 flex flex-col items-center">
                  {/* Progress bar */}
                  <div className="w-full flex items-center">
                    {idx > 0 && (
                      <div className={`flex-1 h-1 rounded-full ${
                        isCompleted || isCurrent ? 'bg-teal-500' : 'bg-slate-200'
                      }`} />
                    )}
                    <div className={`w-3 h-3 rounded-full shrink-0 ${
                      isRevision
                        ? 'bg-red-500'
                        : isCompleted
                          ? 'bg-teal-500'
                          : isCurrent
                            ? 'bg-teal-500 ring-4 ring-teal-100'
                            : 'bg-slate-200'
                    }`} />
                    {idx < PIPELINE_STEPS.length - 1 && (
                      <div className={`flex-1 h-1 rounded-full ${
                        isCompleted ? 'bg-teal-500' : 'bg-slate-200'
                      }`} />
                    )}
                  </div>
                  {/* Label */}
                  <span className={`text-[11px] mt-2 text-center ${
                    isRevision
                      ? 'text-red-600 font-semibold'
                      : isCurrent
                        ? 'text-teal-700 font-semibold'
                        : isCompleted
                          ? 'text-teal-600'
                          : 'text-slate-400'
                  }`}>
                    {isRevision ? 'Changes Req.' : step.label}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Editor assignment + SLA info row */}
          <div className="flex items-center gap-4 mt-4 pt-4 border-t border-slate-100">
            {request.assigned_editor_id ? (
              <div className="flex items-center gap-1.5 text-sm text-indigo-600">
                <User className="w-4 h-4" />
                <span className="font-medium">Editor Assigned</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-sm text-slate-400">
                <User className="w-4 h-4" />
                <span>Awaiting editor</span>
              </div>
            )}
            {request.revision_count > 0 && (
              <div className="flex items-center gap-1.5 text-sm text-red-600">
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{request.revision_count} revision{request.revision_count !== 1 ? 's' : ''}</span>
              </div>
            )}
          </div>
        </div>

        {/* Review Banner */}
        {canReview && (
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-6 mb-6">
            <h2 className="text-lg font-semibold text-orange-900 mb-2">Your Video is Ready!</h2>
            <p className="text-orange-700 mb-4">
              Please review the edited video below. You can approve it or request changes.
            </p>

            {request.edited_drive_link && (
              <a
                href={request.edited_drive_link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors mb-4"
              >
                <ExternalLink className="w-4 h-4" />
                View Edited Video
              </a>
            )}

            {!showRevisionForm ? (
              <div className="flex gap-3 mt-4">
                <button type="button"
                  onClick={handleApprove}
                  disabled={submitting}
                  className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors font-medium"
                >
                  {submitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  Approve Video
                </button>
                <button type="button"
                  onClick={() => setShowRevisionForm(true)}
                  disabled={submitting}
                  className="flex items-center gap-2 px-6 py-3 bg-white text-red-600 border border-red-300 rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors font-medium"
                >
                  <RotateCcw className="w-4 h-4" />
                  Request Changes
                </button>
              </div>
            ) : (
              <div className="mt-4 p-4 bg-white rounded-lg border border-orange-200">
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  What changes do you need?
                </label>
                <textarea
                  value={revisionNotes}
                  onChange={(e) => setRevisionNotes(e.target.value)}
                  placeholder="Describe the specific changes you'd like (e.g., timing, music, text overlays, pacing)..."
                  rows={4}
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent resize-none"
                />
                <div className="flex gap-3 mt-4 justify-end">
                  <button type="button"
                    onClick={() => { setShowRevisionForm(false); setRevisionNotes(''); }}
                    className="px-4 py-2 text-slate-600 hover:text-slate-900"
                  >
                    Cancel
                  </button>
                  <button type="button"
                    onClick={handleRevision}
                    disabled={submitting || !revisionNotes.trim()}
                    className="flex items-center gap-2 px-5 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors font-medium"
                  >
                    {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                    Submit Changes
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Completed Banner */}
        {request.status === 'completed' && request.edited_drive_link && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-6 mb-6">
            <div className="flex items-center gap-3 mb-3">
              <CheckCircle2 className="w-6 h-6 text-green-600" />
              <h2 className="text-lg font-semibold text-green-900">Video Approved</h2>
            </div>
            <p className="text-green-700 mb-4">
              Your video has been approved and is ready for use.
            </p>
            <a
              href={request.edited_drive_link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <Download className="w-4 h-4" />
              Download Video
            </a>
          </div>
        )}

        {/* In Progress Status */}
        {(request.status === 'pending' || request.status === 'assigned' || request.status === 'in_progress' || request.status === 'revision') && (
          <div className={`rounded-xl p-6 mb-6 border ${
            request.status === 'revision'
              ? 'bg-red-50 border-red-200'
              : request.status === 'in_progress'
                ? 'bg-blue-50 border-blue-200'
                : 'bg-slate-50 border-slate-200'
          }`}>
            <div className="flex items-center gap-3 mb-2">
              <Clock className={`w-5 h-5 ${
                request.status === 'revision' ? 'text-red-600' : request.status === 'in_progress' ? 'text-blue-600' : 'text-slate-600'
              }`} />
              <h2 className={`text-lg font-semibold ${
                request.status === 'revision' ? 'text-red-900' : request.status === 'in_progress' ? 'text-blue-900' : 'text-slate-900'
              }`}>
                {request.status === 'revision'
                  ? 'Working on Your Changes'
                  : request.status === 'in_progress'
                    ? 'Currently Editing'
                    : request.status === 'assigned'
                      ? 'Editor Assigned'
                      : 'In Queue'
                }
              </h2>
            </div>
            <p className={
              request.status === 'revision' ? 'text-red-700' : request.status === 'in_progress' ? 'text-blue-700' : 'text-slate-600'
            }>
              {request.status === 'revision'
                ? "Your revision request has been received. The editor is working on the changes."
                : request.status === 'in_progress'
                  ? "Your video is currently being edited. We'll notify you when it's ready for review."
                  : request.status === 'assigned'
                    ? "An editor has been assigned and will begin editing soon."
                    : "Your request is in the queue. An editor will be assigned shortly."
              }
            </p>
          </div>
        )}

        {/* Deliverables */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-6">
          <div className="p-5 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">Deliverables</h3>
          </div>

          {/* Edited video */}
          {request.edited_drive_link ? (
            <a
              href={request.edited_drive_link}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-4 p-5 border-b border-slate-100 hover:bg-green-50/50 transition-colors"
            >
              <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center shrink-0">
                <Download className="w-5 h-5 text-green-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-green-800">Edited Video</p>
                <p className="text-sm text-green-600">Ready to download</p>
              </div>
              <ExternalLink className="w-4 h-4 text-green-500 shrink-0" />
            </a>
          ) : (
            <div className="flex items-center gap-4 p-5 border-b border-slate-100">
              <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                <Clock className="w-5 h-5 text-slate-400" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-slate-500">Edited Video</p>
                <p className="text-sm text-slate-400">Not yet delivered</p>
              </div>
            </div>
          )}

          {/* Source files */}
          <a
            href={request.source_drive_link}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-4 p-5 hover:bg-slate-50 transition-colors"
          >
            <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
              <ExternalLink className="w-5 h-5 text-slate-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-slate-700">Source Files</p>
              <p className="text-sm text-slate-500">Your uploaded footage</p>
            </div>
            <ExternalLink className="w-4 h-4 text-slate-400 shrink-0" />
          </a>
        </div>

        {/* Request Details */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Description */}
          {request.description && (
            <div className="p-6 border-b border-slate-100">
              <h3 className="text-sm font-medium text-slate-500 mb-2">Description</h3>
              <p className="text-slate-800 whitespace-pre-wrap">{request.description}</p>
            </div>
          )}

          {/* Script */}
          {request.script_title && (
            <div className="p-6 border-b border-slate-100">
              <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
                <FileText className="w-4 h-4" />
                Script
              </div>
              <p className="text-slate-800">{request.script_title}</p>
            </div>
          )}

          {/* Revision History */}
          {request.revision_count > 0 && request.revision_notes && (
            <div className="p-6 border-b border-slate-100 bg-red-50/50">
              <h3 className="text-sm font-medium text-red-700 flex items-center gap-2 mb-2">
                <RotateCcw className="w-4 h-4" />
                Last Revision Request (#{request.revision_count})
              </h3>
              <p className="text-red-800 whitespace-pre-wrap text-sm">{request.revision_notes}</p>
            </div>
          )}

          {/* Metadata */}
          <div className="p-6 bg-slate-50">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-slate-500">Request ID</div>
                <div className="font-mono text-slate-700">{request.id.slice(0, 8)}</div>
              </div>
              {request.due_date && (
                <div>
                  <div className="text-slate-500 flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    Due Date
                  </div>
                  <div className={sla?.color.includes('red') ? 'text-red-700 font-medium' : 'text-slate-700'}>
                    {new Date(request.due_date).toLocaleDateString()}
                  </div>
                </div>
              )}
              {request.completed_at && (
                <div>
                  <div className="text-slate-500">Completed</div>
                  <div className="text-green-700">
                    {new Date(request.completed_at).toLocaleDateString()}
                  </div>
                </div>
              )}
              {request.revision_count > 0 && (
                <div>
                  <div className="text-slate-500">Revisions</div>
                  <div className="text-slate-700">{request.revision_count}</div>
                </div>
              )}
              {PRIORITY_CONFIG[request.priority] && (
                <div>
                  <div className="text-slate-500">Priority</div>
                  <div className={PRIORITY_CONFIG[request.priority].color}>
                    {PRIORITY_CONFIG[request.priority].label}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
