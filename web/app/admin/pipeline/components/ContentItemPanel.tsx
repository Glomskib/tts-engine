'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTheme, getThemeColors } from '@/app/components/ThemeProvider';
import { useToast } from '@/contexts/ToastContext';
import { X, Copy, ExternalLink, FileText, Sparkles, Palette, Upload, Hash, Clock, ChevronDown, Lock, FolderPlus, Loader2, Film, Scissors, BarChart3, Plus, Brain, Trophy, ChevronRight } from 'lucide-react';
import type { ContentItem, ContentItemStatus, CowTier, ProcessingStatus, ContentItemPost, MetricsSnapshot, PostPlatform, ContentItemAIInsight } from '@/lib/content-items/types';
import type { EditorNotesJSON } from '@/lib/content-items/editor-notes-schema';
import type { PostmortemJSON } from '@/lib/ai/postmortem/generatePostmortem';
import type { CreatorBriefData, PurpleCowTier } from '@/lib/briefs/creator-brief-types';

interface ContentItemPanelProps {
  contentItemId: string;
  onClose: () => void;
  onOpenRecordingKit: (item: ContentItem, brief: CreatorBriefData | null) => void;
}

type PanelTab = 'brief' | 'script' | 'purple_cow' | 'upload' | 'editor_notes' | 'performance' | 'meta' | 'history';

const STATUS_LABELS: Record<ContentItemStatus, string> = {
  briefing: 'Briefing',
  ready_to_record: 'Ready to Record',
  recorded: 'Recorded',
  editing: 'Editing',
  ready_to_post: 'Ready to Post',
  posted: 'Posted',
};

const TIER_LABELS: Record<CowTier, string> = {
  safe: 'Safe',
  edgy: 'Edgy',
  unhinged: 'Unhinged',
};

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition"
      title={`Copy ${label || ''}`}
    >
      <Copy size={12} />
      {copied ? 'Copied!' : label || 'Copy'}
    </button>
  );
}

function ClaimRiskBadge({ score }: { score: number }) {
  const level = score >= 70 ? 'HIGH' : score >= 30 ? 'MED' : 'LOW';
  const color = level === 'HIGH' ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
    : level === 'MED' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
    : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
  return <span className={`px-2 py-0.5 rounded text-xs font-medium ${color}`}>Risk: {level} ({score})</span>;
}

function PurpleCowSection({ tier, name }: { tier: PurpleCowTier; name: string }) {
  return (
    <div className="space-y-2">
      <h4 className="font-semibold text-sm">{name}</h4>
      {tier.visual_interrupts?.length > 0 && (
        <div><span className="text-xs font-medium text-gray-500">Visual:</span> <span className="text-sm">{tier.visual_interrupts.join(', ')}</span></div>
      )}
      {tier.audio_interrupts?.length > 0 && (
        <div><span className="text-xs font-medium text-gray-500">Audio:</span> <span className="text-sm">{tier.audio_interrupts.join(', ')}</span></div>
      )}
      {tier.behavioral_interrupts?.length > 0 && (
        <div><span className="text-xs font-medium text-gray-500">Behavioral:</span> <span className="text-sm">{tier.behavioral_interrupts.join(', ')}</span></div>
      )}
      {tier.comment_bait?.length > 0 && (
        <div><span className="text-xs font-medium text-gray-500">Comment Bait:</span> <span className="text-sm">{tier.comment_bait.join(' | ')}</span></div>
      )}
    </div>
  );
}

const PROCESSING_BADGE_STYLES: Record<ProcessingStatus, string> = {
  none: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400',
  pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  processing: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  completed: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  failed: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
};

function ProcessingBadge({ status }: { status: ProcessingStatus }) {
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${PROCESSING_BADGE_STYLES[status]}`}>
      {status === 'processing' ? 'Processing...' : status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function UploadTab({ item, assetCounts, onItemUpdate }: { item: ContentItem; assetCounts: Record<string, number>; onItemUpdate: (i: ContentItem) => void }) {
  const { showSuccess, showError } = useToast();
  const [creatingFolder, setCreatingFolder] = useState(false);

  const handleCreateFolder = async () => {
    setCreatingFolder(true);
    try {
      const res = await fetch(`/api/content-items/${item.id}/drive-folder`, { method: 'POST' });
      const json = await res.json();
      if (json.ok) {
        onItemUpdate({ ...item, drive_folder_id: json.data.drive_folder_id, drive_folder_url: json.data.drive_folder_url });
        showSuccess('Upload folder created');
      } else {
        showError(json.error || 'Failed to create folder');
      }
    } catch {
      showError('Failed to create folder');
    } finally {
      setCreatingFolder(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Drive folder */}
      {item.drive_folder_url ? (
        <a
          href={item.drive_folder_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-4 py-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-sm text-blue-700 dark:text-blue-300 hover:bg-blue-100 transition"
        >
          <ExternalLink size={14} /> Open Upload Folder
        </a>
      ) : (
        <button
          onClick={handleCreateFolder}
          disabled={creatingFolder}
          className="flex items-center gap-2 px-4 py-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-sm text-blue-700 dark:text-blue-300 hover:bg-blue-100 transition w-full disabled:opacity-50"
        >
          {creatingFolder ? <Loader2 size={14} className="animate-spin" /> : <FolderPlus size={14} />}
          {creatingFolder ? 'Creating folder...' : 'Create Upload Folder'}
        </button>
      )}
      {item.brief_doc_url && (
        <a
          href={item.brief_doc_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-4 py-2 bg-green-50 dark:bg-green-900/20 rounded-lg text-sm text-green-700 dark:text-green-300 hover:bg-green-100 transition"
        >
          <FileText size={14} /> Open Brief Doc
        </a>
      )}

      {/* Raw footage status */}
      {item.raw_footage_url ? (
        <a
          href={item.raw_footage_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-4 py-2 bg-orange-50 dark:bg-orange-900/20 rounded-lg text-sm text-orange-700 dark:text-orange-300 hover:bg-orange-100 transition"
        >
          <Film size={14} /> View Raw Footage
        </a>
      ) : item.drive_folder_url ? (
        <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 dark:bg-gray-800 rounded-lg text-sm text-gray-500">
          <Upload size={14} /> Waiting for raw footage upload...
        </div>
      ) : null}

      {/* Processing Status */}
      {(item.transcript_status !== 'none' || item.editor_notes_status !== 'none') && (
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-gray-500">Processing</h4>
          <div className="flex justify-between text-sm items-center">
            <span>Transcription</span>
            <ProcessingBadge status={item.transcript_status} />
          </div>
          <div className="flex justify-between text-sm items-center">
            <span>Editor Notes</span>
            <ProcessingBadge status={item.editor_notes_status} />
          </div>
        </div>
      )}

      {/* Assets */}
      <div className="space-y-2">
        <h4 className="text-xs font-medium text-gray-500">Assets</h4>
        {Object.entries(assetCounts).length > 0 ? (
          Object.entries(assetCounts).map(([kind, count]) => (
            <div key={kind} className="flex justify-between text-sm">
              <span className="capitalize">{kind.replace(/_/g, ' ')}</span>
              <span className="text-gray-500">{count}</span>
            </div>
          ))
        ) : (
          <p className="text-sm text-gray-500">No assets uploaded yet</p>
        )}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500">Filename token:</span>
        <CopyButton text={`[${item.short_id}]`} label={`[${item.short_id}]`} />
      </div>
    </div>
  );
}

// ─── Platform badge colors ───────────────────────────────────

const PLATFORM_COLORS: Record<string, string> = {
  tiktok: 'bg-black text-white',
  instagram: 'bg-gradient-to-r from-purple-500 to-pink-500 text-white',
  youtube: 'bg-red-600 text-white',
  facebook: 'bg-blue-600 text-white',
  other: 'bg-gray-500 text-white',
};

function PlatformBadge({ platform }: { platform: string }) {
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${PLATFORM_COLORS[platform] || PLATFORM_COLORS.other}`}>
      {platform}
    </span>
  );
}

const SCORE_COLORS: Record<string, string> = {
  'A+': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  'A': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  'B': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  'C': 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  'D': 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
};

function ContentScoreBadge({ grade }: { grade: string }) {
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${SCORE_COLORS[grade] || SCORE_COLORS.D}`}>
      {grade}
    </span>
  );
}

// ─── Add Post Modal ──────────────────────────────────────────

function AddPostModal({ contentItemId, onClose, onCreated }: {
  contentItemId: string;
  onClose: () => void;
  onCreated: (post: ContentItemPost) => void;
}) {
  const { showSuccess, showError } = useToast();
  const [saving, setSaving] = useState(false);
  const [postUrl, setPostUrl] = useState('');
  const [platform, setPlatform] = useState<PostPlatform | ''>('');
  const [postedAt, setPostedAt] = useState('');
  const [captionUsed, setCaptionUsed] = useState('');
  const [hashtagsUsed, setHashtagsUsed] = useState('');

  // Auto-infer platform from URL
  useEffect(() => {
    if (!postUrl || platform) return;
    const patterns: Array<[PostPlatform, RegExp]> = [
      ['tiktok', /tiktok\.com/i],
      ['instagram', /instagram\.com/i],
      ['youtube', /youtube\.com|youtu\.be/i],
      ['facebook', /facebook\.com|fb\.watch/i],
    ];
    for (const [p, re] of patterns) {
      if (re.test(postUrl)) { setPlatform(p); break; }
    }
  }, [postUrl, platform]);

  const handleSave = async () => {
    if (!postUrl.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/content-items/${contentItemId}/posts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          post_url: postUrl.trim(),
          platform: platform || undefined,
          posted_at: postedAt || undefined,
          caption_used: captionUsed || undefined,
          hashtags_used: hashtagsUsed || undefined,
        }),
      });
      const json = await res.json();
      if (json.ok) {
        showSuccess('Post added');
        onCreated(json.data);
        onClose();
      } else {
        showError(json.error || 'Failed to add post');
      }
    } catch {
      showError('Failed to add post');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-md p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">Add Post</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800"><X size={16} /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-500">Post URL *</label>
            <input
              type="url"
              value={postUrl}
              onChange={e => setPostUrl(e.target.value)}
              placeholder="https://www.tiktok.com/@user/video/..."
              className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500">Platform</label>
            <select
              value={platform}
              onChange={e => setPlatform(e.target.value as PostPlatform)}
              className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
            >
              <option value="">Auto-detect from URL</option>
              <option value="tiktok">TikTok</option>
              <option value="instagram">Instagram</option>
              <option value="youtube">YouTube</option>
              <option value="facebook">Facebook</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500">Posted At</label>
            <input
              type="datetime-local"
              value={postedAt}
              onChange={e => setPostedAt(e.target.value)}
              className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500">Caption Used</label>
            <textarea
              value={captionUsed}
              onChange={e => setCaptionUsed(e.target.value)}
              rows={2}
              className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 resize-none"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500">Hashtags Used</label>
            <input
              type="text"
              value={hashtagsUsed}
              onChange={e => setHashtagsUsed(e.target.value)}
              placeholder="#viral #fyp #product"
              className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
            />
          </div>
        </div>
        <button
          onClick={handleSave}
          disabled={saving || !postUrl.trim()}
          className="w-full px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Add Post'}
        </button>
      </div>
    </div>
  );
}

// ─── Add Metrics Modal ──────────────────────────────────────

function AddMetricsModal({ contentItemId, postId, onClose, onCreated }: {
  contentItemId: string;
  postId: string;
  onClose: () => void;
  onCreated: (snapshot: MetricsSnapshot) => void;
}) {
  const { showSuccess, showError } = useToast();
  const [saving, setSaving] = useState(false);
  const [views, setViews] = useState('');
  const [likes, setLikes] = useState('');
  const [comments, setComments] = useState('');
  const [shares, setShares] = useState('');
  const [saves, setSaves] = useState('');

  const parseNum = (v: string) => v ? parseInt(v, 10) : undefined;

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/content-items/${contentItemId}/metrics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content_item_post_id: postId,
          views: parseNum(views),
          likes: parseNum(likes),
          comments: parseNum(comments),
          shares: parseNum(shares),
          saves: parseNum(saves),
        }),
      });
      const json = await res.json();
      if (json.ok) {
        showSuccess('Metrics saved');
        onCreated(json.data);
        onClose();
      } else {
        showError(json.error || 'Failed to save metrics');
      }
    } catch {
      showError('Failed to save metrics');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-sm p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">Add Metrics</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800"><X size={16} /></button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[
            ['Views', views, setViews],
            ['Likes', likes, setLikes],
            ['Comments', comments, setComments],
            ['Shares', shares, setShares],
            ['Saves', saves, setSaves],
          ].map(([label, val, setter]) => (
            <div key={label as string}>
              <label className="text-xs font-medium text-gray-500">{label as string}</label>
              <input
                type="number"
                min="0"
                value={val as string}
                onChange={e => (setter as (v: string) => void)(e.target.value)}
                className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
              />
            </div>
          ))}
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Metrics'}
        </button>
      </div>
    </div>
  );
}

// ─── Postmortem Insight Card ─────────────────────────────────

function PostmortemInsightCard({ insight, onRegenerate, regenerating }: {
  insight: ContentItemAIInsight;
  onRegenerate: () => void;
  regenerating: boolean;
}) {
  const pm = insight.json as PostmortemJSON | null;
  if (!pm) return null;

  return (
    <div className="bg-purple-50 dark:bg-purple-900/20 p-3 rounded-lg space-y-2 text-xs">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 font-semibold text-purple-800 dark:text-purple-200">
          <Brain size={12} /> AI Postmortem
          {pm.winner_candidate && (
            <span className="ml-1 px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 flex items-center gap-0.5">
              <Trophy size={10} /> Winner
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-400">{new Date(insight.generated_at).toLocaleDateString()}</span>
          <button
            onClick={onRegenerate}
            disabled={regenerating}
            className="text-[10px] text-purple-600 hover:underline disabled:opacity-50"
          >
            {regenerating ? 'Regenerating...' : 'Regenerate'}
          </button>
        </div>
      </div>

      <p className="text-gray-700 dark:text-gray-300">{pm.summary}</p>

      {/* Hook Analysis */}
      <div className="flex items-center gap-3">
        <span className="font-medium text-gray-500">Hook:</span>
        <span>{pm.hook_analysis.hook_strength}/10</span>
        <span className="text-gray-400">|</span>
        <span className="italic">{pm.hook_analysis.pattern_detected}</span>
        <span className="text-gray-400">|</span>
        <span>Scroll-stop: {pm.hook_analysis.scroll_stop_rating}/10</span>
      </div>

      {/* Engagement */}
      <div className="flex items-center gap-3">
        <span className="font-medium text-gray-500">Engagement:</span>
        <span>{pm.engagement_analysis.engagement_rate.toFixed(1)}%</span>
        <span className="text-gray-400">|</span>
        <span>Sentiment: {pm.engagement_analysis.comment_sentiment}</span>
      </div>

      {/* What worked / failed */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <span className="font-medium text-green-700 dark:text-green-400">Worked:</span>
          <ul className="list-disc list-inside mt-0.5 text-gray-600 dark:text-gray-400">
            {pm.what_worked.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
        {pm.what_failed.length > 0 && (
          <div>
            <span className="font-medium text-red-700 dark:text-red-400">Missed:</span>
            <ul className="list-disc list-inside mt-0.5 text-gray-600 dark:text-gray-400">
              {pm.what_failed.map((f, i) => <li key={i}>{f}</li>)}
            </ul>
          </div>
        )}
      </div>

      {/* Next Ideas */}
      {pm.next_ideas.length > 0 && (
        <div>
          <span className="font-medium text-blue-700 dark:text-blue-400">Next Ideas:</span>
          <ul className="mt-0.5 text-gray-600 dark:text-gray-400">
            {pm.next_ideas.map((idea, i) => (
              <li key={i} className="flex items-start gap-1">
                <ChevronRight size={10} className="mt-0.5 flex-shrink-0" /> {idea}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─── Performance Tab ─────────────────────────────────────────

function PerformanceTab({ contentItemId }: { contentItemId: string }) {
  const [posts, setPosts] = useState<ContentItemPost[]>([]);
  const [metrics, setMetrics] = useState<Record<string, MetricsSnapshot>>({});
  const [insights, setInsights] = useState<Record<string, ContentItemAIInsight>>({});
  const [loading, setLoading] = useState(true);
  const [showAddPost, setShowAddPost] = useState(false);
  const [metricsPostId, setMetricsPostId] = useState<string | null>(null);
  const [generatingPostmortem, setGeneratingPostmortem] = useState<string | null>(null);
  const [expandedInsight, setExpandedInsight] = useState<string | null>(null);
  const { showToast } = useToast();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [postsRes, metricsRes] = await Promise.all([
        fetch(`/api/content-items/${contentItemId}/posts`),
        fetch(`/api/content-items/${contentItemId}/metrics`),
      ]);
      const [postsJson, metricsJson] = await Promise.all([postsRes.json(), metricsRes.json()]);

      if (postsJson.ok) {
        const loadedPosts = postsJson.data || [];
        setPosts(loadedPosts);

        // Fetch postmortem insights for each post
        const insightMap: Record<string, ContentItemAIInsight> = {};
        await Promise.all(
          loadedPosts.map(async (p: ContentItemPost) => {
            try {
              const res = await fetch(`/api/content-items/posts/${p.id}/postmortem`);
              const json = await res.json();
              if (json.ok && json.data) insightMap[p.id] = json.data;
            } catch { /* silent */ }
          }),
        );
        setInsights(insightMap);
      }
      if (metricsJson.ok) {
        const map: Record<string, MetricsSnapshot> = {};
        for (const s of (metricsJson.data || []) as MetricsSnapshot[]) {
          map[s.content_item_post_id] = s;
        }
        setMetrics(map);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [contentItemId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleGeneratePostmortem = async (postId: string) => {
    setGeneratingPostmortem(postId);
    try {
      const res = await fetch(`/api/content-items/posts/${postId}/postmortem`, { method: 'POST' });
      const json = await res.json();
      if (json.ok && json.data) {
        setInsights(prev => ({ ...prev, [postId]: json.data }));
        setExpandedInsight(postId);
        showToast({ message: 'Postmortem generated', type: 'success' });
      } else {
        showToast({ message: json.error || 'Failed to generate postmortem', type: 'error' });
      }
    } catch {
      showToast({ message: 'Failed to generate postmortem', type: 'error' });
    } finally {
      setGeneratingPostmortem(null);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-8 text-gray-500">
        <Loader2 size={24} className="mx-auto mb-2 animate-spin opacity-30" />
        <p className="text-sm">Loading performance data...</p>
      </div>
    );
  }

  const formatNum = (n: number | null | undefined) => {
    if (n == null) return '-';
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
  };

  return (
    <div className="space-y-4">
      {/* Posts Section */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-sm">Posts</h3>
          <button
            onClick={() => setShowAddPost(true)}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700 transition"
          >
            <Plus size={12} /> Add Post
          </button>
        </div>

        {posts.length === 0 ? (
          <div className="text-center py-6 text-gray-500">
            <BarChart3 size={24} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">No posts linked yet.</p>
            <p className="text-xs text-gray-400 mt-1">Add a post URL after publishing to track performance.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {posts.map(post => {
              const snapshot = metrics[post.id];
              return (
                <div key={post.id} className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg space-y-2">
                  <div className="flex items-center gap-2">
                    <PlatformBadge platform={post.platform} />
                    {post.performance_score && <ContentScoreBadge grade={post.performance_score} />}
                    <a href={post.post_url} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:underline truncate flex-1 flex items-center gap-1">
                      <ExternalLink size={10} /> {post.post_url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 40)}...
                    </a>
                  </div>

                  {post.posted_at && (
                    <div className="text-[10px] text-gray-400">
                      Posted {new Date(post.posted_at).toLocaleDateString()} {new Date(post.posted_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  )}

                  {/* Metrics row */}
                  {snapshot ? (
                    <div className="flex items-center gap-3 text-xs">
                      {snapshot.views != null && <span title="Views">{formatNum(snapshot.views)} views</span>}
                      {snapshot.likes != null && <span title="Likes">{formatNum(snapshot.likes)} likes</span>}
                      {snapshot.comments != null && <span title="Comments">{formatNum(snapshot.comments)} comments</span>}
                      {snapshot.shares != null && <span title="Shares">{formatNum(snapshot.shares)} shares</span>}
                      {snapshot.saves != null && <span title="Saves">{formatNum(snapshot.saves)} saves</span>}
                    </div>
                  ) : null}

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setMetricsPostId(post.id)}
                      className="text-[10px] text-indigo-600 hover:underline"
                    >
                      {snapshot ? 'Update Metrics' : 'Add Metrics'}
                    </button>
                    {snapshot && (
                      <>
                        <span className="text-[10px] text-gray-400">
                          Updated {new Date(snapshot.captured_at).toLocaleDateString()}
                        </span>
                        <span className="text-[10px] text-gray-300 dark:text-gray-600">|</span>
                        {insights[post.id] ? (
                          <button
                            onClick={() => setExpandedInsight(expandedInsight === post.id ? null : post.id)}
                            className="text-[10px] text-purple-600 hover:underline flex items-center gap-0.5"
                          >
                            <Brain size={10} /> View Postmortem
                          </button>
                        ) : (
                          <button
                            onClick={() => handleGeneratePostmortem(post.id)}
                            disabled={generatingPostmortem === post.id}
                            className="text-[10px] text-purple-600 hover:underline flex items-center gap-0.5 disabled:opacity-50"
                          >
                            {generatingPostmortem === post.id ? (
                              <><Loader2 size={10} className="animate-spin" /> Analyzing...</>
                            ) : (
                              <><Brain size={10} /> AI Postmortem</>
                            )}
                          </button>
                        )}
                      </>
                    )}
                  </div>

                  {/* AI Postmortem Insight */}
                  {expandedInsight === post.id && insights[post.id] && (
                    <PostmortemInsightCard
                      insight={insights[post.id]}
                      onRegenerate={() => handleGeneratePostmortem(post.id)}
                      regenerating={generatingPostmortem === post.id}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modals */}
      {showAddPost && (
        <AddPostModal
          contentItemId={contentItemId}
          onClose={() => setShowAddPost(false)}
          onCreated={(post) => { setPosts(prev => [post, ...prev]); }}
        />
      )}
      {metricsPostId && (
        <AddMetricsModal
          contentItemId={contentItemId}
          postId={metricsPostId}
          onClose={() => setMetricsPostId(null)}
          onCreated={(snapshot) => {
            setMetrics(prev => ({ ...prev, [snapshot.content_item_post_id]: snapshot }));
          }}
        />
      )}
    </div>
  );
}

function formatSec(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

const TIMELINE_LABEL_COLORS: Record<string, string> = {
  keep: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  cut: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  tighten: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  broll: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  text: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  retake: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
};

function EditorNotesTab({ item, onRetry }: { item: ContentItem; onRetry: (field: 'transcript_status' | 'editor_notes_status') => void }) {
  const enhanced = item.editor_notes_json as EditorNotesJSON | null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h3 className="font-semibold text-sm">Editor Notes</h3>
        <ProcessingBadge status={item.editor_notes_status} />
      </div>

      {/* Failed state with retry */}
      {item.editor_notes_status === 'failed' && (
        <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded-lg space-y-2">
          <p className="text-sm text-red-700 dark:text-red-300">
            {item.editor_notes_error || 'Editor notes generation failed.'}
          </p>
          <button
            onClick={() => onRetry('editor_notes_status')}
            className="px-3 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 transition"
          >
            Retry
          </button>
        </div>
      )}

      {/* Transcript failed */}
      {item.transcript_status === 'failed' && (
        <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded-lg space-y-2">
          <p className="text-sm text-red-700 dark:text-red-300">
            Transcription failed: {item.transcript_error || 'Unknown error'}
          </p>
          <button
            onClick={() => onRetry('transcript_status')}
            className="px-3 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 transition"
          >
            Retry Transcription
          </button>
        </div>
      )}

      {/* Processing state */}
      {(item.editor_notes_status === 'pending' || item.editor_notes_status === 'processing' ||
        item.transcript_status === 'pending' || item.transcript_status === 'processing') &&
        item.editor_notes_status !== 'failed' && item.transcript_status !== 'failed' && (
        <div className="text-center py-8 text-gray-500">
          <Loader2 size={24} className="mx-auto mb-2 animate-spin opacity-30" />
          <p className="text-sm">
            {item.transcript_status === 'pending' || item.transcript_status === 'processing'
              ? 'Transcribing raw footage...'
              : 'Generating editor notes...'}
          </p>
        </div>
      )}

      {/* Enhanced notes display */}
      {enhanced && (
        <>
          {/* Summary */}
          <div className="bg-indigo-50 dark:bg-indigo-900/20 p-3 rounded-lg text-sm">
            {enhanced.summary}
          </div>

          {/* Editing Style */}
          <div className="space-y-1">
            <h4 className="text-xs font-medium text-gray-500">Editing Style</h4>
            <div className="text-sm space-y-1 bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
              <div><span className="font-medium">Pace:</span> {enhanced.editing_style.pace}</div>
              <div><span className="font-medium">Jump Cuts:</span> {enhanced.editing_style.jump_cut_recommendation}</div>
              <div><span className="font-medium">Music/SFX:</span> {enhanced.editing_style.music_sfx_notes}</div>
            </div>
          </div>

          {/* Caption + Hashtags — copy-friendly */}
          <div className="space-y-2">
            <h4 className="text-xs font-medium text-gray-500">Caption</h4>
            <div className="flex items-start justify-between bg-gray-50 dark:bg-gray-800 p-2 rounded text-sm">
              <span>{enhanced.caption.primary}</span>
              <CopyButton text={enhanced.caption.primary} label="Copy" />
            </div>
            <div className="flex items-start justify-between bg-gray-50 dark:bg-gray-800 p-2 rounded text-sm text-gray-500">
              <span>{enhanced.caption.alt}</span>
              <CopyButton text={enhanced.caption.alt} label="Alt" />
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-medium text-gray-500">Hashtags</h4>
              <CopyButton text={enhanced.hashtags.join(' ')} label="Copy All" />
            </div>
            <div className="flex flex-wrap gap-1">
              {enhanced.hashtags.map((h, i) => (
                <span key={i} className="text-xs bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded">{h}</span>
              ))}
            </div>
          </div>

          {/* Timeline */}
          {enhanced.timeline?.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-gray-500 mb-1">Timeline</h4>
              <div className="space-y-1">
                {enhanced.timeline.map((t, i) => (
                  <div key={i} className="text-sm bg-gray-50 dark:bg-gray-800 p-2 rounded">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-gray-400">{formatSec(t.start_sec)}–{formatSec(t.end_sec)}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${TIMELINE_LABEL_COLORS[t.label] || 'bg-gray-100'}`}>
                        {t.label}
                      </span>
                    </div>
                    <p className="text-gray-600 dark:text-gray-400 mt-0.5">{t.note}</p>
                    {t.broll && <p className="text-xs text-blue-600 mt-0.5">B-Roll: {t.broll}</p>}
                    {t.on_screen_text && <p className="text-xs text-purple-600 mt-0.5">Text: {t.on_screen_text}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Mistakes / Retakes */}
          {enhanced.mistakes_retakes?.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-gray-500 mb-1">Mistakes / Retakes</h4>
              <div className="space-y-1">
                {enhanced.mistakes_retakes.map((m, i) => (
                  <div key={i} className="text-sm bg-orange-50 dark:bg-orange-900/20 p-2 rounded">
                    <span className="font-mono text-xs text-gray-400">{formatSec(m.at_sec)}</span>{' '}
                    <span className="font-medium">{m.issue}</span> — <span className="text-gray-500">{m.fix}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* B-Roll Pack */}
          {enhanced.broll_pack?.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-gray-500 mb-1">B-Roll Pack</h4>
              <div className="space-y-1">
                {enhanced.broll_pack.map((b, i) => (
                  <div key={i} className="text-sm bg-blue-50 dark:bg-blue-900/20 p-2 rounded">
                    <span className="font-mono text-xs text-gray-400">{formatSec(b.at_sec)}</span>{' '}
                    <span className="text-xs font-medium text-blue-600">[{b.type}]</span>{' '}
                    {b.prompt}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* CTA */}
          {enhanced.cta && (
            <div>
              <h4 className="text-xs font-medium text-gray-500 mb-1">CTA</h4>
              <div className="text-sm bg-green-50 dark:bg-green-900/20 p-2 rounded">
                <span className="font-mono text-xs text-gray-400">{formatSec(enhanced.cta.at_sec)}</span>{' '}
                &ldquo;{enhanced.cta.line}&rdquo;
              </div>
            </div>
          )}

          {/* Comment Bait */}
          {enhanced.comment_bait && (
            <div className="space-y-2">
              <h4 className="text-xs font-medium text-gray-500">Comment Bait</h4>
              {(['safe', 'spicy', 'chaotic'] as const).map(tier => {
                const items = enhanced.comment_bait[tier];
                if (!items?.length) return null;
                const tierColors = tier === 'safe' ? 'bg-green-50 dark:bg-green-900/20' : tier === 'spicy' ? 'bg-orange-50 dark:bg-orange-900/20' : 'bg-red-50 dark:bg-red-900/20';
                return (
                  <div key={tier}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium capitalize">{tier}</span>
                      <CopyButton text={items.join('\n')} label="Copy" />
                    </div>
                    <div className={`${tierColors} p-2 rounded space-y-1`}>
                      {items.map((bait, i) => (
                        <p key={i} className="text-sm">{bait}</p>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Fallback: legacy editor_notes if no enhanced notes */}
      {!enhanced && item.editor_notes && item.editor_notes_status === 'completed' && (
        <>
          {item.editor_notes.editing_style && (
            <div className="bg-indigo-50 dark:bg-indigo-900/20 p-3 rounded-lg text-sm">
              <span className="font-medium text-xs text-gray-500">Style: </span>{item.editor_notes.editing_style}
            </div>
          )}
          {item.editor_notes.overall_notes && (
            <div className="text-sm">{item.editor_notes.overall_notes}</div>
          )}
          {item.editor_notes.cut_suggestions?.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-gray-500 mb-1">Cut Suggestions</h4>
              <div className="space-y-1">
                {item.editor_notes.cut_suggestions.map((c, i) => (
                  <div key={i} className="text-sm bg-gray-50 dark:bg-gray-800 p-2 rounded">
                    <span className="font-mono text-xs text-gray-400">{c.start_ts}–{c.end_ts}</span>{' '}
                    <span>{c.reason}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Empty state */}
      {!enhanced && !item.editor_notes &&
        item.editor_notes_status !== 'pending' && item.editor_notes_status !== 'processing' &&
        item.editor_notes_status !== 'failed' && item.transcript_status !== 'failed' && (
        <div className="text-center py-8 text-gray-500">
          <Scissors size={24} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">No editor notes available.</p>
          <p className="text-xs text-gray-400 mt-1">Upload raw footage to trigger automatic generation.</p>
        </div>
      )}
    </div>
  );
}

export default function ContentItemPanel({ contentItemId, onClose, onOpenRecordingKit }: ContentItemPanelProps) {
  const { isDark } = useTheme();
  const colors = getThemeColors(isDark);
  const { showSuccess, showError } = useToast();
  const [item, setItem] = useState<ContentItem | null>(null);
  const [brief, setBrief] = useState<CreatorBriefData | null>(null);
  const [briefMeta, setBriefMeta] = useState<{ version: number; claim_risk_score: number } | null>(null);
  const [winningHooks, setWinningHooks] = useState<Array<{ pattern: string; example_hook: string | null; performance_score: number }>>([]);
  const [assetCounts, setAssetCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [generatingBrief, setGeneratingBrief] = useState(false);
  const [activeTab, setActiveTab] = useState<PanelTab>('brief');
  const [events, setEvents] = useState<Array<{ event_type: string; created_at: string; actor: string }>>([]);

  const fetchItem = useCallback(async () => {
    try {
      const res = await fetch(`/api/content-items/${contentItemId}`);
      const json = await res.json();
      if (json.ok) {
        setItem(json.data);
        setAssetCounts(json.data.asset_counts || {});
        if (json.data.latest_brief?.data) {
          setBrief(json.data.latest_brief.data as CreatorBriefData);
          setBriefMeta({
            version: json.data.latest_brief.version,
            claim_risk_score: json.data.latest_brief.claim_risk_score,
          });
        }
      }
    } catch (err) {
      showError('Failed to load content item');
    } finally {
      setLoading(false);
    }
  }, [contentItemId, showError]);

  useEffect(() => { fetchItem(); }, [fetchItem]);

  // Fetch winning hook patterns
  useEffect(() => {
    fetch('/api/hook-patterns')
      .then(r => r.json())
      .then(json => { if (json.ok) setWinningHooks(json.data || []); })
      .catch(() => {});
  }, []);

  // Fetch history events if video_id exists
  useEffect(() => {
    if (!item?.video_id) return;
    fetch(`/api/pipeline/${item.video_id}/events`)
      .then(r => r.json())
      .then(json => { if (json.ok) setEvents(json.data || []); })
      .catch(() => {});
  }, [item?.video_id]);

  const handleGenerateBrief = async () => {
    if (!item) return;
    setGeneratingBrief(true);
    try {
      const res = await fetch(`/api/content-items/${contentItemId}/brief`, { method: 'POST' });
      const json = await res.json();
      if (json.ok) {
        setBrief(json.data.brief.data as CreatorBriefData);
        setBriefMeta({ version: json.data.brief.version, claim_risk_score: json.data.brief.claim_risk_score });
        setItem(json.data.content_item);
        showSuccess('Brief generated successfully');
      } else {
        showError(json.error || 'Failed to generate brief');
      }
    } catch {
      showError('Failed to generate brief');
    } finally {
      setGeneratingBrief(false);
    }
  };

  const handleRetryProcessing = async (field: 'transcript_status' | 'editor_notes_status') => {
    if (!item) return;
    try {
      const res = await fetch(`/api/content-items/${contentItemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: 'pending' }),
      });
      const json = await res.json();
      if (json.ok) {
        setItem(json.data);
        showSuccess('Retry queued');
      } else {
        showError(json.error || 'Failed to retry');
      }
    } catch {
      showError('Failed to retry');
    }
  };

  const handleStatusChange = async (newStatus: ContentItemStatus) => {
    if (!item) return;
    try {
      const res = await fetch(`/api/content-items/${contentItemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      const json = await res.json();
      if (json.ok) {
        setItem(json.data);
        showSuccess(`Status updated to ${STATUS_LABELS[newStatus]}`);
      }
    } catch {
      showError('Failed to update status');
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-y-0 right-0 w-[480px] bg-white dark:bg-gray-900 shadow-xl z-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  if (!item) return null;

  const tabs: { key: PanelTab; label: string; icon: React.ReactNode }[] = [
    { key: 'brief', label: 'Brief', icon: <FileText size={14} /> },
    { key: 'script', label: 'Script', icon: <Sparkles size={14} /> },
    { key: 'purple_cow', label: 'Purple Cow', icon: <Palette size={14} /> },
    { key: 'upload', label: 'Upload', icon: <Upload size={14} /> },
    { key: 'editor_notes', label: 'Edit Notes', icon: <Scissors size={14} /> },
    { key: 'performance', label: 'Performance', icon: <BarChart3 size={14} /> },
    { key: 'meta', label: 'Meta', icon: <Hash size={14} /> },
    { key: 'history', label: 'History', icon: <Clock size={14} /> },
  ];

  return (
    <div className="fixed inset-y-0 right-0 w-[480px] bg-white dark:bg-gray-900 shadow-xl z-50 flex flex-col border-l border-gray-200 dark:border-gray-700">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-gray-500">{item.short_id}</span>
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
              item.status === 'posted' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
              item.status === 'ready_to_post' ? 'bg-blue-100 text-blue-800' :
              'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
            }`}>
              {STATUS_LABELS[item.status]}
            </span>
          </div>
          <h2 className="text-lg font-semibold truncate mt-1">{item.title}</h2>
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800">
          <X size={20} />
        </button>
      </div>

      {/* Status Changer */}
      <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700 flex items-center gap-2">
        <select
          value={item.status}
          onChange={(e) => handleStatusChange(e.target.value as ContentItemStatus)}
          className="text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1"
        >
          {Object.entries(STATUS_LABELS).map(([val, label]) => (
            <option key={val} value={val}>{label}</option>
          ))}
        </select>
        {item.status === 'ready_to_record' && (
          <button
            onClick={() => onOpenRecordingKit(item, brief)}
            className="px-3 py-1 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700 transition"
          >
            Recording Kit
          </button>
        )}
        {!brief && (
          <button
            onClick={handleGenerateBrief}
            disabled={generatingBrief}
            className="px-3 py-1 text-sm bg-purple-600 text-white rounded hover:bg-purple-700 transition disabled:opacity-50"
          >
            {generatingBrief ? 'Generating...' : 'Generate Brief'}
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1 px-3 py-2 text-xs font-medium whitespace-nowrap border-b-2 transition ${
              activeTab === tab.key
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Brief Tab */}
        {activeTab === 'brief' && (
          <div className="space-y-4">
            {briefMeta && <ClaimRiskBadge score={briefMeta.claim_risk_score} />}
            {brief ? (
              <>
                <div className="bg-indigo-50 dark:bg-indigo-900/20 p-3 rounded-lg italic text-sm">
                  {brief.one_liner}
                </div>
                <div className="space-y-2">
                  <div><span className="text-xs font-medium text-gray-500">Goal:</span> <span className="text-sm">{brief.goal}</span></div>
                  <div><span className="text-xs font-medium text-gray-500">Audience:</span> <span className="text-sm">{brief.audience_persona}</span></div>
                  <div><span className="text-xs font-medium text-gray-500">Success Metric:</span> <span className="text-sm">{brief.success_metric}</span></div>
                  <div><span className="text-xs font-medium text-gray-500">Setting:</span> <span className="text-sm">{brief.setting}</span></div>
                  <div><span className="text-xs font-medium text-gray-500">Plot:</span> <span className="text-sm">{brief.plot}</span></div>
                  <div><span className="text-xs font-medium text-gray-500">Emotional Arc:</span> <span className="text-sm">{brief.emotional_arc}</span></div>
                  <div><span className="text-xs font-medium text-gray-500">Tone:</span> <span className="text-sm">{brief.performance_tone}</span></div>
                </div>
                {brief.beforehand_checklist?.length > 0 && (
                  <div>
                    <h4 className="text-xs font-medium text-gray-500 mb-1">Checklist:</h4>
                    <ul className="text-sm space-y-1">
                      {brief.beforehand_checklist.map((c, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <input type="checkbox" className="mt-0.5" />
                          <span>{c}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {brief.recording_notes?.length > 0 && (
                  <div>
                    <h4 className="text-xs font-medium text-gray-500 mb-1">Recording Notes:</h4>
                    <ul className="text-sm list-disc pl-4 space-y-1">
                      {brief.recording_notes.map((n, i) => <li key={i}>{n}</li>)}
                    </ul>
                  </div>
                )}
                {winningHooks.length > 0 && (
                  <div className="bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded-lg">
                    <h4 className="text-xs font-semibold text-yellow-800 dark:text-yellow-200 mb-2 flex items-center gap-1">
                      <Trophy size={12} /> Winning Hooks
                    </h4>
                    <div className="space-y-1.5">
                      {winningHooks.slice(0, 5).map((h, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs">
                          <span className="font-medium text-yellow-700 dark:text-yellow-300 whitespace-nowrap">{h.performance_score}/10</span>
                          <span className="text-gray-700 dark:text-gray-300">{h.pattern}</span>
                          {h.example_hook && (
                            <span className="text-gray-400 italic truncate">&mdash; {h.example_hook}</span>
                          )}
                        </div>
                      ))}
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1.5">These hooks performed well in past content. Brief generation uses them automatically.</p>
                  </div>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={handleGenerateBrief}
                    disabled={generatingBrief}
                    className="px-3 py-1.5 text-xs bg-purple-600 text-white rounded hover:bg-purple-700 transition disabled:opacity-50"
                  >
                    {generatingBrief ? 'Regenerating...' : 'Regenerate Brief'}
                  </button>
                  {briefMeta && <span className="text-xs text-gray-400 self-center">v{briefMeta.version}</span>}
                </div>
              </>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <FileText size={32} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">No brief generated yet</p>
                <button
                  onClick={handleGenerateBrief}
                  disabled={generatingBrief}
                  className="mt-3 px-4 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition disabled:opacity-50"
                >
                  {generatingBrief ? 'Generating...' : 'Generate Creator Brief'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Script Tab */}
        {activeTab === 'script' && (
          <div className="space-y-3">
            {brief?.script_text ? (
              <>
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-sm">Script</h3>
                  <CopyButton text={brief.script_text} label="Copy Script" />
                </div>
                <pre className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg text-sm whitespace-pre-wrap font-mono">
                  {brief.script_text}
                </pre>
                {brief.scenes?.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="font-semibold text-sm">Scenes</h4>
                    {brief.scenes.map((s, i) => (
                      <div key={i} className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg text-sm space-y-1">
                        <div className="font-medium">Scene {s.scene_number}: {s.framing}</div>
                        <div className="text-gray-600 dark:text-gray-400">{s.action}</div>
                        <div className="italic">&ldquo;{s.spoken_lines}&rdquo;</div>
                        {s.on_screen_text && <div className="text-xs text-indigo-600">On-Screen: {s.on_screen_text}</div>}
                        {s.broll_suggestions?.length > 0 && (
                          <div className="text-xs text-gray-500">B-Roll: {s.broll_suggestions.join(', ')}</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-gray-500">Generate a brief to see the script.</p>
            )}
          </div>
        )}

        {/* Purple Cow Tab */}
        {activeTab === 'purple_cow' && (
          <div className="space-y-4">
            {brief?.purple_cow?.tiers ? (
              <>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs text-gray-500">Selected Tier:</span>
                  <span className="px-2 py-0.5 rounded text-xs font-semibold bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">
                    {TIER_LABELS[item.brief_selected_cow_tier as CowTier] || item.brief_selected_cow_tier}
                  </span>
                </div>
                {(['safe', 'edgy', 'unhinged'] as const).map(t => (
                  brief.purple_cow.tiers[t] && (
                    <div key={t} className={`p-3 rounded-lg border ${
                      item.brief_selected_cow_tier === t
                        ? 'border-purple-400 bg-purple-50 dark:bg-purple-900/20'
                        : 'border-gray-200 dark:border-gray-700'
                    }`}>
                      <PurpleCowSection tier={brief.purple_cow.tiers[t]} name={TIER_LABELS[t]} />
                    </div>
                  )
                ))}
                {brief.purple_cow.notes_for_creator?.length > 0 && (
                  <div>
                    <h4 className="text-xs font-medium text-gray-500 mb-1">Notes for Creator:</h4>
                    <ul className="text-sm list-disc pl-4 space-y-1">
                      {brief.purple_cow.notes_for_creator.map((n, i) => <li key={i}>{n}</li>)}
                    </ul>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-gray-500">Generate a brief to see Purple Cow tiers.</p>
            )}
          </div>
        )}

        {/* Upload Tab */}
        {activeTab === 'upload' && (
          <UploadTab item={item} assetCounts={assetCounts} onItemUpdate={setItem} />
        )}

        {/* Editor Notes Tab */}
        {activeTab === 'editor_notes' && (
          <EditorNotesTab item={item} onRetry={handleRetryProcessing} />
        )}

        {/* Meta Tab */}
        {activeTab === 'meta' && (
          <div className="space-y-3">
            {item.ai_description && (
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-500">AI Description</span>
                  <CopyButton text={item.ai_description} />
                </div>
                <p className="text-sm mt-1">{item.ai_description}</p>
              </div>
            )}
            {item.caption && (
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-500">Caption</span>
                  <CopyButton text={item.caption} />
                </div>
                <p className="text-sm mt-1">{item.caption}</p>
              </div>
            )}
            {item.hashtags?.length ? (
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-500">Hashtags</span>
                  <CopyButton text={item.hashtags.join(' ')} />
                </div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {item.hashtags.map((h, i) => (
                    <span key={i} className="text-xs bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded">{h}</span>
                  ))}
                </div>
              </div>
            ) : null}
            {item.final_video_url && (
              <div>
                <span className="text-xs font-medium text-gray-500">Final Video</span>
                <a href={item.final_video_url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 text-sm text-blue-600 mt-1 hover:underline">
                  <ExternalLink size={12} /> View Final Video
                </a>
              </div>
            )}
            <div>
              <span className="text-xs font-medium text-gray-500">Short ID</span>
              <div className="flex items-center gap-2 mt-1">
                <span className="font-mono text-sm">{item.short_id}</span>
                <CopyButton text={item.short_id} />
              </div>
            </div>
          </div>
        )}

        {/* Performance Tab */}
        {activeTab === 'performance' && item && (
          <PerformanceTab contentItemId={item.id} />
        )}

        {/* History Tab */}
        {activeTab === 'history' && (
          <div className="space-y-2">
            {events.length > 0 ? (
              events.map((e, i) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <div className="w-2 h-2 rounded-full bg-gray-400 mt-1.5 flex-shrink-0" />
                  <div>
                    <span className="font-medium">{e.event_type}</span>
                    <span className="text-gray-500 ml-2 text-xs">{e.actor}</span>
                    <div className="text-xs text-gray-400">{new Date(e.created_at).toLocaleString()}</div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-500">No history events available</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
