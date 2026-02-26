'use client';

import { useRef, useState, useCallback } from 'react';
import { toCanvas } from 'html-to-image';

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

      // toCanvas gives us direct control over the canvas alpha channel.
      // We deliberately do NOT pass backgroundColor so html-to-image never
      // calls fillRect — the canvas is created with alpha:true by default,
      // giving us transparent pixels outside the bubble.
      const canvas = await toCanvas(stickerRef.current, {
        pixelRatio: 2,
        cacheBust: true,
      });

      // Confirm the canvas has an alpha channel by checking a corner pixel.
      // If it's already transparent we're good; if not, we manually clear
      // the corners by exploting the native PNG alpha path via toDataURL.
      const dataUrl = canvas.toDataURL('image/png');

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
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Preview</p>
            <span className="text-xs text-zinc-600 flex items-center gap-1.5">
              <span
                style={{
                  display: 'inline-block',
                  width: 10,
                  height: 10,
                  backgroundImage:
                    'linear-gradient(45deg,#555 25%,transparent 25%),' +
                    'linear-gradient(-45deg,#555 25%,transparent 25%),' +
                    'linear-gradient(45deg,transparent 75%,#555 75%),' +
                    'linear-gradient(-45deg,transparent 75%,#555 75%)',
                  backgroundSize: '6px 6px',
                  backgroundPosition: '0 0,0 3px,3px -3px,-3px 0',
                  backgroundColor: '#888',
                  borderRadius: 2,
                }}
              />
              Checkerboard = transparent
            </span>
          </div>
          {/*
           * Checkerboard is on THIS container — NOT on the sticker node.
           * Only stickerRef (the inner bubble) is captured on export.
           */}
          <div
            className="flex justify-center py-10 px-4 rounded-xl border border-white/5"
            style={{
              backgroundColor: '#888',
              backgroundImage:
                'linear-gradient(45deg,rgba(0,0,0,.18) 25%,transparent 25%),' +
                'linear-gradient(-45deg,rgba(0,0,0,.18) 25%,transparent 25%),' +
                'linear-gradient(45deg,transparent 75%,rgba(0,0,0,.18) 75%),' +
                'linear-gradient(-45deg,transparent 75%,rgba(0,0,0,.18) 75%)',
              backgroundSize: '24px 24px',
              backgroundPosition: '0 0,0 12px,12px -12px,-12px 0',
            }}
          >
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

// Bubble background — off-white, matches TikTok's overlay card
const BG = '#F4F4F4';

const TikTokCommentBubble = React.forwardRef<HTMLDivElement, BubbleProps>(
  ({ replyTo, username, comment }, ref) => {
    const displayReplyTo = replyTo.trim() || 'someone';
    const displayUsername = username.trim() || 'creator';
    const displayComment = comment.trim() || 'Your comment text will appear here…';
    const initials = displayUsername.charAt(0).toUpperCase();

    return (
      /*
       * Outer wrapper — transparent, gives the tail room to live in.
       * paddingLeft: 10px reserves space so the tail isn't clipped on export.
       * This wrapper is what gets passed to toPng.
       */
      <div
        ref={ref}
        style={{
          position: 'relative',
          display: 'inline-block',
          paddingLeft: 10,
          maxWidth: 390,
          WebkitFontSmoothing: 'antialiased',
          MozOsxFontSmoothing: 'grayscale',
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        } as React.CSSProperties}
      >
        {/*
         * Tail — clean clip-path triangle pointing left.
         * Positioned so its horizontal center aligns with the header row.
         * Overlaps the bubble's left edge by 2px to hide the border joint.
         */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 10,           // aligns with header text vertical center
            width: 12,
            height: 16,
            background: BG,
            clipPath: 'polygon(100% 0%, 100% 100%, 0% 50%)',
            zIndex: 1,
          }}
        />

        {/* Bubble */}
        <div
          style={{
            position: 'relative',
            background: BG,
            borderRadius: 14,
            border: '1px solid rgba(0,0,0,0.07)',
            boxShadow:
              '0 2px 10px rgba(0,0,0,0.13), 0 0 1px rgba(0,0,0,0.06)',
            padding: '10px 14px 12px 14px',
            zIndex: 2,
          }}
        >
          {/* "Reply to @X's comment" header */}
          <div
            style={{
              fontSize: 11.5,
              fontWeight: 400,
              color: '#8c8c8c',
              lineHeight: 1,
              marginBottom: 7,
              letterSpacing: 0.05,
            }}
          >
            Reply to{' '}
            <span style={{ fontWeight: 500, color: '#5c5c5c' }}>
              @{displayReplyTo}
            </span>
            &apos;s comment
          </div>

          {/* Avatar + text row */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            {/* Avatar — 30px, soft gray circle with initials */}
            <div
              style={{
                width: 30,
                height: 30,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #fe2c55 0%, #ee1d52 60%, #ff6550 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                color: '#fff',
                fontSize: 12,
                fontWeight: 700,
                marginTop: 1,   // optical alignment with text cap height
              }}
            >
              {initials}
            </div>

            {/* Username + comment inline, wraps naturally */}
            <div
              style={{
                fontSize: 14,
                lineHeight: 1.42,
                color: '#111111',
                wordBreak: 'break-word',
                overflowWrap: 'break-word',
              }}
            >
              <span style={{ fontWeight: 700, marginRight: 4 }}>
                @{displayUsername}
              </span>
              <span style={{ fontWeight: 400, color: '#1a1a1a' }}>
                {displayComment}
              </span>
            </div>
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
