'use client';

import { useState } from 'react';
import { X, Video, TrendingUp, Eye, Heart, MessageCircle, Share2, Bookmark, Loader2, AlertCircle } from 'lucide-react';
import {
  HOOK_TYPE_OPTIONS,
  CONTENT_FORMAT_OPTIONS,
  PRODUCT_CATEGORY_OPTIONS,
  type HookType,
  type ContentFormat,
} from '@/lib/winners';

interface AddExternalWinnerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function AddExternalWinnerModal({
  isOpen,
  onClose,
  onSuccess,
}: AddExternalWinnerModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'video' | 'metrics' | 'content'>('video');

  // Form state - Video Info
  const [tiktokUrl, setTiktokUrl] = useState('');
  const [videoTitle, setVideoTitle] = useState('');
  const [creatorHandle, setCreatorHandle] = useState('');
  const [creatorNiche, setCreatorNiche] = useState('');

  // Hook (required!)
  const [hookText, setHookText] = useState('');
  const [hookType, setHookType] = useState<HookType | ''>('');

  // Metrics
  const [views, setViews] = useState('');
  const [likes, setLikes] = useState('');
  const [comments, setComments] = useState('');
  const [shares, setShares] = useState('');
  const [saves, setSaves] = useState('');

  // Retention
  const [avgWatchTimePercent, setAvgWatchTimePercent] = useState('');
  const [retention3s, setRetention3s] = useState('');
  const [videoLengthSeconds, setVideoLengthSeconds] = useState('');

  // Content
  const [contentFormat, setContentFormat] = useState<ContentFormat | ''>('');
  const [productName, setProductName] = useState('');
  const [productCategory, setProductCategory] = useState('');
  const [userNotes, setUserNotes] = useState('');
  const [tagsInput, setTagsInput] = useState('');

  if (!isOpen) return null;

  const isValid = hookText.trim().length > 0 && userNotes.trim().length > 0;

  const handleSubmit = async () => {
    if (!isValid) {
      setError('Hook text and notes are required');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const payload: Record<string, unknown> = {
        source_type: 'external',
        hook_text: hookText.trim(),
        user_notes: userNotes.trim(),
      };

      // Add optional fields if provided
      if (tiktokUrl) payload.tiktok_url = tiktokUrl;
      if (videoTitle) payload.video_title = videoTitle;
      if (creatorHandle) payload.creator_handle = creatorHandle.replace('@', '');
      if (creatorNiche) payload.creator_niche = creatorNiche;
      if (hookType) payload.hook_type = hookType;

      if (views) payload.views = parseInt(views, 10);
      if (likes) payload.likes = parseInt(likes, 10);
      if (comments) payload.comments = parseInt(comments, 10);
      if (shares) payload.shares = parseInt(shares, 10);
      if (saves) payload.saves = parseInt(saves, 10);

      if (avgWatchTimePercent) payload.avg_watch_time_percent = parseFloat(avgWatchTimePercent);
      if (retention3s) payload.retention_3s = parseFloat(retention3s);
      if (videoLengthSeconds) payload.video_length_seconds = parseInt(videoLengthSeconds, 10);

      if (contentFormat) payload.content_format = contentFormat;
      if (productName) payload.product_name = productName;
      if (productCategory) payload.product_category = productCategory;
      if (tagsInput) payload.tags = tagsInput.split(',').map(t => t.trim()).filter(Boolean);

      const response = await fetch('/api/winners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.error || 'Failed to add winner');
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
    { id: 'video', label: 'Video Info', icon: Video },
    { id: 'metrics', label: 'Metrics', icon: TrendingUp },
    { id: 'content', label: 'Analysis', icon: MessageCircle },
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
            <div className="w-10 h-10 rounded-full bg-teal-500/20 flex items-center justify-center">
              <Video className="w-5 h-5 text-teal-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Add Reference Winner</h2>
              <p className="text-sm text-zinc-400">Competitor or inspiration video</p>
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
                    ? 'text-teal-400 border-b-2 border-teal-400 bg-teal-500/5'
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
          {/* Video Info Tab */}
          {activeTab === 'video' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                  TikTok Video URL
                </label>
                <input
                  type="url"
                  value={tiktokUrl}
                  onChange={(e) => setTiktokUrl(e.target.value)}
                  placeholder="https://tiktok.com/@user/video/..."
                  className="w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:border-teal-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                    Creator Handle
                  </label>
                  <input
                    type="text"
                    value={creatorHandle}
                    onChange={(e) => setCreatorHandle(e.target.value)}
                    placeholder="@username"
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-teal-500/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                    Creator Niche
                  </label>
                  <input
                    type="text"
                    value={creatorNiche}
                    onChange={(e) => setCreatorNiche(e.target.value)}
                    placeholder="e.g., Beauty, Fitness"
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-teal-500/50"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                  Video Title / Description
                </label>
                <input
                  type="text"
                  value={videoTitle}
                  onChange={(e) => setVideoTitle(e.target.value)}
                  placeholder="Brief description of the video"
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-teal-500/50"
                />
              </div>

              {/* Hook Text - Required */}
              <div>
                <label className="flex items-center gap-1.5 text-sm font-medium text-zinc-300 mb-1.5">
                  Hook Text <span className="text-red-400">*</span>
                </label>
                <textarea
                  value={hookText}
                  onChange={(e) => setHookText(e.target.value)}
                  placeholder="What did they say in the first 3 seconds? (Transcribe the hook)"
                  rows={2}
                  className={`w-full px-3 py-2 bg-zinc-800 border rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-teal-500/50 resize-none ${
                    !hookText.trim() ? 'border-amber-500/50' : 'border-zinc-700'
                  }`}
                />
                <p className="mt-1 text-xs text-zinc-500">
                  The opening hook is critical for learning - be as accurate as possible
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                  Hook Type
                </label>
                <select
                  value={hookType}
                  onChange={(e) => setHookType(e.target.value as HookType | '')}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-teal-500/50"
                >
                  <option value="">Select hook type...</option>
                  {HOOK_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label} - {opt.example}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Metrics Tab */}
          {activeTab === 'metrics' && (
            <div className="space-y-4">
              <p className="text-sm text-zinc-500">
                Add any metrics you can find (from comments, creator mentions, etc).
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
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-teal-500/50"
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
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-teal-500/50"
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
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-teal-500/50"
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
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-teal-500/50"
                  />
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-sm font-medium text-zinc-300 mb-1.5">
                    <Bookmark className="w-3.5 h-3.5" /> Saves
                  </label>
                  <input
                    type="number"
                    value={saves}
                    onChange={(e) => setSaves(e.target.value)}
                    placeholder="0"
                    min="0"
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-teal-500/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                    Video Length (sec)
                  </label>
                  <input
                    type="number"
                    value={videoLengthSeconds}
                    onChange={(e) => setVideoLengthSeconds(e.target.value)}
                    placeholder="0"
                    min="0"
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-teal-500/50"
                  />
                </div>
              </div>

              <div className="pt-2 border-t border-zinc-800">
                <p className="text-sm text-zinc-400 mb-3">Estimated Retention (if visible)</p>
                <div className="grid grid-cols-2 gap-4">
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
                      className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-teal-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                      3s Retention (%)
                    </label>
                    <input
                      type="number"
                      value={retention3s}
                      onChange={(e) => setRetention3s(e.target.value)}
                      placeholder="0"
                      min="0"
                      max="100"
                      className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-teal-500/50"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Content/Analysis Tab */}
          {activeTab === 'content' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                    Content Format
                  </label>
                  <select
                    value={contentFormat}
                    onChange={(e) => setContentFormat(e.target.value as ContentFormat | '')}
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-teal-500/50"
                  >
                    <option value="">Select...</option>
                    {CONTENT_FORMAT_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                    Product Category
                  </label>
                  <select
                    value={productCategory}
                    onChange={(e) => setProductCategory(e.target.value)}
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-teal-500/50"
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
                  Product Name (if applicable)
                </label>
                <input
                  type="text"
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  placeholder="What product were they promoting?"
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-teal-500/50"
                />
              </div>

              {/* User Notes - Required */}
              <div>
                <label className="flex items-center gap-1.5 text-sm font-medium text-zinc-300 mb-1.5">
                  Why did this work? <span className="text-red-400">*</span>
                </label>
                <textarea
                  value={userNotes}
                  onChange={(e) => setUserNotes(e.target.value)}
                  placeholder="What made this video successful? What patterns do you notice? Why did the hook grab attention?"
                  rows={4}
                  className={`w-full px-3 py-2 bg-zinc-800 border rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-teal-500/50 resize-none ${
                    !userNotes.trim() ? 'border-amber-500/50' : 'border-zinc-700'
                  }`}
                />
                <p className="mt-1 text-xs text-zinc-500">
                  Your observations help train the AI to generate better scripts
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                  Tags (comma-separated)
                </label>
                <input
                  type="text"
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  placeholder="viral, competitor, trendy, relatable"
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-teal-500/50"
                />
              </div>
            </div>
          )}

          {/* Validation Warning */}
          {!isValid && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-amber-400">
                Hook text and notes are required to add a reference winner.
              </p>
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
            disabled={isSubmitting || !isValid}
            className="px-6 py-2 bg-teal-600 hover:bg-teal-500 disabled:bg-teal-600/50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center gap-2"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Adding...
              </>
            ) : (
              <>
                <Video className="w-4 h-4" />
                Add Reference Winner
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default AddExternalWinnerModal;
