'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  RefreshCw,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  FileText,
  Clock,
  User,
  Shield,
  Loader2,
  ExternalLink,
  Unlock,
  Paperclip,
  Save,
} from 'lucide-react';
import { useHydrated, getTimeAgo, formatDateString } from '@/lib/useHydrated';
import { Breadcrumbs } from '@/components/ui/Breadcrumbs';
import AdminPageLayout, { AdminCard } from '@/app/admin/components/AdminPageLayout';
import { getStatusConfig, formatStatusLabel } from '@/lib/status';

// ─── Types ──────────────────────────────────────────────────────

interface ClaimedVideo {
  id: string;
  claimed_by: string;
  claimed_at: string;
  claim_expires_at: string;
}

interface VideoEvent {
  id: string;
  video_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  correlation_id: string;
  actor: string;
  created_at: string;
}

interface VideoDetail {
  id: string;
  script_id: string | null;
  script_locked_json: Record<string, unknown> | null;
  script_locked_text: string | null;
  status: string | null;
  recording_status: string;
  recorded_at: string | null;
  edited_at: string | null;
  ready_to_post_at: string | null;
  posted_at: string | null;
  rejected_at: string | null;
  recording_notes: string | null;
  editor_notes: string | null;
  uploader_notes: string | null;
  posted_url: string | null;
  posted_platform: string | null;
  posted_account: string | null;
  posted_at_local: string | null;
  posting_error: string | null;
  last_status_changed_at: string | null;
}

interface ScriptInfo {
  id: string;
  title: string | null;
  status: string;
  version: number;
}

interface Script {
  id: string;
  title: string | null;
  status: string;
  version: number;
  script_text: string | null;
}

interface TimelineItem {
  ts: string;
  type: 'event' | 'assignment' | 'video_snapshot';
  label: string;
  metadata: Record<string, unknown>;
}

const RECORDING_STATUSES = ['NEEDS_SCRIPT', 'GENERATING_SCRIPT', 'NOT_RECORDED', 'AI_RENDERING', 'RECORDED', 'READY_TO_POST', 'POSTED', 'REJECTED'] as const;
const PLATFORMS = ['tiktok', 'instagram', 'youtube', 'other'] as const;

// ─── Status badge styles ────────────────────────────────────────

// Uses centralized status config from @/lib/status

function StatusBadge({ status }: { status: string | null }) {
  const s = getStatusConfig(status);
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {formatStatusLabel(status)}
    </span>
  );
}

// ─── Reusable components ────────────────────────────────────────

const inputClass = 'w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent';
const selectClass = inputClass;
const textareaClass = `${inputClass} resize-vertical min-h-[60px]`;
const btnPrimary = 'inline-flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors';
const btnDanger = 'inline-flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors';
const btnSecondary = 'inline-flex items-center gap-2 px-4 py-2 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 text-zinc-200 text-sm font-medium rounded-lg transition-colors';
const btnGhost = 'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors';

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2">
      <span className="text-xs font-medium text-zinc-500 w-28 shrink-0 pt-0.5">{label}</span>
      <span className="text-sm text-zinc-200 min-w-0">{children}</span>
    </div>
  );
}

function MessageBanner({ type, children }: { type: 'success' | 'error' | 'warning' | 'info'; children: React.ReactNode }) {
  const styles = {
    success: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
    error: 'bg-red-500/10 border-red-500/20 text-red-400',
    warning: 'bg-amber-500/10 border-amber-500/20 text-amber-400',
    info: 'bg-blue-500/10 border-blue-500/20 text-blue-400',
  };
  return (
    <div className={`px-4 py-3 rounded-lg border text-sm ${styles[type]}`}>
      {children}
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────

export default function VideoDetailPage() {
  const params = useParams();
  const videoId = params.id as string;
  const hydrated = useHydrated();

  const [adminEnabled, setAdminEnabled] = useState<boolean | null>(null);
  const [claimedInfo, setClaimedInfo] = useState<ClaimedVideo | null>(null);
  const [videoDetail, setVideoDetail] = useState<VideoDetail | null>(null);
  const [linkedScript, setLinkedScript] = useState<ScriptInfo | null>(null);
  const [events, setEvents] = useState<VideoEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [releasing, setReleasing] = useState(false);
  const [releaseMessage, setReleaseMessage] = useState<string | null>(null);

  // Script attachment state
  const [showAttachScript, setShowAttachScript] = useState(false);
  const [availableScripts, setAvailableScripts] = useState<Script[]>([]);
  const [scriptsLoading, setScriptsLoading] = useState(false);
  const [selectedScriptId, setSelectedScriptId] = useState<string>('');
  const [attaching, setAttaching] = useState(false);
  const [attachMessage, setAttachMessage] = useState<string | null>(null);
  const [forceOverwrite, setForceOverwrite] = useState(false);

  // Execution tracking state
  const [executionForm, setExecutionForm] = useState({
    recording_status: 'NOT_RECORDED',
    recording_notes: '',
    editor_notes: '',
    uploader_notes: '',
    posted_url: '',
    posted_platform: '',
    posted_account: '',
    posted_at_local: '',
    posting_error: '',
  });
  const [savingExecution, setSavingExecution] = useState(false);
  const [executionMessage, setExecutionMessage] = useState<string | null>(null);

  // Timeline state
  const [timelineItems, setTimelineItems] = useState<TimelineItem[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);

  // Admin Actions state
  const [showAdminActions, setShowAdminActions] = useState(false);
  const [adminActionLoading, setAdminActionLoading] = useState(false);
  const [adminActionMessage, setAdminActionMessage] = useState<string | null>(null);
  const [forceStatusTarget, setForceStatusTarget] = useState('');
  const [forceStatusReason, setForceStatusReason] = useState('');
  const [forceStatusPostedUrl, setForceStatusPostedUrl] = useState('');
  const [forceStatusPostedPlatform, setForceStatusPostedPlatform] = useState('');
  const [clearClaimReason, setClearClaimReason] = useState('');
  const [resetMode, setResetMode] = useState<'expire' | 'unassign'>('expire');
  const [resetReason, setResetReason] = useState('');
  const [showConfirmModal, setShowConfirmModal] = useState<'clear-claim' | 'reset' | null>(null);

  // Script expand state
  const [scriptExpanded, setScriptExpanded] = useState(false);

  const checkAdminEnabled = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/enabled');
      const data = await res.json();
      setAdminEnabled(data.enabled === true);
    } catch {
      setAdminEnabled(false);
    }
  }, []);

  const fetchData = useCallback(async () => {
    if (!videoId) return;
    setLoading(true);
    try {
      const [claimedRes, eventsRes, videoRes] = await Promise.all([
        fetch('/api/observability/claimed'),
        fetch(`/api/videos/${videoId}/events`),
        fetch(`/api/videos/${videoId}`),
      ]);

      const [claimedData, eventsData, videoData] = await Promise.all([
        claimedRes.json(),
        eventsRes.json(),
        videoRes.json(),
      ]);

      if (claimedData.ok && claimedData.data) {
        const claimed = claimedData.data.find((v: ClaimedVideo) => v.id === videoId);
        setClaimedInfo(claimed || null);
      }

      if (eventsData.ok && eventsData.data) {
        setEvents(eventsData.data);
      }

      if (videoData.ok && videoData.data) {
        setVideoDetail(videoData.data);
        setExecutionForm({
          recording_status: videoData.data.recording_status || 'NOT_RECORDED',
          recording_notes: videoData.data.recording_notes || '',
          editor_notes: videoData.data.editor_notes || '',
          uploader_notes: videoData.data.uploader_notes || '',
          posted_url: videoData.data.posted_url || '',
          posted_platform: videoData.data.posted_platform || '',
          posted_account: videoData.data.posted_account || '',
          posted_at_local: videoData.data.posted_at_local || '',
          posting_error: videoData.data.posting_error || '',
        });

        if (videoData.data.script_id) {
          try {
            const scriptRes = await fetch(`/api/scripts/${videoData.data.script_id}`);
            const scriptData = await scriptRes.json();
            if (scriptData.ok && scriptData.data) {
              setLinkedScript({
                id: scriptData.data.id,
                title: scriptData.data.title,
                status: scriptData.data.status,
                version: scriptData.data.version,
              });
            }
          } catch { /* Script fetch failed */ }
        } else {
          setLinkedScript(null);
        }
      }

      setError('');
    } catch {
      setError('Failed to fetch video data');
    } finally {
      setLoading(false);
    }
  }, [videoId]);

  const fetchAvailableScripts = useCallback(async () => {
    setScriptsLoading(true);
    try {
      const res = await fetch('/api/scripts?status=APPROVED');
      const data = await res.json();
      if (data.ok) setAvailableScripts(data.data || []);
    } catch { /* silent */ }
    finally { setScriptsLoading(false); }
  }, []);

  const fetchTimeline = useCallback(async () => {
    if (!videoId) return;
    setTimelineLoading(true);
    try {
      const res = await fetch(`/api/admin/videos/${videoId}/timeline?limit=50`);
      if (!res.ok) { setTimelineItems([]); return; }
      const data = await res.json();
      if (data.ok && data.data?.items) setTimelineItems(data.data.items);
    } catch { /* silent */ }
    finally { setTimelineLoading(false); }
  }, [videoId]);

  // ─── Action handlers ───────────────────────────────────────────

  const handleForceStatus = async () => {
    if (!forceStatusTarget || !forceStatusReason.trim()) {
      setAdminActionMessage('Target status and reason are required');
      return;
    }
    if (forceStatusTarget === 'POSTED' && (!forceStatusPostedUrl.trim() || !forceStatusPostedPlatform)) {
      setAdminActionMessage('Posted URL and platform are required for POSTED status');
      return;
    }

    setAdminActionLoading(true);
    setAdminActionMessage(null);
    try {
      const payload: Record<string, string> = { target_status: forceStatusTarget, reason: forceStatusReason.trim() };
      if (forceStatusTarget === 'POSTED') {
        payload.posted_url = forceStatusPostedUrl.trim();
        payload.posted_platform = forceStatusPostedPlatform;
      }
      const res = await fetch(`/api/admin/videos/${videoId}/force-status`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.ok) {
        setAdminActionMessage(`Status forced to ${forceStatusTarget}`);
        setForceStatusTarget(''); setForceStatusReason(''); setForceStatusPostedUrl(''); setForceStatusPostedPlatform('');
        fetchData(); fetchTimeline();
      } else {
        setAdminActionMessage(data.message || data.error || 'Failed to force status');
      }
    } catch { setAdminActionMessage('Failed to force status'); }
    finally { setAdminActionLoading(false); }
  };

  const handleClearClaim = async () => {
    if (!clearClaimReason.trim()) return;
    setAdminActionLoading(true); setAdminActionMessage(null); setShowConfirmModal(null);
    try {
      const res = await fetch(`/api/admin/videos/${videoId}/clear-claim`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: clearClaimReason.trim() }),
      });
      const data = await res.json();
      if (data.ok) { setAdminActionMessage('Claim cleared'); setClearClaimReason(''); fetchData(); fetchTimeline(); }
      else { setAdminActionMessage(data.message || data.error || 'Failed to clear claim'); }
    } catch { setAdminActionMessage('Failed to clear claim'); }
    finally { setAdminActionLoading(false); }
  };

  const handleResetAssignments = async () => {
    if (!resetReason.trim()) return;
    setAdminActionLoading(true); setAdminActionMessage(null); setShowConfirmModal(null);
    try {
      const res = await fetch(`/api/admin/videos/${videoId}/reset-assignments`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: resetMode, reason: resetReason.trim() }),
      });
      const data = await res.json();
      if (data.ok) { setAdminActionMessage(`Assignments reset (${resetMode})`); setResetReason(''); fetchData(); fetchTimeline(); }
      else { setAdminActionMessage(data.message || data.error || 'Failed to reset assignments'); }
    } catch { setAdminActionMessage('Failed to reset assignments'); }
    finally { setAdminActionLoading(false); }
  };

  const attachScript = async () => {
    if (!selectedScriptId) return;
    setAttaching(true); setAttachMessage(null);
    try {
      const payload: { script_id: string; force?: boolean } = { script_id: selectedScriptId };
      if (forceOverwrite) payload.force = true;
      const res = await fetch(`/api/videos/${videoId}/attach-script`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.ok) {
        setAttachMessage('Script attached successfully');
        setShowAttachScript(false); setSelectedScriptId(''); setForceOverwrite(false); fetchData();
      } else if (data.code === 'SCRIPT_ALREADY_LOCKED') {
        setAttachMessage('This video already has an approved script. Check "Overwrite existing" to replace it.');
      } else if (data.code === 'SCRIPT_NOT_APPROVED') {
        setAttachMessage(`Script is not approved (status: ${data.details?.status || 'unknown'}). Check "Force attach" to attach anyway.`);
      } else {
        setAttachMessage(data.error || 'Failed to attach script');
      }
    } catch { setAttachMessage('Failed to attach script'); }
    finally { setAttaching(false); }
  };

  const validateStatusTransition = (status: string): string | null => {
    if (status === 'POSTED') {
      if (!executionForm.posted_url?.trim()) return 'Posted URL is required';
      if (!executionForm.posted_platform) return 'Platform is required';
    }
    if (status === 'REJECTED') {
      const hasNotes = executionForm.recording_notes.trim() || executionForm.editor_notes.trim() || executionForm.uploader_notes.trim();
      if (!hasNotes) return 'At least one Notes field is required for rejection';
    }
    return null;
  };

  const saveExecution = async () => {
    const validationError = validateStatusTransition(executionForm.recording_status);
    if (validationError) { setExecutionMessage(validationError); return; }

    setSavingExecution(true); setExecutionMessage(null);
    try {
      const res = await fetch(`/api/videos/${videoId}/execution`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recording_status: executionForm.recording_status,
          recording_notes: executionForm.recording_notes || null,
          editor_notes: executionForm.editor_notes || null,
          uploader_notes: executionForm.uploader_notes || null,
          posted_url: executionForm.posted_url || null,
          posted_platform: executionForm.posted_platform || null,
          posted_account: executionForm.posted_account || null,
          posted_at_local: executionForm.posted_at_local || null,
          posting_error: executionForm.posting_error || null,
        }),
      });
      const data = await res.json();
      if (data.ok) { setExecutionMessage('Saved successfully'); fetchData(); setTimeout(() => setExecutionMessage(null), 3000); }
      else { setExecutionMessage(data.error || 'Failed to save'); }
    } catch { setExecutionMessage('Failed to save execution status'); }
    finally { setSavingExecution(false); }
  };

  const setTimestampNow = async (field: 'recorded_at' | 'edited_at' | 'ready_to_post_at' | 'posted_at' | 'rejected_at') => {
    const statusMap: Record<string, string> = {
      recorded_at: 'RECORDED', edited_at: 'EDITED', ready_to_post_at: 'READY_TO_POST', posted_at: 'POSTED', rejected_at: 'REJECTED',
    };
    const newStatus = statusMap[field];
    const validationError = validateStatusTransition(newStatus);
    if (validationError) { setExecutionMessage(validationError); return; }

    setSavingExecution(true); setExecutionMessage(null);
    try {
      const payload: Record<string, unknown> = { recording_status: newStatus, [field]: new Date().toISOString() };
      if (newStatus === 'POSTED') { payload.posted_url = executionForm.posted_url || null; payload.posted_platform = executionForm.posted_platform || null; payload.posted_account = executionForm.posted_account || null; }
      if (newStatus === 'REJECTED') { payload.recording_notes = executionForm.recording_notes || null; payload.editor_notes = executionForm.editor_notes || null; payload.uploader_notes = executionForm.uploader_notes || null; }

      const res = await fetch(`/api/videos/${videoId}/execution`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.ok) {
        setExecutionMessage(`Set ${field.replace(/_/g, ' ')} to now`);
        setExecutionForm(prev => ({ ...prev, recording_status: newStatus }));
        fetchData(); setTimeout(() => setExecutionMessage(null), 3000);
      } else { setExecutionMessage(data.error || 'Failed to set timestamp'); }
    } catch { setExecutionMessage('Failed to set timestamp'); }
    finally { setSavingExecution(false); }
  };

  const releaseVideo = async () => {
    if (!claimedInfo) return;
    setReleasing(true); setReleaseMessage(null);
    try {
      const res = await fetch(`/api/videos/${videoId}/release`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claimed_by: claimedInfo.claimed_by, force: true }),
      });
      const data = await res.json();
      if (data.ok) { setReleaseMessage('Claim released'); fetchData(); }
      else { setReleaseMessage(data.message || data.error || 'Failed to release'); }
    } catch { setReleaseMessage('Failed to release claim'); }
    finally { setReleasing(false); }
  };

  const copyToClipboard = async (text: string, label: string) => {
    try { await navigator.clipboard.writeText(text); setCopiedId(label); setTimeout(() => setCopiedId(null), 2000); } catch { /* silent */ }
  };

  useEffect(() => { checkAdminEnabled(); }, [checkAdminEnabled]);
  useEffect(() => { if (adminEnabled === true) { fetchData(); fetchTimeline(); } }, [adminEnabled, fetchData, fetchTimeline]);
  useEffect(() => { if (showAttachScript) fetchAvailableScripts(); }, [showAttachScript, fetchAvailableScripts]);

  const displayTime = (dateStr: string) => hydrated ? getTimeAgo(dateStr) : formatDateString(dateStr);

  // ─── Loading / Error states ──────────────────────────────────

  if (adminEnabled === null) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-teal-500 animate-spin" />
      </div>
    );
  }

  if (adminEnabled === false) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-xl font-bold text-zinc-200 mb-2">Not Found</h1>
          <p className="text-sm text-zinc-500">This page is not available.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="flex items-center gap-3 text-zinc-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Loading video details...</span>
        </div>
      </div>
    );
  }

  const isRejectedStatus = executionForm.recording_status === 'REJECTED';
  const isPostedStatus = executionForm.recording_status === 'POSTED';
  const noNotesForReject = isRejectedStatus && !executionForm.recording_notes.trim() && !executionForm.editor_notes.trim() && !executionForm.uploader_notes.trim();

  // ─── Render ──────────────────────────────────────────────────

  return (
    <AdminPageLayout title="Video Details" subtitle={`ID: ${videoId.slice(0, 8)}...`} stage="production">
      {/* Back + Refresh */}
      <div className="flex items-center gap-2 mb-4">
        <Link href="/admin/pipeline" className={btnGhost}>
          <ArrowLeft className="w-3.5 h-3.5" />
          Pipeline
        </Link>
        <button onClick={fetchData} className={btnGhost}>
          <RefreshCw className="w-3 h-3" />
          Refresh
        </button>
      </div>

      {error && <MessageBanner type="error">{error}</MessageBanner>}
      {releaseMessage && <MessageBanner type={releaseMessage.includes('released') ? 'success' : 'error'}>{releaseMessage}</MessageBanner>}

      {/* Status Summary Card */}
      {videoDetail && (
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-4 sm:p-5 mb-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              <StatusBadge status={videoDetail.recording_status} />
              {videoDetail.last_status_changed_at && (
                <span className="text-xs text-zinc-500 flex items-center gap-1" title={formatDateString(videoDetail.last_status_changed_at)}>
                  <Clock className="w-3 h-3" />
                  {displayTime(videoDetail.last_status_changed_at)}
                </span>
              )}
              {claimedInfo ? (
                <span className="text-xs text-blue-400 flex items-center gap-1">
                  <User className="w-3 h-3" />
                  {claimedInfo.claimed_by.slice(0, 8)}
                </span>
              ) : (
                <span className="text-xs text-zinc-600">Unassigned</span>
              )}
            </div>
            <button onClick={() => copyToClipboard(videoId, 'vid')} className={btnGhost}>
              {copiedId === 'vid' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              {copiedId === 'vid' ? 'Copied' : videoId.slice(0, 8)}
            </button>
          </div>
        </div>
      )}

      {/* Primary Actions */}
      <div className="flex flex-wrap gap-2 mb-5">
        <button onClick={releaseVideo} disabled={!claimedInfo || releasing} className={btnDanger}>
          <Unlock className="w-3.5 h-3.5" />
          {releasing ? 'Releasing...' : 'Release Claim'}
        </button>
        <button onClick={() => setShowAttachScript(!showAttachScript)} className={btnSecondary}>
          <Paperclip className="w-3.5 h-3.5" />
          {showAttachScript ? 'Cancel' : 'Attach Script'}
        </button>
        <Link href="/admin/script-library" className={btnGhost}>
          <FileText className="w-3.5 h-3.5" />
          Script Library
        </Link>
      </div>

      {/* Attach Script Form */}
      {showAttachScript && (
        <AdminCard title="Attach Approved Script" accent="blue">
          {attachMessage && (
            <MessageBanner type={attachMessage.includes('successfully') ? 'success' : 'warning'}>
              {attachMessage}
            </MessageBanner>
          )}
          {scriptsLoading ? (
            <div className="flex items-center gap-2 py-4 text-sm text-zinc-400">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading scripts...
            </div>
          ) : availableScripts.length === 0 ? (
            <p className="py-4 text-sm text-zinc-500">
              No approved scripts available. <Link href="/admin/script-library" className="text-teal-400 hover:text-teal-300">Create one</Link>
            </p>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Select Script</label>
                <select value={selectedScriptId} onChange={e => setSelectedScriptId(e.target.value)} className={selectClass}>
                  <option value="">-- Select a script --</option>
                  {availableScripts.map(s => (
                    <option key={s.id} value={s.id}>{s.title || s.id.slice(0, 8)} (v{s.version})</option>
                  ))}
                </select>
              </div>
              {selectedScriptId && (
                <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-3">
                  <span className="text-xs text-zinc-500 mb-2 block">Preview</span>
                  <pre className="text-xs text-zinc-300 whitespace-pre-wrap font-mono max-h-36 overflow-auto">
                    {availableScripts.find(s => s.id === selectedScriptId)?.script_text || 'No preview available'}
                  </pre>
                </div>
              )}
              {videoDetail?.script_locked_json && (
                <MessageBanner type="warning">This video already has an approved script.</MessageBanner>
              )}
              <label className="flex items-center gap-2 text-sm text-zinc-400 cursor-pointer">
                <input type="checkbox" checked={forceOverwrite} onChange={e => setForceOverwrite(e.target.checked)} className="rounded bg-zinc-800 border-zinc-600" />
                Overwrite existing / Force attach unapproved
              </label>
              <button onClick={attachScript} disabled={!selectedScriptId || attaching} className={btnPrimary}>
                {attaching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
                {attaching ? 'Attaching...' : 'Attach Script'}
              </button>
            </div>
          )}
        </AdminCard>
      )}

      {/* Approved Script */}
      {videoDetail?.script_locked_text && (
        <AdminCard title="Approved Script" accent="teal">
          <MessageBanner type="info">
            This video has a locked copy of its script. Edits to the source script won&apos;t affect this video.
          </MessageBanner>
          {videoDetail.script_id && (
            <div className="flex flex-wrap items-center gap-3 mt-3">
              <code className="text-xs bg-zinc-800 px-2 py-0.5 rounded font-mono text-zinc-400">{videoDetail.script_id.slice(0, 12)}...</code>
              {linkedScript && (
                <>
                  <StatusBadge status={linkedScript.status} />
                  <span className="text-xs text-zinc-500">v{linkedScript.version}</span>
                </>
              )}
              <Link href={`/admin/scripts/${videoDetail.script_id}`} className="text-xs text-teal-400 hover:text-teal-300 flex items-center gap-1">
                View Script <ExternalLink className="w-3 h-3" />
              </Link>
            </div>
          )}
          <div className="mt-3">
            <button onClick={() => setScriptExpanded(!scriptExpanded)} className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 mb-2 transition-colors">
              {scriptExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              {scriptExpanded ? 'Collapse' : 'Expand'} Script
            </button>
            <div className={`relative bg-zinc-800/60 border border-zinc-700/50 rounded-lg overflow-hidden transition-all ${scriptExpanded ? 'max-h-[600px]' : 'max-h-36'}`}>
              <pre className="p-4 text-[13px] leading-relaxed text-zinc-200 whitespace-pre-wrap font-mono overflow-auto h-full">
                {videoDetail.script_locked_text}
              </pre>
              {!scriptExpanded && (
                <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-zinc-800/90 to-transparent pointer-events-none" />
              )}
            </div>
          </div>
          {videoDetail.script_locked_json && (
            <details className="mt-3">
              <summary className="text-xs text-zinc-500 cursor-pointer hover:text-zinc-300">View JSON Structure</summary>
              <pre className="mt-2 bg-zinc-800/30 border border-zinc-700/50 rounded-lg p-3 text-[11px] text-zinc-400 font-mono overflow-auto max-h-48">
                {JSON.stringify(videoDetail.script_locked_json, null, 2)}
              </pre>
            </details>
          )}
        </AdminCard>
      )}

      {/* Execution Tracking */}
      <AdminCard title="Execution Tracking" accent="emerald">
        {executionMessage && (
          <MessageBanner type={executionMessage.includes('success') || executionMessage.includes('Saved') || executionMessage.startsWith('Set ') ? 'success' : 'error'}>
            {executionMessage}
          </MessageBanner>
        )}

        <div className="space-y-6">
          {/* Recording Status */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">Recording Status</label>
            <select value={executionForm.recording_status} onChange={e => setExecutionForm(prev => ({ ...prev, recording_status: e.target.value }))} className={selectClass}>
              {RECORDING_STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
            </select>
            {isPostedStatus && (
              <p className="mt-2 text-xs text-amber-400">Platform and Posted URL are required for POSTED status.</p>
            )}
            {isRejectedStatus && (
              <p className="mt-2 text-xs text-red-400">At least one Notes field is required when rejecting.</p>
            )}
          </div>

          {/* Timestamps — workflow progression */}
          <div>
            <h3 className="text-xs font-medium text-zinc-500 mb-3 uppercase tracking-wider">Workflow Timestamps</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {([
                { field: 'recorded_at' as const, label: 'Recorded', value: videoDetail?.recorded_at },
                { field: 'edited_at' as const, label: 'Edited', value: videoDetail?.edited_at },
                { field: 'ready_to_post_at' as const, label: 'Ready to Post', value: videoDetail?.ready_to_post_at },
                { field: 'posted_at' as const, label: 'Posted', value: videoDetail?.posted_at },
                { field: 'rejected_at' as const, label: 'Rejected', value: videoDetail?.rejected_at },
              ]).map(ts => (
                <div key={ts.field} className="bg-zinc-800/30 border border-zinc-700/50 rounded-lg px-3 py-2.5 flex items-center justify-between">
                  <div>
                    <div className="text-xs text-zinc-500">{ts.label}</div>
                    <div className="text-sm text-zinc-300">
                      {ts.value ? (hydrated ? new Date(ts.value).toLocaleString() : formatDateString(ts.value)) : '—'}
                    </div>
                  </div>
                  <button
                    onClick={() => setTimestampNow(ts.field)}
                    disabled={savingExecution}
                    className={`text-xs px-2 py-1 rounded ${ts.field === 'rejected_at' ? 'bg-red-600/20 text-red-400 hover:bg-red-600/30' : 'bg-teal-600/20 text-teal-400 hover:bg-teal-600/30'} transition-colors disabled:opacity-50`}
                  >
                    Set Now
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <h3 className="text-xs font-medium text-zinc-500 mb-3 uppercase tracking-wider">Notes</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {([
                { key: 'recording_notes', label: 'Recording Notes', placeholder: 'Notes from recording...' },
                { key: 'editor_notes', label: 'Editor Notes', placeholder: 'Notes from editing...' },
                { key: 'uploader_notes', label: 'Uploader Notes', placeholder: 'Notes from uploading...' },
              ] as const).map(n => (
                <div key={n.key}>
                  <label className="block text-xs text-zinc-400 mb-1">
                    {n.label}
                    {isRejectedStatus && <span className="text-red-400 ml-1">*</span>}
                  </label>
                  <textarea
                    value={executionForm[n.key]}
                    onChange={e => setExecutionForm(prev => ({ ...prev, [n.key]: e.target.value }))}
                    className={`${textareaClass} ${noNotesForReject ? 'border-red-500/50' : ''}`}
                    placeholder={n.placeholder}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Posting Details */}
          <div className={`rounded-lg border p-4 ${isPostedStatus ? 'border-teal-500/20 bg-teal-500/5' : 'border-zinc-700/50 bg-zinc-800/20'}`}>
            <h3 className="text-xs font-medium text-zinc-400 mb-3">
              Posting Details
              {isPostedStatus && <span className="text-teal-400 ml-2 text-[10px]">(Required)</span>}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Platform {isPostedStatus && <span className="text-red-400">*</span>}</label>
                <select value={executionForm.posted_platform} onChange={e => setExecutionForm(prev => ({ ...prev, posted_platform: e.target.value }))} className={`${selectClass} ${isPostedStatus && !executionForm.posted_platform ? 'border-red-500/50' : ''}`}>
                  <option value="">Select...</option>
                  {PLATFORMS.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Posted URL {isPostedStatus && <span className="text-red-400">*</span>}</label>
                <input type="text" value={executionForm.posted_url} onChange={e => setExecutionForm(prev => ({ ...prev, posted_url: e.target.value }))} className={`${inputClass} ${isPostedStatus && !executionForm.posted_url.trim() ? 'border-red-500/50' : ''}`} placeholder="https://..." />
                {videoDetail?.posted_url && videoDetail.recording_status === 'POSTED' && (
                  <a href={videoDetail.posted_url} target="_blank" rel="noopener noreferrer" className="text-xs text-teal-400 hover:text-teal-300 mt-1 inline-flex items-center gap-1">
                    Open posted video <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Account / Handle</label>
                <input type="text" value={executionForm.posted_account} onChange={e => setExecutionForm(prev => ({ ...prev, posted_account: e.target.value }))} className={inputClass} placeholder="@username" />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Posted At (Local)</label>
                <input type="text" value={executionForm.posted_at_local} onChange={e => setExecutionForm(prev => ({ ...prev, posted_at_local: e.target.value }))} className={inputClass} placeholder="e.g., 3pm EST" />
              </div>
            </div>
            <div className="mt-3">
              <label className="block text-xs text-zinc-400 mb-1">Posting Error (if failed)</label>
              <textarea value={executionForm.posting_error} onChange={e => setExecutionForm(prev => ({ ...prev, posting_error: e.target.value }))} className={textareaClass} placeholder="Error message if posting failed..." />
            </div>
          </div>

          {/* Save */}
          <button onClick={saveExecution} disabled={savingExecution} className={btnPrimary}>
            {savingExecution ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {savingExecution ? 'Saving...' : 'Save Execution Status'}
          </button>
        </div>
      </AdminCard>

      {/* Admin Actions */}
      <AdminCard
        title="Admin Actions"
        accent="red"
        headerActions={
          <button onClick={() => setShowAdminActions(!showAdminActions)} className={`text-xs px-3 py-1 rounded-lg transition-colors ${showAdminActions ? 'bg-zinc-700 text-zinc-300' : 'bg-red-600/20 text-red-400 hover:bg-red-600/30'}`}>
            {showAdminActions ? 'Hide' : 'Show'}
          </button>
        }
      >
        <MessageBanner type="warning">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            Admin actions are for fixing stuck items only. All actions are logged.
          </div>
        </MessageBanner>

        {adminActionMessage && (
          <div className="mt-3">
            <MessageBanner type={adminActionMessage.includes('forced') || adminActionMessage.includes('cleared') || adminActionMessage.includes('reset') ? 'success' : 'error'}>
              {adminActionMessage}
            </MessageBanner>
          </div>
        )}

        {showAdminActions && (
          <div className="mt-4 space-y-4">
            {/* Force Status */}
            <div className="bg-zinc-800/30 border border-zinc-700/50 rounded-lg p-4">
              <h3 className="text-sm font-medium text-zinc-300 mb-3">Force Status</h3>
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="sm:w-48">
                  <label className="block text-xs text-zinc-500 mb-1">Target Status</label>
                  <select value={forceStatusTarget} onChange={e => setForceStatusTarget(e.target.value)} className={selectClass}>
                    <option value="">Select...</option>
                    <option value="NOT_RECORDED">NOT RECORDED</option>
                    <option value="RECORDED">RECORDED</option>
                    <option value="EDITED">EDITED</option>
                    <option value="READY_TO_POST">READY TO POST</option>
                    <option value="POSTED">POSTED</option>
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-xs text-zinc-500 mb-1">Reason *</label>
                  <input type="text" value={forceStatusReason} onChange={e => setForceStatusReason(e.target.value)} className={inputClass} placeholder="Why is this change needed?" />
                </div>
                <div className="flex items-end">
                  <button onClick={handleForceStatus} disabled={adminActionLoading || !forceStatusTarget || !forceStatusReason.trim()} className={btnDanger}>
                    {adminActionLoading ? 'Processing...' : 'Force'}
                  </button>
                </div>
              </div>
              {forceStatusTarget === 'POSTED' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                  <div>
                    <label className="block text-xs text-zinc-500 mb-1">Posted URL *</label>
                    <input type="text" value={forceStatusPostedUrl} onChange={e => setForceStatusPostedUrl(e.target.value)} className={inputClass} placeholder="https://..." />
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-500 mb-1">Platform *</label>
                    <select value={forceStatusPostedPlatform} onChange={e => setForceStatusPostedPlatform(e.target.value)} className={selectClass}>
                      <option value="">Select...</option>
                      {PLATFORMS.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* Clear Claim */}
            <div className="bg-zinc-800/30 border border-zinc-700/50 rounded-lg p-4">
              <h3 className="text-sm font-medium text-zinc-300 mb-3">Clear Claim</h3>
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1">
                  <label className="block text-xs text-zinc-500 mb-1">Reason *</label>
                  <input type="text" value={clearClaimReason} onChange={e => setClearClaimReason(e.target.value)} className={inputClass} placeholder="Why clear this claim?" />
                </div>
                <div className="flex items-end">
                  <button onClick={() => clearClaimReason.trim() && setShowConfirmModal('clear-claim')} disabled={adminActionLoading || !clearClaimReason.trim()} className={btnDanger}>
                    Clear...
                  </button>
                </div>
              </div>
            </div>

            {/* Reset Assignments */}
            <div className="bg-zinc-800/30 border border-zinc-700/50 rounded-lg p-4">
              <h3 className="text-sm font-medium text-zinc-300 mb-3">Reset Assignments</h3>
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="sm:w-48">
                  <label className="block text-xs text-zinc-500 mb-1">Mode</label>
                  <select value={resetMode} onChange={e => setResetMode(e.target.value as 'expire' | 'unassign')} className={selectClass}>
                    <option value="expire">Expire</option>
                    <option value="unassign">Unassign</option>
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-xs text-zinc-500 mb-1">Reason *</label>
                  <input type="text" value={resetReason} onChange={e => setResetReason(e.target.value)} className={inputClass} placeholder="Why reset?" />
                </div>
                <div className="flex items-end">
                  <button onClick={() => resetReason.trim() && setShowConfirmModal('reset')} disabled={adminActionLoading || !resetReason.trim()} className={btnDanger}>
                    Reset...
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Confirmation Modal */}
        {showConfirmModal && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowConfirmModal(null)}>
            <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 max-w-sm w-full shadow-2xl" onClick={e => e.stopPropagation()}>
              <h3 className="text-base font-semibold text-zinc-100 mb-2 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-400" />
                Confirm Action
              </h3>
              <p className="text-sm text-zinc-400 mb-5">
                {showConfirmModal === 'clear-claim'
                  ? 'Are you sure you want to clear the claim on this video? This action will be logged.'
                  : `Are you sure you want to ${resetMode === 'expire' ? 'expire' : 'unassign'} this video? This action will be logged.`}
              </p>
              <div className="flex gap-3 justify-end">
                <button onClick={() => setShowConfirmModal(null)} className={btnSecondary}>Cancel</button>
                <button onClick={showConfirmModal === 'clear-claim' ? handleClearClaim : handleResetAssignments} disabled={adminActionLoading} className={btnDanger}>
                  {adminActionLoading ? 'Processing...' : 'Confirm'}
                </button>
              </div>
            </div>
          </div>
        )}
      </AdminCard>

      {/* Events / Audit Log */}
      <AdminCard title={`Events / Audit Log (${events.length})`}>
        {events.length > 0 ? (
          <div className="overflow-x-auto -mx-5">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left px-4 py-2 text-xs font-medium text-zinc-500">When</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-zinc-500">Type</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-zinc-500 hidden sm:table-cell">Actor</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-zinc-500">Transition</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-zinc-500 hidden md:table-cell">Correlation</th>
                </tr>
              </thead>
              <tbody>
                {events.map(event => (
                  <tr key={event.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                    <td className="px-4 py-2.5 text-xs text-zinc-400" title={formatDateString(event.created_at)}>
                      {displayTime(event.created_at)}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-zinc-300">{event.event_type}</td>
                    <td className="px-4 py-2.5 text-xs text-zinc-400 hidden sm:table-cell">{event.actor?.slice(0, 8)}...</td>
                    <td className="px-4 py-2.5 text-xs">
                      <span className="text-zinc-500">{event.from_status || '—'}</span>
                      <span className="text-zinc-600 mx-1">&rarr;</span>
                      <span className="text-zinc-300">{event.to_status || '—'}</span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-zinc-500 font-mono hidden md:table-cell cursor-pointer hover:text-zinc-300" onClick={() => copyToClipboard(event.correlation_id, `corr-${event.id}`)}>
                      {event.correlation_id.slice(0, 12)}...
                      {copiedId === `corr-${event.id}` && <span className="ml-1 text-emerald-400">Copied</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="py-4 text-sm text-zinc-500 text-center">No events found for this video</p>
        )}
      </AdminCard>

      {/* Timeline */}
      {timelineItems.length > 0 && (
        <AdminCard
          title={`Timeline (${timelineItems.length})`}
          accent="violet"
          headerActions={
            <button onClick={fetchTimeline} disabled={timelineLoading} className={btnGhost}>
              {timelineLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
              Refresh
            </button>
          }
        >
          <div className="max-h-96 overflow-y-auto -mx-5 px-5 space-y-0">
            {timelineItems.map((item, idx) => {
              const typeColors: Record<string, string> = {
                event: 'bg-blue-500/10 text-blue-400',
                assignment: 'bg-emerald-500/10 text-emerald-400',
                video_snapshot: 'bg-amber-500/10 text-amber-400',
              };
              const eventType = (item.metadata?.event_type as string) || '';
              let displayType = item.type;
              if (eventType.includes('email')) displayType = 'event';
              if (eventType.includes('slack')) displayType = 'event';
              if (eventType.startsWith('admin_')) displayType = 'event';

              return (
                <div key={`${item.ts}-${idx}`} className="flex flex-col sm:flex-row gap-2 sm:gap-4 py-3 border-b border-white/5 last:border-0">
                  <div className="text-xs text-zinc-500 sm:w-32 shrink-0" title={item.ts}>
                    {hydrated ? new Date(item.ts).toLocaleString() : formatDateString(item.ts)}
                  </div>
                  <div className="shrink-0">
                    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium ${typeColors[displayType] || typeColors.event}`}>
                      {item.type}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-zinc-300">{item.label}</div>
                    {item.metadata && Object.keys(item.metadata).length > 0 && (
                      <details className="mt-1">
                        <summary className="text-[10px] text-zinc-500 cursor-pointer hover:text-zinc-300">Details</summary>
                        <pre className="mt-1 text-[10px] text-zinc-500 font-mono bg-zinc-800/30 rounded p-2 overflow-auto max-h-24">
                          {JSON.stringify(item.metadata, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </AdminCard>
      )}

      {/* Bottom spacing for mobile nav */}
      <div className="h-20 lg:h-0" />
    </AdminPageLayout>
  );
}
