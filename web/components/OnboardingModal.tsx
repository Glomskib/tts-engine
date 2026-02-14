'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Package, Sparkles, Video, X } from 'lucide-react';

interface OnboardingModalProps {
  onComplete: () => void;
}

interface OnboardingStep {
  title: string;
  description: string;
  icon: React.ReactNode;
  primaryLabel?: string;
  primaryHref?: string;
}

const steps: OnboardingStep[] = [
  {
    title: 'Welcome to FlashFlow',
    description: 'Your AI-powered content engine for TikTok and short-form video. Add products, generate scripts, and track your videos from idea to post.',
    icon: (
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-teal-500 to-violet-600 flex items-center justify-center">
        <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      </div>
    ),
  },
  {
    title: 'Add a Product',
    description: 'Tell FlashFlow what you sell — product name, brand, benefits, and pain points. The more detail you give, the better your AI scripts will be.',
    icon: (
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center">
        <Package className="w-8 h-8 text-white" />
      </div>
    ),
    primaryLabel: 'Go to Products',
    primaryHref: '/admin/products',
  },
  {
    title: 'Generate a Script',
    description: 'Head to Content Studio, pick a product, and hit Generate. AI creates a complete video script with hook, beats, and CTA — ready to film.',
    icon: (
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
        <Sparkles className="w-8 h-8 text-white" />
      </div>
    ),
    primaryLabel: 'Open Content Studio',
    primaryHref: '/admin/content-studio',
  },
  {
    title: 'Review in Pipeline',
    description: 'Track every video from script to post. Assign editors, review drafts, schedule posts — all in one board.',
    icon: (
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
        <Video className="w-8 h-8 text-white" />
      </div>
    ),
    primaryLabel: 'Go to Products',
    primaryHref: '/admin/products',
  },
];

export default function OnboardingModal({ onComplete }: OnboardingModalProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 50);
    return () => clearTimeout(timer);
  }, []);

  const handleDismiss = () => {
    // Persist dismiss server-side + localStorage
    localStorage.setItem('ff-onboarding-dismissed', 'true');
    fetch('/api/onboarding/dismiss', { method: 'POST' }).catch(() => {});
    setIsVisible(false);
    setTimeout(() => onComplete(), 200);
  };

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleFinish = (href?: string) => {
    localStorage.setItem('ff-onboarding-dismissed', 'true');
    fetch('/api/onboarding/dismiss', { method: 'POST' }).catch(() => {});
    setIsVisible(false);
    setTimeout(() => {
      onComplete();
      if (href) router.push(href);
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
        onClick={handleDismiss}
      />

      {/* Modal */}
      <div
        className={`relative w-full max-w-md mx-4 bg-zinc-900 rounded-2xl border border-white/10 shadow-2xl transform transition-all duration-200 ${
          isVisible ? 'scale-100 translate-y-0' : 'scale-95 translate-y-4'
        }`}
      >
        {/* Close button */}
        <button
          type="button"
          onClick={handleDismiss}
          className="absolute top-4 right-4 text-zinc-500 hover:text-zinc-300 transition-colors"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
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
              <button
                type="button"
                key={index}
                onClick={() => setCurrentStep(index)}
                className={`w-2 h-2 rounded-full transition-all ${
                  index === currentStep
                    ? 'bg-teal-500 w-6'
                    : index < currentStep
                    ? 'bg-teal-500/50'
                    : 'bg-zinc-700'
                }`}
              />
            ))}
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-3">
            {isLastStep ? (
              <>
                <button
                  type="button"
                  onClick={() => handleFinish('/admin/products')}
                  className="w-full py-3 px-4 bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-500 hover:to-teal-400 text-white font-semibold rounded-lg transition-all shadow-lg shadow-teal-500/25"
                >
                  Go to Products
                </button>
                <button
                  type="button"
                  onClick={() => handleFinish()}
                  className="w-full py-3 px-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium rounded-lg transition-colors border border-white/10"
                >
                  Skip — I know my way around
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleNext}
                  className="w-full py-3 px-4 bg-white hover:bg-zinc-100 text-zinc-900 font-semibold rounded-lg transition-colors"
                >
                  Next
                </button>
                <button
                  type="button"
                  onClick={handleDismiss}
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
