'use client';

import { useRef, useState, useCallback } from 'react';
import { toPng } from 'html-to-image';

// ============================================================================
// TikTok On-Screen Comment Reply Sticker Generator
// ============================================================================

export default function TokCommentTool() {
  const [replyTo, setReplyTo] = useState('');
  const [username, setUsername] = useState('');
  const [comment, setComment] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');

  const stickerRef = useRef<HTMLDivElement>(null);

  const handleDownload = useCallback(async () => {
    if (!stickerRef.current) return;
    setError('');
    setDownloading(true);

    try {
      // One rAF to let the browser settle layout
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

      const dataUrl = await toPng(stickerRef.current, {
        pixelRatio: 2,
        backgroundColor: undefined, // transparent
        cacheBust: true,
      });

      const safe = (username || 'comment').replace(/[^a-z0-9_-]/gi, '_').toLowerCase();
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `tiktok-reply-${safe}.png`;
      a.click();
    } catch (err) {
      console.error('[TokCommentTool] export failed:', err);
      setError('Export failed — try again or use a different browser.');
    } finally {
      setDownloading(false);
    }
  }, [username]);

  const hasContent = replyTo.trim() || username.trim() || comment.trim();

  return (
    <div className="min-h-screen bg-[#09090b] text-white">
      <div className="max-w-2xl mx-auto px-4 py-12 space-y-8">

        {/* Header */}
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-zinc-100">TikTok Comment Reply Sticker</h1>
          <p className="text-sm text-zinc-500">
            Generate a transparent PNG overlay of a TikTok on-screen comment reply bubble.
          </p>
        </div>

        {/* Inputs */}
        <div className="bg-zinc-900/50 border border-white/10 rounded-xl p-5 space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-zinc-300">
              Reply to username <span className="text-zinc-600 text-xs">(the commenter)</span>
            </label>
            <div className="flex items-center">
              <span className="px-3 py-2.5 bg-zinc-800 border border-r-0 border-white/10 rounded-l-lg text-zinc-500 text-sm select-none">@</span>
              <input
                type="text"
                value={replyTo}
                onChange={e => setReplyTo(e.target.value)}
                placeholder="originalcommenter"
                className="flex-1 bg-zinc-800/50 border border-white/10 rounded-r-lg px-3.5 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-zinc-300">
              Your username <span className="text-zinc-600 text-xs">(the creator replying)</span>
            </label>
            <div className="flex items-center">
              <span className="px-3 py-2.5 bg-zinc-800 border border-r-0 border-white/10 rounded-l-lg text-zinc-500 text-sm select-none">@</span>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="yourcreatorhandle"
                className="flex-1 bg-zinc-800/50 border border-white/10 rounded-r-lg px-3.5 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-zinc-300 flex items-center justify-between">
              <span>Comment text</span>
              <span className="text-zinc-600 text-xs font-normal">{comment.length}/220</span>
            </label>
            <textarea
              value={comment}
              onChange={e => setComment(e.target.value.slice(0, 220))}
              rows={3}
              placeholder="Type the comment text here..."
              className="w-full bg-zinc-800/50 border border-white/10 rounded-lg px-3.5 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 resize-none"
            />
          </div>
        </div>

        {/* Preview */}
        <div className="space-y-3">
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Preview</p>
          <div className="flex justify-center py-10 px-4 bg-zinc-900/30 border border-white/5 rounded-xl">
            <TikTokCommentBubble
              ref={stickerRef}
              replyTo={replyTo}
              username={username}
              comment={comment}
            />
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-start gap-2.5 p-3.5 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
            <span className="mt-0.5 shrink-0">⚠</span>
            {error}
          </div>
        )}

        {/* Download button */}
        <button
          onClick={handleDownload}
          disabled={downloading || !hasContent}
          className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-white text-zinc-900 text-sm font-semibold hover:bg-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {downloading ? (
            <>
              <span className="inline-block w-4 h-4 border-2 border-zinc-400 border-t-zinc-900 rounded-full animate-spin" />
              Exporting…
            </>
          ) : (
            <>
              <DownloadIcon />
              Download PNG (Transparent)
            </>
          )}
        </button>

        <p className="text-center text-xs text-zinc-600">
          Exports at 2× pixel ratio — crisp in any video editor timeline.
        </p>
      </div>
    </div>
  );
}

// ============================================================================
// Sticker bubble — the actual node that gets captured
// ============================================================================

import React from 'react';

interface BubbleProps {
  replyTo: string;
  username: string;
  comment: string;
}

const TikTokCommentBubble = React.forwardRef<HTMLDivElement, BubbleProps>(
  ({ replyTo, username, comment }, ref) => {
    const displayReplyTo = replyTo.trim() || 'someone';
    const displayUsername = username.trim() || 'creator';
    const displayComment = comment.trim() || 'Your comment text will appear here…';

    // Avatar initials
    const initials = displayUsername.charAt(0).toUpperCase();

    return (
      <div
        ref={ref}
        style={{
          // Explicit inline styles so html-to-image captures everything correctly
          // (Tailwind classes work but inline guarantees no purge surprises)
          position: 'relative',
          display: 'inline-block',
          maxWidth: 480,
          width: 'fit-content',
          background: '#ffffff',
          borderRadius: 16,
          padding: '10px 14px 10px 16px',
          boxShadow: '0 4px 24px rgba(0,0,0,0.18), 0 1px 4px rgba(0,0,0,0.10)',
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        }}
      >
        {/* Tail (left side) */}
        <div
          style={{
            position: 'absolute',
            left: -10,
            top: 24,
            width: 0,
            height: 0,
            borderTop: '8px solid transparent',
            borderBottom: '8px solid transparent',
            borderRight: '10px solid #ffffff',
            filter: 'drop-shadow(-2px 1px 2px rgba(0,0,0,0.10))',
          }}
        />

        {/* "Reply to X's comment" header */}
        <div
          style={{
            fontSize: 11,
            color: '#8a8a8a',
            marginBottom: 8,
            letterSpacing: 0.1,
          }}
        >
          Reply to{' '}
          <span style={{ fontWeight: 600, color: '#555' }}>@{displayReplyTo}</span>
          &apos;s comment
        </div>

        {/* Avatar + username + comment row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          {/* Avatar */}
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #fe2c55 0%, #ff8c00 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              color: '#fff',
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            {initials}
          </div>

          {/* Text */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <span
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: '#111',
                marginRight: 6,
              }}
            >
              @{displayUsername}
            </span>
            <span
              style={{
                fontSize: 13,
                color: '#222',
                lineHeight: 1.45,
                wordBreak: 'break-word',
              }}
            >
              {displayComment}
            </span>
          </div>
        </div>
      </div>
    );
  }
);

TikTokCommentBubble.displayName = 'TikTokCommentBubble';

// ============================================================================
// Inline download icon (no external dep)
// ============================================================================

function DownloadIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M7.5 1v9M4 7l3.5 3.5L11 7M2 13h11"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
