'use client';

import { useState } from 'react';
import { Share2, Copy, Check, UserPlus, Link2 } from 'lucide-react';
import { handleShare } from '@/lib/share';

interface ShareActionsProps {
  /** The video/script title */
  title: string;
  /** Caption text to copy */
  caption?: string | null;
  /** URL of the posted video */
  postedUrl?: string | null;
  /** Script text to share */
  scriptText?: string | null;
  /** Show referral invite button */
  showReferral?: boolean;
  /** Referral link */
  referralLink?: string;
}

/**
 * Growth-oriented share actions: Share, Copy Caption, Invite Creator.
 * Designed for video detail pages and post-completion screens.
 */
export function ShareActions({
  title,
  caption,
  postedUrl,
  scriptText,
  showReferral = false,
  referralLink,
}: ShareActionsProps) {
  const [copiedCaption, setCopiedCaption] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [shared, setShared] = useState(false);

  const handleCopyCaption = async () => {
    const text = caption || scriptText || '';
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedCaption(true);
      setTimeout(() => setCopiedCaption(false), 2000);
    } catch { /* silent */ }
  };

  const handleCopyLink = async () => {
    const url = postedUrl || referralLink || '';
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch { /* silent */ }
  };

  const handleShareVideo = async () => {
    const shareUrl = postedUrl || '';
    const shareText = caption || scriptText || '';
    await handleShare(
      { title, text: shareText, url: shareUrl },
      { onSuccess: () => { setShared(true); setTimeout(() => setShared(false), 2000); } }
    );
  };

  const handleInviteCreator = async () => {
    const link = referralLink || `${typeof window !== 'undefined' ? window.location.origin : ''}/signup`;
    await handleShare(
      {
        title: 'Join FlashFlow',
        text: 'I use FlashFlow to go from script to posted video in minutes. Try it out!',
        url: link,
      },
    );
  };

  const hasContent = caption || scriptText || postedUrl;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Share Video / Script */}
      {hasContent && (
        <button
          type="button"
          onClick={handleShareVideo}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700 active:bg-zinc-600 transition-colors min-h-[40px]"
        >
          {shared ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Share2 className="w-3.5 h-3.5" />}
          {shared ? 'Shared' : 'Share'}
        </button>
      )}

      {/* Copy Caption */}
      {(caption || scriptText) && (
        <button
          type="button"
          onClick={handleCopyCaption}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700 active:bg-zinc-600 transition-colors min-h-[40px]"
        >
          {copiedCaption ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
          {copiedCaption ? 'Copied' : 'Copy Caption'}
        </button>
      )}

      {/* Copy Link */}
      {postedUrl && (
        <button
          type="button"
          onClick={handleCopyLink}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700 active:bg-zinc-600 transition-colors min-h-[40px]"
        >
          {copiedLink ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Link2 className="w-3.5 h-3.5" />}
          {copiedLink ? 'Copied' : 'Copy Link'}
        </button>
      )}

      {/* Invite Creator */}
      {showReferral && (
        <button
          type="button"
          onClick={handleInviteCreator}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium bg-teal-600/15 text-teal-400 hover:bg-teal-600/25 active:bg-teal-600/35 transition-colors min-h-[40px]"
        >
          <UserPlus className="w-3.5 h-3.5" />
          Invite Creator
        </button>
      )}
    </div>
  );
}
