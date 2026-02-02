'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { useCredits } from '@/hooks/useCredits';
import { useToast } from '@/contexts/ToastContext';
import { User, CreditCard, Bell, Palette, Shield, Loader2, Check } from 'lucide-react';

interface UserProfile {
  id: string;
  email: string | null;
  created_at: string;
}

interface UserSettings {
  theme: string;
  notifications: {
    email: boolean;
    push: boolean;
    weekly_digest: boolean;
  };
  defaults: {
    video_aspect_ratio: string;
    video_quality: string;
    auto_save: boolean;
  };
  accessibility: {
    reduce_motion: boolean;
    high_contrast: boolean;
  };
}

type TabId = 'account' | 'subscription' | 'notifications' | 'preferences';

const TABS = [
  { id: 'account' as TabId, label: 'Account', icon: User },
  { id: 'subscription' as TabId, label: 'Subscription', icon: CreditCard },
  { id: 'notifications' as TabId, label: 'Notifications', icon: Bell },
  { id: 'preferences' as TabId, label: 'Preferences', icon: Palette },
];

export default function SettingsPage() {
  const { showSuccess, showError } = useToast();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('account');
  const { credits, subscription, isLoading: creditsLoading } = useCredits();

  useEffect(() => {
    const fetchData = async () => {
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

        // Fetch settings
        const res = await fetch('/api/user/settings');
        if (res.ok) {
          const data = await res.json();
          setSettings(data.settings);
        }
      } catch (err) {
        console.error('Failed to fetch data:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const updateSettings = async (updates: Partial<UserSettings>) => {
    setSaving(true);
    try {
      const res = await fetch('/api/user/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        const data = await res.json();
        setSettings(data.settings);
        setSaved(true);
        showSuccess('Settings updated');
        setTimeout(() => setSaved(false), 2000);
      } else {
        showError('Failed to save settings');
      }
    } catch (err) {
      console.error('Failed to update settings:', err);
      showError('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

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
      <div className="p-6 lg:p-8 max-w-4xl mx-auto">
        <div className="animate-pulse space-y-6">
          <div className="h-8 w-32 bg-zinc-800 rounded"></div>
          <div className="h-48 bg-zinc-800/50 rounded-xl"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto pb-24 lg:pb-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white mb-1">Settings</h1>
            <p className="text-zinc-400">Manage your account and preferences</p>
          </div>
          {(saving || saved) && (
            <div className="flex items-center gap-2 text-sm">
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
                  <span className="text-zinc-400">Saving...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4 text-green-400" />
                  <span className="text-green-400">Saved</span>
                </>
              )}
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                activeTab === tab.id
                  ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
                  : 'bg-zinc-800/50 text-zinc-400 border border-transparent hover:text-zinc-200'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Account Tab */}
        {activeTab === 'account' && (
          <div className="space-y-6">
            <div className="p-6 rounded-xl border border-white/10 bg-zinc-900/50">
              <h2 className="text-lg font-semibold text-white mb-4">Account Information</h2>
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

            <div className="p-6 rounded-xl border border-red-500/20 bg-red-500/5">
              <h2 className="text-lg font-semibold text-red-400 mb-4 flex items-center gap-2">
                <Shield className="w-5 h-5" />
                Danger Zone
              </h2>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-medium text-zinc-200">Sign out</div>
                  <div className="text-sm text-zinc-500">Sign out of your account on this device</div>
                </div>
                <button
                  onClick={handleLogout}
                  disabled={loggingOut}
                  className="px-4 py-2 bg-zinc-800 text-zinc-200 rounded-lg hover:bg-zinc-700 border border-white/10 disabled:opacity-50"
                >
                  {loggingOut ? 'Signing out...' : 'Sign Out'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Subscription Tab */}
        {activeTab === 'subscription' && (
          <div className="space-y-6">
            <div className="p-6 rounded-xl border border-white/10 bg-zinc-900/50">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white">Current Plan</h2>
                <Link href="/upgrade" className="text-sm text-violet-400 hover:text-violet-300">
                  {isUnlimited ? 'Manage plan' : 'Upgrade'}
                </Link>
              </div>
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                  <span className="text-sm text-zinc-400 sm:w-32">Plan</span>
                  <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    isUnlimited ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-700 text-zinc-300'
                  }`}>
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

            <div className="p-6 rounded-xl border border-white/10 bg-zinc-900/50">
              <h2 className="text-lg font-semibold text-white mb-4">Usage This Month</h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-zinc-800/50 rounded-lg">
                  <p className="text-sm text-zinc-400">Credits Used This Period</p>
                  <p className="text-2xl font-bold text-white">{credits?.usedThisPeriod || 0}</p>
                </div>
                <div className="p-4 bg-zinc-800/50 rounded-lg">
                  <p className="text-sm text-zinc-400">Lifetime Credits Used</p>
                  <p className="text-2xl font-bold text-white">{credits?.lifetimeUsed || 0}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Notifications Tab */}
        {activeTab === 'notifications' && settings && (
          <div className="space-y-6">
            <div className="p-6 rounded-xl border border-white/10 bg-zinc-900/50">
              <h2 className="text-lg font-semibold text-white mb-4">Email Notifications</h2>
              <div className="space-y-4">
                <label className="flex items-center justify-between cursor-pointer">
                  <div>
                    <div className="text-sm font-medium text-zinc-200">Email notifications</div>
                    <div className="text-sm text-zinc-500">Receive updates about your account via email</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.notifications.email}
                    onChange={(e) => updateSettings({ notifications: { ...settings.notifications, email: e.target.checked } })}
                    className="w-5 h-5 rounded bg-zinc-800 border-zinc-600 text-violet-500 focus:ring-violet-500"
                  />
                </label>
                <label className="flex items-center justify-between cursor-pointer">
                  <div>
                    <div className="text-sm font-medium text-zinc-200">Weekly digest</div>
                    <div className="text-sm text-zinc-500">Get a summary of your activity each week</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.notifications.weekly_digest}
                    onChange={(e) => updateSettings({ notifications: { ...settings.notifications, weekly_digest: e.target.checked } })}
                    className="w-5 h-5 rounded bg-zinc-800 border-zinc-600 text-violet-500 focus:ring-violet-500"
                  />
                </label>
                <label className="flex items-center justify-between cursor-pointer">
                  <div>
                    <div className="text-sm font-medium text-zinc-200">Push notifications</div>
                    <div className="text-sm text-zinc-500">Receive push notifications in your browser</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.notifications.push}
                    onChange={(e) => updateSettings({ notifications: { ...settings.notifications, push: e.target.checked } })}
                    className="w-5 h-5 rounded bg-zinc-800 border-zinc-600 text-violet-500 focus:ring-violet-500"
                  />
                </label>
              </div>
            </div>
          </div>
        )}

        {/* Preferences Tab */}
        {activeTab === 'preferences' && settings && (
          <div className="space-y-6">
            <div className="p-6 rounded-xl border border-white/10 bg-zinc-900/50">
              <h2 className="text-lg font-semibold text-white mb-4">Default Settings</h2>
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                  <span className="text-sm text-zinc-400 sm:w-40">Default aspect ratio</span>
                  <select
                    value={settings.defaults.video_aspect_ratio}
                    onChange={(e) => updateSettings({ defaults: { ...settings.defaults, video_aspect_ratio: e.target.value } })}
                    className="flex-1 max-w-xs px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                  >
                    <option value="9:16">9:16 (TikTok/Reels)</option>
                    <option value="16:9">16:9 (YouTube)</option>
                    <option value="1:1">1:1 (Square)</option>
                    <option value="4:5">4:5 (Instagram)</option>
                  </select>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                  <span className="text-sm text-zinc-400 sm:w-40">Video quality</span>
                  <select
                    value={settings.defaults.video_quality}
                    onChange={(e) => updateSettings({ defaults: { ...settings.defaults, video_quality: e.target.value } })}
                    className="flex-1 max-w-xs px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                  >
                    <option value="low">Low (faster)</option>
                    <option value="medium">Medium</option>
                    <option value="high">High (best quality)</option>
                  </select>
                </div>
                <label className="flex items-center justify-between cursor-pointer">
                  <div>
                    <div className="text-sm font-medium text-zinc-200">Auto-save</div>
                    <div className="text-sm text-zinc-500">Automatically save your work as you edit</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.defaults.auto_save}
                    onChange={(e) => updateSettings({ defaults: { ...settings.defaults, auto_save: e.target.checked } })}
                    className="w-5 h-5 rounded bg-zinc-800 border-zinc-600 text-violet-500 focus:ring-violet-500"
                  />
                </label>
              </div>
            </div>

            <div className="p-6 rounded-xl border border-white/10 bg-zinc-900/50">
              <h2 className="text-lg font-semibold text-white mb-4">Accessibility</h2>
              <div className="space-y-4">
                <label className="flex items-center justify-between cursor-pointer">
                  <div>
                    <div className="text-sm font-medium text-zinc-200">Reduce motion</div>
                    <div className="text-sm text-zinc-500">Minimize animations throughout the app</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.accessibility.reduce_motion}
                    onChange={(e) => updateSettings({ accessibility: { ...settings.accessibility, reduce_motion: e.target.checked } })}
                    className="w-5 h-5 rounded bg-zinc-800 border-zinc-600 text-violet-500 focus:ring-violet-500"
                  />
                </label>
                <label className="flex items-center justify-between cursor-pointer">
                  <div>
                    <div className="text-sm font-medium text-zinc-200">High contrast</div>
                    <div className="text-sm text-zinc-500">Increase contrast for better visibility</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.accessibility.high_contrast}
                    onChange={(e) => updateSettings({ accessibility: { ...settings.accessibility, high_contrast: e.target.checked } })}
                    className="w-5 h-5 rounded bg-zinc-800 border-zinc-600 text-violet-500 focus:ring-violet-500"
                  />
                </label>
              </div>
            </div>

            <div className="p-6 rounded-xl border border-white/10 bg-zinc-900/50">
              <h2 className="text-lg font-semibold text-white mb-4">Appearance</h2>
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                <span className="text-sm text-zinc-400 sm:w-40">Theme</span>
                <div className="flex gap-2">
                  {['dark', 'light', 'system'].map(theme => (
                    <button
                      key={theme}
                      onClick={() => updateSettings({ theme })}
                      className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${
                        settings.theme === theme
                          ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
                          : 'bg-zinc-800 text-zinc-400 border border-transparent hover:text-zinc-200'
                      }`}
                    >
                      {theme}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
    </div>
  );
}
