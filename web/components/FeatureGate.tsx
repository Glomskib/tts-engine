'use client';

import { useCredits } from '@/hooks/useCredits';
import { useFeatureAccess } from '@/hooks/useFeatureAccess';
import Link from 'next/link';
import { ReactNode, useState } from 'react';
import { useTheme, getThemeColors } from '@/app/components/ThemeProvider';
import { Lock, Sparkles } from 'lucide-react';

interface FeatureGateProps {
  children: ReactNode;
  fallback?: ReactNode;
  requiredPlan?: 'starter' | 'pro' | 'team' | 'creator' | 'business';
  requireCredits?: boolean;
  /** Feature key for granular feature gating */
  featureKey?: string;
  /** Show disabled/blurred version instead of fallback */
  showDisabled?: boolean;
  /** Custom class name */
  className?: string;
}

const PLAN_HIERARCHY = ['free', 'starter', 'creator', 'pro', 'business', 'team'];

// Feature names for display
const FEATURE_NAMES: Record<string, string> = {
  skit_generator: 'Skit Generator',
  basic_presets: 'Basic Presets',
  all_presets: 'All Character Presets',
  save_skits: 'Save Skits',
  product_catalog: 'Product Catalog',
  audience_intelligence: 'Audience Intelligence',
  winners_bank: 'Winners Bank',
  pain_point_analysis: 'Pain Point Analysis',
  team_members: 'Team Members',
  video_portal: 'Video Portal',
};

/**
 * Gate features based on subscription plan, feature key, or credit availability
 */
export function FeatureGate({
  children,
  fallback,
  requiredPlan,
  requireCredits = false,
  featureKey,
  showDisabled = false,
  className,
}: FeatureGateProps) {
  const { subscription, hasCredits, isLoading: creditsLoading } = useCredits();
  const featureAccess = useFeatureAccess(featureKey || '');

  // Use feature key check if provided
  if (featureKey) {
    if (featureAccess.loading) {
      return <>{fallback || <FeatureGateSkeleton />}</>;
    }

    if (!featureAccess.allowed) {
      if (showDisabled) {
        return (
          <div className={`relative ${className || ''}`}>
            <div className="opacity-50 pointer-events-none blur-[1px]">
              {children}
            </div>
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-lg">
              <FeatureLockedPrompt featureKey={featureKey} compact />
            </div>
          </div>
        );
      }
      return <>{fallback || <FeatureLockedPrompt featureKey={featureKey} />}</>;
    }

    return <>{children}</>;
  }

  // Legacy plan-based gating
  if (creditsLoading) {
    return <>{fallback || <FeatureGateSkeleton />}</>;
  }

  const currentPlanIndex = PLAN_HIERARCHY.indexOf(subscription?.planId || 'free');
  const requiredPlanIndex = requiredPlan ? PLAN_HIERARCHY.indexOf(requiredPlan) : -1;

  if (requiredPlan && currentPlanIndex < requiredPlanIndex) {
    return (
      <>{fallback || <UpgradePrompt requiredPlan={requiredPlan} currentPlan={subscription?.planName || 'Free'} />}</>
    );
  }

  if (requireCredits && !hasCredits) {
    return <>{fallback || <NoCreditsPrompt />}</>;
  }

  return <>{children}</>;
}

/**
 * Feature locked prompt with upgrade CTA
 */
function FeatureLockedPrompt({ featureKey, compact }: { featureKey: string; compact?: boolean }) {
  const { isDark } = useTheme();
  const colors = getThemeColors(isDark);
  const featureName = FEATURE_NAMES[featureKey] || featureKey;

  if (compact) {
    return (
      <Link
        href="/upgrade"
        className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 rounded-lg text-white text-sm font-medium transition-all"
      >
        <Lock className="w-4 h-4" />
        Upgrade to unlock
      </Link>
    );
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '32px',
      backgroundColor: colors.surface,
      borderRadius: '12px',
      border: `1px solid ${colors.border}`,
    }}>
      <div style={{
        width: '48px',
        height: '48px',
        borderRadius: '50%',
        backgroundColor: 'rgba(139, 92, 246, 0.2)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: '16px',
      }}>
        <Lock size={24} color="#a855f7" />
      </div>
      <h3 style={{ fontSize: '18px', fontWeight: 600, color: colors.text, marginBottom: '8px' }}>
        {featureName} is locked
      </h3>
      <p style={{ fontSize: '14px', color: colors.textMuted, textAlign: 'center', marginBottom: '16px', maxWidth: '320px' }}>
        Upgrade your plan to unlock {featureName.toLowerCase()} and other premium features.
      </p>
      <Link
        href="/upgrade"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '12px 24px',
          background: 'linear-gradient(135deg, #9333ea, #3b82f6)',
          borderRadius: '8px',
          color: '#fff',
          fontWeight: 500,
          textDecoration: 'none',
        }}
      >
        <Sparkles size={16} />
        View Upgrade Options
      </Link>
    </div>
  );
}

function FeatureGateSkeleton() {
  const { isDark } = useTheme();
  const colors = getThemeColors(isDark);

  return (
    <div style={{
      padding: '16px',
      borderRadius: '8px',
      backgroundColor: colors.surface,
    }}>
      <div style={{
        height: '16px',
        width: '128px',
        backgroundColor: colors.border,
        borderRadius: '4px',
      }} />
    </div>
  );
}

function UpgradePrompt({ requiredPlan, currentPlan }: { requiredPlan: string; currentPlan: string }) {
  const { isDark } = useTheme();
  const colors = getThemeColors(isDark);

  return (
    <div style={{
      padding: '24px',
      borderRadius: '12px',
      backgroundColor: colors.surface,
      border: `1px solid ${colors.border}`,
      textAlign: 'center',
    }}>
      <div style={{
        width: '48px',
        height: '48px',
        margin: '0 auto 16px',
        borderRadius: '50%',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="#3b82f6" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
        </svg>
      </div>
      <h3 style={{ fontSize: '18px', fontWeight: 600, color: colors.text, marginBottom: '8px' }}>
        Upgrade to {requiredPlan.charAt(0).toUpperCase() + requiredPlan.slice(1)}
      </h3>
      <p style={{ fontSize: '14px', color: colors.textMuted, marginBottom: '16px' }}>
        This feature requires a {requiredPlan} plan or higher. You&apos;re currently on the {currentPlan} plan.
      </p>
      <Link
        href="/upgrade"
        style={{
          display: 'inline-block',
          padding: '8px 24px',
          borderRadius: '8px',
          backgroundColor: colors.accent,
          color: '#fff',
          fontWeight: 500,
          textDecoration: 'none',
        }}
      >
        View Plans
      </Link>
    </div>
  );
}

function NoCreditsPrompt() {
  const { isDark } = useTheme();
  const colors = getThemeColors(isDark);

  return (
    <div style={{
      padding: '24px',
      borderRadius: '12px',
      backgroundColor: colors.surface,
      border: '1px solid rgba(239, 68, 68, 0.2)',
      textAlign: 'center',
    }}>
      <div style={{
        width: '48px',
        height: '48px',
        margin: '0 auto 16px',
        borderRadius: '50%',
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="#ef4444" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
        </svg>
      </div>
      <h3 style={{ fontSize: '18px', fontWeight: 600, color: colors.text, marginBottom: '8px' }}>
        No Credits Remaining
      </h3>
      <p style={{ fontSize: '14px', color: colors.textMuted, marginBottom: '16px' }}>
        You&apos;ve used all your credits. Upgrade your plan to continue generating content.
      </p>
      <Link
        href="/upgrade"
        style={{
          display: 'inline-block',
          padding: '8px 24px',
          borderRadius: '8px',
          backgroundColor: colors.accent,
          color: '#fff',
          fontWeight: 500,
          textDecoration: 'none',
        }}
      >
        Get More Credits
      </Link>
    </div>
  );
}

// Modal version for when user tries to generate without credits
interface NoCreditsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function NoCreditsModal({ isOpen, onClose }: NoCreditsModalProps) {
  const { isFreeUser } = useCredits();
  const { isDark } = useTheme();
  const colors = getThemeColors(isDark);

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 50,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '16px',
    }}>
      {/* Backdrop */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.6)',
          backdropFilter: 'blur(4px)',
        }}
        onClick={onClose}
      />

      {/* Modal */}
      <div style={{
        position: 'relative',
        width: '100%',
        maxWidth: '400px',
        backgroundColor: colors.card,
        border: `1px solid ${colors.border}`,
        borderRadius: '16px',
        padding: '24px',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
      }}>
        <button type="button"
          onClick={onClose}
          aria-label="Close"
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            background: 'none',
            border: 'none',
            color: colors.textMuted,
            cursor: 'pointer',
            padding: '4px',
          }}
        >
          <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: '64px',
            height: '64px',
            margin: '0 auto 24px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(139, 92, 246, 0.2))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <svg width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="#3b82f6" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>

          <h2 style={{ fontSize: '24px', fontWeight: 700, color: colors.text, marginBottom: '8px' }}>
            {isFreeUser ? 'Free Trial Complete' : 'Out of Credits'}
          </h2>

          <p style={{ color: colors.textMuted, marginBottom: '24px' }}>
            {isFreeUser
              ? "You've used all 5 free generations. Upgrade to keep the momentum going."
              : "You've used all your credits for this billing period. Upgrade for more."}
          </p>

          {/* Plan comparison for free users */}
          {isFreeUser && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '12px',
              marginBottom: '24px',
              textAlign: 'left',
            }}>
              <div style={{
                padding: '16px',
                borderRadius: '12px',
                backgroundColor: colors.surface,
                border: `1px solid ${colors.border}`,
              }}>
                <div style={{ fontSize: '13px', fontWeight: 500, color: colors.textMuted, marginBottom: '4px' }}>Starter</div>
                <div style={{ fontSize: '20px', fontWeight: 700, color: colors.text }}>
                  $9<span style={{ fontSize: '13px', fontWeight: 400, color: colors.textMuted }}>/mo</span>
                </div>
                <div style={{ fontSize: '12px', color: colors.accent, marginTop: '4px' }}>75 credits</div>
              </div>
              <div style={{
                padding: '16px',
                borderRadius: '12px',
                backgroundColor: colors.surface,
                border: '1px solid rgba(59, 130, 246, 0.3)',
              }}>
                <div style={{ fontSize: '13px', fontWeight: 500, color: '#3b82f6', marginBottom: '4px' }}>Creator</div>
                <div style={{ fontSize: '20px', fontWeight: 700, color: colors.text }}>
                  $29<span style={{ fontSize: '13px', fontWeight: 400, color: colors.textMuted }}>/mo</span>
                </div>
                <div style={{ fontSize: '12px', color: '#3b82f6', marginTop: '4px' }}>300 credits</div>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <Link
              href="/upgrade"
              style={{
                display: 'block',
                width: '100%',
                padding: '12px',
                borderRadius: '8px',
                backgroundColor: colors.accent,
                color: '#fff',
                fontWeight: 600,
                textAlign: 'center',
                textDecoration: 'none',
              }}
            >
              View All Plans
            </Link>
            <button type="button"
              onClick={onClose}
              style={{
                display: 'block',
                width: '100%',
                padding: '12px',
                borderRadius: '8px',
                border: `1px solid ${colors.border}`,
                backgroundColor: 'transparent',
                color: colors.textMuted,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Maybe Later
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Hook for easy modal management
export function useNoCreditsModal() {
  const [isOpen, setIsOpen] = useState(false);
  const open = () => setIsOpen(true);
  const close = () => setIsOpen(false);
  return { isOpen, open, close };
}
