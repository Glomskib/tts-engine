'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';

interface AuthUser {
  id: string;
  email: string | null;
}

interface PlanStatus {
  plan: 'free' | 'pro';
  isActive: boolean;
  gatingEnabled: boolean;
}

interface RuntimeConfig {
  is_admin: boolean;
  subscription_gating_enabled: boolean;
  email_enabled: boolean;
  slack_enabled: boolean;
  assignment_ttl_minutes: number;
  user_plan: string;
  user_plan_active: boolean;
}

export default function UpgradePage() {
  const router = useRouter();
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [planStatus, setPlanStatus] = useState<PlanStatus | null>(null);
  const [runtimeConfig, setRuntimeConfig] = useState<RuntimeConfig | null>(null);
  const [copied, setCopied] = useState(false);

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

        // Fetch plan status
        const planRes = await fetch('/api/auth/plan-status');
        if (planRes.ok) {
          const planData = await planRes.json();
          if (planData.ok) {
            setPlanStatus(planData.data);
          }
        }

        // Fetch runtime config
        const configRes = await fetch('/api/auth/runtime-config');
        if (configRes.ok) {
          const configData = await configRes.json();
          if (configData.ok) {
            setRuntimeConfig(configData.data);
          }
        }
      } catch (err) {
        console.error('Auth error:', err);
        router.push('/login?redirect=/upgrade');
      } finally {
        setAuthLoading(false);
      }
    };

    fetchAuthUser();
  }, [router]);

  const copyContactMessage = async () => {
    const message = `Hi Admin,

I would like to upgrade my account to Pro to access the full workbench features.

User ID: ${authUser?.id || 'Unknown'}
Email: ${authUser?.email || 'Unknown'}

Thank you!`;

    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

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
          // Refresh plan status
          const planRes = await fetch('/api/auth/plan-status');
          if (planRes.ok) {
            const planData = await planRes.json();
            if (planData.ok) {
              setPlanStatus(planData.data);
            }
          }
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

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-slate-500">Checking access...</div>
      </div>
    );
  }

  if (!authUser) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-slate-500">Redirecting to login...</div>
      </div>
    );
  }

  const isPro = planStatus?.plan === 'pro' && planStatus?.isActive;

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4">
      <div className="max-w-xl mx-auto">
        {/* Back Link */}
        <div className="mb-6">
          <Link
            href="/admin/pipeline"
            className="text-sm text-blue-600 hover:text-blue-700 transition-colors"
          >
            ← Back to Work Queue
          </Link>
        </div>

        {/* Pro Status Banner */}
        {isPro ? (
          <div className="mb-8 p-8 bg-green-50 rounded-xl border-2 border-green-300 text-center">
            <div className="text-5xl mb-4">★</div>
            <h1 className="text-2xl font-bold text-green-700 mb-2">You're Pro!</h1>
            <p className="text-green-600">You have full access to all workbench features.</p>
          </div>
        ) : (
          <>
            {/* Upgrade Hero */}
            <div className="mb-8 p-8 bg-blue-50 rounded-xl border-2 border-blue-300 text-center">
              <h1 className="text-2xl font-bold text-blue-800 mb-3">Upgrade to Pro</h1>
              <p className="text-blue-600">Unlock full access to workbench actions and task dispatch.</p>
            </div>

            {/* Features List */}
            <div className="mb-6 p-6 bg-white rounded-lg border border-slate-200 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-800 mb-4">What Pro Unlocks</h2>
              <ul className="space-y-3 text-slate-600">
                <li className="flex items-start gap-2">
                  <span className="text-green-500 mt-0.5">✓</span>
                  <span><strong className="text-slate-800">Auto-Dispatch</strong> – Get work assigned automatically</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500 mt-0.5">✓</span>
                  <span><strong className="text-slate-800">Status Updates</strong> – Mark tasks as Recorded, Edited, Posted</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500 mt-0.5">✓</span>
                  <span><strong className="text-slate-800">Workbench Actions</strong> – Full control over assigned tasks</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-500 mt-0.5">✓</span>
                  <span><strong className="text-slate-800">Priority Queue</strong> – Access to high-priority assignments</span>
                </li>
              </ul>
            </div>

            {/* Request Upgrade */}
            <div className="p-6 bg-white rounded-lg border border-slate-200 shadow-sm">
              <h3 className="text-base font-semibold text-slate-800 mb-4">Request Upgrade</h3>

              {/* Status messages */}
              {requestStatus === 'requested' && (
                <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
                  Your upgrade request has been submitted. An administrator will review it shortly.
                </div>
              )}

              {requestStatus === 'already_requested' && (
                <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-sm">
                  You have already requested an upgrade within the last 24 hours. Please wait for admin review.
                </div>
              )}

              {requestStatus === 'error' && (
                <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  Failed to submit request. Please try again.
                </div>
              )}

              {requestStatus !== 'requested' && (
                <>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                      Message <span className="text-slate-400 font-normal">(optional)</span>
                    </label>
                    <textarea
                      value={requestMessage}
                      onChange={(e) => setRequestMessage(e.target.value)}
                      placeholder="Tell us why you need Pro access..."
                      maxLength={500}
                      className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                      rows={3}
                    />
                  </div>

                  <button
                    onClick={submitUpgradeRequest}
                    disabled={requestSubmitting}
                    className="w-full py-3 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {requestSubmitting ? 'Submitting...' : 'Request Upgrade'}
                  </button>
                </>
              )}

              {/* Manual contact option */}
              <div className="mt-6 pt-5 border-t border-slate-200">
                <p className="text-sm text-slate-500 text-center mb-3">Or contact your administrator directly:</p>
                <button
                  onClick={copyContactMessage}
                  className={`w-full py-2.5 rounded-md font-medium text-sm transition-colors ${
                    copied
                      ? 'bg-green-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {copied ? 'Copied!' : 'Copy Contact Message'}
                </button>
              </div>
            </div>
          </>
        )}

        {/* Runtime Config Summary */}
        {runtimeConfig && (
          <div className="mt-6 p-5 bg-white rounded-lg border border-slate-200">
            <h3 className="text-sm font-medium text-slate-600 mb-4">System Configuration</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className={`p-3 rounded-lg ${runtimeConfig.subscription_gating_enabled ? 'bg-amber-50' : 'bg-green-50'}`}>
                <div className="text-xs text-slate-500 mb-0.5">Subscription Gating</div>
                <div className={`font-semibold ${runtimeConfig.subscription_gating_enabled ? 'text-amber-700' : 'text-green-700'}`}>
                  {runtimeConfig.subscription_gating_enabled ? 'Enabled' : 'Disabled'}
                </div>
              </div>
              <div className={`p-3 rounded-lg ${runtimeConfig.email_enabled ? 'bg-green-50' : 'bg-slate-50'}`}>
                <div className="text-xs text-slate-500 mb-0.5">Email Notifications</div>
                <div className={`font-semibold ${runtimeConfig.email_enabled ? 'text-green-700' : 'text-slate-500'}`}>
                  {runtimeConfig.email_enabled ? 'Enabled' : 'Disabled'}
                </div>
              </div>
              <div className={`p-3 rounded-lg ${runtimeConfig.slack_enabled ? 'bg-green-50' : 'bg-slate-50'}`}>
                <div className="text-xs text-slate-500 mb-0.5">Slack Notifications</div>
                <div className={`font-semibold ${runtimeConfig.slack_enabled ? 'text-green-700' : 'text-slate-500'}`}>
                  {runtimeConfig.slack_enabled ? 'Enabled' : 'Disabled'}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-blue-50">
                <div className="text-xs text-slate-500 mb-0.5">Assignment TTL</div>
                <div className="font-semibold text-blue-700">{runtimeConfig.assignment_ttl_minutes} min</div>
              </div>
            </div>
          </div>
        )}

        {/* User Info */}
        <div className="mt-4 p-4 bg-slate-100 rounded-lg text-xs text-slate-500">
          <div>User ID: {authUser.id}</div>
          <div>Email: {authUser.email || 'Not set'}</div>
          <div>Current Plan: {planStatus?.plan || 'Unknown'}</div>
        </div>
      </div>
    </div>
  );
}
