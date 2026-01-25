'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';

interface InviteDetails {
  org_name: string;
  role: string;
  email: string;
  expires_at: string;
}

interface AuthUser {
  id: string;
  email: string | null;
}

export default function InviteAcceptPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const router = useRouter();

  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [invite, setInvite] = useState<InviteDetails | null>(null);
  const [inviteLoading, setInviteLoading] = useState(true);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);

  // Check auth status
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const supabase = createBrowserSupabaseClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (user) {
          setAuthUser({
            id: user.id,
            email: user.email || null,
          });
        }
      } catch (err) {
        console.error('Auth check error:', err);
      } finally {
        setAuthLoading(false);
      }
    };

    checkAuth();
  }, []);

  // Fetch invite details
  useEffect(() => {
    if (!token) return;

    const fetchInvite = async () => {
      try {
        const res = await fetch(`/api/invite/accept?token=${encodeURIComponent(token)}`);
        const data = await res.json();

        if (!res.ok) {
          setInviteError(data.error || 'Invalid or expired invite');
        } else if (data.ok && data.data) {
          setInvite(data.data);
        } else {
          setInviteError('Invalid invite');
        }
      } catch (err) {
        console.error('Invite fetch error:', err);
        setInviteError('Unable to load invite');
      } finally {
        setInviteLoading(false);
      }
    };

    fetchInvite();
  }, [token]);

  // Handle accept
  const handleAccept = async () => {
    if (!authUser) return;

    setAccepting(true);
    setAcceptError(null);

    try {
      const supabase = createBrowserSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setAcceptError('Session expired. Please sign in again.');
        setAccepting(false);
        return;
      }

      const res = await fetch('/api/invite/accept', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ token }),
      });

      const data = await res.json();

      if (!res.ok) {
        setAcceptError(data.error || 'Failed to accept invite');
        setAccepting(false);
        return;
      }

      // Success - redirect to client portal with welcome flag
      router.push('/client?welcome=1');
    } catch (err) {
      console.error('Accept error:', err);
      setAcceptError('An unexpected error occurred');
      setAccepting(false);
    }
  };

  // Loading state
  if (authLoading || inviteLoading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f5f5f5',
      }}>
        <div style={{ color: '#666' }}>Loading...</div>
      </div>
    );
  }

  // Invite error state
  if (inviteError) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f5f5f5',
      }}>
        <div style={{
          backgroundColor: 'white',
          padding: '40px',
          borderRadius: '8px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
          width: '100%',
          maxWidth: '400px',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>:(</div>
          <h1 style={{ margin: '0 0 16px 0', fontSize: '20px', color: '#dc3545' }}>
            Invite Not Valid
          </h1>
          <p style={{ margin: '0 0 24px 0', fontSize: '14px', color: '#666' }}>
            This invite link is invalid, expired, or has already been used.
          </p>
          <Link
            href="/login"
            style={{
              display: 'inline-block',
              padding: '12px 24px',
              backgroundColor: '#228be6',
              color: 'white',
              borderRadius: '4px',
              textDecoration: 'none',
              fontSize: '14px',
              fontWeight: 'bold',
            }}
          >
            Go to Sign In
          </Link>
        </div>
      </div>
    );
  }

  // Not authenticated - show sign in prompt
  if (!authUser) {
    const loginUrl = `/login?redirect=${encodeURIComponent(`/invite/${token}`)}`;

    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f5f5f5',
      }}>
        <div style={{
          backgroundColor: 'white',
          padding: '40px',
          borderRadius: '8px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
          width: '100%',
          maxWidth: '400px',
          textAlign: 'center',
        }}>
          <h1 style={{ margin: '0 0 8px 0', fontSize: '24px' }}>
            You&apos;re Invited
          </h1>
          <p style={{ margin: '0 0 24px 0', fontSize: '14px', color: '#666' }}>
            Sign in or create an account to accept your invite to{' '}
            <strong>{invite?.org_name || 'the organization'}</strong>.
          </p>

          {invite && (
            <div style={{
              backgroundColor: '#f8f9fa',
              padding: '16px',
              borderRadius: '6px',
              marginBottom: '24px',
              textAlign: 'left',
            }}>
              <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>Organization</div>
              <div style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '12px' }}>
                {invite.org_name}
              </div>
              <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>Role</div>
              <div style={{ fontSize: '14px', textTransform: 'capitalize' }}>
                {invite.role}
              </div>
            </div>
          )}

          <Link
            href={loginUrl}
            style={{
              display: 'block',
              padding: '12px',
              backgroundColor: '#228be6',
              color: 'white',
              borderRadius: '4px',
              textDecoration: 'none',
              fontSize: '16px',
              fontWeight: 'bold',
              marginBottom: '12px',
            }}
          >
            Sign In to Accept
          </Link>
          <Link
            href={loginUrl}
            style={{
              display: 'block',
              padding: '12px',
              backgroundColor: 'transparent',
              color: '#228be6',
              border: '1px solid #228be6',
              borderRadius: '4px',
              textDecoration: 'none',
              fontSize: '14px',
            }}
          >
            Create Account
          </Link>
        </div>
      </div>
    );
  }

  // Authenticated - show accept confirmation
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#f5f5f5',
    }}>
      <div style={{
        backgroundColor: 'white',
        padding: '40px',
        borderRadius: '8px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
        width: '100%',
        maxWidth: '400px',
        textAlign: 'center',
      }}>
        <h1 style={{ margin: '0 0 8px 0', fontSize: '24px' }}>
          Accept Invite
        </h1>
        <p style={{ margin: '0 0 24px 0', fontSize: '14px', color: '#666' }}>
          You&apos;ve been invited to join <strong>{invite?.org_name}</strong>.
        </p>

        {invite && (
          <div style={{
            backgroundColor: '#f8f9fa',
            padding: '16px',
            borderRadius: '6px',
            marginBottom: '24px',
            textAlign: 'left',
          }}>
            <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>Organization</div>
            <div style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '12px' }}>
              {invite.org_name}
            </div>
            <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>Role</div>
            <div style={{ fontSize: '14px', textTransform: 'capitalize', marginBottom: '12px' }}>
              {invite.role}
            </div>
            <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>Signed in as</div>
            <div style={{ fontSize: '14px' }}>
              {authUser.email}
            </div>
          </div>
        )}

        {acceptError && (
          <div style={{
            marginBottom: '16px',
            padding: '10px',
            backgroundColor: '#f8d7da',
            color: '#721c24',
            borderRadius: '4px',
            fontSize: '13px',
          }}>
            {acceptError}
          </div>
        )}

        <button
          onClick={handleAccept}
          disabled={accepting}
          style={{
            width: '100%',
            padding: '12px',
            backgroundColor: accepting ? '#ccc' : '#22c55e',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            fontSize: '16px',
            fontWeight: 'bold',
            cursor: accepting ? 'not-allowed' : 'pointer',
            marginBottom: '12px',
          }}
        >
          {accepting ? 'Accepting...' : 'Accept Invite'}
        </button>

        <Link
          href="/client"
          style={{
            display: 'block',
            color: '#666',
            fontSize: '14px',
            textDecoration: 'underline',
          }}
        >
          Cancel
        </Link>
      </div>
    </div>
  );
}
