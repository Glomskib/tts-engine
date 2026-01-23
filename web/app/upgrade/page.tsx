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
      <div style={{ padding: '40px', textAlign: 'center' }}>
        Checking access...
      </div>
    );
  }

  if (!authUser) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        Redirecting to login...
      </div>
    );
  }

  const isPro = planStatus?.plan === 'pro' && planStatus?.isActive;
  const gatingEnabled = planStatus?.gatingEnabled ?? false;

  return (
    <div style={{ padding: '40px', maxWidth: '600px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '30px' }}>
        <Link
          href="/admin/pipeline"
          style={{ color: '#228be6', textDecoration: 'none', fontSize: '14px' }}
        >
          Back to Pipeline
        </Link>
      </div>

      {/* Pro Status Banner */}
      {isPro ? (
        <div style={{
          padding: '30px',
          backgroundColor: '#d3f9d8',
          borderRadius: '12px',
          border: '2px solid #69db7c',
          textAlign: 'center',
          marginBottom: '30px',
        }}>
          <div style={{ fontSize: '48px', marginBottom: '15px' }}>
            &#9733;
          </div>
          <h1 style={{ margin: '0 0 10px 0', color: '#2b8a3e' }}>
            You're Pro!
          </h1>
          <p style={{ color: '#37b24d', margin: 0 }}>
            You have full access to all workbench features.
          </p>
        </div>
      ) : (
        <>
          {/* Upgrade Hero */}
          <div style={{
            padding: '30px',
            backgroundColor: '#e7f5ff',
            borderRadius: '12px',
            border: '2px solid #228be6',
            textAlign: 'center',
            marginBottom: '30px',
          }}>
            <h1 style={{ margin: '0 0 15px 0', color: '#1971c2' }}>
              Upgrade to Pro
            </h1>
            <p style={{ color: '#495057', margin: 0, fontSize: '16px' }}>
              Unlock full access to workbench actions and task dispatch.
            </p>
          </div>

          {/* Features List */}
          <div style={{
            padding: '25px',
            backgroundColor: '#fff',
            borderRadius: '8px',
            border: '1px solid #dee2e6',
            marginBottom: '25px',
          }}>
            <h2 style={{ margin: '0 0 20px 0', fontSize: '18px', color: '#212529' }}>
              What Pro Unlocks
            </h2>
            <ul style={{ margin: 0, padding: '0 0 0 20px', lineHeight: '2' }}>
              <li><strong>Auto-Dispatch</strong> - Get work assigned automatically</li>
              <li><strong>Status Updates</strong> - Mark tasks as Recorded, Edited, Posted</li>
              <li><strong>Workbench Actions</strong> - Full control over your assigned tasks</li>
              <li><strong>Priority Queue</strong> - Access to high-priority assignments</li>
            </ul>
          </div>

          {/* Request Upgrade */}
          <div style={{
            padding: '25px',
            backgroundColor: '#f8f9fa',
            borderRadius: '8px',
            border: '1px solid #dee2e6',
          }}>
            <h3 style={{ margin: '0 0 15px 0', fontSize: '16px' }}>
              Request Upgrade
            </h3>

            {/* Status messages */}
            {requestStatus === 'requested' && (
              <div style={{
                marginBottom: '15px',
                padding: '12px',
                backgroundColor: '#d3f9d8',
                border: '1px solid #69db7c',
                borderRadius: '4px',
                color: '#2b8a3e',
              }}>
                Your upgrade request has been submitted. An administrator will review it shortly.
              </div>
            )}

            {requestStatus === 'already_requested' && (
              <div style={{
                marginBottom: '15px',
                padding: '12px',
                backgroundColor: '#fff3bf',
                border: '1px solid #ffd43b',
                borderRadius: '4px',
                color: '#e67700',
              }}>
                You have already requested an upgrade within the last 24 hours. Please wait for admin review.
              </div>
            )}

            {requestStatus === 'error' && (
              <div style={{
                marginBottom: '15px',
                padding: '12px',
                backgroundColor: '#f8d7da',
                border: '1px solid #f5c6cb',
                borderRadius: '4px',
                color: '#721c24',
              }}>
                Failed to submit request. Please try again.
              </div>
            )}

            {requestStatus !== 'requested' && (
              <>
                <div style={{ marginBottom: '15px' }}>
                  <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', color: '#495057' }}>
                    Message (optional)
                  </label>
                  <textarea
                    value={requestMessage}
                    onChange={(e) => setRequestMessage(e.target.value)}
                    placeholder="Tell us why you need Pro access..."
                    maxLength={500}
                    style={{
                      width: '100%',
                      padding: '10px',
                      border: '1px solid #ced4da',
                      borderRadius: '4px',
                      minHeight: '80px',
                      resize: 'vertical',
                      fontSize: '14px',
                    }}
                  />
                </div>

                <button
                  onClick={submitUpgradeRequest}
                  disabled={requestSubmitting}
                  style={{
                    width: '100%',
                    padding: '12px 30px',
                    backgroundColor: requestSubmitting ? '#adb5bd' : '#28a745',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: requestSubmitting ? 'not-allowed' : 'pointer',
                    fontWeight: 'bold',
                    fontSize: '15px',
                  }}
                >
                  {requestSubmitting ? 'Submitting...' : 'Request Upgrade'}
                </button>
              </>
            )}

            {/* Manual contact option */}
            <div style={{ marginTop: '20px', paddingTop: '15px', borderTop: '1px solid #dee2e6' }}>
              <p style={{ color: '#6c757d', margin: '0 0 10px 0', fontSize: '13px', textAlign: 'center' }}>
                Or contact your administrator directly:
              </p>
              <button
                onClick={copyContactMessage}
                style={{
                  width: '100%',
                  padding: '10px 20px',
                  backgroundColor: copied ? '#28a745' : '#6c757d',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '13px',
                }}
              >
                {copied ? 'Copied!' : 'Copy Contact Message'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Runtime Config Summary */}
      {runtimeConfig && (
        <div style={{
          marginTop: '30px',
          padding: '15px 20px',
          backgroundColor: '#f8f9fa',
          borderRadius: '8px',
          border: '1px solid #dee2e6',
        }}>
          <h3 style={{ margin: '0 0 15px 0', fontSize: '14px', color: '#495057' }}>
            System Configuration
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '13px' }}>
            <div style={{
              padding: '8px 12px',
              backgroundColor: runtimeConfig.subscription_gating_enabled ? '#fff3bf' : '#d3f9d8',
              borderRadius: '4px',
            }}>
              <div style={{ fontSize: '11px', color: '#6c757d', marginBottom: '2px' }}>Subscription Gating</div>
              <div style={{ fontWeight: 'bold', color: runtimeConfig.subscription_gating_enabled ? '#e67700' : '#2b8a3e' }}>
                {runtimeConfig.subscription_gating_enabled ? 'Enabled' : 'Disabled'}
              </div>
            </div>
            <div style={{
              padding: '8px 12px',
              backgroundColor: runtimeConfig.email_enabled ? '#d3f9d8' : '#f8f9fa',
              borderRadius: '4px',
            }}>
              <div style={{ fontSize: '11px', color: '#6c757d', marginBottom: '2px' }}>Email Notifications</div>
              <div style={{ fontWeight: 'bold', color: runtimeConfig.email_enabled ? '#2b8a3e' : '#6c757d' }}>
                {runtimeConfig.email_enabled ? 'Enabled' : 'Disabled'}
              </div>
            </div>
            <div style={{
              padding: '8px 12px',
              backgroundColor: runtimeConfig.slack_enabled ? '#d3f9d8' : '#f8f9fa',
              borderRadius: '4px',
            }}>
              <div style={{ fontSize: '11px', color: '#6c757d', marginBottom: '2px' }}>Slack Notifications</div>
              <div style={{ fontWeight: 'bold', color: runtimeConfig.slack_enabled ? '#2b8a3e' : '#6c757d' }}>
                {runtimeConfig.slack_enabled ? 'Enabled' : 'Disabled'}
              </div>
            </div>
            <div style={{
              padding: '8px 12px',
              backgroundColor: '#e7f5ff',
              borderRadius: '4px',
            }}>
              <div style={{ fontSize: '11px', color: '#6c757d', marginBottom: '2px' }}>Assignment TTL</div>
              <div style={{ fontWeight: 'bold', color: '#1971c2' }}>
                {runtimeConfig.assignment_ttl_minutes} min
              </div>
            </div>
          </div>
        </div>
      )}

      {/* User Info */}
      <div style={{
        marginTop: '20px',
        padding: '12px 15px',
        backgroundColor: '#f1f3f5',
        borderRadius: '4px',
        fontSize: '12px',
        color: '#6c757d',
      }}>
        <div>User ID: {authUser.id}</div>
        <div>Email: {authUser.email || 'Not set'}</div>
        <div>Current Plan: {planStatus?.plan || 'Unknown'}</div>
      </div>
    </div>
  );
}
