'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Joyride, { ACTIONS, EVENTS, STATUS, type CallBackProps, type Step } from 'react-joyride';
import { buildTourSteps, TOUR_STORAGE_KEY } from '@/lib/onboarding-tour';
import { useCredits } from '@/hooks/useCredits';

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

  // Check tour state on mount
  useEffect(() => {
    if (checked) return;

    const localSeen = localStorage.getItem(TOUR_STORAGE_KEY) === 'true';
    if (localSeen) {
      setChecked(true);
      return;
    }

    // Check server
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
        // If fetch fails, still show tour for new users
        setShowWelcome(true);
      })
      .finally(() => setChecked(true));
  }, [checked]);

  // Listen for restart-tour event (from CommandPalette)
  useEffect(() => {
    const handler = () => {
      localStorage.removeItem(TOUR_STORAGE_KEY);
      setShowWelcome(true);
      setStepIndex(0);
    };
    window.addEventListener('flashflow:restart-tour', handler);
    return () => window.removeEventListener('flashflow:restart-tour', handler);
  }, []);

  // Build steps when subscription info is available
  useEffect(() => {
    const planId = subscription?.planId || 'free';
    // Check if user has products (simple heuristic: fetch product count)
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
    // On mobile, open sidebar so tour targets are visible
    if (isMobile && onOpenSidebar) {
      onOpenSidebar();
    }
    // Small delay to let sidebar animate open
    setTimeout(() => setRunTour(true), isMobile ? 400 : 100);
  };

  const handleSkip = () => {
    setShowWelcome(false);
    markSeen(false);
  };

  const handleJoyrideCallback = useCallback((data: CallBackProps) => {
    const { action, index, status, type, step } = data;

    // Tour finished or skipped
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

    // Navigate to the step's route on step:after for NEXT/PREV
    if (type === EVENTS.STEP_AFTER) {
      const nextIndex = action === ACTIONS.PREV ? index - 1 : index + 1;

      if (nextIndex >= 0 && nextIndex < steps.length) {
        const nextStep = steps[nextIndex];
        const route = (nextStep as Step & { data?: { route?: string } }).data?.route;

        if (route) {
          // On mobile, ensure sidebar stays open
          if (isMobile && onOpenSidebar) {
            onOpenSidebar();
          }
          router.push(route);
        }
      }

      setStepIndex(nextIndex);
    }

    // Handle close action
    if (action === ACTIONS.CLOSE) {
      setRunTour(false);
      markSeen(false);
    }
  }, [steps, router, markSeen, isMobile, onOpenSidebar]);

  // Welcome modal
  if (showWelcome) {
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

        {/* Modal — responsive width + constrained height with safe-area support */}
        <div
          className="relative bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl w-full overflow-hidden flex flex-col text-center"
          style={{
            maxWidth: 'min(92vw, 420px)',
            maxHeight: 'calc(100dvh - 32px)',
            paddingBottom: 'env(safe-area-inset-bottom, 0px)',
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

          {/* Sticky footer — always visible */}
          <div className="sticky bottom-0 bg-zinc-900 border-t border-zinc-800 px-6 sm:px-8 py-4 flex flex-col gap-3">
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

  if (!runTour || steps.length === 0) return null;

  return (
    <Joyride
      steps={steps}
      stepIndex={stepIndex}
      run={runTour}
      continuous
      showProgress
      showSkipButton
      scrollToFirstStep
      disableOverlayClose={false}
      disableScrolling={false}
      spotlightPadding={isMobile ? 4 : 10}
      callback={handleJoyrideCallback}
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
          padding: isMobile ? 14 : 20,
          maxWidth: isMobile ? '92vw' : 420,
          boxSizing: 'border-box' as const,
        },
        tooltipTitle: {
          fontSize: isMobile ? 15 : 16,
          fontWeight: 700,
          color: '#ffffff',
          marginBottom: 4,
        },
        tooltipContent: {
          fontSize: isMobile ? 13 : 14,
          lineHeight: 1.6,
          color: '#a1a1aa',
          padding: '8px 0',
          maxHeight: isMobile ? 'calc(100dvh - 200px)' : 'none',
          overflowY: 'auto' as const,
        },
        buttonNext: {
          backgroundColor: '#14b8a6',
          borderRadius: 8,
          fontSize: isMobile ? 13 : 14,
          fontWeight: 600,
          padding: isMobile ? '8px 16px' : '8px 20px',
        },
        buttonBack: {
          color: '#a1a1aa',
          fontSize: isMobile ? 13 : 14,
          marginRight: 8,
        },
        buttonSkip: {
          color: '#71717a',
          fontSize: isMobile ? 12 : 13,
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
            maxWidth: isMobile ? '92vw' : undefined,
          },
        },
      }}
    />
  );
}
