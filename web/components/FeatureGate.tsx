'use client';

import { useCredits } from '@/hooks/useCredits';
import Link from 'next/link';
import { ReactNode, useState } from 'react';
import { useTheme, getThemeColors } from '@/app/components/ThemeProvider';

interface FeatureGateProps {
  children: ReactNode;
  fallback?: ReactNode;
  requiredPlan?: 'starter' | 'pro' | 'team';
  requireCredits?: boolean;
}

const PLAN_HIERARCHY = ['free', 'starter', 'pro', 'team'];

/**
 * Gate features based on subscription plan or credit availability
 */
export function FeatureGate({
  children,
  fallback,
  requiredPlan,
  requireCredits = false,
}: FeatureGateProps) {
  const { subscription, hasCredits, isLoading } = useCredits();

  if (isLoading) {
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
        href="/pricing"
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
        href="/pricing"
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
        <button
          onClick={onClose}
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
                  $29<span style={{ fontSize: '13px', fontWeight: 400, color: colors.textMuted }}>/mo</span>
                </div>
                <div style={{ fontSize: '12px', color: colors.accent, marginTop: '4px' }}>100 generations</div>
              </div>
              <div style={{
                padding: '16px',
                borderRadius: '12px',
                backgroundColor: colors.surface,
                border: '1px solid rgba(59, 130, 246, 0.3)',
              }}>
                <div style={{ fontSize: '13px', fontWeight: 500, color: '#3b82f6', marginBottom: '4px' }}>Pro</div>
                <div style={{ fontSize: '20px', fontWeight: 700, color: colors.text }}>
                  $79<span style={{ fontSize: '13px', fontWeight: 400, color: colors.textMuted }}>/mo</span>
                </div>
                <div style={{ fontSize: '12px', color: '#3b82f6', marginTop: '4px' }}>500 generations</div>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <Link
              href="/pricing"
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
            <button
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
