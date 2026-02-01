'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import AppLayout from '../../components/AppLayout';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { useCredits } from '@/hooks/useCredits';

interface UserProfile {
  id: string;
  email: string | null;
  created_at: string;
}

export default function SettingsPage() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const { credits, subscription, isLoading: creditsLoading } = useCredits();

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const supabase = createBrowserSupabaseClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          setUser({
            id: user.id,
            email: user.email || null,
            created_at: user.created_at || new Date().toISOString(),
          });
        }
      } catch (err) {
        console.error('Failed to fetch user:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchUser();
  }, []);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      const supabase = createBrowserSupabaseClient();
      await supabase.auth.signOut();
      window.location.href = '/login';
    } catch (err) {
      console.error('Logout error:', err);
      setLoggingOut(false);
    }
  };

  const isUnlimited = credits?.remaining === -1;
  const formatDate = (dateString: string) => new Date(dateString).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  if (loading) {
    return (
      <AppLayout>
        <div className="p-6 lg:p-8 max-w-4xl mx-auto">
          <div className="animate-pulse space-y-6">
            <div className="h-8 w-32 bg-zinc-800 rounded"></div>
            <div className="h-48 bg-zinc-800/50 rounded-xl"></div>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-6 lg:p-8 max-w-4xl mx-auto pb-24 lg:pb-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white mb-1">Settings</h1>
          <p className="text-zinc-400">Manage your account and preferences</p>
        </div>

        <div className="mb-6 p-6 rounded-xl border border-white/10 bg-zinc-900/50">
          <h2 className="text-lg font-semibold text-white mb-4">Account</h2>
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
              <span className="text-sm text-zinc-400 sm:w-32">Email</span>
              <span className="text-zinc-200">{user?.email || 'Not set'}</span>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
              <span className="text-sm text-zinc-400 sm:w-32">User ID</span>
              <span className="text-zinc-500 font-mono text-sm">{user?.id}</span>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
              <span className="text-sm text-zinc-400 sm:w-32">Member since</span>
              <span className="text-zinc-200">{user?.created_at ? formatDate(user.created_at) : '-'}</span>
            </div>
          </div>
        </div>

        <div className="mb-6 p-6 rounded-xl border border-white/10 bg-zinc-900/50">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">Subscription</h2>
            <Link href="/upgrade" className="text-sm text-violet-400 hover:text-violet-300">{isUnlimited ? 'View plans' : 'Upgrade'}</Link>
          </div>
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
              <span className="text-sm text-zinc-400 sm:w-32">Current plan</span>
              <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${isUnlimited ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-700 text-zinc-300'}`}>
                {subscription?.planName || 'Free'}
              </span>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
              <span className="text-sm text-zinc-400 sm:w-32">Credits</span>
              <span className={`font-semibold ${isUnlimited ? 'text-emerald-400' : 'text-white'}`}>
                {creditsLoading ? '-' : isUnlimited ? 'Unlimited' : credits?.remaining ?? 0}
              </span>
            </div>
          </div>
        </div>

        <div className="mb-6 p-6 rounded-xl border border-white/10 bg-zinc-900/50">
          <h2 className="text-lg font-semibold text-white mb-4">Preferences</h2>
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
              <span className="text-sm text-zinc-400 sm:w-32">Theme</span>
              <span className="text-zinc-300">Dark (default)</span>
            </div>
          </div>
        </div>

        <div className="p-6 rounded-xl border border-red-500/20 bg-red-500/5">
          <h2 className="text-lg font-semibold text-red-400 mb-4">Danger Zone</h2>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium text-zinc-200">Sign out</div>
              <div className="text-sm text-zinc-500">Sign out of your account</div>
            </div>
            <button onClick={handleLogout} disabled={loggingOut} className="px-4 py-2 bg-zinc-800 text-zinc-200 rounded-lg hover:bg-zinc-700 border border-white/10 disabled:opacity-50">{loggingOut ? 'Signing out...' : 'Sign Out'}</button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
