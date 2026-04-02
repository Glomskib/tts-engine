'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, ChevronDown, ChevronUp, Check, AlertTriangle,
  Video, FileText, Package, Scissors, Send, BarChart3,
  Lightbulb, Copy, ExternalLink, FolderOpen, Trophy, Sparkles,
  Loader2, Wand2,
} from 'lucide-react';
import { useToast } from '@/contexts/ToastContext';
import { getNextAction } from '@/lib/videos/nextAction';

// --- Types ---

interface VideoDetail {
  id: string;
  variant_id: string;
  account_id: string;
  status: string;
  recording_status: string | null;
  created_at: string;
  last_status_changed_at: string | null;
  claimed_by: string | null;
  google_drive_url: string | null;
  final_video_url: string | null;
  posted_url: string | null;
  posted_platform: string | null;
  concept_id: string | null;
  product_id: string | null;
  brand_name: string | null;
  product_name: string | null;
  product_url: string | null;
  account_name: string | null;
  account_platform: string | null;
  posting_account_id: string | null;
  posting_account_name: string | null;
  script_locked_text?: string | null;
  posting_meta?: Record<string, unknown> | null;
}

interface Brief {
  concept_id: string;
  title: string | null;
  angle: string | null;
  hypothesis: string | null;
  proof_type: string | null;
  hook_options: string[] | null;
  notes: string | null;
  visual_hook: string | null;
  on_screen_text_hook: string | null;
  on_screen_text_cta: string | null;
  hook_type: string | null;
  reference_script: string | null;
  tone_preset: string | null;
}

interface Script {
  text: string;
  version: number;
  locked: boolean;
}

interface Assets {
  raw_footage_url: string | null;
  final_mp4_url: string | null;
  thumbnail_url: string | null;
  google_drive_url: string | null;
  screenshots: string[];
}

interface PostingMeta {
  caption?: string;
  hashtags?: string[];
  cta_line?: string;
  posting_steps?: string;
  [key: string]: unknown;
}

interface VideoEvent {
  id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor: string;
  created_at: string;
}

interface RelevantPattern {
  id: string;
  hook_text: string | null;
  format_tag: string | null;
  length_bucket: string | null;
  score: number;
  sample_size: number;
  product_name: string | null;
}

// --- Status Pill ---

function StatusPill({ status }: { status: string }) {
  const configs: Record<string, { label: string; classes: string }> = {
    draft: { label: 'Draft', classes: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30' },
    needs_edit: { label: 'Needs Edit', classes: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
    ready_to_post: { label: 'Ready to Post', classes: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
    posted: { label: 'Posted', classes: 'bg-purple-500/15 text-purple-400 border-purple-500/30' },
    failed: { label: 'Failed', classes: 'bg-red-500/15 text-red-400 border-red-500/30' },
    archived: { label: 'Archived', classes: 'bg-zinc-600/15 text-zinc-500 border-zinc-600/30' },
  };
  const config = configs[status] || configs.draft;
  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border ${config.classes}`}>
      {config.label}
    </span>
  );
}

// --- Accordion Section ---

function AccordionSection({
  title,
  icon: Icon,
  isComplete,
  defaultOpen = false,
  children,
}: {
  title: string;
  icon: typeof Video;
  isComplete: boolean | null;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="bg-zinc-900/50 border border-white/10 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-4 py-4 min-h-[56px] hover:bg-white/[0.02] transition-colors"
      >
        <Icon className="w-5 h-5 text-zinc-400 flex-shrink-0" />
        <span className="text-sm font-semibold text-white flex-1 text-left">{title}</span>
        {isComplete !== null && (
          isComplete ? (
            <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
          )
        )}
        {open ? (
          <ChevronUp className="w-4 h-4 text-zinc-500 flex-shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-zinc-500 flex-shrink-0" />
        )}
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 border-t border-white/5">
          {children}
        </div>
      )}
    </div>
  );
}

// --- Asset Chip ---

function AssetChip({ label, present, href }: { label: string; present: boolean; href?: string | null }) {
  const inner = (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border ${
      present
        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
        : 'bg-zinc-800 text-zinc-500 border-zinc-700'
    }`}>
      {present ? <Check className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
      {label}
    </span>
  );

  if (href && present) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="inline-block">
        {inner}
      </a>
    );
  }
  return inner;
}

// --- Main Page ---

export default function VideoWorkflowPage() {
  const params = useParams();
  const router = useRouter();
  const { showSuccess, showError } = useToast();
  const videoId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [video, setVideo] = useState<VideoDetail | null>(null);
  const [brief, setBrief] = useState<Brief | null>(null);
  const [script, setScript] = useState<Script | null>(null);
  const [assets, setAssets] = useState<Assets | null>(null);
  const [events, setEvents] = useState<VideoEvent[]>([]);
  const [postingMeta, setPostingMeta] = useState<PostingMeta | null>(null);
  const [transitioning, setTransitioning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [winnerPatterns, setWinnerPatterns] = useState<RelevantPattern[]>([]);
  const [editingSuggestions, setEditingSuggestions] = useState<Array<{ timestamp_start: number | null; timestamp_end: number | null; suggestion: string; type: string }>>([]);
  const [analyzingEdits, setAnalyzingEdits] = useState(false);

  const fetchDetail = useCallback(async () => {
    try {
      const res = await fetch(`/api/videos/${videoId}/details`);
      const json = await res.json();
      if (json.ok) {
        setVideo(json.video);
        setBrief(json.brief || null);
        setScript(json.script || null);
        setAssets(json.assets || null);
        setEvents(json.events || []);
        setPostingMeta(json.posting_meta || null);
        setError(null);
      } else {
        // Check if this ID belongs to a content_item instead
        const ciRes = await fetch(`/api/content-items/${videoId}`);
        if (ciRes.ok) {
          router.replace(`/admin/content-items/${videoId}`);
          return;
        }
        setError(json.error || 'Video not found');
      }
    } catch {
      setError('Failed to load video details');
    } finally {
      setLoading(false);
    }
  }, [videoId]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  // Fetch relevant winner patterns
  useEffect(() => {
    if (!videoId) return;
    fetch(`/api/intelligence/winner-patterns/relevant?content_item_id=${videoId}`)
      .then(r => r.json())
      .then(json => {
        if (json.ok) setWinnerPatterns(json.data || []);
      })
      .catch(() => {});
  }, [videoId]);

  const handleTransition = async (targetStatus: string) => {
    if (!video) return;
    setTransitioning(true);
    try {
      const res = await fetch(`/api/videos/${videoId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: targetStatus, force: true }),
      });
      const json = await res.json();
      if (json.ok || res.ok) {
        showSuccess(`Status updated to ${targetStatus}`);
        fetchDetail();
      } else {
        showError(json.error || json.message || 'Transition failed');
      }
    } catch {
      showError('Network error');
    } finally {
      setTransitioning(false);
    }
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showSuccess(`${label} copied`);
    } catch {
      showError('Failed to copy');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#09090b] pt-4 pb-24 px-4 max-w-3xl mx-auto space-y-4">
        <div className="h-12 bg-zinc-800 rounded-xl animate-pulse" />
        {[1, 2, 3].map(i => (
          <div key={i} className="h-20 bg-zinc-900/50 border border-white/10 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (error || !video) {
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-red-400 text-sm mb-4">{error || 'Video not found'}</p>
          <button
            onClick={() => router.back()}
            className="px-4 py-2.5 min-h-[44px] bg-zinc-800 text-zinc-300 rounded-lg text-sm hover:bg-zinc-700 transition-colors"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const nextAction = getNextAction({
    id: video.id,
    status: video.status,
    recording_status: video.recording_status,
    google_drive_url: video.google_drive_url,
    script_locked_text: video.script_locked_text || null,
    product_id: video.product_id,
    final_video_url: video.final_video_url,
    posted_url: video.posted_url,
    posting_meta: video.posting_meta || postingMeta,
  });

  const videoTitle = brief?.title || brief?.angle || `Video ${video.id.slice(0, 8)}`;

  // Default-open sections based on current status
  const isBriefOpen = video.status === 'draft';
  const isRecordOpen = video.status === 'draft' && (!video.recording_status || video.recording_status === 'NOT_RECORDED');
  const isAssetsOpen = video.status === 'draft' && video.recording_status === 'RECORDED';
  const isEditOpen = video.status === 'needs_edit';
  const isPostOpen = video.status === 'ready_to_post';
  const isMetricsOpen = video.status === 'posted';

  return (
    <div className="min-h-screen bg-[#09090b]">
      {/* Sticky Header */}
      <div className="sticky top-0 z-30 bg-[#09090b]/95 backdrop-blur-sm border-b border-white/10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-zinc-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
            aria-label="Go back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white truncate">{videoTitle}</p>
          </div>
          <StatusPill status={video.status} />
        </div>
      </div>

      {/* Next Action CTA */}
      {nextAction.action !== 'none' && (
        <div className="max-w-3xl mx-auto px-4 pt-4">
          <div className="bg-teal-500/10 border border-teal-500/20 rounded-xl p-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs text-teal-400/70 uppercase tracking-wider font-medium">Next Step</p>
              <p className="text-sm text-teal-300 font-semibold mt-0.5">{nextAction.label}</p>
            </div>
            {nextAction.action === 'record' && (
              <button
                type="button"
                onClick={() => handleTransition('needs_edit')}
                disabled={transitioning}
                className="px-5 py-2.5 min-h-[48px] bg-teal-500 text-white rounded-xl text-sm font-medium hover:bg-teal-600 transition-colors disabled:opacity-50 flex-shrink-0"
              >
                {transitioning ? '...' : 'Mark Recorded'}
              </button>
            )}
            {nextAction.action === 'edit' && (
              <button
                type="button"
                onClick={() => handleTransition('ready_to_post')}
                disabled={transitioning}
                className="px-5 py-2.5 min-h-[48px] bg-teal-500 text-white rounded-xl text-sm font-medium hover:bg-teal-600 transition-colors disabled:opacity-50 flex-shrink-0"
              >
                {transitioning ? '...' : 'Mark Ready'}
              </button>
            )}
            {nextAction.action === 'post' && (
              <button
                type="button"
                onClick={() => handleTransition('posted')}
                disabled={transitioning}
                className="px-5 py-2.5 min-h-[48px] bg-teal-500 text-white rounded-xl text-sm font-medium hover:bg-teal-600 transition-colors disabled:opacity-50 flex-shrink-0"
              >
                {transitioning ? '...' : 'Mark Posted'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Content */}
      <div className="max-w-3xl mx-auto px-4 py-4 pb-24 space-y-3">

        {/* Blockers Banner */}
        {nextAction.blockers.length > 0 && (
          <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl px-4 py-3 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-orange-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-orange-400">Blockers</p>
              <ul className="text-xs text-orange-300/70 mt-1 space-y-0.5">
                {nextAction.blockers.map(b => (
                  <li key={b}>{b.replace(/_/g, ' ')}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* 1. Overview */}
        <AccordionSection title="Overview" icon={Video} isComplete={null} defaultOpen={true}>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Product</p>
              <p className="text-sm text-white">{video.product_name || '—'}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Brand</p>
              <p className="text-sm text-white">{video.brand_name || '—'}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Platform</p>
              <p className="text-sm text-white">{video.account_platform || video.account_name || '—'}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Recording</p>
              <p className="text-sm text-white">{video.recording_status || 'NOT_RECORDED'}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Created</p>
              <p className="text-sm text-white">
                {new Date(video.created_at).toLocaleDateString()}
              </p>
            </div>
            {video.posting_account_name && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Post Account</p>
                <p className="text-sm text-white">{video.posting_account_name}</p>
              </div>
            )}
          </div>
          <div className="mt-3 pt-3 border-t border-white/5">
            <Link
              href={`/admin/pipeline/${video.id}`}
              className="text-xs text-teal-400 hover:text-teal-300 transition-colors"
            >
              Open full detail view
            </Link>
          </div>
        </AccordionSection>

        {/* 2. Brief + Hook */}
        <AccordionSection
          title="Brief + Hook"
          icon={Lightbulb}
          isComplete={!!brief}
          defaultOpen={isBriefOpen}
        >
          {brief ? (
            <div className="space-y-3">
              {brief.hook_options && brief.hook_options.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">Hook Options</p>
                  {brief.hook_options.map((hook, i) => (
                    <p key={i} className="text-sm text-teal-300 font-medium mb-1">
                      &ldquo;{hook}&rdquo;
                    </p>
                  ))}
                </div>
              )}
              {brief.angle && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Angle</p>
                  <p className="text-sm text-zinc-300">{brief.angle}</p>
                </div>
              )}
              {brief.hypothesis && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Hypothesis</p>
                  <p className="text-sm text-zinc-300">{brief.hypothesis}</p>
                </div>
              )}
              {brief.notes && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Notes</p>
                  <p className="text-sm text-zinc-400">{brief.notes}</p>
                </div>
              )}
              {brief.visual_hook && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Visual Hook</p>
                  <p className="text-sm text-zinc-300">{brief.visual_hook}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-4">
              <p className="text-zinc-500 text-sm mb-3">No brief attached.</p>
              <Link
                href="/admin/content-studio"
                className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[48px] bg-teal-500/10 text-teal-400 border border-teal-500/20 rounded-xl text-sm font-medium hover:bg-teal-500/20 transition-colors"
              >
                Generate Brief
              </Link>
            </div>
          )}
        </AccordionSection>

        {/* 3. Product + Offer */}
        <AccordionSection
          title="Product + Offer"
          icon={Package}
          isComplete={!!video.product_id}
          defaultOpen={!video.product_id}
        >
          {video.product_id ? (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-white font-medium">{video.product_name}</p>
                <p className="text-xs text-zinc-500">{video.brand_name}</p>
              </div>
              {video.product_url && (
                <a
                  href={video.product_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-zinc-400 hover:text-teal-400 transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              )}
            </div>
          ) : (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-4 py-3">
              <p className="text-sm text-amber-400 font-medium">Product required before posting</p>
              <Link
                href="/admin/products"
                className="inline-block mt-2 text-xs text-amber-300 underline"
              >
                Select product
              </Link>
            </div>
          )}
        </AccordionSection>

        {/* 4. Record */}
        <AccordionSection
          title="Record"
          icon={Video}
          isComplete={video.recording_status != null && video.recording_status !== 'NOT_RECORDED'}
          defaultOpen={isRecordOpen}
        >
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-zinc-400">
              <span>Status:</span>
              <span className="text-white font-medium">{video.recording_status || 'NOT_RECORDED'}</span>
            </div>

            {(!video.recording_status || video.recording_status === 'NOT_RECORDED') && (
              <button
                type="button"
                onClick={() => handleTransition('needs_edit')}
                disabled={transitioning}
                className="w-full py-3 min-h-[48px] bg-red-500/10 text-red-400 border border-red-500/20 rounded-xl text-sm font-medium hover:bg-red-500/20 transition-colors disabled:opacity-50"
              >
                {transitioning ? 'Updating...' : 'Mark as Recorded'}
              </button>
            )}

            {script && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
                  Locked Script (v{script.version})
                </p>
                <div className="bg-zinc-800/50 rounded-lg p-3 text-sm text-zinc-300 whitespace-pre-wrap max-h-48 overflow-y-auto">
                  {script.text}
                </div>
                <button
                  type="button"
                  onClick={() => copyToClipboard(script.text, 'Script')}
                  className="flex items-center gap-1.5 mt-2 px-3 py-1.5 min-h-[36px] text-xs text-zinc-400 hover:text-white bg-zinc-800 rounded-lg transition-colors"
                >
                  <Copy className="w-3 h-3" />
                  Copy Script
                </button>
              </div>
            )}
          </div>
        </AccordionSection>

        {/* 5. Assets / Files */}
        <AccordionSection
          title="Assets / Files"
          icon={FolderOpen}
          isComplete={!!(assets?.google_drive_url || assets?.final_mp4_url)}
          defaultOpen={isAssetsOpen}
        >
          <div className="space-y-3">
            {video.google_drive_url && (
              <a
                href={video.google_drive_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-3 min-h-[48px] bg-blue-500/10 border border-blue-500/20 rounded-xl text-sm text-blue-400 font-medium hover:bg-blue-500/20 transition-colors"
              >
                <FolderOpen className="w-5 h-5" />
                Open Drive Folder
              </a>
            )}
            <div className="flex flex-wrap gap-2">
              <AssetChip label="Drive Folder" present={!!assets?.google_drive_url} href={assets?.google_drive_url} />
              <AssetChip label="Raw Footage" present={!!assets?.raw_footage_url} href={assets?.raw_footage_url} />
              <AssetChip label="Final MP4" present={!!assets?.final_mp4_url} href={assets?.final_mp4_url} />
              <AssetChip label="Transcript" present={!!script} />
            </div>
          </div>
        </AccordionSection>

        {/* 6. Edit */}
        <AccordionSection
          title="Edit"
          icon={Scissors}
          isComplete={video.status !== 'draft' && video.status !== 'needs_edit'}
          defaultOpen={isEditOpen}
        >
          <div className="space-y-3">
            {video.status === 'needs_edit' && (
              <button
                type="button"
                onClick={() => handleTransition('ready_to_post')}
                disabled={transitioning}
                className="w-full py-3 min-h-[48px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-xl text-sm font-medium hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
              >
                {transitioning ? 'Updating...' : 'Mark Ready to Post'}
              </button>
            )}
            {video.status === 'draft' && (
              <button
                type="button"
                onClick={() => handleTransition('needs_edit')}
                disabled={transitioning}
                className="w-full py-3 min-h-[48px] bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-xl text-sm font-medium hover:bg-blue-500/20 transition-colors disabled:opacity-50"
              >
                {transitioning ? 'Updating...' : 'Send to Edit Queue'}
              </button>
            )}
            {video.status !== 'draft' && video.status !== 'needs_edit' && (
              <p className="text-zinc-500 text-sm">Editing complete.</p>
            )}
          </div>
        </AccordionSection>

        {/* 6b. Editing Suggestions */}
        <AccordionSection
          title="Editing Suggestions"
          icon={Wand2}
          isComplete={editingSuggestions.length > 0}
          defaultOpen={false}
        >
          <div className="space-y-3">
            {editingSuggestions.length === 0 ? (
              <button
                type="button"
                onClick={async () => {
                  setAnalyzingEdits(true);
                  try {
                    const res = await fetch('/api/intelligence/analyze-edit', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ content_item_id: videoId }),
                    });
                    const json = await res.json();
                    if (json.ok) setEditingSuggestions(json.data.suggestions);
                  } catch {
                    showError('Failed to analyze transcript');
                  } finally {
                    setAnalyzingEdits(false);
                  }
                }}
                disabled={analyzingEdits}
                className="w-full py-3 min-h-[48px] bg-violet-500/10 text-violet-400 border border-violet-500/20 rounded-xl text-sm font-medium hover:bg-violet-500/20 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {analyzingEdits ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                {analyzingEdits ? 'Analyzing...' : 'Analyze Transcript for Edits'}
              </button>
            ) : (
              <div className="space-y-2">
                {editingSuggestions.map((s, i) => {
                  const typeColors: Record<string, string> = {
                    cut_pause: 'text-red-400 bg-red-400/10',
                    remove_mistake: 'text-orange-400 bg-orange-400/10',
                    add_broll: 'text-blue-400 bg-blue-400/10',
                    add_text_overlay: 'text-teal-400 bg-teal-400/10',
                    highlight_hook: 'text-amber-400 bg-amber-400/10',
                  };
                  const formatTime = (t: number | null) => {
                    if (t == null) return '';
                    const m = Math.floor(t / 60);
                    const sec = Math.floor(t % 60);
                    return `${m}:${String(sec).padStart(2, '0')}`;
                  };
                  return (
                    <div key={i} className="flex items-start gap-3 bg-zinc-800/50 rounded-lg p-3">
                      <span className="text-xs text-zinc-500 font-mono w-16 flex-shrink-0 pt-0.5">
                        {formatTime(s.timestamp_start)}
                        {s.timestamp_end != null ? `–${formatTime(s.timestamp_end)}` : ''}
                      </span>
                      <div className="flex-1">
                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase mb-1 ${typeColors[s.type] || 'text-zinc-400 bg-zinc-700'}`}>
                          {s.type.replace(/_/g, ' ')}
                        </span>
                        <p className="text-sm text-zinc-300">{s.suggestion}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </AccordionSection>

        {/* 7. Post Package */}
        <AccordionSection
          title="Post Package"
          icon={Send}
          isComplete={!!postingMeta?.caption}
          defaultOpen={isPostOpen}
        >
          {postingMeta?.caption ? (
            <div className="space-y-3">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Caption</p>
                <div className="bg-zinc-800/50 rounded-lg p-3 text-sm text-zinc-300 whitespace-pre-wrap">
                  {String(postingMeta.caption)}
                </div>
              </div>
              {postingMeta.hashtags && Array.isArray(postingMeta.hashtags) && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">Hashtags</p>
                  <p className="text-sm text-teal-400">{postingMeta.hashtags.join(' ')}</p>
                </div>
              )}
              {postingMeta.cta_line && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">CTA</p>
                  <p className="text-sm text-zinc-300">{String(postingMeta.cta_line)}</p>
                </div>
              )}
              <button
                type="button"
                onClick={() => {
                  const full = [
                    postingMeta.caption,
                    '',
                    postingMeta.hashtags ? (postingMeta.hashtags as string[]).join(' ') : '',
                    '',
                    postingMeta.cta_line || '',
                  ].join('\n');
                  copyToClipboard(full, 'Post package');
                }}
                className="flex items-center gap-1.5 px-4 py-2.5 min-h-[44px] text-sm text-zinc-400 hover:text-white bg-zinc-800 rounded-xl transition-colors"
              >
                <Copy className="w-4 h-4" />
                Copy Package
              </button>
              {video.status === 'ready_to_post' && (
                <button
                  type="button"
                  onClick={() => handleTransition('posted')}
                  disabled={transitioning}
                  className="w-full py-3 min-h-[48px] bg-purple-500/10 text-purple-400 border border-purple-500/20 rounded-xl text-sm font-medium hover:bg-purple-500/20 transition-colors disabled:opacity-50"
                >
                  {transitioning ? 'Updating...' : 'Mark as Posted'}
                </button>
              )}
            </div>
          ) : (
            <div className="text-center py-4">
              <p className="text-zinc-500 text-sm">No post package generated yet.</p>
            </div>
          )}
        </AccordionSection>

        {/* 8. Winning Patterns */}
        {winnerPatterns.length > 0 && (
          <AccordionSection
            title="Winning Patterns"
            icon={Trophy}
            isComplete={null}
            defaultOpen={video.status === 'draft' || video.status === 'ready_to_post'}
          >
            <div className="space-y-2">
              <p className="text-xs text-zinc-500 mb-3">
                Top patterns for this product/platform based on your past performance.
              </p>
              {winnerPatterns.slice(0, 3).map((pat) => (
                <div key={pat.id} className="bg-zinc-800/50 rounded-lg p-3 space-y-2">
                  {pat.hook_text && (
                    <p className="text-sm text-white font-medium leading-relaxed">
                      &ldquo;{pat.hook_text}&rdquo;
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-2 text-[10px]">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      Score {pat.score}
                    </span>
                    {pat.format_tag && (
                      <span className="px-2 py-0.5 rounded-md font-medium uppercase tracking-wider bg-violet-500/10 text-violet-400 border border-violet-500/20">
                        {pat.format_tag}
                      </span>
                    )}
                    {pat.length_bucket && (
                      <span className="px-2 py-0.5 rounded-md font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
                        {pat.length_bucket}
                      </span>
                    )}
                    <span className="text-zinc-600">{pat.sample_size} posts</span>
                  </div>
                  <Link
                    href={`/admin/content-studio?${new URLSearchParams({
                      ...(pat.hook_text ? { inspiration: pat.hook_text } : {}),
                      ...(pat.format_tag ? { format: pat.format_tag } : {}),
                    }).toString()}`}
                    className="flex items-center justify-center gap-1.5 w-full py-2 min-h-[40px] text-xs font-medium text-teal-400 bg-teal-500/10 border border-teal-500/20 rounded-lg hover:bg-teal-500/20 transition-colors"
                  >
                    <Sparkles className="w-3 h-3" />
                    Apply to Script
                  </Link>
                </div>
              ))}
            </div>
          </AccordionSection>
        )}

        {/* 9. Posts + Metrics */}
        <AccordionSection
          title="Posts + Metrics"
          icon={BarChart3}
          isComplete={!!video.posted_url}
          defaultOpen={isMetricsOpen}
        >
          {video.posted_url ? (
            <a
              href={video.posted_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-teal-400 hover:text-teal-300 min-h-[44px]"
            >
              <ExternalLink className="w-4 h-4" />
              View on {video.posted_platform || 'platform'}
            </a>
          ) : (
            <p className="text-zinc-500 text-sm py-2">No post URL added yet.</p>
          )}
        </AccordionSection>

        {/* 9. Activity Log */}
        <AccordionSection title="Activity Log" icon={FileText} isComplete={null} defaultOpen={false}>
          {events.length > 0 ? (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {events.slice(0, 20).map((evt) => (
                <div key={evt.id} className="flex items-start gap-2 text-xs">
                  <span className="text-zinc-600 whitespace-nowrap">
                    {new Date(evt.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span className="text-zinc-400">
                    {evt.event_type.replace(/_/g, ' ')}
                    {evt.to_status && <span className="text-teal-400"> → {evt.to_status}</span>}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-zinc-500 text-sm py-2">No events recorded.</p>
          )}
        </AccordionSection>
      </div>
    </div>
  );
}
