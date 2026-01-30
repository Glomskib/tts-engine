'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { BRAND } from '@/lib/brand';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect') || '/admin/skit-generator';
  const initialMode = searchParams.get('mode') === 'signup' ? 'signup' : 'signin';

  const [mode, setMode] = useState<'signin' | 'signup'>(initialMode);
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
        if (password !== confirmPassword) {
          setError('Passwords do not match');
          setLoading(false);
          return;
        }

        if (password.length < 8) {
          setError('Password must be at least 8 characters');
          setLoading(false);
          return;
        }

        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}${redirect}`,
          },
        });

        if (signUpError) {
          setError('Unable to create account. Please try again or use a different email.');
          setLoading(false);
          return;
        }

        setSignupSuccess(true);
        setLoading(false);
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (signInError) {
          setError('Invalid email or password');
          setLoading(false);
          return;
        }

        const explicitRedirect = searchParams.get('redirect');
        if (explicitRedirect) {
          router.push(explicitRedirect);
          router.refresh();
          return;
        }

        try {
          const roleRes = await fetch('/api/auth/me');
          const roleData = await roleRes.json();

          if (roleData.ok) {
            if (roleData.isAdmin) {
              router.push('/admin/skit-generator');
            } else if (roleData.isUploader) {
              router.push('/uploader');
            } else {
              router.push('/admin/skit-generator');
            }
            router.refresh();
            return;
          }
        } catch {
          // Fallback if role check fails
        }

        router.push('/admin/skit-generator');
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

  if (signupSuccess) {
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-zinc-900/50 border border-white/10 rounded-2xl p-8 text-center">
            <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-emerald-500/10 flex items-center justify-center">
              <svg className="w-8 h-8 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-zinc-100 mb-2">Account Created</h1>
            <p className="text-zinc-400 mb-6">
              Check your email to confirm your account, then sign in.
            </p>
            <button
              onClick={() => {
                setSignupSuccess(false);
                setMode('signin');
              }}
              className="w-full py-3 px-4 bg-white text-zinc-900 font-semibold rounded-lg hover:bg-zinc-100 transition-colors"
            >
              Go to Sign In
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#09090b] flex items-center justify-center p-4">
      {/* Background effects */}
      <div className="fixed inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px] pointer-events-none" />
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-gradient-to-b from-blue-500/10 via-violet-500/5 to-transparent rounded-full blur-3xl pointer-events-none" />

      <div className="relative w-full max-w-md">
        {/* Logo */}
        <Link href="/" className="flex items-center justify-center gap-3 mb-8">
          <Image
            src={BRAND.logo}
            alt={BRAND.name}
            width={40}
            height={40}
            className="rounded-xl"
          />
          <span className="text-2xl font-bold text-zinc-100">{BRAND.name}</span>
        </Link>

        {/* Form card */}
        <div className="bg-zinc-900/50 border border-white/10 rounded-2xl p-8">
          <h1 className="text-xl font-semibold text-zinc-100 text-center mb-2">
            {mode === 'signin' ? 'Welcome back' : 'Create your account'}
          </h1>
          <p className="text-zinc-400 text-center text-sm mb-6">
            {mode === 'signin'
              ? 'Sign in to continue to your dashboard'
              : 'Start creating with AI-powered scripts'}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-3 bg-zinc-800 border border-white/10 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={mode === 'signup' ? 8 : undefined}
                className="w-full px-4 py-3 bg-zinc-800 border border-white/10 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                placeholder={mode === 'signup' ? 'At least 8 characters' : 'Enter your password'}
              />
            </div>

            {mode === 'signup' && (
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">
                  Confirm Password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  className="w-full px-4 py-3 bg-zinc-800 border border-white/10 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  placeholder="Re-enter your password"
                />
              </div>
            )}

            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 bg-white text-zinc-900 font-semibold rounded-lg hover:bg-zinc-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading && (
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              )}
              {loading
                ? (mode === 'signin' ? 'Signing in...' : 'Creating account...')
                : (mode === 'signin' ? 'Sign In' : 'Create Account')}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={toggleMode}
              className="text-sm text-zinc-400 hover:text-white transition-colors"
            >
              {mode === 'signin'
                ? "Don't have an account? "
                : 'Already have an account? '}
              <span className="text-blue-400 hover:text-blue-300">
                {mode === 'signin' ? 'Sign up' : 'Sign in'}
              </span>
            </button>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-zinc-600 mt-6">
          By continuing, you agree to our{' '}
          <Link href="/terms" className="text-zinc-400 hover:text-white">Terms</Link>
          {' '}and{' '}
          <Link href="/privacy" className="text-zinc-400 hover:text-white">Privacy Policy</Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
        <div className="flex items-center gap-3 text-zinc-500">
          <div className="w-5 h-5 border-2 border-zinc-600 border-t-zinc-300 rounded-full animate-spin" />
          Loading...
        </div>
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
