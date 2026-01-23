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

export default function UpgradePage() {
  const router = useRouter();
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [planStatus, setPlanStatus] = useState<PlanStatus | null>(null);
  const [copied, setCopied] = useState(false);

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

          {/* Contact Admin */}
          <div style={{
            padding: '25px',
            backgroundColor: '#f8f9fa',
            borderRadius: '8px',
            border: '1px solid #dee2e6',
            textAlign: 'center',
          }}>
            <h3 style={{ margin: '0 0 15px 0', fontSize: '16px' }}>
              Ready to upgrade?
            </h3>
            <p style={{ color: '#6c757d', margin: '0 0 20px 0', fontSize: '14px' }}>
              Contact your administrator to enable Pro features on your account.
            </p>
            <button
              onClick={copyContactMessage}
              style={{
                padding: '12px 30px',
                backgroundColor: copied ? '#28a745' : '#228be6',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: '15px',
              }}
            >
              {copied ? 'Copied to Clipboard!' : 'Copy Contact Message'}
            </button>
          </div>
        </>
      )}

      {/* Gating Status Info */}
      <div style={{
        marginTop: '30px',
        padding: '15px 20px',
        backgroundColor: gatingEnabled ? '#fff3bf' : '#d3f9d8',
        borderRadius: '6px',
        border: `1px solid ${gatingEnabled ? '#ffd43b' : '#69db7c'}`,
        fontSize: '13px',
      }}>
        <strong>Subscription Gating:</strong>{' '}
        {gatingEnabled ? (
          <span style={{ color: '#e67700' }}>
            Enabled - Pro subscription required for workbench actions
          </span>
        ) : (
          <span style={{ color: '#2b8a3e' }}>
            Disabled - All users have full access
          </span>
        )}
      </div>

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
