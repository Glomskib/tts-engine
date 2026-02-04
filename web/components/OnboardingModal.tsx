'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface OnboardingModalProps {
  onComplete: () => void;
}

const ONBOARDING_STORAGE_KEY = 'flashflow-onboarding-completed';

interface OnboardingStep {
  title: string;
  description: string;
  icon: React.ReactNode;
}

const steps: OnboardingStep[] = [
  {
    title: 'Welcome to FlashFlow AI',
    description: 'Create engaging TikTok and short-form video scripts in seconds using AI. Let\'s take a quick tour of the key features.',
    icon: (
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
        <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      </div>
    ),
  },
  {
    title: 'Skit Generator',
    description: 'Enter your product details, set the intensity level, and let AI create scroll-stopping scripts complete with hooks, beats, and CTAs.',
    icon: (
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center">
        <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
        </svg>
      </div>
    ),
  },
  {
    title: 'Audience Intelligence',
    description: 'Build detailed personas of your target customers. Extract pain points from real reviews to make your scripts more authentic and relatable.',
    icon: (
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
        <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      </div>
    ),
  },
  {
    title: 'You\'re All Set!',
    description: 'You have 5 free credits to start. Each script generation uses 1 credit. Ready to create your first viral script?',
    icon: (
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center">
        <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
    ),
  },
];

export default function OnboardingModal({ onComplete }: OnboardingModalProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const router = useRouter();

  useEffect(() => {
    // Animate in
    const timer = setTimeout(() => setIsVisible(true), 50);
    return () => clearTimeout(timer);
  }, []);

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  };

  const handleSkip = () => {
    handleComplete();
  };

  const handleComplete = () => {
    localStorage.setItem(ONBOARDING_STORAGE_KEY, 'true');
    setIsVisible(false);
    setTimeout(() => {
      onComplete();
    }, 200);
  };

  const handleCreateFirstSkit = () => {
    localStorage.setItem(ONBOARDING_STORAGE_KEY, 'true');
    setIsVisible(false);
    setTimeout(() => {
      onComplete();
      router.push('/admin/skit-generator');
    }, 200);
  };

  const isLastStep = currentStep === steps.length - 1;
  const step = steps[currentStep];

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center transition-opacity duration-200 ${
        isVisible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={handleSkip}
      />

      {/* Modal */}
      <div
        className={`relative w-full max-w-md mx-4 bg-zinc-900 rounded-2xl border border-white/10 shadow-2xl transform transition-all duration-200 ${
          isVisible ? 'scale-100 translate-y-0' : 'scale-95 translate-y-4'
        }`}
      >
        {/* Skip button */}
        <button type="button"
          onClick={handleSkip}
          className="absolute top-4 right-4 text-zinc-500 hover:text-zinc-300 transition-colors"
          aria-label="Skip"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Content */}
        <div className="p-8 text-center">
          {/* Icon */}
          <div className="flex justify-center mb-6">
            {step.icon}
          </div>

          {/* Title */}
          <h2 className="text-2xl font-bold text-white mb-3">
            {step.title}
          </h2>

          {/* Description */}
          <p className="text-zinc-400 mb-8 leading-relaxed">
            {step.description}
          </p>

          {/* Progress dots */}
          <div className="flex justify-center gap-2 mb-6">
            {steps.map((_, index) => (
              <button type="button"
                key={index}
                onClick={() => setCurrentStep(index)}
                className={`w-2 h-2 rounded-full transition-all ${
                  index === currentStep
                    ? 'bg-violet-500 w-6'
                    : index < currentStep
                    ? 'bg-violet-500/50'
                    : 'bg-zinc-700'
                }`}
              />
            ))}
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-3">
            {isLastStep ? (
              <>
                <button type="button"
                  onClick={handleCreateFirstSkit}
                  className="w-full py-3 px-4 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white font-semibold rounded-lg transition-all shadow-lg shadow-violet-500/25"
                >
                  Create Your First Skit
                </button>
                <button type="button"
                  onClick={handleComplete}
                  className="w-full py-3 px-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium rounded-lg transition-colors border border-white/10"
                >
                  Explore on My Own
                </button>
              </>
            ) : (
              <>
                <button type="button"
                  onClick={handleNext}
                  className="w-full py-3 px-4 bg-white hover:bg-zinc-100 text-zinc-900 font-semibold rounded-lg transition-colors"
                >
                  Next
                </button>
                <button type="button"
                  onClick={handleSkip}
                  className="text-zinc-500 hover:text-zinc-300 text-sm transition-colors"
                >
                  Skip tour
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Hook to check if onboarding should be shown
export function useOnboarding() {
  const [shouldShow, setShouldShow] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkOnboarding = async () => {
      // Check localStorage first
      const completed = localStorage.getItem(ONBOARDING_STORAGE_KEY);
      if (completed === 'true') {
        setShouldShow(false);
        setIsLoading(false);
        return;
      }

      // Check if user is new (has 5 credits and 0 saved skits)
      try {
        const [creditsRes, skitsRes] = await Promise.all([
          fetch('/api/credits'),
          fetch('/api/saved-skits?limit=1'),
        ]);

        if (creditsRes.ok && skitsRes.ok) {
          const creditsData = await creditsRes.json();
          const skitsData = await skitsRes.json();

          const credits = creditsData.credits?.remaining ?? 0;
          const skitCount = skitsData.total ?? skitsData.data?.length ?? 0;

          // Show onboarding if user has exactly 5 credits and 0 skits (fresh account)
          // Or if they have 5 or fewer credits and 0 skits (also fresh)
          if (credits <= 5 && skitCount === 0) {
            setShouldShow(true);
          }
        }
      } catch (err) {
        // If we can't check, don't show onboarding
        console.error('Failed to check onboarding status:', err);
      }

      setIsLoading(false);
    };

    checkOnboarding();
  }, []);

  const markComplete = () => {
    localStorage.setItem(ONBOARDING_STORAGE_KEY, 'true');
    setShouldShow(false);
  };

  return { shouldShow, isLoading, markComplete };
}
