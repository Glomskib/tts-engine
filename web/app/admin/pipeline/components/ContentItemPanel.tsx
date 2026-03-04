'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTheme, getThemeColors } from '@/app/components/ThemeProvider';
import { useToast } from '@/contexts/ToastContext';
import { X, Copy, ExternalLink, FileText, Sparkles, Palette, Upload, Hash, Clock, ChevronDown, Lock, FolderPlus, Loader2, Film } from 'lucide-react';
import type { ContentItem, ContentItemStatus, CowTier } from '@/lib/content-items/types';
import type { CreatorBriefData, PurpleCowTier } from '@/lib/briefs/creator-brief-types';

interface ContentItemPanelProps {
  contentItemId: string;
  onClose: () => void;
  onOpenRecordingKit: (item: ContentItem, brief: CreatorBriefData | null) => void;
}

type PanelTab = 'brief' | 'script' | 'purple_cow' | 'upload' | 'meta' | 'history';

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

export default function ContentItemPanel({ contentItemId, onClose, onOpenRecordingKit }: ContentItemPanelProps) {
  const { isDark } = useTheme();
  const colors = getThemeColors(isDark);
  const { showSuccess, showError } = useToast();
  const [item, setItem] = useState<ContentItem | null>(null);
  const [brief, setBrief] = useState<CreatorBriefData | null>(null);
  const [briefMeta, setBriefMeta] = useState<{ version: number; claim_risk_score: number } | null>(null);
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
