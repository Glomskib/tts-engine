'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { X, Loader2, ChevronRight, Sparkles, Package, Trophy, Video, FileText } from 'lucide-react';
import { PERSONAS } from '@/lib/personas';
import { celebrate } from '@/lib/celebrations';
import { useToast } from '@/contexts/ToastContext';
import { useCredits } from '@/hooks/useCredits';
import WizardPersonaCard from './WizardPersonaCard';
import WizardScriptPreview from './WizardScriptPreview';

interface OnboardingWizardProps {
  onComplete: () => void;
}

const CATEGORIES = [
  'Supplements',
  'Skincare',
  'Home',
  'Kitchen',
  'Fitness',
  'Tech',
  'Fashion',
  'Other',
];

// Featured 6 persona IDs for the wizard
const FEATURED_PERSONA_IDS = ['sarah', 'mike', 'jessica', 'marcus', 'lisa', 'tyler'];
const FEATURED_PERSONAS = PERSONAS.filter(p => FEATURED_PERSONA_IDS.includes(p.id));

const TOTAL_STEPS = 5;

export default function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const router = useRouter();
  const { showSuccess, showError } = useToast();
  const { isFreeUser } = useCredits();
  const [isVisible, setIsVisible] = useState(false);
  const [step, setStep] = useState(0);

  // Step 1 state
  const [category, setCategory] = useState('');

  // Step 2 state
  const [productName, setProductName] = useState('');
  const [brandName, setBrandName] = useState('');
  const [productDescription, setProductDescription] = useState('');
  const [productLink, setProductLink] = useState('');
  const [productId, setProductId] = useState<string | null>(null);
  const [productLoading, setProductLoading] = useState(false);
  const [productError, setProductError] = useState('');

  // Step 3 state
  const [selectedPersonas, setSelectedPersonas] = useState<string[]>([]);

  // Step 4 state
  const [scriptLoading, setScriptLoading] = useState(false);
  const [scriptData, setScriptData] = useState<{ hook?: string; setup?: string; body?: string; cta?: string } | null>(null);
  const [scriptError, setScriptError] = useState('');
  const [showConfetti, setShowConfetti] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 50);
    return () => clearTimeout(timer);
  }, []);

  const handleDismiss = () => {
    localStorage.setItem('ff-onboarding-dismissed', 'true');
    fetch('/api/onboarding/dismiss', { method: 'POST' }).catch(() => {});
    setIsVisible(false);
    setTimeout(() => onComplete(), 200);
  };

  const handleComplete = () => {
    localStorage.setItem('ff-onboarding-dismissed', 'true');
    fetch('/api/onboarding/complete', { method: 'POST' }).catch(() => {});
    setIsVisible(false);
    setTimeout(() => onComplete(), 200);
  };

  const handleAddProduct = async () => {
    if (!productName.trim() || !brandName.trim()) {
      setProductError('Product name and brand are required.');
      return;
    }
    setProductLoading(true);
    setProductError('');

    try {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: productName.trim(),
          brand: brandName.trim(),
          category: category || 'Other',
          description: productDescription.trim() || undefined,
          link: productLink.trim() || undefined,
        }),
      });
      const json = await res.json();

      if (!res.ok) {
        setProductError(json.error || 'Failed to create product.');
        return;
      }

      setProductId(json.data?.id || null);
      celebrate('first-product', showSuccess);
      setStep(2);
    } catch {
      setProductError('Network error. Please try again.');
    } finally {
      setProductLoading(false);
    }
  };

  const handleTogglePersona = (id: string) => {
    setSelectedPersonas(prev => {
      if (prev.includes(id)) return prev.filter(p => p !== id);
      if (prev.length >= 2) return prev;
      return [...prev, id];
    });
  };

  const handleGenerateScript = async () => {
    setScriptLoading(true);
    setScriptError('');

    const persona = PERSONAS.find(p => p.id === selectedPersonas[0]);
    const creativeDirection = persona
      ? `Write in the style of: ${persona.name}. Tone: ${persona.tone}. Style: ${persona.style}. ${persona.fullDescription}`
      : undefined;

    try {
      const res = await fetch('/api/ai/generate-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content_type: 'script',
          ...(productId ? { product_id: productId } : { product_name: productName || 'Sample Product' }),
          creative_direction: creativeDirection,
        }),
      });
      const json = await res.json();

      if (!res.ok) {
        setScriptError(json.error || 'Failed to generate script.');
        return;
      }

      const s = json.script;
      if (s) {
        setScriptData({
          hook: s.hook || '',
          body: Array.isArray(s.body) ? s.body.join('\n\n') : (s.body || ''),
          cta: s.cta || '',
        });
        celebrate('first-script', showSuccess);
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 3000);
      } else {
        setScriptError('Unexpected response. Please try again.');
      }
    } catch {
      setScriptError('Network error. Please try again.');
    } finally {
      setScriptLoading(false);
    }
  };

  const goNext = () => setStep(s => Math.min(s + 1, TOTAL_STEPS - 1));

  // --- Render helpers ---

  const renderProgressDots = () => (
    <div className="flex justify-center gap-2 mb-6">
      {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
        <div
          key={i}
          className={`h-2 rounded-full transition-all ${
            i === step
              ? 'bg-teal-500 w-6'
              : i < step
              ? 'bg-teal-500/50 w-2'
              : 'bg-zinc-700 w-2'
          }`}
        />
      ))}
    </div>
  );

  const renderStep0 = () => (
    <>
      {/* Lightning bolt icon */}
      <div className="flex justify-center mb-6">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-teal-500 to-violet-600 flex items-center justify-center">
          <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
      </div>
      <h2 className="text-2xl font-bold text-white mb-2">Welcome to FlashFlow!</h2>
      <p className="text-zinc-400 mb-6 text-sm">Let&apos;s set you up in under 2 minutes. What do you sell on TikTok?</p>

      <select
        value={category}
        onChange={e => setCategory(e.target.value)}
        className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:border-teal-500 transition-colors mb-6 appearance-none"
      >
        <option value="">Select a category...</option>
        {CATEGORIES.map(c => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>

      {renderProgressDots()}

      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={goNext}
          disabled={!category}
          className="w-full py-3 px-4 bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-500 hover:to-teal-400 text-white font-semibold rounded-lg transition-all shadow-lg shadow-teal-500/25 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Next
        </button>
        <button type="button" onClick={handleDismiss} className="text-zinc-500 hover:text-zinc-300 text-sm transition-colors">
          Skip setup
        </button>
      </div>
    </>
  );

  const renderStep1 = () => (
    <>
      <div className="flex justify-center mb-6">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center">
          <Package className="w-8 h-8 text-white" />
        </div>
      </div>
      <h2 className="text-2xl font-bold text-white mb-2">Add your first product</h2>
      <p className="text-zinc-400 mb-6 text-sm">Tell us what you&apos;re selling so we can generate killer scripts.</p>

      <div className="space-y-3 mb-4 text-left">
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Product Name *</label>
          <input
            type="text"
            value={productName}
            onChange={e => setProductName(e.target.value)}
            placeholder="e.g. SuperGreens Powder"
            className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm placeholder-zinc-500 focus:outline-none focus:border-teal-500 transition-colors"
          />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Brand Name *</label>
          <input
            type="text"
            value={brandName}
            onChange={e => setBrandName(e.target.value)}
            placeholder="e.g. VitalBlend"
            className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm placeholder-zinc-500 focus:outline-none focus:border-teal-500 transition-colors"
          />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">One-line description</label>
          <input
            type="text"
            value={productDescription}
            onChange={e => setProductDescription(e.target.value)}
            placeholder="e.g. Daily greens blend for energy and focus"
            className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm placeholder-zinc-500 focus:outline-none focus:border-teal-500 transition-colors"
          />
        </div>
        <div>
          <label className="block text-xs text-zinc-400 mb-1">Product link</label>
          <input
            type="url"
            value={productLink}
            onChange={e => setProductLink(e.target.value)}
            placeholder="https://..."
            className="w-full px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm placeholder-zinc-500 focus:outline-none focus:border-teal-500 transition-colors"
          />
        </div>
      </div>

      {productError && (
        <p className="text-red-400 text-xs mb-3">{productError}</p>
      )}

      {renderProgressDots()}

      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={handleAddProduct}
          disabled={productLoading || !productName.trim() || !brandName.trim()}
          className="w-full py-3 px-4 bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-500 hover:to-teal-400 text-white font-semibold rounded-lg transition-all shadow-lg shadow-teal-500/25 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {productLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Adding...</> : 'Add Product'}
        </button>
        <button type="button" onClick={goNext} className="text-zinc-500 hover:text-zinc-300 text-sm transition-colors">
          Skip for now
        </button>
      </div>
    </>
  );

  const renderStep2 = () => (
    <>
      <div className="flex justify-center mb-6">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
          <Sparkles className="w-8 h-8 text-white" />
        </div>
      </div>
      <h2 className="text-2xl font-bold text-white mb-2">Pick your voice</h2>
      <p className="text-zinc-400 mb-4 text-sm">Choose 1-2 personas that match your brand. These shape how your scripts sound.</p>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-4 text-left max-h-[320px] overflow-y-auto pr-1">
        {FEATURED_PERSONAS.map(persona => (
          <WizardPersonaCard
            key={persona.id}
            persona={persona}
            selected={selectedPersonas.includes(persona.id)}
            onToggle={handleTogglePersona}
          />
        ))}
      </div>

      {selectedPersonas.length > 0 && (
        <p className="text-xs text-teal-400 mb-2">
          {selectedPersonas.length}/2 selected
        </p>
      )}

      {renderProgressDots()}

      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={goNext}
          disabled={selectedPersonas.length === 0}
          className="w-full py-3 px-4 bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-500 hover:to-teal-400 text-white font-semibold rounded-lg transition-all shadow-lg shadow-teal-500/25 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Next
        </button>
        <button type="button" onClick={goNext} className="text-zinc-500 hover:text-zinc-300 text-sm transition-colors">
          Skip
        </button>
      </div>
    </>
  );

  const renderStep3 = () => {
    const personaName = selectedPersonas.length > 0
      ? PERSONAS.find(p => p.id === selectedPersonas[0])?.name || 'Selected persona'
      : 'Default';

    return (
      <>
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
            <FileText className="w-8 h-8 text-white" />
          </div>
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Generate your first script!</h2>

        {!scriptData && !scriptLoading && (
          <>
            {/* Summary card */}
            <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-3 mb-6 text-left">
              <div className="flex items-center gap-2 text-sm">
                <Package className="w-4 h-4 text-zinc-400" />
                <span className="text-white font-medium">{productName || 'Sample Product'}</span>
              </div>
              <div className="flex items-center gap-2 text-sm mt-1">
                <Sparkles className="w-4 h-4 text-zinc-400" />
                <span className="text-zinc-400">{personaName}</span>
              </div>
            </div>

            {renderProgressDots()}

            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={handleGenerateScript}
                className="w-full py-3 px-4 bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-500 hover:to-teal-400 text-white font-semibold rounded-lg transition-all shadow-lg shadow-teal-500/25 flex items-center justify-center gap-2"
              >
                <Sparkles className="w-4 h-4" /> Generate Script
              </button>
              <button type="button" onClick={goNext} className="text-zinc-500 hover:text-zinc-300 text-sm transition-colors">
                Skip
              </button>
            </div>
          </>
        )}

        {scriptLoading && (
          <>
            <div className="space-y-3 mb-6">
              <div className="h-16 bg-zinc-800 rounded-lg animate-pulse" />
              <div className="h-24 bg-zinc-800 rounded-lg animate-pulse" />
              <div className="h-12 bg-zinc-800 rounded-lg animate-pulse" />
            </div>
            <p className="text-teal-400 text-sm animate-pulse mb-4">Generating your first script...</p>
            {renderProgressDots()}
          </>
        )}

        {scriptError && (
          <>
            <p className="text-red-400 text-sm mb-4">{scriptError}</p>
            {renderProgressDots()}
            <button
              type="button"
              onClick={handleGenerateScript}
              className="w-full py-3 px-4 bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-500 hover:to-teal-400 text-white font-semibold rounded-lg transition-all shadow-lg shadow-teal-500/25"
            >
              Try Again
            </button>
          </>
        )}

        {scriptData && (
          <>
            {/* Confetti overlay */}
            {showConfetti && (
              <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-2xl z-10">
                {Array.from({ length: 30 }).map((_, i) => (
                  <div
                    key={i}
                    className="absolute w-2 h-2 rounded-full animate-confetti-fall"
                    style={{
                      left: `${Math.random() * 100}%`,
                      backgroundColor: ['#14b8a6', '#a78bfa', '#f59e0b', '#ec4899', '#3b82f6'][i % 5],
                      animationDelay: `${Math.random() * 0.5}s`,
                      animationDuration: `${1.5 + Math.random()}s`,
                    }}
                  />
                ))}
              </div>
            )}

            <div className="mb-4 text-left">
              <WizardScriptPreview script={scriptData} />
            </div>

            {renderProgressDots()}

            <button
              type="button"
              onClick={goNext}
              className="w-full py-3 px-4 bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-500 hover:to-teal-400 text-white font-semibold rounded-lg transition-all shadow-lg shadow-teal-500/25 flex items-center justify-center gap-2"
            >
              Continue <ChevronRight className="w-4 h-4" />
            </button>
          </>
        )}
      </>
    );
  };

  const renderStep4 = () => (
    <>
      <div className="flex justify-center mb-6">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
          <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
      </div>
      <h2 className="text-2xl font-bold text-white mb-2">You&apos;re all set!</h2>
      <p className="text-zinc-400 mb-6 text-sm">Here&apos;s where to go next:</p>

      {/* Quick links grid */}
      <div className="grid grid-cols-2 gap-2 mb-6 text-left">
        {[
          { label: 'Content Studio', href: '/admin/content-studio', icon: Sparkles, color: 'text-blue-400' },
          { label: 'Products', href: '/admin/products', icon: Package, color: 'text-cyan-400' },
          { label: 'Winners Bank', href: '/admin/winners', icon: Trophy, color: 'text-amber-400' },
          { label: 'Pipeline', href: '/admin/pipeline', icon: Video, color: 'text-purple-400' },
        ].map(link => {
          const Icon = link.icon;
          return (
            <button
              key={link.href}
              type="button"
              onClick={() => {
                handleComplete();
                setTimeout(() => router.push(link.href), 250);
              }}
              className="flex items-center gap-2.5 p-3 rounded-xl bg-zinc-800/50 border border-zinc-700 hover:border-zinc-600 transition-colors min-h-[52px]"
            >
              <Icon className={`w-5 h-5 ${link.color} shrink-0`} />
              <span className="text-sm text-white font-medium">{link.label}</span>
            </button>
          );
        })}
      </div>

      {/* Upgrade CTA for free tier */}
      {isFreeUser && (
        <div className="bg-gradient-to-r from-violet-500/10 to-teal-500/10 border border-violet-500/20 rounded-xl p-4 mb-6 text-left">
          <p className="text-sm font-semibold text-white mb-1">Upgrade for unlimited scripts</p>
          <p className="text-xs text-zinc-400 mb-3">Free plan includes 3 credits. Go Pro for 100+ scripts/month.</p>
          <button
            type="button"
            onClick={() => {
              handleComplete();
              setTimeout(() => router.push('/admin/settings?tab=billing'), 250);
            }}
            className="px-4 py-2 bg-gradient-to-r from-violet-600 to-teal-500 text-white text-xs font-semibold rounded-lg hover:from-violet-500 hover:to-teal-400 transition-all"
          >
            View Plans
          </button>
        </div>
      )}

      {renderProgressDots()}

      <button
        type="button"
        onClick={handleComplete}
        className="w-full py-3 px-4 bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-500 hover:to-teal-400 text-white font-semibold rounded-lg transition-all shadow-lg shadow-teal-500/25"
      >
        Go to Dashboard
      </button>
    </>
  );

  const stepRenderers = [renderStep0, renderStep1, renderStep2, renderStep3, renderStep4];

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center transition-opacity duration-200 ${
        isVisible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      {/* Modal — full-page on mobile, centered on desktop */}
      <div
        className={`relative w-full h-full sm:h-auto sm:max-w-lg sm:mx-4 bg-zinc-900 sm:rounded-2xl sm:border sm:border-white/10 shadow-2xl transform transition-all duration-200 overflow-y-auto ${
          isVisible ? 'scale-100 translate-y-0' : 'scale-95 translate-y-4'
        }`}
      >
        {/* Close button */}
        <button
          type="button"
          onClick={handleDismiss}
          className="absolute top-4 right-4 text-zinc-500 hover:text-zinc-300 transition-colors z-20"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Content */}
        <div className="p-8 text-center">
          {stepRenderers[step]()}
        </div>
      </div>

      {/* Confetti CSS animation */}
      <style jsx global>{`
        @keyframes confetti-fall {
          0% {
            transform: translateY(-20px) rotate(0deg);
            opacity: 1;
          }
          100% {
            transform: translateY(400px) rotate(720deg);
            opacity: 0;
          }
        }
        .animate-confetti-fall {
          animation: confetti-fall 2s ease-out forwards;
        }
      `}</style>
    </div>
  );
}
