'use client';

import React, { useRef, useState, useLayoutEffect, useCallback } from 'react';
import { toCanvas } from 'html-to-image';
import { formatReplyHeader } from '@/lib/tools/tok-comment';

// ============================================================================
// TikTok On-Screen Comment Reply Sticker Generator
// ============================================================================

interface TokCommentToolProps {
  /** When true, renders without the standalone page wrapper (for admin layout embedding) */
  embedded?: boolean;
}

export default function TokCommentTool({ embedded = false }: TokCommentToolProps) {
  const [replyTo, setReplyTo] = useState('');
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

      // toCanvas — no backgroundColor arg so html-to-image never calls fillRect;
      // canvas is created with alpha:true giving transparent pixels outside the bubble.
      const canvas = await toCanvas(stickerRef.current, {
        pixelRatio: 2,
        cacheBust: true,
      });

      const dataUrl = canvas.toDataURL('image/png');
      const safe = (replyTo || 'comment').replace(/[^a-z0-9_-]/gi, '_').toLowerCase();
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
  }, [replyTo]);

  const hasContent = replyTo.trim() || comment.trim();

  const content = (
    <div className="space-y-6">

        {/* Inputs */}
        <div className="bg-zinc-900/50 border border-white/10 rounded-xl p-5 space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-zinc-300">
              Commenter username <span className="text-zinc-600 text-xs">(who wrote the comment)</span>
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

        {/* Preview — checkerboard behind sticker so transparency is visible */}
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
          {/* Checkerboard is on THIS container only — NOT inside the sticker node */}
          <div
            className="flex justify-center pt-10 pb-4 px-4 rounded-xl border border-white/5"
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
  );

  if (embedded) return content;

  return (
    <div className="min-h-screen bg-[#09090b] text-white">
      <div className="max-w-2xl mx-auto px-4 py-12 space-y-8">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-zinc-100">TikTok Comment Reply Sticker</h1>
          <p className="text-sm text-zinc-500">
            Generate a transparent PNG overlay of a TikTok on-screen comment reply bubble.
          </p>
        </div>
        {content}
      </div>
    </div>
  );
}

// ============================================================================
// Sticker bubble — the actual node captured by html-to-image
// ============================================================================

interface BubbleProps {
  replyTo: string;
  comment: string;
}

const BUBBLE_BG = '#FFFFFF';
const TAIL_H    = 18;  // px the tail extends below the bubble bottom
const R         = 16;  // bubble corner radius

/**
 * Single SVG path: rounded rectangle + TikTok-style downward speech tail.
 *
 * The tail sits at the bottom-left of the bubble and points down-left
 * matching TikTok's native reply sticker. Both sides of the tail use
 * cubic bezier curves so the wedge blends smoothly into the rounded rect
 * — no visible seam, no sharp triangle.
 *
 * Geometry (bubble = W × H, tail adds TAIL_H below):
 *
 *   ┌─────────────────────────────────┐
 *   │          rounded rect           │
 *   └───tl────tr──────────────────────┘
 *         ╲     ╱
 *          ╲   ╱    ← smooth cubic bezier curves
 *           ╲ ╱
 *            ╰      ← rounded tip at (tx, ty)
 */
function buildPath(W: number, H: number): string {
  const r  = R;
  const tl = 26;           // tail base left x
  const tr = 52;           // tail base right x
  const tx = 14;           // tail tip x
  const ty = H + TAIL_H;  // tail tip y

  // Right wall of tail: gentle curve from (tr, H) → near tip.
  // cp1 starts nearly horizontal then sweeps down; cp2 converges from right.
  const rcp1x = tr + 1,  rcp1y = H + 7;
  const rcp2x = tx + 14, rcp2y = ty - 3;

  // Rounded tip: quadratic arc through the apex so the point is soft.
  const tipX = tx,      tipY = ty + 2;
  const tEndX = tx - 4, tEndY = ty - 2;

  // Left wall of tail: mirror — curves from near-tip back up to (tl, H).
  const lcp1x = tx - 12, lcp1y = ty - 3;
  const lcp2x = tl - 1,  lcp2y = H + 7;

  return [
    `M${r} 0`,
    `L${W - r} 0`,
    `Q${W} 0 ${W} ${r}`,         // top-right corner
    `L${W} ${H - r}`,
    `Q${W} ${H} ${W - r} ${H}`,  // bottom-right corner
    `L${tr} ${H}`,                // bottom edge → tail right base
    // Right side of tail — smooth cubic curve
    `C${rcp1x} ${rcp1y} ${rcp2x} ${rcp2y} ${tx + 3} ${ty - 1}`,
    // Rounded tip
    `Q${tipX} ${tipY} ${tEndX} ${tEndY}`,
    // Left side of tail — smooth cubic curve
    `C${lcp1x} ${lcp1y} ${lcp2x} ${lcp2y} ${tl} ${H}`,
    `L${r} ${H}`,
    `Q0 ${H} 0 ${H - r}`,        // bottom-left corner
    `L0 ${r}`,
    `Q0 0 ${r} 0`,               // top-left corner
    'Z',
  ].join(' ');
}

const TikTokCommentBubble = React.forwardRef<HTMLDivElement, BubbleProps>(
  ({ replyTo, comment }, ref) => {
    const displayReplyTo = replyTo.trim() || 'someone';
    const displayComment = comment.trim() || 'Your comment text will appear here…';
    const initials = displayReplyTo.charAt(0).toUpperCase();

    // Measure the content div after each paint so the SVG fits exactly.
    const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
    const contentRef = useRef<HTMLDivElement>(null);

    useLayoutEffect(() => {
      const el = contentRef.current;
      if (!el) return;
      const measure = () => setDims({ w: el.offsetWidth, h: el.offsetHeight });
      measure();
      const ro = new ResizeObserver(measure);
      ro.observe(el);
      return () => ro.disconnect();
    }, []);

    const svgH = (dims?.h ?? 0) + TAIL_H;

    return (
      /**
       * Outer wrapper — this is the node captured for export.
       * No background here; transparency comes from the SVG shape.
       * paddingBottom = TAIL_H so the tail is inside the captured bounds.
       */
      <div
        ref={ref}
        style={{
          position: 'relative',
          display: 'inline-block',
          maxWidth: 380,
          paddingBottom: TAIL_H,
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
          WebkitFontSmoothing: 'antialiased',
          MozOsxFontSmoothing: 'grayscale',
        } as React.CSSProperties}
      >
        {/* SVG bubble shape — sits behind content via z-index 0 */}
        {dims && dims.w > 0 && (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width={dims.w}
            height={svgH}
            viewBox={`0 0 ${dims.w} ${svgH}`}
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              overflow: 'visible',
              pointerEvents: 'none',
              zIndex: 0,
            }}
          >
            <defs>
              {/*
               * SVG drop-shadow filter — follows exact path contour so the
               * shadow hugs the rounded-rect + tail as one unified shape.
               */}
              <filter
                id="tok-shadow"
                x="-20%"
                y="-15%"
                width="140%"
                height="160%"
              >
                <feGaussianBlur in="SourceAlpha" stdDeviation="3" result="blur" />
                <feOffset in="blur" dx="0" dy="2" result="off" />
                <feColorMatrix
                  in="off"
                  type="matrix"
                  values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.10 0"
                  result="shadow"
                />
                <feMerge>
                  <feMergeNode in="shadow" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <path
              d={buildPath(dims.w, dims.h)}
              fill={BUBBLE_BG}
              stroke="rgba(0,0,0,0.05)"
              strokeWidth="0.5"
              filter="url(#tok-shadow)"
            />
          </svg>
        )}

        {/* Content layer — z-index 1 so it sits above the SVG */}
        <div
          ref={contentRef}
          style={{
            position: 'relative',
            zIndex: 1,
            padding: '10px 14px 12px 14px',
          }}
        >
          {/* "Reply to @X's comment" header */}
          <div
            style={{
              fontSize: 11.5,
              fontWeight: 400,
              color: '#8a8a8a',
              lineHeight: 1,
              marginBottom: 8,
              letterSpacing: 0.05,
            }}
          >
            Reply to{' '}
            <span style={{ fontWeight: 500, color: '#5a5a5a' }}>
              @{displayReplyTo}
            </span>
            &apos;s comment
          </div>

          {/* Avatar + comment text */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                background:
                  'linear-gradient(135deg, #fe2c55 0%, #ee1d52 60%, #ff6550 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                color: '#fff',
                fontSize: 12,
                fontWeight: 700,
                marginTop: 1,
              }}
            >
              {initials}
            </div>
            <div
              style={{
                fontSize: 14,
                lineHeight: 1.42,
                color: '#111111',
                fontWeight: 400,
                wordBreak: 'break-word',
                overflowWrap: 'break-word',
              }}
            >
              {displayComment}
            </div>
          </div>
        </div>
      </div>
    );
  }
);

TikTokCommentBubble.displayName = 'TikTokCommentBubble';

// ============================================================================
// Inline download icon
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
