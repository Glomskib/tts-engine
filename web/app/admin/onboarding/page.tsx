'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import {
  Package, Sparkles, Users, Video, Trophy, Check, ArrowRight, ArrowLeft,
} from 'lucide-react';
import Link from 'next/link';
import { SkeletonPage } from '@/components/ui/Skeleton';

interface OnboardingStep {
  id: string;
  icon: any;
  title: string;
  description: string;
  action: string;
  href: string;
  checkEndpoint?: string;
}

const STEPS: OnboardingStep[] = [
  {
    id: 'products',
    icon: Package,
    title: 'Add Your Products',
    description: 'Import or manually add the products you want to create TikTok content for. Include names, brands, benefits, and pain points — the more detail, the better AI scripts you\'ll get.',
    action: 'Go to Products',
    href: '/admin/products',
    checkEndpoint: '/api/products',
  },
  {
    id: 'script',
    icon: Sparkles,
    title: 'Generate Your First Script',
    description: 'Head to Content Studio, select a product, and hit Generate. The AI will create a complete TikTok script with hook, scene beats, and CTA. Aim for an 8+/10 AI score.',
    action: 'Open Content Studio',
    href: '/admin/content-studio',
  },
  {
    id: 'team',
    icon: Users,
    title: 'Set Up Your Team',
    description: 'Add your video editors (VAs) as team members so you can assign videos to them. They\'ll use the VA Dashboard (/va) to track and submit their work.',
    action: 'Manage Team',
    href: '/admin/users',
  },
  {
    id: 'pipeline',
    icon: Video,
    title: 'Queue Your First Video',
    description: 'Create a video in the pipeline from a saved script. Assign it to a VA, set priority, and track it through the production workflow.',
    action: 'Open Pipeline',
    href: '/admin/pipeline',
  },
  {
    id: 'winners',
    icon: Trophy,
    title: 'Track Winners',
    description: 'As you post content and gather data, the system auto-detects winners based on engagement and views. Winners feed back into the AI for even better scripts.',
    action: 'View Winners Bank',
    href: '/admin/winners-bank',
  },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const checkProgress = async () => {
      try {
        const supabase = createBrowserSupabaseClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { router.push('/login'); return; }

        // Check product count
        const productRes = await fetch('/api/products', { credentials: 'include' });
        const productData = await productRes.json();
        if (productData.ok && (productData.data?.length || 0) > 0) {
          setCompletedSteps(prev => new Set([...prev, 'products']));
        }

        // Check if saved to local storage
        const saved = localStorage.getItem('ff-onboarding-completed');
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed)) {
              setCompletedSteps(prev => new Set([...prev, ...parsed]));
            }
          } catch {}
        }
      } catch (err) {
        console.error('Onboarding check error:', err);
      } finally {
        setChecking(false);
      }
    };
    checkProgress();
  }, [router]);

  const markComplete = (stepId: string) => {
    const updated = new Set([...completedSteps, stepId]);
    setCompletedSteps(updated);
    localStorage.setItem('ff-onboarding-completed', JSON.stringify([...updated]));
  };

  const progress = completedSteps.size / STEPS.length;
  const allDone = completedSteps.size === STEPS.length;
  const step = STEPS[currentStep];
  const Icon = step.icon;

  if (checking) {
    return <div style={{ padding: '40px' }}><SkeletonPage /></div>;
  }

  return (
    <div style={{ padding: '20px', maxWidth: '700px', margin: '0 auto' }} className="pb-24 lg:pb-6">
      {/* Header */}
      <h1 style={{ margin: '0 0 8px 0', fontSize: '24px', color: '#fff' }}>Getting Started</h1>
      <p style={{ margin: '0 0 24px 0', fontSize: '14px', color: '#71717a' }}>
        Complete these {STEPS.length} steps to set up your FlashFlow content engine.
      </p>

      {/* Progress Bar */}
      <div style={{ marginBottom: '32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
          <span style={{ fontSize: '13px', color: '#a1a1aa' }}>
            {completedSteps.size} of {STEPS.length} complete
          </span>
          <span style={{ fontSize: '13px', color: '#a1a1aa' }}>
            {Math.round(progress * 100)}%
          </span>
        </div>
        <div style={{ height: '8px', backgroundColor: '#27272a', borderRadius: '4px', overflow: 'hidden' }}>
          <div style={{
            height: '100%',
            width: `${progress * 100}%`,
            backgroundColor: allDone ? '#22c55e' : '#3b82f6',
            borderRadius: '4px',
            transition: 'width 0.3s ease',
          }} />
        </div>
      </div>

      {/* Step Indicators */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', justifyContent: 'center' }}>
        {STEPS.map((s, i) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setCurrentStep(i)}
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              border: `2px solid ${completedSteps.has(s.id) ? '#22c55e' : i === currentStep ? '#3b82f6' : '#27272a'}`,
              backgroundColor: completedSteps.has(s.id) ? '#22c55e' : i === currentStep ? '#3b82f6' : 'transparent',
              color: completedSteps.has(s.id) || i === currentStep ? '#fff' : '#71717a',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '14px',
              fontWeight: 600,
            }}
          >
            {completedSteps.has(s.id) ? <Check size={16} /> : i + 1}
          </button>
        ))}
      </div>

      {/* Current Step Card */}
      {!allDone && (
        <div style={{
          backgroundColor: '#18181b',
          border: '1px solid #27272a',
          borderRadius: '12px',
          padding: '32px',
          textAlign: 'center',
        }}>
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '16px',
            backgroundColor: 'rgba(59, 130, 246, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
          }}>
            <Icon size={28} style={{ color: '#60a5fa' }} />
          </div>
          <h2 style={{ margin: '0 0 8px 0', fontSize: '20px', color: '#e4e4e7' }}>{step.title}</h2>
          <p style={{ margin: '0 0 24px 0', fontSize: '14px', color: '#a1a1aa', lineHeight: '1.6' }}>
            {step.description}
          </p>

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
            <Link
              href={step.href}
              style={{
                padding: '12px 24px',
                backgroundColor: '#3b82f6',
                color: '#fff',
                borderRadius: '8px',
                textDecoration: 'none',
                fontSize: '14px',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              {step.action}
              <ArrowRight size={16} />
            </Link>
            <button
              type="button"
              onClick={() => {
                markComplete(step.id);
                if (currentStep < STEPS.length - 1) {
                  setCurrentStep(currentStep + 1);
                }
              }}
              style={{
                padding: '12px 24px',
                backgroundColor: '#27272a',
                color: '#a1a1aa',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '14px',
              }}
            >
              {completedSteps.has(step.id) ? 'Already Done' : 'Mark as Done'}
            </button>
          </div>

          {/* Navigation */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '24px' }}>
            <button
              type="button"
              onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
              disabled={currentStep === 0}
              style={{
                background: 'none',
                border: 'none',
                color: currentStep === 0 ? '#27272a' : '#71717a',
                cursor: currentStep === 0 ? 'default' : 'pointer',
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <ArrowLeft size={14} /> Previous
            </button>
            <button
              type="button"
              onClick={() => setCurrentStep(Math.min(STEPS.length - 1, currentStep + 1))}
              disabled={currentStep === STEPS.length - 1}
              style={{
                background: 'none',
                border: 'none',
                color: currentStep === STEPS.length - 1 ? '#27272a' : '#71717a',
                cursor: currentStep === STEPS.length - 1 ? 'default' : 'pointer',
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              Next <ArrowRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* All Done */}
      {allDone && (
        <div style={{
          backgroundColor: '#18181b',
          border: '1px solid #22c55e',
          borderRadius: '12px',
          padding: '40px',
          textAlign: 'center',
        }}>
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            backgroundColor: 'rgba(34, 197, 94, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
          }}>
            <Check size={32} style={{ color: '#22c55e' }} />
          </div>
          <h2 style={{ margin: '0 0 8px 0', fontSize: '20px', color: '#4ade80' }}>All Set!</h2>
          <p style={{ margin: '0 0 24px 0', fontSize: '14px', color: '#a1a1aa' }}>
            Your FlashFlow content engine is configured. Start creating!
          </p>
          <Link
            href="/admin/content-studio"
            style={{
              padding: '12px 24px',
              backgroundColor: '#22c55e',
              color: '#fff',
              borderRadius: '8px',
              textDecoration: 'none',
              fontSize: '14px',
              fontWeight: 600,
            }}
          >
            Open Content Studio
          </Link>
        </div>
      )}
    </div>
  );
}
