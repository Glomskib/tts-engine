// ============================================================
// FlashFlow AI — Open Graph image (1200×630)
//
// Next.js auto-discovery: by sitting at app/opengraph-image.tsx,
// this file becomes the og:image for the root route ("/"). Next
// injects og:image, og:image:width=1200, og:image:height=630, and
// og:image:type=image/png into <head> automatically.
//
// Don't bother with a hardcoded openGraph.images in layout.tsx —
// per Next.js Metadata API rules, file-based image conventions
// take precedence over the metadata.openGraph.images field for
// the same route segment.
// ============================================================

import { ImageResponse } from 'next/og';

// Image metadata
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt =
  'FlashFlow AI — Growth engine for TikTok Shop affiliates, creators, and brands';

// Force static so Vercel renders at build time, not per-request
export const dynamic = 'force-static';

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#09090b',
          color: '#fafafa',
          fontFamily: 'system-ui, sans-serif',
          padding: '64px',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Top-left brand row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
          }}
        >
          {/* Lightning-bolt logo, drawn as SVG for crisp render */}
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none">
            <path
              d="M13 2L3 14h8l-1 8 10-12h-8l1-8z"
              fill="#14b8a6"
              stroke="#14b8a6"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </svg>
          <div
            style={{
              fontSize: 36,
              fontWeight: 700,
              letterSpacing: '-0.02em',
            }}
          >
            FlashFlow AI
          </div>
        </div>

        {/* Spacer pushes hero to vertical-center */}
        <div style={{ flex: 1, display: 'flex' }} />

        {/* Hero copy */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 28,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignSelf: 'flex-start',
              padding: '8px 16px',
              backgroundColor: 'rgba(20, 184, 166, 0.12)',
              border: '1px solid rgba(20, 184, 166, 0.35)',
              borderRadius: 9999,
              color: '#5eead4',
              fontSize: 20,
              fontWeight: 500,
              letterSpacing: '0.01em',
            }}
          >
            Free to start · No credit card
          </div>

          <div
            style={{
              fontSize: 82,
              fontWeight: 800,
              lineHeight: 1.05,
              letterSpacing: '-0.03em',
              maxWidth: 1000,
              display: 'flex',
              flexWrap: 'wrap',
            }}
          >
            <span>The growth engine for&nbsp;</span>
            <span
              style={{
                background: 'linear-gradient(90deg, #5eead4 0%, #2dd4bf 50%, #34d399 100%)',
                backgroundClip: 'text',
                color: 'transparent',
              }}
            >
              TikTok Shop creators.
            </span>
          </div>

          <div
            style={{
              fontSize: 28,
              color: '#a1a1aa',
              maxWidth: 1000,
              lineHeight: 1.4,
            }}
          >
            Find products, generate hooks, edit videos, publish to TikTok, track
            commissions — in one tool.
          </div>
        </div>

        {/* Bottom row: URL */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: 40,
            fontSize: 22,
            color: '#71717a',
            letterSpacing: '0.02em',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ color: '#52525b' }}>→</span>
            <span>flashflowai.com</span>
          </div>
          <div
            style={{
              display: 'flex',
              gap: 24,
              color: '#52525b',
              fontSize: 18,
            }}
          >
            <span>Scripts</span>
            <span>·</span>
            <span>Clips</span>
            <span>·</span>
            <span>Publishing</span>
            <span>·</span>
            <span>Commissions</span>
          </div>
        </div>

        {/* Decorative gradient glow in the corner */}
        <div
          style={{
            position: 'absolute',
            top: -200,
            right: -150,
            width: 600,
            height: 600,
            background:
              'radial-gradient(circle, rgba(20, 184, 166, 0.18) 0%, rgba(20, 184, 166, 0) 70%)',
            display: 'flex',
          }}
        />
      </div>
    ),
    {
      ...size,
      // No custom fonts — system-ui is fine and avoids font-fetch
      // failures during build that have bitten this project before.
    }
  );
}
