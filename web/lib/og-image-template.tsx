// ============================================================
// Shared OG-image template for FlashFlow AI.
//
// Each per-route opengraph-image.tsx file imports `renderOgCard`
// and calls it with a config. Centralizes the visual so we keep
// every ad-card on the same brand canvas while letting the
// landing-page variants accent-shift their hue and headline.
//
// CONSTRAINTS (Next.js ImageResponse / Satori):
//  - display: 'flex' or 'block' only — no 'grid' / 'inline-flex'.
//  - System fonts only (no font fetching during build).
//  - Style values must be inline (no Tailwind classes).
// ============================================================

import { ImageResponse } from 'next/og';
import type { ReactElement } from 'react';

export const OG_SIZE = { width: 1200, height: 630 } as const;
export const OG_CONTENT_TYPE = 'image/png' as const;

export type AccentTheme = {
  // Glow tint in the corner — usually a translucent accent color.
  glow: string;
  // Badge background + border + text.
  badgeBg: string;
  badgeBorder: string;
  badgeText: string;
  // Gradient for the highlighted span in the headline.
  highlightGradient: string;
  // Lightning logo fill.
  logoFill: string;
};

export const ACCENT_TEAL: AccentTheme = {
  glow: 'radial-gradient(circle, rgba(20, 184, 166, 0.18) 0%, rgba(20, 184, 166, 0) 70%)',
  badgeBg: 'rgba(20, 184, 166, 0.12)',
  badgeBorder: 'rgba(20, 184, 166, 0.35)',
  badgeText: '#5eead4',
  highlightGradient: 'linear-gradient(90deg, #5eead4 0%, #2dd4bf 50%, #34d399 100%)',
  logoFill: '#14b8a6',
};

export const ACCENT_ROSE: AccentTheme = {
  glow: 'radial-gradient(circle, rgba(244, 63, 94, 0.18) 0%, rgba(244, 63, 94, 0) 70%)',
  badgeBg: 'rgba(244, 63, 94, 0.12)',
  badgeBorder: 'rgba(244, 63, 94, 0.35)',
  badgeText: '#fda4af',
  highlightGradient: 'linear-gradient(90deg, #fda4af 0%, #f472b6 50%, #fb7185 100%)',
  logoFill: '#14b8a6', // keep brand lightning teal even on rose theme
};

export const ACCENT_VIOLET: AccentTheme = {
  glow: 'radial-gradient(circle, rgba(139, 92, 246, 0.18) 0%, rgba(139, 92, 246, 0) 70%)',
  badgeBg: 'rgba(139, 92, 246, 0.12)',
  badgeBorder: 'rgba(139, 92, 246, 0.35)',
  badgeText: '#c4b5fd',
  highlightGradient: 'linear-gradient(90deg, #c4b5fd 0%, #a78bfa 50%, #818cf8 100%)',
  logoFill: '#14b8a6',
};

export type OgCardConfig = {
  /** Top-left brand line — usually 'FlashFlow AI'. */
  brand: string;
  /** Small pill above the headline. */
  badge: string;
  /** Plain text before the highlight (include trailing space if needed). */
  titleLead: string;
  /** Highlighted gradient text — the punchline. */
  titleHighlight: string;
  /** Single subtitle paragraph. */
  subtitle: string;
  /** Footer features list (rendered with · separators). */
  footerTags: string[];
  /** URL shown bottom-left. */
  url: string;
  /** Color theme. */
  accent: AccentTheme;
};

export function renderOgCard(config: OgCardConfig): ReactElement {
  const { brand, badge, titleLead, titleHighlight, subtitle, footerTags, url, accent } = config;

  return (
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
      {/* Brand row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none">
          <path
            d="M13 2L3 14h8l-1 8 10-12h-8l1-8z"
            fill={accent.logoFill}
            stroke={accent.logoFill}
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
        <div style={{ fontSize: 36, fontWeight: 700, letterSpacing: '-0.02em' }}>{brand}</div>
      </div>

      <div style={{ flex: 1, display: 'flex' }} />

      {/* Hero block */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
        <div
          style={{
            display: 'flex',
            alignSelf: 'flex-start',
            padding: '8px 16px',
            backgroundColor: accent.badgeBg,
            border: `1px solid ${accent.badgeBorder}`,
            borderRadius: 9999,
            color: accent.badgeText,
            fontSize: 20,
            fontWeight: 500,
            letterSpacing: '0.01em',
          }}
        >
          {badge}
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
          <span>{titleLead}</span>
          <span
            style={{
              background: accent.highlightGradient,
              backgroundClip: 'text',
              color: 'transparent',
            }}
          >
            {titleHighlight}
          </span>
        </div>

        <div style={{ fontSize: 28, color: '#a1a1aa', maxWidth: 1000, lineHeight: 1.4 }}>
          {subtitle}
        </div>
      </div>

      {/* Footer row */}
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
          <span>{url}</span>
        </div>
        <div style={{ display: 'flex', gap: 24, color: '#52525b', fontSize: 18 }}>
          {footerTags.flatMap((t, i) =>
            i === 0
              ? [<span key={`t-${i}`}>{t}</span>]
              : [<span key={`s-${i}`}>·</span>, <span key={`t-${i}`}>{t}</span>]
          )}
        </div>
      </div>

      {/* Decorative glow */}
      <div
        style={{
          position: 'absolute',
          top: -200,
          right: -150,
          width: 600,
          height: 600,
          background: accent.glow,
          display: 'flex',
        }}
      />
    </div>
  );
}

/**
 * Convenience wrapper — most call sites just want to pass a config and get
 * back an ImageResponse. Keeps individual opengraph-image.tsx files to ~10
 * lines each.
 */
export function ogImageFromConfig(config: OgCardConfig) {
  return new ImageResponse(renderOgCard(config), { ...OG_SIZE });
}
