'use client';

import { useState, useEffect, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, Check, ExternalLink, Send, Loader2, ArrowLeft, Sparkles, Package, FileText, AlertTriangle } from 'lucide-react';
import { useToast } from '@/contexts/ToastContext';
import type { ContentItem } from '@/lib/content-items/types';
import DriveFolderButton from '@/components/DriveFolderButton';
import ProductPicker from '@/components/ProductPicker';
import TikTokDraftExport from '@/app/admin/components/TikTokDraftExport';

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
  const [generatingCaption, setGeneratingCaption] = useState(false);
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [generatingPackage, setGeneratingPackage] = useState(false);
  const [postPackageMarkdown, setPostPackageMarkdown] = useState<string | null>(null);

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

  const handleLinkProduct = async (productId: string, productName: string) => {
    setShowProductPicker(false);
    try {
      const res = await fetch(`/api/content-items/${contentItemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id: productId }),
      });
      const json = await res.json();
      if (json.ok) {
        setItem(prev => prev ? { ...prev, product_id: productId, products: { name: productName } } : prev);
        showToast({ message: `Linked: ${productName}`, type: 'success' });
      } else {
        showToast({ message: json.error || 'Failed to link product', type: 'error' });
      }
    } catch {
      showToast({ message: 'Network error', type: 'error' });
    }
  };

  const handleGeneratePackage = async () => {
    setGeneratingPackage(true);
    try {
      const res = await fetch(`/api/content-items/${contentItemId}/post-package`, { method: 'POST' });
      const json = await res.json();
      if (json.ok && json.data) {
        setPostPackageMarkdown(json.data.markdown);
        showToast({ message: 'Post package generated', type: 'success' });
      } else {
        showToast({ message: json.error || 'Failed to generate package', type: 'error' });
      }
    } catch {
      showToast({ message: 'Network error', type: 'error' });
    } finally {
      setGeneratingPackage(false);
    }
  };

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
        if (json.error_code === 'MISSING_PRODUCT_ID') {
          showToast({ message: 'Link a product first', type: 'error' });
          setShowProductPicker(true);
        } else {
          showToast({ message: json.error || 'Failed', type: 'error' });
        }
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
  const hasProduct = !!item.product_id;

  return (
    <div className="pb-28 max-w-lg mx-auto">
      {/* Header */}
      <div className="px-4 pt-2 pb-4">
        <button onClick={() => router.back()} className="flex items-center gap-1 text-sm text-[var(--text-muted)] mb-3">
          <ArrowLeft size={16} /> Back
        </button>
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-[var(--text)]">Post Content</h1>
          <DriveFolderButton
            contentItemId={item.id}
            driveFolderUrl={item.drive_folder_url}
            compact
          />
        </div>
        <p className="text-sm text-[var(--text-muted)] font-mono">{item.short_id} — {item.title}</p>
      </div>

      <div className="px-4 space-y-6">
        {/* Product enforcement banner */}
        {!hasProduct && (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex items-center gap-3">
            <AlertTriangle size={20} className="text-amber-500 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-400">Link a product to post</p>
              <p className="text-xs text-amber-400/70 mt-0.5">Required before marking as posted</p>
            </div>
            <button
              onClick={() => setShowProductPicker(true)}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-500 text-white hover:bg-amber-600 transition"
            >
              Link
            </button>
          </div>
        )}

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

        {/* TikTok Draft Export */}
        <TikTokDraftExport
          contentItemId={contentItemId}
          hasRenderedVideo={!!item.final_video_url}
          initialStatus={(item as unknown as Record<string, unknown>).tiktok_draft_status as string | null}
          initialError={(item as unknown as Record<string, unknown>).tiktok_draft_error as string | null}
        />

        {/* Product */}
        {item.products?.name ? (
          <section>
            <h2 className="text-lg font-semibold text-[var(--text)] mb-2">Product</h2>
            <span className="inline-block text-sm px-3 py-1 rounded-full bg-teal-500/10 text-teal-400 border border-teal-500/20">
              {item.products.name}
            </span>
          </section>
        ) : hasProduct ? null : (
          <section>
            <h2 className="text-lg font-semibold text-[var(--text)] mb-2">Product</h2>
            <button
              onClick={() => setShowProductPicker(true)}
              className="flex items-center justify-center gap-2 w-full min-h-[48px] rounded-xl text-base font-medium bg-zinc-800 text-zinc-200 active:bg-zinc-700"
            >
              <Package size={18} /> Link Product
            </button>
          </section>
        )}

        {/* Caption */}
        <section>
          <h2 className="text-lg font-semibold text-[var(--text)] mb-2">Caption</h2>
          {item.caption ? (
            <>
              <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 mb-3">
                <p className="text-base text-[var(--text)] whitespace-pre-wrap">{item.caption}</p>
              </div>
              <CopyBtn text={item.caption} label="Copy Caption" />
            </>
          ) : (
            <p className="text-sm text-[var(--text-muted)] mb-3">No caption yet.</p>
          )}
          <button
            onClick={async () => {
              setGeneratingCaption(true);
              try {
                const res = await fetch('/api/ai/caption', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ content_item_id: contentItemId }),
                });
                const json = await res.json();
                if (json.ok && json.data) {
                  // Save caption to content item
                  await fetch(`/api/content-items/${contentItemId}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      caption: json.data.caption,
                      hashtags: json.data.hashtags,
                    }),
                  });
                  setItem(prev => prev ? { ...prev, caption: json.data.caption, hashtags: json.data.hashtags } : prev);
                  showToast({ message: 'Caption generated!', type: 'success' });
                } else {
                  showToast({ message: json.error || 'Failed to generate caption', type: 'error' });
                }
              } catch {
                showToast({ message: 'Network error', type: 'error' });
              } finally {
                setGeneratingCaption(false);
              }
            }}
            disabled={generatingCaption}
            className="flex items-center justify-center gap-2 w-full min-h-[48px] rounded-xl text-base font-medium transition-colors bg-violet-600 text-white active:bg-violet-700 disabled:opacity-50 mt-2"
          >
            {generatingCaption ? <><Loader2 size={18} className="animate-spin" /> Generating...</> : <><Sparkles size={18} /> {item.caption ? 'Regenerate Caption' : 'Generate AI Caption'}</>}
          </button>
        </section>

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

        {/* Post Package */}
        <section>
          <h2 className="text-lg font-semibold text-[var(--text)] mb-2">Post Package</h2>
          <button
            onClick={handleGeneratePackage}
            disabled={generatingPackage || !hasProduct}
            className="flex items-center justify-center gap-2 w-full min-h-[48px] rounded-xl text-base font-medium transition-colors bg-indigo-600 text-white active:bg-indigo-700 disabled:opacity-50"
          >
            {generatingPackage ? (
              <><Loader2 size={18} className="animate-spin" /> Generating...</>
            ) : (
              <><FileText size={18} /> Generate Post Package</>
            )}
          </button>
          {!hasProduct && (
            <p className="text-xs text-[var(--text-muted)] mt-1 text-center">Link a product first</p>
          )}
          {postPackageMarkdown && (
            <div className="mt-3 space-y-2">
              <pre className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 text-xs text-[var(--text)] whitespace-pre-wrap overflow-x-auto max-h-[400px] overflow-y-auto">
                {postPackageMarkdown}
              </pre>
              <CopyBtn text={postPackageMarkdown} label="Copy Package" />
            </div>
          )}
        </section>

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
            disabled={posting || !hasProduct}
            className="flex items-center justify-center gap-2 w-full min-h-[48px] rounded-xl text-base font-semibold bg-green-600 text-white active:bg-green-700 disabled:opacity-50"
          >
            {posting ? <><Loader2 size={18} className="animate-spin" /> Posting...</> : <><Send size={18} /> Mark Posted</>}
          </button>
        </div>
      </div>

      {/* Product Picker Modal */}
      <ProductPicker
        isOpen={showProductPicker}
        onClose={() => setShowProductPicker(false)}
        onSelect={handleLinkProduct}
      />
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
