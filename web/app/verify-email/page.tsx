'use client';

import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { BRAND } from '@/lib/brand';

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const emailParam = searchParams.get('email') || '';

  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleResend = async () => {
    if (!emailParam) {
      setError('No email address provided. Please sign up again.');
      return;
    }

    setResending(true);
    setError(null);

    try {
      const supabase = createBrowserSupabaseClient();
      const { error: resendError } = await supabase.auth.resend({
        type: 'signup',
        email: emailParam,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (resendError) {
        setError('Failed to resend verification email. Please try again.');
        setResending(false);
        return;
      }

      setResent(true);
      setResending(false);
    } catch {
      setError('An unexpected error occurred');
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#09090b] flex items-center justify-center p-4">
      {/* Background effects */}
      <div className="fixed inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px] pointer-events-none" />
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-gradient-to-b from-teal-500/10 via-violet-500/5 to-transparent rounded-full blur-3xl pointer-events-none" />

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

        {/* Card */}
        <div className="bg-zinc-900/50 border border-white/10 rounded-2xl p-8 text-center">
          <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-teal-500/10 flex items-center justify-center">
            <svg className="w-8 h-8 text-teal-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>

          <h1 className="text-2xl font-bold text-zinc-100 mb-2">Verify Your Email</h1>

          <p className="text-zinc-400 mb-2">
            We sent a verification email to
          </p>
          {emailParam && (
            <p className="text-zinc-200 font-medium mb-4">
              {emailParam}
            </p>
          )}
          <p className="text-zinc-500 text-sm mb-6">
            Click the link in the email to verify your account. If you don&apos;t see it, check your spam folder.
          </p>

          {error && (
            <div className="p-3 mb-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          {resent ? (
            <div className="p-3 mb-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-400 text-sm">
              Verification email resent! Check your inbox.
            </div>
          ) : (
            <button
              type="button"
              onClick={handleResend}
              disabled={resending || !emailParam}
              className="w-full py-3 px-4 bg-zinc-800 border border-white/10 text-zinc-200 font-medium rounded-lg hover:bg-zinc-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mb-4"
            >
              {resending && (
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              )}
              {resending ? 'Resending...' : "Didn't receive it? Resend"}
            </button>
          )}

          <Link
            href="/login"
            className="inline-block w-full py-3 px-4 bg-white text-zinc-900 font-semibold rounded-lg hover:bg-zinc-100 transition-colors text-center"
          >
            Go to Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
        <div className="flex items-center gap-3 text-zinc-500">
          <div className="w-5 h-5 border-2 border-zinc-600 border-t-zinc-300 rounded-full animate-spin" />
          Loading...
        </div>
      </div>
    }>
      <VerifyEmailContent />
    </Suspense>
  );
}
