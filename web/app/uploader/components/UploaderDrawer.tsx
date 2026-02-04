'use client';

import { useState, useEffect, useCallback } from 'react';
import { formatDateString, getTimeAgo, useHydrated } from '@/lib/useHydrated';

interface UploaderVideo {
  video_id: string;
  status: string;
  created_at: string;
  product_sku: string | null;
  product_link: string | null;
  caption: string | null;
  hashtags: string[] | null;
  compliance_notes: string | null;
  target_account: string | null;
  uploader_checklist_completed_at: string | null;
  final_mp4_uri: string | null;
  thumbnail_uri: string | null;
  has_locked_script: boolean;
  posting_meta_complete: boolean;
  has_final_mp4: boolean;
  missing_fields: string[];
}

interface UploaderDrawerProps {
  video: UploaderVideo;
  onClose: () => void;
  onOpenPostModal: (video: UploaderVideo) => void;
  onMarkChecklistComplete: (videoId: string) => void;
  onRefresh: () => void;
}

interface VideoDetails {
  video: {
    id: string;
    brand_name: string | null;
    product_name: string | null;
    product_sku: string | null;
    account_name: string | null;
    google_drive_url: string | null;
    final_video_url: string | null;
  };
  brief: {
    angle: string | null;
    notes: string | null;
    hook_options: string[] | null;
  } | null;
  script: {
    text: string;
    version: number;
  } | null;
  assets: {
    final_mp4_url: string | null;
    google_drive_url: string | null;
    screenshots: string[];
  };
  events: {
    id: string;
    event_type: string;
    from_status: string | null;
    to_status: string | null;
    actor: string;
    created_at: string;
  }[];
}

type TabType = 'info' | 'script' | 'activity';

export default function UploaderDrawer({
  video,
  onClose,
  onOpenPostModal,
  onMarkChecklistComplete,
}: UploaderDrawerProps) {
  const hydrated = useHydrated();
  const [activeTab, setActiveTab] = useState<TabType>('info');
  const [details, setDetails] = useState<VideoDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(true);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Fetch detailed info
  const fetchDetails = useCallback(async () => {
    setDetailsLoading(true);
    try {
      const res = await fetch(`/api/videos/${video.video_id}/details`);
      const data = await res.json();
      if (data.ok) {
        setDetails(data);
      }
    } catch (err) {
      console.error('Failed to fetch video details:', err);
    } finally {
      setDetailsLoading(false);
    }
  }, [video.video_id]);

  useEffect(() => {
    fetchDetails();
  }, [fetchDetails]);

  // Handle ESC key
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  const copyToClipboard = async (text: string, fieldName: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(fieldName);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const displayTime = (dateStr: string) => {
    if (!hydrated) return formatDateString(dateStr);
    return getTimeAgo(dateStr);
  };

  const handlePost = () => {
    onOpenPostModal(video);
  };

  const handleMarkDone = async () => {
    setActionLoading(true);
    try {
      onMarkChecklistComplete(video.video_id);
    } finally {
      setActionLoading(false);
    }
  };

  const tabs: { key: TabType; label: string; icon: string }[] = [
    { key: 'info', label: 'Info', icon: '📋' },
    { key: 'script', label: 'Script', icon: '📝' },
    { key: 'activity', label: 'Activity', icon: '📊' },
  ];

  const canPost = video.posting_meta_complete && video.has_locked_script && video.has_final_mp4;

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/30 z-[999]"
      />

      {/* Drawer */}
      <div className="fixed top-0 right-0 bottom-0 w-[420px] bg-white shadow-xl z-[1000] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-slate-200 bg-slate-50">
          <div className="flex justify-between items-start mb-3">
            <div className="flex-1">
              {/* Video ID with copy */}
              <div className="flex items-center gap-2 mb-2">
                <span className="font-mono text-sm text-slate-600">
                  {video.video_id.slice(0, 12)}...
                </span>
                <button type="button"
                  onClick={() => copyToClipboard(video.video_id, 'videoId')}
                  className={`px-2 py-0.5 text-xs rounded ${
                    copiedField === 'videoId' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {copiedField === 'videoId' ? 'Copied!' : 'Copy'}
                </button>
              </div>

              {/* Badges row */}
              <div className="flex gap-2 flex-wrap items-center">
                {video.target_account && (
                  <span className="px-2 py-1 rounded bg-blue-100 text-blue-700 text-xs font-medium">
                    {video.target_account}
                  </span>
                )}
                {video.product_sku && (
                  <span className="px-2 py-1 rounded bg-slate-100 text-slate-600 text-xs border border-slate-200">
                    {video.product_sku}
                  </span>
                )}
                <span className={`px-2 py-1 rounded text-xs font-medium ${
                  canPost ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                }`}>
                  {canPost ? 'Ready' : 'Incomplete'}
                </span>
              </div>
            </div>

            <button type="button"
              onClick={onClose}
              className="text-2xl text-slate-400 hover:text-slate-600"
            >
              x
            </button>
          </div>

          {/* Primary Action */}
          {canPost && (
            <div className="p-3 bg-green-50 rounded-lg border border-green-200">
              <div className="text-xs text-green-700 mb-1 font-bold uppercase">Ready to Post</div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-slate-800">Post this video</span>
                <button type="button"
                  onClick={handlePost}
                  className="px-4 py-2 bg-green-600 text-white rounded-md text-sm font-bold hover:bg-green-700"
                >
                  Post
                </button>
              </div>
            </div>
          )}

          {/* Missing fields warning */}
          {video.missing_fields.length > 0 && (
            <div className="mt-2 p-2 bg-amber-50 rounded border border-amber-200 text-xs text-amber-700">
              Missing: {video.missing_fields.join(', ')}
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200">
          {tabs.map(tab => (
            <button type="button"
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 py-2 px-2 text-sm flex items-center justify-center gap-1 ${
                activeTab === tab.key
                  ? 'border-b-2 border-blue-500 text-blue-600 font-bold bg-slate-50'
                  : 'text-slate-500'
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {detailsLoading ? (
            <div className="text-center py-10 text-slate-400">Loading details...</div>
          ) : (
            <>
              {/* Info Tab */}
              {activeTab === 'info' && (
                <div className="space-y-4">
                  {/* Caption */}
                  {video.caption && (
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <h4 className="text-xs text-slate-400 uppercase font-medium">Caption</h4>
                        <button type="button"
                          onClick={() => copyToClipboard(video.caption || '', 'caption')}
                          className={`px-2 py-0.5 text-xs rounded ${
                            copiedField === 'caption' ? 'bg-green-100 text-green-700' : 'bg-slate-100'
                          }`}
                        >
                          {copiedField === 'caption' ? 'Copied!' : 'Copy'}
                        </button>
                      </div>
                      <div className="p-3 bg-slate-50 rounded-md text-sm whitespace-pre-wrap">
                        {video.caption}
                      </div>
                    </div>
                  )}

                  {/* Hashtags */}
                  {video.hashtags && video.hashtags.length > 0 && (
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <h4 className="text-xs text-slate-400 uppercase font-medium">Hashtags</h4>
                        <button type="button"
                          onClick={() => copyToClipboard(video.hashtags?.join(' ') || '', 'hashtags')}
                          className={`px-2 py-0.5 text-xs rounded ${
                            copiedField === 'hashtags' ? 'bg-green-100 text-green-700' : 'bg-slate-100'
                          }`}
                        >
                          {copiedField === 'hashtags' ? 'Copied!' : 'Copy'}
                        </button>
                      </div>
                      <div className="p-3 bg-slate-50 rounded-md text-sm text-blue-600">
                        {video.hashtags.join(' ')}
                      </div>
                    </div>
                  )}

                  {/* Product Link */}
                  {video.product_link && (
                    <div>
                      <h4 className="text-xs text-slate-400 uppercase font-medium mb-1">Product Link</h4>
                      <a
                        href={video.product_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block p-3 bg-blue-50 rounded-md text-sm text-blue-600 hover:bg-blue-100 truncate"
                      >
                        {video.product_link}
                      </a>
                    </div>
                  )}

                  {/* Final MP4 */}
                  {(video.final_mp4_uri || details?.assets.final_mp4_url) && (
                    <a
                      href={video.final_mp4_uri || details?.assets.final_mp4_url || '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 p-3 bg-green-50 rounded-md border border-green-200"
                    >
                      <span className="text-xl">🎬</span>
                      <div>
                        <div className="font-bold text-green-700 text-sm">Final MP4</div>
                        <div className="text-xs text-green-600">Ready for upload</div>
                      </div>
                    </a>
                  )}

                  {/* Google Drive */}
                  {details?.assets.google_drive_url && (
                    <a
                      href={details.assets.google_drive_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 p-3 bg-amber-50 rounded-md border border-amber-200"
                    >
                      <span className="text-xl">📁</span>
                      <div>
                        <div className="font-bold text-amber-700 text-sm">Google Drive</div>
                        <div className="text-xs text-amber-600">All assets</div>
                      </div>
                    </a>
                  )}

                  {/* Compliance Notes */}
                  {video.compliance_notes && (
                    <div>
                      <h4 className="text-xs text-slate-400 uppercase font-medium mb-1">Compliance Notes</h4>
                      <div className="p-3 bg-red-50 rounded-md text-sm text-red-700 border border-red-200">
                        {video.compliance_notes}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Script Tab */}
              {activeTab === 'script' && (
                <div>
                  {details?.script?.text ? (
                    <>
                      <div className="flex justify-between items-center mb-3">
                        <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-bold">
                          Locked v{details.script.version || 1}
                        </span>
                        <button type="button"
                          onClick={() => copyToClipboard(details?.script?.text || '', 'fullScript')}
                          className={`px-3 py-1 text-xs font-bold rounded ${
                            copiedField === 'fullScript'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-blue-500 text-white'
                          }`}
                        >
                          {copiedField === 'fullScript' ? 'Copied!' : 'Copy Script'}
                        </button>
                      </div>
                      <div className="p-3 bg-slate-50 rounded-md text-sm leading-relaxed whitespace-pre-wrap max-h-[400px] overflow-auto border border-slate-200">
                        {details.script.text}
                      </div>
                    </>
                  ) : video.has_locked_script ? (
                    <div className="text-center py-10 text-slate-400">
                      <div className="text-3xl mb-2">📝</div>
                      <div>Script locked but not available in details</div>
                    </div>
                  ) : (
                    <div className="text-center py-10 bg-amber-50 rounded-lg">
                      <div className="text-3xl mb-2">📝</div>
                      <div className="text-amber-700">No script attached</div>
                    </div>
                  )}
                </div>
              )}

              {/* Activity Tab */}
              {activeTab === 'activity' && (
                <div>
                  {details?.events && details.events.length > 0 ? (
                    <div className="space-y-2">
                      {details.events.map((event) => (
                        <div
                          key={event.id}
                          className="p-3 bg-slate-50 rounded-md border-l-2 border-blue-400"
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <div className="font-bold text-xs text-slate-800">
                                {event.event_type.replace(/_/g, ' ')}
                              </div>
                              {event.from_status && event.to_status && (
                                <div className="text-xs text-slate-500">
                                  {event.from_status} → {event.to_status}
                                </div>
                              )}
                            </div>
                            <div className="text-right">
                              <div className="text-xs text-slate-400">
                                {displayTime(event.created_at)}
                              </div>
                              <div className="text-xs text-slate-300 font-mono">
                                {event.actor.slice(0, 8)}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-10 bg-slate-50 rounded-lg text-slate-400">
                      <div className="text-3xl mb-2">📊</div>
                      <div>No activity yet</div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50">
          <div className="flex gap-2">
            {canPost && (
              <button type="button"
                onClick={handlePost}
                className="flex-1 py-3 bg-green-600 text-white rounded-md font-bold text-sm hover:bg-green-700"
              >
                Post Video
              </button>
            )}
            {!video.uploader_checklist_completed_at && (
              <button type="button"
                onClick={handleMarkDone}
                disabled={actionLoading}
                className="flex-1 py-3 bg-blue-500 text-white rounded-md font-bold text-sm hover:bg-blue-600 disabled:opacity-50"
              >
                {actionLoading ? '...' : 'Mark Done'}
              </button>
            )}
            {video.uploader_checklist_completed_at && !canPost && (
              <div className="flex-1 py-3 bg-green-100 text-green-700 rounded-md text-center text-sm font-medium">
                Checklist Complete
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
