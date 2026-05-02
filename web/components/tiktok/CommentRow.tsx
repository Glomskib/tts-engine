/**
 * CommentRow — pixel-accurate TikTok comment row.
 *
 * Matches the flat-row layout in the TikTok feed (NOT the chat bubble used
 * in /admin/tools/tok-comment which is a different surface — that's the
 * "Reply to @X's comment" overlay). Reference: live TikTok at 1x and 3x.
 *
 * Layout:
 *   [36px circle avatar] [username · timestamp · text · reply chip]   [♡  count]
 *   left col, 8px gap                  middle col flexes               right col
 *
 * - No bubble background. TikTok comments are flat rows on the dark surface.
 * - Username is bold, slightly larger; timestamp is smaller and gray.
 * - Reply chip ("Reply") sits below the body in a smaller gray font.
 * - Like icon column is to the right with the count stacked under the heart.
 *
 * Props are loose so it can render either real TikTok comments (from RI)
 * or example comments from comment-miner themes.
 */
'use client';

import React from 'react';
import { Heart } from 'lucide-react';

export interface CommentRowProps {
  /** TikTok @handle without the @ */
  username: string;
  /** The comment body */
  text: string;
  /** Like count (heart). Optional — hidden if undefined */
  likeCount?: number;
  /** Display timestamp, e.g. "2d", "3w", "5-15" — TikTok-style */
  timestamp?: string;
  /** Optional avatar URL. Falls back to initial-on-gradient. */
  avatarUrl?: string;
  /** Whether the user has liked this comment (filled heart) */
  liked?: boolean;
  /** Whether to show the "Reply" chip (defaults true) */
  showReplyChip?: boolean;
  /** Optional accessory the parent can render to the far right (e.g. a kebab menu) */
  rightSlot?: React.ReactNode;
  /** Tailwind-friendly className passthrough */
  className?: string;
}

const AVATAR_GRADIENTS = [
  'linear-gradient(135deg, #fe2c55 0%, #ee1d52 60%, #ff6550 100%)',
  'linear-gradient(135deg, #25f4ee 0%, #14b8b3 100%)',
  'linear-gradient(135deg, #a855f7 0%, #6366f1 100%)',
  'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)',
  'linear-gradient(135deg, #10b981 0%, #06b6d4 100%)',
];

function pickGradient(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_GRADIENTS[h % AVATAR_GRADIENTS.length];
}

function formatLikes(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return (n / 1000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, '') + 'K';
  return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
}

export const CommentRow = React.forwardRef<HTMLDivElement, CommentRowProps>(
  function CommentRow(
    {
      username,
      text,
      likeCount,
      timestamp,
      avatarUrl,
      liked = false,
      showReplyChip = true,
      rightSlot,
      className,
    },
    ref,
  ) {
    const handle = (username || 'user').replace(/^@+/, '');
    const initial = handle.charAt(0).toUpperCase() || 'U';
    const gradient = pickGradient(handle);

    return (
      <div
        ref={ref}
        className={className}
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 12,
          padding: '12px 4px',
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
          WebkitFontSmoothing: 'antialiased',
          MozOsxFontSmoothing: 'grayscale',
          color: '#e7e7e7',
        }}
      >
        {/* Avatar — 36px circle */}
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl}
            alt=""
            width={36}
            height={36}
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              flexShrink: 0,
              objectFit: 'cover',
            }}
          />
        ) : (
          <div
            aria-hidden="true"
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: gradient,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              color: '#fff',
              fontSize: 15,
              fontWeight: 700,
              lineHeight: 1,
            }}
          >
            {initial}
          </div>
        )}

        {/* Body — username, text, reply chip stacked */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: '#a0a0a0',
              lineHeight: 1.2,
              marginBottom: 4,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              flexWrap: 'wrap',
            }}
          >
            <span style={{ color: '#a0a0a0' }}>{handle}</span>
            {timestamp && (
              <>
                <span style={{ color: '#6a6a6a', fontWeight: 400 }}>·</span>
                <span style={{ color: '#6a6a6a', fontWeight: 400, fontSize: 12 }}>
                  {timestamp}
                </span>
              </>
            )}
          </div>

          <div
            style={{
              fontSize: 14,
              lineHeight: 1.42,
              color: '#f1f1f1',
              fontWeight: 400,
              wordBreak: 'break-word',
              overflowWrap: 'break-word',
              whiteSpace: 'pre-wrap',
            }}
          >
            {text}
          </div>

          {showReplyChip && (
            <button
              type="button"
              tabIndex={-1}
              style={{
                marginTop: 6,
                fontSize: 12,
                color: '#7a7a7a',
                background: 'transparent',
                border: 'none',
                padding: 0,
                cursor: 'default',
              }}
            >
              Reply
            </button>
          )}
        </div>

        {/* Right column — heart + count stacked vertically */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 4,
            paddingTop: 2,
            flexShrink: 0,
            color: '#9a9a9a',
            minWidth: 32,
          }}
        >
          <Heart
            size={18}
            strokeWidth={1.75}
            fill={liked ? '#fe2c55' : 'none'}
            color={liked ? '#fe2c55' : '#9a9a9a'}
            aria-hidden="true"
          />
          {typeof likeCount === 'number' && (
            <span style={{ fontSize: 11, color: '#9a9a9a', lineHeight: 1 }}>
              {formatLikes(likeCount)}
            </span>
          )}
          {rightSlot}
        </div>
      </div>
    );
  },
);

export default CommentRow;
