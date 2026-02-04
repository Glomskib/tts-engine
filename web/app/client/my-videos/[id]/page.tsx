'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Loader2, ExternalLink, Download,
  CheckCircle2, RotateCcw, Clock, Calendar,
  FileText, AlertTriangle
} from 'lucide-react';

type RequestStatus = 'pending' | 'assigned' | 'in_progress' | 'review' | 'revision' | 'completed' | 'cancelled';

interface VideoRequest {
  id: string;
  title: string;
  description: string | null;
  source_drive_link: string;
  edited_drive_link: string | null;
  status: RequestStatus;
  priority: number;
  due_date: string | null;
  completed_at: string | null;
  revision_count: number;
  revision_notes: string | null;
  created_at: string;
  script_title?: string;
}

const STATUS_CONFIG: Record<RequestStatus, { label: string; color: string; bgColor: string }> = {
  pending: { label: 'Pending', color: 'text-zinc-600', bgColor: 'bg-zinc-100' },
  assigned: { label: 'Assigned', color: 'text-blue-600', bgColor: 'bg-blue-100' },
  in_progress: { label: 'In Progress', color: 'text-amber-600', bgColor: 'bg-amber-100' },
  review: { label: 'Ready for Review', color: 'text-purple-600', bgColor: 'bg-purple-100' },
  revision: { label: 'Revision Requested', color: 'text-orange-600', bgColor: 'bg-orange-100' },
  completed: { label: 'Completed', color: 'text-green-600', bgColor: 'bg-green-100' },
  cancelled: { label: 'Cancelled', color: 'text-red-600', bgColor: 'bg-red-100' },
};

export default function ClientVideoReviewPage() {
  const params = useParams();
  const requestId = params.id as string;

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
        alert(data.error || 'Failed to approve');
      }
    } catch (err) {
      console.error('Approve error:', err);
      alert('Failed to approve video');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRevision = async () => {
    if (!revisionNotes.trim()) {
      alert('Please describe the changes you need');
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
        alert(data.error || 'Failed to request revision');
      }
    } catch (err) {
      console.error('Revision error:', err);
      alert('Failed to request revision');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (error || !request) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="max-w-3xl mx-auto px-4 py-8">
          <Link
            href="/client"
            className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
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

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Header */}
        <Link
          href="/client"
          className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </Link>

        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{request.title}</h1>
            <p className="text-sm text-slate-500 mt-1">
              Submitted {new Date(request.created_at).toLocaleDateString()}
            </p>
          </div>
          <span className={`px-3 py-1.5 rounded-full text-sm font-medium ${statusConfig.bgColor} ${statusConfig.color}`}>
            {statusConfig.label}
          </span>
        </div>

        {/* Review Banner */}
        {canReview && (
          <div className="bg-purple-50 border border-purple-200 rounded-xl p-6 mb-6">
            <h2 className="text-lg font-semibold text-purple-900 mb-2">Your Video is Ready!</h2>
            <p className="text-purple-700 mb-4">
              Please review the edited video below. You can approve it or request revisions.
            </p>

            {request.edited_drive_link && (
              <a
                href={request.edited_drive_link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors mb-4"
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
                  className="flex items-center gap-2 px-6 py-3 bg-white text-orange-600 border border-orange-300 rounded-lg hover:bg-orange-50 disabled:opacity-50 transition-colors font-medium"
                >
                  <RotateCcw className="w-4 h-4" />
                  Request Revisions
                </button>
              </div>
            ) : (
              <div className="mt-4 p-4 bg-white rounded-lg border border-purple-200">
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  What changes do you need?
                </label>
                <textarea
                  value={revisionNotes}
                  onChange={(e) => setRevisionNotes(e.target.value)}
                  placeholder="Please describe the changes you'd like..."
                  rows={4}
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                />
                <div className="flex gap-3 mt-4">
                  <button type="button"
                    onClick={handleRevision}
                    disabled={submitting || !revisionNotes.trim()}
                    className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 transition-colors"
                  >
                    {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                    Submit Revision Request
                  </button>
                  <button type="button"
                    onClick={() => { setShowRevisionForm(false); setRevisionNotes(''); }}
                    className="px-4 py-2 text-slate-600 hover:text-slate-900"
                  >
                    Cancel
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
              <h2 className="text-lg font-semibold text-green-900">Video Complete</h2>
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
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 mb-6">
            <div className="flex items-center gap-3 mb-2">
              <Clock className="w-5 h-5 text-blue-600" />
              <h2 className="text-lg font-semibold text-blue-900">In Progress</h2>
            </div>
            <p className="text-blue-700">
              {request.status === 'revision'
                ? "Your revision request has been received. Our editor is working on the changes."
                : "Your video is currently being edited. We'll notify you when it's ready for review."
              }
            </p>
          </div>
        )}

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

          {/* Source Files */}
          <div className="p-6 border-b border-slate-100">
            <h3 className="text-sm font-medium text-slate-500 mb-2">Source Files</h3>
            <a
              href={request.source_drive_link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-800"
            >
              <ExternalLink className="w-4 h-4" />
              View Original Files
            </a>
          </div>

          {/* Revision History */}
          {request.revision_count > 0 && request.revision_notes && (
            <div className="p-6 border-b border-slate-100 bg-orange-50">
              <h3 className="text-sm font-medium text-orange-700 mb-2">
                Last Revision Request (#{request.revision_count})
              </h3>
              <p className="text-orange-800 whitespace-pre-wrap">{request.revision_notes}</p>
            </div>
          )}

          {/* Metadata */}
          <div className="p-6 bg-slate-50">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-slate-500">Request ID</div>
                <div className="font-mono text-slate-700">{request.id.slice(0, 8)}...</div>
              </div>
              {request.due_date && (
                <div>
                  <div className="text-slate-500 flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    Due Date
                  </div>
                  <div className="text-slate-700">
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
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
