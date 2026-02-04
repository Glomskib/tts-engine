'use client';

import { useState } from 'react';
import { X, Trophy, TrendingUp, Eye, Heart, MessageCircle, Share2, Bookmark, Loader2 } from 'lucide-react';
import {
  HOOK_TYPE_OPTIONS,
  CONTENT_FORMAT_OPTIONS,
  PRODUCT_CATEGORY_OPTIONS,
  type HookType,
  type ContentFormat,
} from '@/lib/winners';

interface MarkAsWinnerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  scriptId: string;
  scriptTitle?: string;
  hookText?: string;
  productName?: string;
}

export function MarkAsWinnerModal({
  isOpen,
  onClose,
  onSuccess,
  scriptId,
  scriptTitle,
  hookText,
  productName: _productName,
}: MarkAsWinnerModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'metrics' | 'retention' | 'content'>('metrics');

  // Form state
  const [tiktokUrl, setTiktokUrl] = useState('');
  const [views, setViews] = useState('');
  const [likes, setLikes] = useState('');
  const [comments, setComments] = useState('');
  const [shares, setShares] = useState('');
  const [saves, setSaves] = useState('');

  // Retention
  const [avgWatchTimeSeconds, setAvgWatchTimeSeconds] = useState('');
  const [avgWatchTimePercent, setAvgWatchTimePercent] = useState('');
  const [retention3s, setRetention3s] = useState('');
  const [retentionHalf, setRetentionHalf] = useState('');
  const [retentionFull, setRetentionFull] = useState('');

  // Content
  const [hookType, setHookType] = useState<HookType | ''>('');
  const [contentFormat, setContentFormat] = useState<ContentFormat | ''>('skit');
  const [productCategory, setProductCategory] = useState('');
  const [videoLengthSeconds, setVideoLengthSeconds] = useState('');
  const [userNotes, setUserNotes] = useState('');
  const [tagsInput, setTagsInput] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setError(null);

    try {
      const payload: Record<string, unknown> = {
        source_type: 'generated',
        script_id: scriptId,
        hook: hookText,
      };

      // Add optional fields if provided
      if (tiktokUrl) payload.video_url = tiktokUrl;
      if (views) payload.view_count = parseInt(views, 10);
      if (likes) payload.like_count = parseInt(likes, 10);
      if (comments) payload.comment_count = parseInt(comments, 10);
      if (shares) payload.share_count = parseInt(shares, 10);
      if (saves) payload.save_count = parseInt(saves, 10);

      if (avgWatchTimeSeconds) payload.avg_watch_time = parseFloat(avgWatchTimeSeconds);
      if (retention3s) payload.retention_3s = parseFloat(retention3s);
      if (retentionHalf) payload.retention_5s = parseFloat(retentionHalf);
      if (retentionFull) payload.retention_10s = parseFloat(retentionFull);

      if (hookType) payload.hook_type = hookType;
      if (contentFormat) payload.content_format = contentFormat;
      if (productCategory) payload.product_category = productCategory;
      if (userNotes) payload.notes = userNotes;

      const response = await fetch('/api/winners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.error || 'Failed to mark as winner');
      }

      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsSubmitting(false);
    }
  };

  const tabs = [
    { id: 'metrics', label: 'Metrics', icon: TrendingUp },
    { id: 'retention', label: 'Retention', icon: Eye },
    { id: 'content', label: 'Content', icon: MessageCircle },
  ] as const;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-xl bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
              <Trophy className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Mark as Winner</h2>
              {scriptTitle && (
                <p className="text-sm text-zinc-400 truncate max-w-[300px]">{scriptTitle}</p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5 text-zinc-400" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-zinc-800">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'text-amber-400 border-b-2 border-amber-400 bg-amber-500/5'
                    : 'text-zinc-400 hover:text-zinc-300 hover:bg-zinc-800/50'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          {/* TikTok URL - Always visible */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">
              TikTok Video URL
            </label>
            <input
              type="url"
              value={tiktokUrl}
              onChange={(e) => setTiktokUrl(e.target.value)}
              placeholder="https://tiktok.com/@user/video/..."
              className="w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500"
            />
          </div>

          {/* Metrics Tab */}
          {activeTab === 'metrics' && (
            <div className="space-y-4">
              <p className="text-sm text-zinc-500">
                Enter the video&apos;s performance metrics from TikTok Analytics.
              </p>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="flex items-center gap-1.5 text-sm font-medium text-zinc-300 mb-1.5">
                    <Eye className="w-3.5 h-3.5" /> Views
                  </label>
                  <input
                    type="number"
                    value={views}
                    onChange={(e) => setViews(e.target.value)}
                    placeholder="0"
                    min="0"
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                  />
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-sm font-medium text-zinc-300 mb-1.5">
                    <Heart className="w-3.5 h-3.5" /> Likes
                  </label>
                  <input
                    type="number"
                    value={likes}
                    onChange={(e) => setLikes(e.target.value)}
                    placeholder="0"
                    min="0"
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                  />
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-sm font-medium text-zinc-300 mb-1.5">
                    <MessageCircle className="w-3.5 h-3.5" /> Comments
                  </label>
                  <input
                    type="number"
                    value={comments}
                    onChange={(e) => setComments(e.target.value)}
                    placeholder="0"
                    min="0"
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                  />
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-sm font-medium text-zinc-300 mb-1.5">
                    <Share2 className="w-3.5 h-3.5" /> Shares
                  </label>
                  <input
                    type="number"
                    value={shares}
                    onChange={(e) => setShares(e.target.value)}
                    placeholder="0"
                    min="0"
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                  />
                </div>
                <div className="col-span-2">
                  <label className="flex items-center gap-1.5 text-sm font-medium text-zinc-300 mb-1.5">
                    <Bookmark className="w-3.5 h-3.5" /> Saves
                  </label>
                  <input
                    type="number"
                    value={saves}
                    onChange={(e) => setSaves(e.target.value)}
                    placeholder="0"
                    min="0"
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Retention Tab */}
          {activeTab === 'retention' && (
            <div className="space-y-4">
              <p className="text-sm text-zinc-500">
                Retention data from TikTok Analytics (if available).
              </p>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                    Avg Watch Time (sec)
                  </label>
                  <input
                    type="number"
                    value={avgWatchTimeSeconds}
                    onChange={(e) => setAvgWatchTimeSeconds(e.target.value)}
                    placeholder="0"
                    min="0"
                    step="0.1"
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                    Avg Watch Time (%)
                  </label>
                  <input
                    type="number"
                    value={avgWatchTimePercent}
                    onChange={(e) => setAvgWatchTimePercent(e.target.value)}
                    placeholder="0"
                    min="0"
                    max="100"
                    step="0.1"
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                    Retention at 3s (%)
                  </label>
                  <input
                    type="number"
                    value={retention3s}
                    onChange={(e) => setRetention3s(e.target.value)}
                    placeholder="0"
                    min="0"
                    max="100"
                    step="0.1"
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                    Retention at 50% (%)
                  </label>
                  <input
                    type="number"
                    value={retentionHalf}
                    onChange={(e) => setRetentionHalf(e.target.value)}
                    placeholder="0"
                    min="0"
                    max="100"
                    step="0.1"
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                    Retention at 100% (%)
                  </label>
                  <input
                    type="number"
                    value={retentionFull}
                    onChange={(e) => setRetentionFull(e.target.value)}
                    placeholder="0"
                    min="0"
                    max="100"
                    step="0.1"
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                    Video Length (seconds)
                  </label>
                  <input
                    type="number"
                    value={videoLengthSeconds}
                    onChange={(e) => setVideoLengthSeconds(e.target.value)}
                    placeholder="0"
                    min="0"
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Content Tab */}
          {activeTab === 'content' && (
            <div className="space-y-4">
              <p className="text-sm text-zinc-500">
                Categorize the content to help identify patterns.
              </p>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                    Hook Type
                  </label>
                  <select
                    value={hookType}
                    onChange={(e) => setHookType(e.target.value as HookType | '')}
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                  >
                    <option value="">Select...</option>
                    {HOOK_TYPE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                    Content Format
                  </label>
                  <select
                    value={contentFormat}
                    onChange={(e) => setContentFormat(e.target.value as ContentFormat | '')}
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                  >
                    <option value="">Select...</option>
                    {CONTENT_FORMAT_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                    Product Category
                  </label>
                  <select
                    value={productCategory}
                    onChange={(e) => setProductCategory(e.target.value)}
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                  >
                    <option value="">Select...</option>
                    {PRODUCT_CATEGORY_OPTIONS.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                  Tags (comma-separated)
                </label>
                <input
                  type="text"
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  placeholder="viral, trendy, product-demo"
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                  Notes (why did this work?)
                </label>
                <textarea
                  value={userNotes}
                  onChange={(e) => setUserNotes(e.target.value)}
                  placeholder="What made this video successful? Any observations..."
                  rows={3}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 resize-none"
                />
              </div>
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-zinc-800 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-zinc-400 hover:text-zinc-300 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="px-6 py-2 bg-amber-600 hover:bg-amber-500 disabled:bg-amber-600/50 text-white font-medium rounded-lg transition-colors flex items-center gap-2"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Trophy className="w-4 h-4" />
                Add to Winners Bank
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default MarkAsWinnerModal;
