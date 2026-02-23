'use client';

/**
 * MainOnboardingTour — Joyride-based feature tour + welcome modal.
 *
 * Mobile QA checklist (390×844):
 *  [ ] Welcome modal fits without clipping, footer buttons visible
 *  [ ] Step transitions don't cause viewport jumps
 *  [ ] Tooltip never clips below home-bar (safe-area)
 *  [ ] Buttons stack vertically — Next / Back / Skip
 *  [ ] Background doesn't scroll while tour is active
 *  [ ] Console shows "[Onboarding] Mobile layout active"
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import type { CallBackProps, Step, TooltipRenderProps } from 'react-joyride';
import { buildTourSteps, TOUR_STORAGE_KEY, getMobilePlacement } from '@/lib/onboarding-tour';
import { useCredits } from '@/hooks/useCredits';

// react-joyride@2.9.3 uses unmountComponentAtNode which was removed in React 19.
// Dynamically import to defer the error, and provide a noop shim to prevent crash.
let Joyride: typeof import('react-joyride').default | null = null;
let ACTIONS: typeof import('react-joyride').ACTIONS;
let EVENTS: typeof import('react-joyride').EVENTS;
let STATUS: typeof import('react-joyride').STATUS;
let joyrideReady = false;

if (typeof window !== 'undefined') {
  // Shim unmountComponentAtNode before react-joyride loads
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ReactDOM = require('react-dom') as Record<string, unknown>;
  if (!ReactDOM.unmountComponentAtNode) {
    ReactDOM.unmountComponentAtNode = () => false;
  }
  // Now safe to load react-joyride synchronously
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('react-joyride');
  Joyride = mod.default;
  ACTIONS = mod.ACTIONS;
  EVENTS = mod.EVENTS;
  STATUS = mod.STATUS;
  joyrideReady = true;
}

/* ------------------------------------------------------------------ */
/*  Mobile-only custom tooltip — stacked buttons + compact sizing     */
/* ------------------------------------------------------------------ */

function MobileTooltip({
  index,
  step,
  backProps,
  primaryProps,
  skipProps,
  tooltipProps,
  isLastStep,
  size,
}: TooltipRenderProps) {
  return (
    <div
      {...tooltipProps}
      style={{
        backgroundColor: '#18181b',
        border: '1px solid #3f3f46',
        borderRadius: 12,
        padding: 12,
        maxWidth: '92vw',
        maxHeight: 'calc(100dvh - 120px - env(safe-area-inset-bottom, 0px))',
        overflowY: 'auto',
        boxSizing: 'border-box' as const,
        paddingBottom: `calc(12px + env(safe-area-inset-bottom, 0px))`,
      }}
    >
      {step.title && (
        <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 4 }}>
          {step.title}
        </div>
      )}
      <div style={{ fontSize: 12, lineHeight: 1.5, color: '#a1a1aa', padding: '6px 0' }}>
        {step.content}
      </div>

      {/* Vertically stacked buttons: Next → Back → Skip */}
      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <button
          {...primaryProps}
          style={{
            width: '100%',
            padding: '10px 16px',
            backgroundColor: '#14b8a6',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {isLastStep ? 'Done' : 'Next'} ({index + 1}/{size})
        </button>
        {index > 0 && (
          <button
            {...backProps}
            style={{
              width: '100%',
              padding: '8px 16px',
              backgroundColor: 'transparent',
              color: '#a1a1aa',
              border: '1px solid #3f3f46',
              borderRadius: 8,
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            Back
          </button>
        )}
        <button
          {...skipProps}
          style={{
            width: '100%',
            padding: '8px 16px',
            backgroundColor: 'transparent',
            color: '#71717a',
            border: 'none',
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          Skip tour
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

interface MainOnboardingTourProps {
  isMobile: boolean;
  onOpenSidebar?: () => void;
}

export function MainOnboardingTour({ isMobile, onOpenSidebar }: MainOnboardingTourProps) {
  const router = useRouter();
  const { subscription } = useCredits();
  const [showWelcome, setShowWelcome] = useState(false);
  const [runTour, setRunTour] = useState(false);
  const [steps, setSteps] = useState<Step[]>([]);
  const [stepIndex, setStepIndex] = useState(0);
  const [checked, setChecked] = useState(false);
  const [mobilePlacement, setMobilePlacement] = useState<'top' | 'bottom' | 'auto'>('auto');
  const mobileLoggedRef = useRef(false);

  // ── Task 4: mobileCompact flag (max-width 640px) ──────────────
  const [mobileCompact, setMobileCompact] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)');
    setMobileCompact(mq.matches);
    const handler = (e: MediaQueryListEvent) => setMobileCompact(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // ── Task 7: QA helper log ─────────────────────────────────────
  useEffect(() => {
    if (isMobile && !mobileLoggedRef.current) {
      mobileLoggedRef.current = true;
      console.log('[Onboarding] Mobile layout active');
    }
  }, [isMobile]);

  // ── Task 6: prevent background scroll bleed (iOS Safari hardened) ──
  useEffect(() => {
    if (!showWelcome && !runTour) return;
    const scrollY = window.scrollY;
    const prevBodyOverflow = document.body.style.overflow;
    const prevBodyPosition = document.body.style.position;
    const prevBodyWidth = document.body.style.width;
    const prevBodyTop = document.body.style.top;
    const prevHtmlOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.width = '100%';
    document.body.style.top = `-${scrollY}px`;
    document.documentElement.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = prevBodyOverflow;
      document.body.style.position = prevBodyPosition;
      document.body.style.width = prevBodyWidth;
      document.body.style.top = prevBodyTop;
      document.documentElement.style.overflow = prevHtmlOverflow;
      window.scrollTo(0, scrollY);
    };
  }, [showWelcome, runTour]);

  // ── Check tour state on mount ─────────────────────────────────
  useEffect(() => {
    if (checked) return;

    const localSeen = localStorage.getItem(TOUR_STORAGE_KEY) === 'true';
    if (localSeen) {
      setChecked(true);
      return;
    }

    fetch('/api/onboarding/tour')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.main_tour_seen) {
          localStorage.setItem(TOUR_STORAGE_KEY, 'true');
        } else {
          setShowWelcome(true);
        }
      })
      .catch(() => {
        setShowWelcome(true);
      })
      .finally(() => setChecked(true));
  }, [checked]);

  // ── Listen for restart-tour event ─────────────────────────────
  useEffect(() => {
    const handler = () => {
      localStorage.removeItem(TOUR_STORAGE_KEY);
      setShowWelcome(true);
      setStepIndex(0);
    };
    window.addEventListener('flashflow:restart-tour', handler);
    return () => window.removeEventListener('flashflow:restart-tour', handler);
  }, []);

  // ── Build steps when subscription info is available ───────────
  useEffect(() => {
    const planId = subscription?.planId || 'free';
    fetch('/api/products?limit=1')
      .then(r => r.ok ? r.json() : { data: [] })
      .then(data => {
        const hasProducts = Array.isArray(data.data) && data.data.length > 0;
        setSteps(buildTourSteps({ planId, hasProducts }));
      })
      .catch(() => {
        setSteps(buildTourSteps({ planId, hasProducts: false }));
      });
  }, [subscription?.planId]);

  // ── Task 1 & 2: mobile scroll-to-center + dynamic placement ──
  useEffect(() => {
    if (!isMobile || !runTour || steps.length === 0) return;
    const step = steps[stepIndex];
    if (!step) return;

    // Allow route navigation + render to settle before measuring
    const timer = setTimeout(() => {
      const el =
        typeof step.target === 'string'
          ? document.querySelector(step.target)
          : step.target;
      if (!(el instanceof HTMLElement)) return;

      // Scroll target to center of viewport (no jump)
      el.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'nearest' });

      // Double-rAF to let layout settle, then compute placement
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const rect = el.getBoundingClientRect();
          setMobilePlacement(getMobilePlacement(rect, window.innerHeight));
        });
      });
    }, 150);

    return () => clearTimeout(timer);
  }, [stepIndex, isMobile, runTour, steps]);

  // ── Derived steps with mobile placement override ──────────────
  const activeSteps = useMemo(() => {
    if (!isMobile || steps.length === 0) return steps;
    return steps.map((s, i) =>
      i === stepIndex ? { ...s, placement: mobilePlacement as Step['placement'] } : s,
    );
  }, [steps, stepIndex, isMobile, mobilePlacement]);

  const markSeen = useCallback((completed: boolean) => {
    localStorage.setItem(TOUR_STORAGE_KEY, 'true');
    fetch('/api/onboarding/tour', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seen: true, completed, skipped: !completed }),
    }).catch(() => {});
  }, []);

  const handleStart = () => {
    setShowWelcome(false);
    if (isMobile && onOpenSidebar) onOpenSidebar();

    const delay = isMobile ? 400 : 100;
    setTimeout(() => {
      // Mobile: scroll first step target to center before starting tour
      if (isMobile && steps.length > 0) {
        const firstTarget = steps[0].target;
        const el =
          typeof firstTarget === 'string'
            ? document.querySelector(firstTarget)
            : firstTarget;
        if (el instanceof HTMLElement) {
          el.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'nearest' });
        }
      }
      // Small extra delay for layout to stabilize on mobile
      setTimeout(() => setRunTour(true), isMobile ? 75 : 0);
    }, delay);
  };

  const handleSkip = () => {
    setShowWelcome(false);
    markSeen(false);
  };

  const handleJoyrideCallback = useCallback(
    (data: CallBackProps) => {
      const { action, index, status, type } = data;

      if (status === STATUS.FINISHED) {
        setRunTour(false);
        markSeen(true);
        return;
      }

      if (status === STATUS.SKIPPED) {
        setRunTour(false);
        markSeen(false);
        return;
      }

      if (type === EVENTS.STEP_AFTER) {
        const nextIndex = action === ACTIONS.PREV ? index - 1 : index + 1;

        if (nextIndex >= 0 && nextIndex < steps.length) {
          const nextStep = steps[nextIndex];
          const route = (nextStep as Step & { data?: { route?: string } }).data?.route;

          if (route) {
            if (isMobile && onOpenSidebar) onOpenSidebar();
            router.push(route);
          }

          // Mobile + route: delay stepIndex update so the new route renders
          // before the scroll-to-center effect fires
          if (isMobile && route) {
            setTimeout(() => setStepIndex(nextIndex), 300);
          } else {
            setStepIndex(nextIndex);
          }
        } else {
          setStepIndex(nextIndex);
        }
      }

      if (action === ACTIONS.CLOSE) {
        setRunTour(false);
        markSeen(false);
      }
    },
    [steps, router, markSeen, isMobile, onOpenSidebar],
  );

  // ── Welcome modal ─────────────────────────────────────────────
  if (showWelcome) {
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

        {/* Modal — responsive width + constrained height */}
        <div
          className="relative bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl w-full overflow-hidden flex flex-col text-center"
          style={{
            maxWidth: 'min(92vw, 420px)',
            maxHeight: 'calc(100dvh - 32px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))',
          }}
        >
          {/* Scrollable body */}
          <div className="overflow-y-auto flex-1 p-6 sm:p-8">
            <div className="w-14 h-14 sm:w-16 sm:h-16 mx-auto mb-4 sm:mb-5 rounded-2xl bg-gradient-to-br from-teal-400 to-teal-600 flex items-center justify-center">
              <svg className="w-7 h-7 sm:w-8 sm:h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>

            <h2 className="text-xl sm:text-2xl font-bold text-white mb-2">Welcome to FlashFlow</h2>
            <p className="text-zinc-400 mb-2 text-sm leading-relaxed">
              Let us show you around! A quick walkthrough of the key features
              so you can start creating content right away.
            </p>
          </div>

          {/* Task 5: sticky footer with safe-area padding */}
          <div
            className="sticky bottom-0 bg-zinc-900 border-t border-zinc-800 px-6 sm:px-8 py-4 flex flex-col gap-3"
            style={{ paddingBottom: `calc(1rem + env(safe-area-inset-bottom, 0px))` }}
          >
            <button
              onClick={handleStart}
              className="w-full py-3 px-6 bg-teal-500 hover:bg-teal-600 text-white font-semibold rounded-xl transition-colors"
            >
              Start Walkthrough
            </button>
            <button
              onClick={handleSkip}
              className="w-full py-2.5 px-6 text-zinc-500 hover:text-zinc-300 font-medium rounded-xl transition-colors"
            >
              Skip for now
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!runTour || activeSteps.length === 0) return null;

  return (
    <Joyride
      steps={activeSteps}
      stepIndex={stepIndex}
      run={runTour}
      continuous
      showProgress
      showSkipButton
      scrollToFirstStep={!isMobile}
      disableOverlayClose={false}
      disableScrolling={isMobile}
      spotlightPadding={isMobile ? 4 : 10}
      callback={handleJoyrideCallback}
      tooltipComponent={mobileCompact ? MobileTooltip : undefined}
      locale={{
        back: 'Back',
        close: 'Close',
        last: 'Done',
        next: 'Next',
        skip: 'Skip tour',
      }}
      styles={{
        options: {
          zIndex: 10000,
          primaryColor: '#14b8a6',
          backgroundColor: '#18181b',
          textColor: '#e4e4e7',
          arrowColor: '#18181b',
          overlayColor: 'rgba(0, 0, 0, 0.6)',
        },
        tooltip: {
          borderRadius: 12,
          border: '1px solid #3f3f46',
          padding: 20,
          maxWidth: 420,
          boxSizing: 'border-box' as const,
        },
        tooltipTitle: {
          fontSize: 16,
          fontWeight: 700,
          color: '#ffffff',
          marginBottom: 4,
        },
        tooltipContent: {
          fontSize: 14,
          lineHeight: 1.6,
          color: '#a1a1aa',
          padding: '8px 0',
        },
        buttonNext: {
          backgroundColor: '#14b8a6',
          borderRadius: 8,
          fontSize: 14,
          fontWeight: 600,
          padding: '8px 20px',
        },
        buttonBack: {
          color: '#a1a1aa',
          fontSize: 14,
          marginRight: 8,
        },
        buttonSkip: {
          color: '#71717a',
          fontSize: 13,
        },
        buttonClose: {
          color: '#71717a',
        },
        spotlight: {
          borderRadius: 12,
        },
      }}
      floaterProps={{
        disableAnimation: false,
        styles: {
          floater: {
            filter: 'none',
          },
        },
      }}
    />
  );
}
