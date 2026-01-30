'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { useCredits } from '@/hooks/useCredits';

interface AuthUser {
  id: string;
  email: string | null;
}

export default function UpgradePage() {
  const router = useRouter();
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const { credits, subscription, isLoading: creditsLoading, refetch } = useCredits();

  // Self-service upgrade request state
  const [requestMessage, setRequestMessage] = useState('');
  const [requestSubmitting, setRequestSubmitting] = useState(false);
  const [requestStatus, setRequestStatus] = useState<'idle' | 'requested' | 'already_requested' | 'error'>('idle');

  // Fetch authenticated user
  useEffect(() => {
    const fetchAuthUser = async () => {
      try {
        const supabase = createBrowserSupabaseClient();
        const { data: { user }, error } = await supabase.auth.getUser();

        if (error || !user) {
          router.push('/login?redirect=/upgrade');
          return;
        }

        setAuthUser({
          id: user.id,
          email: user.email || null,
        });
      } catch (err) {
        console.error('Auth error:', err);
        router.push('/login?redirect=/upgrade');
      } finally {
        setAuthLoading(false);
      }
    };

    fetchAuthUser();
  }, [router]);

  const submitUpgradeRequest = async () => {
    setRequestSubmitting(true);
    setRequestStatus('idle');

    try {
      const res = await fetch('/api/auth/upgrade-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: requestMessage.trim() || null }),
      });

      const data = await res.json();

      if (data.ok) {
        if (data.status === 'already_requested') {
          setRequestStatus('already_requested');
        } else if (data.status === 'already_pro') {
          refetch();
        } else {
          setRequestStatus('requested');
          setRequestMessage('');
        }
      } else {
        setRequestStatus('error');
      }
    } catch (err) {
      console.error('Request error:', err);
      setRequestStatus('error');
    } finally {
      setRequestSubmitting(false);
    }
  };

  if (authLoading || creditsLoading) {
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
        <div className="text-zinc-500">Loading...</div>
      </div>
    );
  }

  if (!authUser) {
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
        <div className="text-zinc-500">Redirecting to login...</div>
      </div>
    );
  }

  const isUnlimited = credits?.remaining === -1 || (credits as { isUnlimited?: boolean })?.isUnlimited;
  const isPro = subscription?.planId === 'pro' || subscription?.planId === 'team' || subscription?.planId === 'admin';
  const currentPlan = subscription?.planName || 'Free';
  const creditsRemaining = isUnlimited ? 'Unlimited' : (credits?.remaining ?? 5);

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 py-10 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Back Link */}
        <div className="mb-6">
          <Link
            href="/admin/skit-generator"
            className="text-sm text-zinc-400 hover:text-white transition-colors"
          >
            ← Back to Skit Generator
          </Link>
        </div>

        {/* Current Plan Banner */}
        <div className={`mb-8 p-6 rounded-xl border ${
          isUnlimited
            ? 'bg-emerald-500/10 border-emerald-500/30'
            : 'bg-zinc-900/50 border-white/10'
        }`}>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <div className="text-sm text-zinc-400 mb-1">Current Plan</div>
              <div className="text-2xl font-bold">{currentPlan}</div>
            </div>
            <div className="text-right">
              <div className="text-sm text-zinc-400 mb-1">Credits</div>
              <div className={`text-2xl font-bold ${isUnlimited ? 'text-emerald-400' : ''}`}>
                {creditsRemaining}
              </div>
            </div>
          </div>
        </div>

        {/* Pricing Tiers */}
        <h2 className="text-xl font-semibold mb-6">Choose Your Plan</h2>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
          {/* Free Tier */}
          <div className={`p-6 rounded-xl border ${
            currentPlan === 'Free' ? 'border-blue-500/50 bg-blue-500/5' : 'border-white/10 bg-zinc-900/30'
          }`}>
            <div className="mb-4">
              <h3 className="text-lg font-semibold">Free</h3>
              <div className="text-3xl font-bold mt-2">$0</div>
              <div className="text-sm text-zinc-500">forever</div>
            </div>
            <div className="text-sm text-blue-400 mb-4">5 generations total</div>
            <ul className="space-y-2 mb-6">
              <li className="flex items-start gap-2 text-sm text-zinc-400">
                <span className="text-emerald-500 mt-0.5">✓</span>
                Skit Generator
              </li>
              <li className="flex items-start gap-2 text-sm text-zinc-400">
                <span className="text-emerald-500 mt-0.5">✓</span>
                Basic character presets
              </li>
              <li className="flex items-start gap-2 text-sm text-zinc-400">
                <span className="text-emerald-500 mt-0.5">✓</span>
                Save up to 3 skits
              </li>
              <li className="flex items-start gap-2 text-sm text-zinc-400">
                <span className="text-zinc-600 mt-0.5">✗</span>
                <span className="text-zinc-600">Audience Intelligence</span>
              </li>
              <li className="flex items-start gap-2 text-sm text-zinc-400">
                <span className="text-zinc-600 mt-0.5">✗</span>
                <span className="text-zinc-600">Winners Bank</span>
              </li>
            </ul>
            {currentPlan === 'Free' && (
              <div className="text-center text-sm text-zinc-500 py-2">Current Plan</div>
            )}
          </div>

          {/* Starter Tier */}
          <div className={`p-6 rounded-xl border ${
            subscription?.planId === 'starter' ? 'border-blue-500/50 bg-blue-500/5' : 'border-white/10 bg-zinc-900/30'
          }`}>
            <div className="mb-4">
              <h3 className="text-lg font-semibold">Starter</h3>
              <div className="text-3xl font-bold mt-2">$29</div>
              <div className="text-sm text-zinc-500">/month</div>
            </div>
            <div className="text-sm text-blue-400 mb-4">100 generations/mo</div>
            <ul className="space-y-2 mb-6">
              <li className="flex items-start gap-2 text-sm text-zinc-400">
                <span className="text-emerald-500 mt-0.5">✓</span>
                Everything in Free
              </li>
              <li className="flex items-start gap-2 text-sm text-zinc-400">
                <span className="text-emerald-500 mt-0.5">✓</span>
                All character presets
              </li>
              <li className="flex items-start gap-2 text-sm text-zinc-400">
                <span className="text-emerald-500 mt-0.5">✓</span>
                Unlimited saved skits
              </li>
              <li className="flex items-start gap-2 text-sm text-zinc-400">
                <span className="text-emerald-500 mt-0.5">✓</span>
                Product catalog (10)
              </li>
              <li className="flex items-start gap-2 text-sm text-zinc-400">
                <span className="text-emerald-500 mt-0.5">✓</span>
                Email support
              </li>
            </ul>
            <button
              onClick={() => window.open('/contact?plan=starter', '_blank')}
              className="w-full py-2.5 rounded-lg bg-zinc-800 text-zinc-200 font-medium hover:bg-zinc-700 transition-colors"
            >
              Contact Sales
            </button>
          </div>

          {/* Pro Tier */}
          <div className={`p-6 rounded-xl border-2 ${
            isPro && subscription?.planId === 'pro'
              ? 'border-emerald-500/50 bg-emerald-500/5'
              : 'border-blue-500/50 bg-blue-500/5'
          } relative`}>
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-blue-500 text-xs font-medium text-white">
              Most Popular
            </div>
            <div className="mb-4">
              <h3 className="text-lg font-semibold">Pro</h3>
              <div className="text-3xl font-bold mt-2">$79</div>
              <div className="text-sm text-zinc-500">/month</div>
            </div>
            <div className="text-sm text-blue-400 mb-4">500 generations/mo</div>
            <ul className="space-y-2 mb-6">
              <li className="flex items-start gap-2 text-sm text-zinc-400">
                <span className="text-emerald-500 mt-0.5">✓</span>
                Everything in Starter
              </li>
              <li className="flex items-start gap-2 text-sm text-zinc-400">
                <span className="text-emerald-500 mt-0.5">✓</span>
                Audience Intelligence
              </li>
              <li className="flex items-start gap-2 text-sm text-zinc-400">
                <span className="text-emerald-500 mt-0.5">✓</span>
                Winners Bank
              </li>
              <li className="flex items-start gap-2 text-sm text-zinc-400">
                <span className="text-emerald-500 mt-0.5">✓</span>
                Custom presets
              </li>
              <li className="flex items-start gap-2 text-sm text-zinc-400">
                <span className="text-emerald-500 mt-0.5">✓</span>
                Priority support
              </li>
            </ul>
            {isPro ? (
              <div className="text-center text-sm text-emerald-400 py-2 font-medium">✓ Active</div>
            ) : (
              <button
                onClick={() => window.open('/contact?plan=pro', '_blank')}
                className="w-full py-2.5 rounded-lg bg-white text-zinc-900 font-medium hover:bg-zinc-100 transition-colors"
              >
                Upgrade to Pro
              </button>
            )}
          </div>

          {/* Team Tier */}
          <div className={`p-6 rounded-xl border ${
            subscription?.planId === 'team' ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-white/10 bg-zinc-900/30'
          }`}>
            <div className="mb-4">
              <h3 className="text-lg font-semibold">Team</h3>
              <div className="text-3xl font-bold mt-2">$199</div>
              <div className="text-sm text-zinc-500">/month</div>
            </div>
            <div className="text-sm text-blue-400 mb-4">2,000 generations/mo</div>
            <ul className="space-y-2 mb-6">
              <li className="flex items-start gap-2 text-sm text-zinc-400">
                <span className="text-emerald-500 mt-0.5">✓</span>
                Everything in Pro
              </li>
              <li className="flex items-start gap-2 text-sm text-zinc-400">
                <span className="text-emerald-500 mt-0.5">✓</span>
                Up to 10 team members
              </li>
              <li className="flex items-start gap-2 text-sm text-zinc-400">
                <span className="text-emerald-500 mt-0.5">✓</span>
                Shared workspaces
              </li>
              <li className="flex items-start gap-2 text-sm text-zinc-400">
                <span className="text-emerald-500 mt-0.5">✓</span>
                Usage analytics
              </li>
              <li className="flex items-start gap-2 text-sm text-zinc-400">
                <span className="text-emerald-500 mt-0.5">✓</span>
                Dedicated support
              </li>
            </ul>
            {subscription?.planId === 'team' ? (
              <div className="text-center text-sm text-emerald-400 py-2 font-medium">✓ Active</div>
            ) : (
              <button
                onClick={() => window.open('/contact?plan=team', '_blank')}
                className="w-full py-2.5 rounded-lg bg-zinc-800 text-zinc-200 font-medium hover:bg-zinc-700 transition-colors"
              >
                Contact Sales
              </button>
            )}
          </div>
        </div>

        {/* Request Upgrade (for non-pro users) */}
        {!isPro && !isUnlimited && (
          <div className="p-6 bg-zinc-900/50 rounded-xl border border-white/10">
            <h3 className="text-base font-semibold mb-4">Request Upgrade</h3>
            <p className="text-sm text-zinc-400 mb-4">
              Send a request to our team and we'll get back to you within 24 hours.
            </p>

            {/* Status messages */}
            {requestStatus === 'requested' && (
              <div className="mb-4 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400 text-sm">
                Your upgrade request has been submitted. We'll review it shortly.
              </div>
            )}

            {requestStatus === 'already_requested' && (
              <div className="mb-4 p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-400 text-sm">
                You have already requested an upgrade. Please wait for admin review.
              </div>
            )}

            {requestStatus === 'error' && (
              <div className="mb-4 p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                Failed to submit request. Please try again.
              </div>
            )}

            {requestStatus !== 'requested' && (
              <>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-zinc-400 mb-1.5">
                    Message <span className="text-zinc-600">(optional)</span>
                  </label>
                  <textarea
                    value={requestMessage}
                    onChange={(e) => setRequestMessage(e.target.value)}
                    placeholder="Tell us about your use case..."
                    maxLength={500}
                    className="w-full px-3 py-2 bg-zinc-800 border border-white/10 rounded-md text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                    rows={3}
                  />
                </div>

                <button
                  onClick={submitUpgradeRequest}
                  disabled={requestSubmitting}
                  className="w-full py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {requestSubmitting ? 'Submitting...' : 'Request Upgrade'}
                </button>
              </>
            )}
          </div>
        )}

        {/* User Info */}
        <div className="mt-6 p-4 bg-zinc-900/30 rounded-lg border border-white/5">
          <div className="text-xs text-zinc-600 space-y-1">
            <div>User ID: {authUser.id}</div>
            <div>Email: {authUser.email || 'Not set'}</div>
            <div>Plan: {subscription?.planId || 'free'}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
