'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect') || '/admin/pipeline';

  // Toggle between Sign In and Create Account modes
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [signupSuccess, setSignupSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const supabase = createBrowserSupabaseClient();

      if (mode === 'signup') {
        // Validate confirm password
        if (password !== confirmPassword) {
          setError('Passwords do not match');
          setLoading(false);
          return;
        }

        // Password strength check
        if (password.length < 8) {
          setError('Password must be at least 8 characters');
          setLoading(false);
          return;
        }

        // Create account
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}${redirect}`,
          },
        });

        if (signUpError) {
          // Generic error message to avoid leaking whether email exists
          setError('Unable to create account. Please try again or use a different email.');
          setLoading(false);
          return;
        }

        // Show success message (email confirmation may be required)
        setSignupSuccess(true);
        setLoading(false);
      } else {
        // Sign in
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (signInError) {
          setError('Invalid email or password');
          setLoading(false);
          return;
        }

        // Check if explicit redirect was provided in URL
        const explicitRedirect = searchParams.get('redirect');
        if (explicitRedirect) {
          // Use explicit redirect (e.g., from protected page redirect)
          router.push(explicitRedirect);
          router.refresh();
          return;
        }

        // No explicit redirect - route based on user role
        try {
          const roleRes = await fetch('/api/auth/me');
          const roleData = await roleRes.json();

          if (roleData.ok) {
            if (roleData.isAdmin) {
              router.push('/admin/pipeline');
            } else if (roleData.isUploader) {
              router.push('/uploader');
            } else {
              // Default for other users (client portal)
              router.push('/');
            }
            router.refresh();
            return;
          }
        } catch {
          // Fallback if role check fails
        }

        // Fallback to default (client portal, safe for non-admins)
        router.push('/');
        router.refresh();
      }
    } catch (err) {
      console.error('Auth error:', err);
      setError('An unexpected error occurred');
      setLoading(false);
    }
  };

  const toggleMode = () => {
    setMode(mode === 'signin' ? 'signup' : 'signin');
    setError(null);
    setConfirmPassword('');
    setSignupSuccess(false);
  };

  // Success message after signup
  if (signupSuccess) {
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
          <h1 style={{ margin: '0 0 16px 0', fontSize: '24px', color: '#22c55e' }}>
            Account Created
          </h1>
          <p style={{ margin: '0 0 24px 0', fontSize: '14px', color: '#666' }}>
            Check your email to confirm your account, then sign in.
          </p>
          <button
            onClick={() => {
              setSignupSuccess(false);
              setMode('signin');
            }}
            style={{
              padding: '12px 24px',
              backgroundColor: '#228be6',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              fontSize: '14px',
              fontWeight: 'bold',
              cursor: 'pointer',
            }}
          >
            Go to Sign In
          </button>
        </div>
      </div>
    );
  }

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
      }}>
        <h1 style={{ margin: '0 0 8px 0', fontSize: '24px', textAlign: 'center' }}>
          TTS Engine
        </h1>
        <p style={{ margin: '0 0 24px 0', fontSize: '14px', textAlign: 'center', color: '#666' }}>
          {mode === 'signin'
            ? 'Sign in to access the video pipeline'
            : 'Create Account to get started'}
        </p>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold', fontSize: '14px' }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '10px',
                border: '1px solid #ccc',
                borderRadius: '4px',
                fontSize: '14px',
                boxSizing: 'border-box',
              }}
              placeholder="your@email.com"
            />
          </div>

          <div style={{ marginBottom: mode === 'signup' ? '16px' : '24px' }}>
            <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold', fontSize: '14px' }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={mode === 'signup' ? 8 : undefined}
              style={{
                width: '100%',
                padding: '10px',
                border: '1px solid #ccc',
                borderRadius: '4px',
                fontSize: '14px',
                boxSizing: 'border-box',
              }}
              placeholder={mode === 'signup' ? 'At least 8 characters' : 'Enter your password'}
            />
          </div>

          {mode === 'signup' && (
            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold', fontSize: '14px' }}>
                Confirm Password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '10px',
                  border: '1px solid #ccc',
                  borderRadius: '4px',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                }}
                placeholder="Re-enter your password"
              />
            </div>
          )}

          {error && (
            <div style={{
              marginBottom: '16px',
              padding: '10px',
              backgroundColor: '#f8d7da',
              color: '#721c24',
              borderRadius: '4px',
              fontSize: '13px',
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '12px',
              backgroundColor: loading ? '#ccc' : '#228be6',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              fontSize: '16px',
              fontWeight: 'bold',
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading
              ? (mode === 'signin' ? 'Signing in...' : 'Creating account...')
              : (mode === 'signin' ? 'Sign In' : 'Create Account')}
          </button>
        </form>

        <div style={{ marginTop: '20px', textAlign: 'center' }}>
          <button
            type="button"
            onClick={toggleMode}
            style={{
              background: 'none',
              border: 'none',
              color: '#228be6',
              cursor: 'pointer',
              fontSize: '14px',
              textDecoration: 'underline',
            }}
          >
            {mode === 'signin'
              ? "Don't have an account? Create Account"
              : 'Already have an account? Sign In'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f5f5f5',
      }}>
        <div style={{ color: '#666' }}>Loading...</div>
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
