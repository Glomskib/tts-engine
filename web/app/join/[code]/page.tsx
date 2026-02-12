'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import Image from 'next/image';

interface BrandInviteDetails {
  brand_name: string;
  brand_logo?: string | null;
  invite_code: string;
}

export default function BrandJoinPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = use(params);
  const [invite, setInvite] = useState<BrandInviteDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchInvite() {
      try {
        const res = await fetch(`/api/brand-invites/${code}`);
        const data = await res.json();

        if (!data.ok) {
          setError(data.message || 'This invite link is no longer valid.');
          setLoading(false);
          return;
        }

        setInvite(data.data);

        // Store invite code in cookie for post-signup linking
        document.cookie = `ff_brand_invite=${code}; path=/; max-age=${30 * 86400}; SameSite=Lax`;
        localStorage.setItem('ff_brand_invite', code);

        // Record click
        fetch(`/api/brand-invites/${code}/click`, { method: 'POST' }).catch(() => {});
      } catch {
        setError('Something went wrong. Please try again.');
      } finally {
        setLoading(false);
      }
    }

    fetchInvite();
  }, [code]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
        <div className="flex items-center gap-3 text-zinc-500">
          <div className="w-5 h-5 border-2 border-zinc-600 border-t-zinc-300 rounded-full animate-spin" />
          Loading...
        </div>
      </div>
    );
  }

  if (error || !invite) {
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center">
          <div className="bg-zinc-900/50 border border-white/10 rounded-2xl p-8">
            <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-red-500/10 flex items-center justify-center">
              <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-zinc-100 mb-2">Invalid Invite Link</h1>
            <p className="text-zinc-400 mb-6">{error || 'This invite link is no longer valid.'}</p>
            <Link href="/" className="text-teal-400 hover:text-teal-300 text-sm">
              Go to FlashFlow AI &rarr;
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100">
      <div className="fixed inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px] pointer-events-none" />
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-gradient-to-b from-blue-500/10 via-violet-500/5 to-transparent rounded-full blur-3xl pointer-events-none" />

      <main className="relative z-10 flex items-center justify-center min-h-screen p-4">
        <div className="w-full max-w-md">
          {/* Brand Card */}
          <div className="bg-zinc-900/50 border border-white/10 rounded-2xl p-8 text-center">
            {invite.brand_logo ? (
              <Image
                src={invite.brand_logo}
                alt={invite.brand_name}
                width={64}
                height={64}
                className="mx-auto mb-4 rounded-xl"
              />
            ) : (
              <div className="w-16 h-16 mx-auto mb-4 rounded-xl bg-gradient-to-br from-teal-400 to-blue-500 flex items-center justify-center text-white font-bold text-2xl">
                {invite.brand_name.charAt(0).toUpperCase()}
              </div>
            )}

            <h1 className="text-2xl font-bold text-zinc-100 mb-2">
              You&apos;ve been invited!
            </h1>
            <p className="text-zinc-400 mb-6">
              <strong className="text-zinc-200">{invite.brand_name}</strong> has invited you to use FlashFlow AI
              to generate scripts for their products.
            </p>

            <div className="bg-zinc-800/50 rounded-xl p-4 mb-6 text-left">
              <h3 className="text-sm font-semibold text-zinc-300 mb-2">What you get:</h3>
              <ul className="space-y-1.5 text-sm text-zinc-400">
                <li className="flex items-start gap-2">
                  <span className="text-teal-400 mt-0.5">&#10003;</span>
                  <span>Access to {invite.brand_name}&apos;s product catalog</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-teal-400 mt-0.5">&#10003;</span>
                  <span>AI-powered scripts tailored to their products</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-teal-400 mt-0.5">&#10003;</span>
                  <span>7 creator personas for unique content</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-teal-400 mt-0.5">&#10003;</span>
                  <span>5 free scripts to get started</span>
                </li>
              </ul>
            </div>

            <Link
              href={`/login?mode=signup&redirect=/admin/content-studio`}
              className="block w-full py-3.5 px-4 bg-teal-600 hover:bg-teal-500 text-white font-semibold rounded-lg transition-colors text-center mb-3"
            >
              Sign Up Free
            </Link>

            <Link
              href="/login"
              className="block text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              Already have an account? Sign in
            </Link>
          </div>

          <p className="text-center text-xs text-zinc-600 mt-6">
            Powered by{' '}
            <Link href="/" className="text-teal-400/60 hover:text-teal-400">FlashFlow AI</Link>
          </p>
        </div>
      </main>
    </div>
  );
}
