'use client';

import { useCredits } from '@/hooks/useCredits';
import Link from 'next/link';
import { useTheme, getThemeColors } from '@/app/components/ThemeProvider';

interface CreditsBadgeProps {
  showPlan?: boolean;
  compact?: boolean;
}

export function CreditsBadge({ showPlan = false, compact = false }: CreditsBadgeProps) {
  const { credits, subscription, isLoading, isFreeUser } = useCredits();
  const { isDark } = useTheme();
  const colors = getThemeColors(isDark);

  if (isLoading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '6px 12px',
        borderRadius: '8px',
        backgroundColor: colors.surface,
        border: `1px solid ${colors.border}`,
      }}>
        <div style={{
          width: '16px',
          height: '16px',
          borderRadius: '50%',
          backgroundColor: colors.border,
        }} />
        <div style={{
          width: '48px',
          height: '16px',
          borderRadius: '4px',
          backgroundColor: colors.border,
        }} />
      </div>
    );
  }

  const remaining = credits?.remaining ?? 0;
  const isUnlimited = remaining === -1 || (credits as { isUnlimited?: boolean })?.isUnlimited;
  const isLow = !isUnlimited && remaining > 0 && remaining <= 5;
  const isEmpty = !isUnlimited && remaining === 0;

  const getBadgeColors = () => {
    if (isUnlimited) {
      return {
        backgroundColor: 'rgba(45, 212, 191, 0.1)',
        borderColor: 'rgba(45, 212, 191, 0.2)',
        color: '#2dd4bf',
      };
    }
    if (isEmpty) {
      return {
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        borderColor: 'rgba(239, 68, 68, 0.2)',
        color: '#ef4444',
      };
    }
    if (isLow) {
      return {
        backgroundColor: 'rgba(245, 158, 11, 0.1)',
        borderColor: 'rgba(245, 158, 11, 0.2)',
        color: '#f59e0b',
      };
    }
    return {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      color: colors.text,
    };
  };

  const badgeColors = getBadgeColors();

  // Compact version for mobile
  if (compact) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          padding: '4px 8px',
          borderRadius: '6px',
          border: `1px solid ${badgeColors.borderColor}`,
          backgroundColor: badgeColors.backgroundColor,
          color: badgeColors.color,
        }}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M13 10V3L4 14h7v7l9-11h-7z"
          />
        </svg>
        <span style={{ fontSize: '12px', fontWeight: 500 }}>
          {isUnlimited ? '∞' : remaining}
        </span>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
      {/* Credits count */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '6px 12px',
          borderRadius: '8px',
          border: `1px solid ${badgeColors.borderColor}`,
          backgroundColor: badgeColors.backgroundColor,
          color: badgeColors.color,
        }}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M13 10V3L4 14h7v7l9-11h-7z"
          />
        </svg>
        <span style={{ fontSize: '13px', fontWeight: 500 }}>
          {isUnlimited ? 'Unlimited' : `${remaining} credits`}
        </span>
      </div>

      {/* Plan badge */}
      {showPlan && subscription && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '6px 12px',
          borderRadius: '8px',
          backgroundColor: colors.surface,
          border: `1px solid ${colors.border}`,
        }}>
          <span style={{ fontSize: '13px', color: colors.textMuted }}>{subscription.planName}</span>
        </div>
      )}

      {/* Upgrade prompt - not shown for unlimited users */}
      {!isUnlimited && (isEmpty || (isFreeUser && isLow)) && (
        <Link
          href="/upgrade"
          style={{
            fontSize: '13px',
            color: colors.accent,
            textDecoration: 'none',
          }}
        >
          Upgrade
        </Link>
      )}
    </div>
  );
}

// Minimal version for tight spaces
export function CreditsCount() {
  const { credits, isLoading } = useCredits();
  const { isDark } = useTheme();
  const colors = getThemeColors(isDark);

  if (isLoading) {
    return <span style={{ color: colors.textMuted }}>...</span>;
  }

  const remaining = credits?.remaining ?? 0;
  const isUnlimited = remaining === -1 || (credits as { isUnlimited?: boolean })?.isUnlimited;
  const textColor = isUnlimited
    ? '#2dd4bf'
    : remaining === 0
    ? '#ef4444'
    : remaining <= 5
    ? '#f59e0b'
    : colors.text;

  return (
    <span style={{ fontWeight: 500, color: textColor }}>
      {isUnlimited ? '∞' : remaining}
    </span>
  );
}
