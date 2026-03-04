'use client';

import { useState, useEffect, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, Check, ExternalLink, Send, Loader2, ArrowLeft } from 'lucide-react';
import { useToast } from '@/contexts/ToastContext';
import type { ContentItem } from '@/lib/content-items/types';

function CopyBtn({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="flex items-center justify-center gap-2 w-full min-h-[48px] rounded-xl text-base font-medium transition-colors bg-zinc-800 text-zinc-200 active:bg-zinc-700"
    >
      {copied ? <><Check size={18} /> Copied!</> : <><Copy size={18} /> {label || 'Copy'}</>}
    </button>
  );
}

interface ContentItemRow extends ContentItem {
  products?: { name: string } | null;
}

export default function PostPage({ params }: { params: Promise<{ contentItemId: string }> }) {
  const { contentItemId } = use(params);
  const router = useRouter();
  const { showToast } = useToast();

  const [item, setItem] = useState<ContentItemRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [postUrl, setPostUrl] = useState('');
  const [views, setViews] = useState('');
  const [likes, setLikes] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/content-items/${contentItemId}`);
      const json = await res.json();
      if (json.ok && json.data) {
        setItem(json.data);
      }
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, [contentItemId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleMarkPosted = async () => {
    setPosting(true);
    try {
      const res = await fetch(`/api/content-items/${contentItemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'posted' }),
      });
      const json = await res.json();
      if (json.ok) {
        // If post URL provided, create a content_item_post record
        if (postUrl.trim()) {
          await fetch(`/api/content-items/${contentItemId}/posts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              platform: detectPlatform(postUrl),
              post_url: postUrl.trim(),
              caption_used: item?.caption || null,
              hashtags_used: item?.hashtags?.join(' ') || null,
              views: views ? parseInt(views) : null,
              likes: likes ? parseInt(likes) : null,
            }),
          }).catch(() => { /* best effort */ });
        }
        showToast({ message: 'Marked as posted!', type: 'success' });
        router.push('/admin/studio');
      } else {
        showToast({ message: json.error || 'Failed', type: 'error' });
      }
    } catch {
      showToast({ message: 'Network error', type: 'error' });
    } finally {
      setPosting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-zinc-500" />
      </div>
    );
  }

  if (!item) {
    return (
      <div className="px-4 py-12 text-center">
        <p className="text-base text-[var(--text-muted)]">Content item not found.</p>
      </div>
    );
  }

  const hashtags = item.hashtags?.join(' ') || '';

  return (
    <div className="pb-28 max-w-lg mx-auto">
      {/* Header */}
      <div className="px-4 pt-2 pb-4">
        <button onClick={() => router.back()} className="flex items-center gap-1 text-sm text-[var(--text-muted)] mb-3">
          <ArrowLeft size={16} /> Back
        </button>
        <h1 className="text-xl font-bold text-[var(--text)]">Post Content</h1>
        <p className="text-sm text-[var(--text-muted)] font-mono">{item.short_id} — {item.title}</p>
      </div>

      <div className="px-4 space-y-6">
        {/* Video Preview */}
        {item.final_video_url && (
          <section>
            <h2 className="text-lg font-semibold text-[var(--text)] mb-2">Video</h2>
            <a
              href={item.final_video_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full min-h-[48px] rounded-xl text-base font-medium bg-zinc-800 text-zinc-200 active:bg-zinc-700"
            >
              <ExternalLink size={18} /> Open Video
            </a>
          </section>
        )}

        {/* Product */}
        {item.products?.name && (
          <section>
            <h2 className="text-lg font-semibold text-[var(--text)] mb-2">Product</h2>
            <span className="inline-block text-sm px-3 py-1 rounded-full bg-teal-500/10 text-teal-400 border border-teal-500/20">
              {item.products.name}
            </span>
          </section>
        )}

        {/* Caption */}
        {item.caption && (
          <section>
            <h2 className="text-lg font-semibold text-[var(--text)] mb-2">Caption</h2>
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 mb-3">
              <p className="text-base text-[var(--text)] whitespace-pre-wrap">{item.caption}</p>
            </div>
            <CopyBtn text={item.caption} label="Copy Caption" />
          </section>
        )}

        {/* Hashtags */}
        {hashtags && (
          <section>
            <h2 className="text-lg font-semibold text-[var(--text)] mb-2">Hashtags</h2>
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 mb-3">
              <p className="text-base text-blue-400">{hashtags}</p>
            </div>
            <CopyBtn text={hashtags} label="Copy Hashtags" />
          </section>
        )}

        {/* Copy All (caption + hashtags) */}
        {item.caption && hashtags && (
          <CopyBtn text={`${item.caption}\n\n${hashtags}`} label="Copy Caption + Hashtags" />
        )}

        {/* Open TikTok */}
        <a
          href="https://www.tiktok.com/upload"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full min-h-[48px] rounded-xl text-base font-medium bg-zinc-800 text-zinc-200 active:bg-zinc-700"
        >
          <ExternalLink size={18} /> Open TikTok
        </a>

        {/* Optional Fields */}
        <section>
          <h2 className="text-lg font-semibold text-[var(--text)] mb-3">Post Details (Optional)</h2>
          <div className="space-y-3">
            <div>
              <label className="block text-sm text-[var(--text-muted)] mb-1">Post URL</label>
              <input
                type="url"
                value={postUrl}
                onChange={(e) => setPostUrl(e.target.value)}
                placeholder="https://www.tiktok.com/..."
                className="w-full min-h-[48px] px-4 rounded-xl text-base bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text-muted)]"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-[var(--text-muted)] mb-1">Views</label>
                <input
                  type="number"
                  value={views}
                  onChange={(e) => setViews(e.target.value)}
                  placeholder="0"
                  className="w-full min-h-[48px] px-4 rounded-xl text-base bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text-muted)]"
                />
              </div>
              <div>
                <label className="block text-sm text-[var(--text-muted)] mb-1">Likes</label>
                <input
                  type="number"
                  value={likes}
                  onChange={(e) => setLikes(e.target.value)}
                  placeholder="0"
                  className="w-full min-h-[48px] px-4 rounded-xl text-base bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text-muted)]"
                />
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Sticky bottom action bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-[var(--bg)] border-t border-[var(--border)] p-4 pb-safe z-50">
        <div className="max-w-lg mx-auto">
          <button
            onClick={handleMarkPosted}
            disabled={posting}
            className="flex items-center justify-center gap-2 w-full min-h-[48px] rounded-xl text-base font-semibold bg-green-600 text-white active:bg-green-700 disabled:opacity-50"
          >
            {posting ? <><Loader2 size={18} className="animate-spin" /> Posting...</> : <><Send size={18} /> Mark Posted</>}
          </button>
        </div>
      </div>
    </div>
  );
}

function detectPlatform(url: string): string {
  const lower = url.toLowerCase();
  if (lower.includes('tiktok.com')) return 'tiktok';
  if (lower.includes('instagram.com')) return 'instagram';
  if (lower.includes('youtube.com') || lower.includes('youtu.be')) return 'youtube';
  if (lower.includes('facebook.com')) return 'facebook';
  return 'other';
}
