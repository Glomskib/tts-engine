'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { useCredits } from '@/hooks/useCredits';
import { useToast } from '@/contexts/ToastContext';
import { User, CreditCard, Bell, Palette, Shield, Loader2, Check, Key, Copy, Trash2, Plus, AlertTriangle, Zap, Send, ToggleLeft, ToggleRight, Download, Upload } from 'lucide-react';

interface UserProfile {
  id: string;
  email: string | null;
  created_at: string;
}

interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  last_used_at: string | null;
  created_at: string;
  revoked_at: string | null;
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
  posting: {
    videos_per_day: number;
    posting_time_1: string;
    posting_time_2: string;
  };
}

interface Webhook {
  id: string;
  name: string;
  url: string;
  events: string[];
  is_active: boolean;
  created_at: string;
  last_triggered_at: string | null;
  last_status_code: number | null;
  failure_count: number;
}

type TabId = 'account' | 'subscription' | 'notifications' | 'preferences' | 'api-keys' | 'webhooks' | 'data';

const TABS = [
  { id: 'account' as TabId, label: 'Account', icon: User },
  { id: 'subscription' as TabId, label: 'Subscription', icon: CreditCard },
  { id: 'notifications' as TabId, label: 'Notifications', icon: Bell },
  { id: 'preferences' as TabId, label: 'Preferences', icon: Palette },
  { id: 'api-keys' as TabId, label: 'API Keys', icon: Key },
  { id: 'webhooks' as TabId, label: 'Webhooks', icon: Zap },
  { id: 'data' as TabId, label: 'Data', icon: Download },
];

const EXPORT_TYPES = [
  { id: 'videos', label: 'Videos', description: 'Pipeline videos with stats and status' },
  { id: 'scripts', label: 'Scripts', description: 'Saved scripts and hooks' },
  { id: 'winners', label: 'Winners', description: 'Winners bank entries' },
  { id: 'products', label: 'Products', description: 'Product catalog' },
  { id: 'all', label: 'All Data', description: 'Complete export of all data' },
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
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [apiKeysLoading, setApiKeysLoading] = useState(false);
  const [showCreateKey, setShowCreateKey] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyScopes, setNewKeyScopes] = useState<string[]>(['read']);
  const [creatingKey, setCreatingKey] = useState(false);
  const [newKeyPlaintext, setNewKeyPlaintext] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  // Webhook state
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [webhooksLoading, setWebhooksLoading] = useState(false);
  const [availableEvents, setAvailableEvents] = useState<string[]>([]);
  const [showCreateWebhook, setShowCreateWebhook] = useState(false);
  const [newWebhookName, setNewWebhookName] = useState('');
  const [newWebhookUrl, setNewWebhookUrl] = useState('');
  const [newWebhookEvents, setNewWebhookEvents] = useState<string[]>([]);
  const [newWebhookSecret, setNewWebhookSecret] = useState<string | null>(null);
  const [creatingWebhook, setCreatingWebhook] = useState(false);
  const [testingWebhookId, setTestingWebhookId] = useState<string | null>(null);

  // Data export/import state
  const [exporting, setExporting] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number } | null>(null);

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

  const fetchApiKeys = async () => {
    setApiKeysLoading(true);
    try {
      const res = await fetch('/api/user/api-keys');
      if (res.ok) {
        const data = await res.json();
        setApiKeys(data.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch API keys:', err);
    } finally {
      setApiKeysLoading(false);
    }
  };

  const createApiKey = async () => {
    if (!newKeyName.trim()) return;
    setCreatingKey(true);
    try {
      const res = await fetch('/api/user/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newKeyName.trim(), scopes: newKeyScopes }),
      });
      if (res.ok) {
        const data = await res.json();
        setNewKeyPlaintext(data.data.plaintext);
        setNewKeyName('');
        setNewKeyScopes(['read']);
        fetchApiKeys();
        showSuccess('API key created');
      } else {
        const data = await res.json();
        showError(data.error || 'Failed to create API key');
      }
    } catch {
      showError('Failed to create API key');
    } finally {
      setCreatingKey(false);
    }
  };

  const revokeApiKey = async (keyId: string) => {
    setRevokingId(keyId);
    try {
      const res = await fetch(`/api/user/api-keys/${keyId}`, { method: 'DELETE' });
      if (res.ok) {
        fetchApiKeys();
        showSuccess('API key revoked');
      } else {
        showError('Failed to revoke API key');
      }
    } catch {
      showError('Failed to revoke API key');
    } finally {
      setRevokingId(null);
    }
  };

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Webhook functions
  const fetchWebhooks = async () => {
    setWebhooksLoading(true);
    try {
      const res = await fetch('/api/webhooks');
      if (res.ok) {
        const data = await res.json();
        setWebhooks(data.data?.webhooks || []);
        setAvailableEvents(data.data?.available_events || []);
      }
    } catch (err) {
      console.error('Failed to fetch webhooks:', err);
    } finally {
      setWebhooksLoading(false);
    }
  };

  const createWebhook = async () => {
    if (!newWebhookName.trim() || !newWebhookUrl.trim() || newWebhookEvents.length === 0) return;
    setCreatingWebhook(true);
    try {
      const res = await fetch('/api/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newWebhookName.trim(),
          url: newWebhookUrl.trim(),
          events: newWebhookEvents,
          generate_secret: true,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.data?.secret) setNewWebhookSecret(data.data.secret);
        setNewWebhookName('');
        setNewWebhookUrl('');
        setNewWebhookEvents([]);
        setShowCreateWebhook(false);
        fetchWebhooks();
        showSuccess('Webhook created');
      } else {
        const data = await res.json();
        showError(data.error?.message || 'Failed to create webhook');
      }
    } catch {
      showError('Failed to create webhook');
    } finally {
      setCreatingWebhook(false);
    }
  };

  const toggleWebhook = async (webhookId: string, isActive: boolean) => {
    try {
      const res = await fetch('/api/webhooks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: webhookId, is_active: !isActive }),
      });
      if (res.ok) {
        fetchWebhooks();
        showSuccess(isActive ? 'Webhook disabled' : 'Webhook enabled');
      }
    } catch {
      showError('Failed to update webhook');
    }
  };

  const deleteWebhook = async (webhookId: string) => {
    try {
      const res = await fetch(`/api/webhooks?id=${webhookId}`, { method: 'DELETE' });
      if (res.ok) {
        fetchWebhooks();
        showSuccess('Webhook deleted');
      }
    } catch {
      showError('Failed to delete webhook');
    }
  };

  const testWebhook = async (webhookId: string) => {
    setTestingWebhookId(webhookId);
    try {
      const res = await fetch('/api/webhooks/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ webhook_id: webhookId }),
      });
      const data = await res.json();
      if (data.data?.success) {
        showSuccess(`Test ping sent (${data.data.status_code}, ${data.data.duration_ms}ms)`);
      } else {
        showError(`Test failed: ${data.data?.status_code || 'Connection error'}`);
      }
    } catch {
      showError('Failed to send test');
    } finally {
      setTestingWebhookId(null);
    }
  };

  // Data export function
  const handleExport = async (type: string, format: 'json' | 'csv') => {
    setExporting(`${type}-${format}`);
    try {
      const res = await fetch(`/api/export?type=${type}&format=${format}`);
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = res.headers.get('content-disposition')?.split('filename=')[1]?.replace(/"/g, '') || `export.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showSuccess(`${type} exported as ${format.toUpperCase()}`);
    } catch {
      showError('Export failed');
    } finally {
      setExporting(null);
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    try {
      const text = await file.text();
      const json = JSON.parse(text);

      // Auto-detect type from export format
      let type = '';
      let data: unknown[] = [];
      if (json.products) { type = 'products'; data = json.products; }
      else if (json.winners) { type = 'winners'; data = json.winners; }
      else if (Array.isArray(json) && json.length > 0) {
        if ('hook' in json[0]) { type = 'winners'; data = json; }
        else if ('name' in json[0]) { type = 'products'; data = json; }
      }

      if (!type || data.length === 0) {
        showError('Could not detect import type. File must contain products or winners data.');
        return;
      }

      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, data }),
      });
      const result = await res.json();
      if (result.ok) {
        setImportResult(result.data);
        showSuccess(`Imported ${result.data.imported} ${type}`);
      } else {
        showError(result.error?.message || 'Import failed');
      }
    } catch {
      showError('Failed to parse import file. Must be valid JSON.');
    } finally {
      setImporting(false);
      e.target.value = '';
    }
  };

  // Fetch API keys / webhooks when tab becomes active
  useEffect(() => {
    if (activeTab === 'api-keys') {
      fetchApiKeys();
    }
    if (activeTab === 'webhooks') {
      fetchWebhooks();
    }
  }, [activeTab]);

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
            <button type="button"
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
                <button type="button"
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
                {subscription?.periodEnd && (
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                    <span className="text-sm text-zinc-400 sm:w-32">Renews on</span>
                    <span className="text-zinc-200">{formatDate(subscription.periodEnd)}</span>
                  </div>
                )}
              </div>

              {/* Quick Actions */}
              <div className="mt-6 pt-4 border-t border-white/10 flex flex-wrap gap-3">
                <Link
                  href="/upgrade"
                  className="px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-500 text-sm font-medium"
                >
                  {isUnlimited ? 'Change Plan' : 'Upgrade Plan'}
                </Link>
                {subscription?.stripeCustomerId && (
                  <button type="button"
                    onClick={async () => {
                      try {
                        const res = await fetch('/api/subscriptions/portal', { method: 'POST' });
                        const data = await res.json();
                        if (data.url) window.location.href = data.url;
                      } catch {
                        showError('Failed to open billing portal');
                      }
                    }}
                    className="px-4 py-2 bg-zinc-800 text-zinc-200 rounded-lg hover:bg-zinc-700 border border-white/10 text-sm font-medium"
                  >
                    Manage Billing
                  </button>
                )}
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

              {/* Credit Usage Bar */}
              {!isUnlimited && credits && (
                <div className="mt-4">
                  <div className="flex justify-between text-sm text-zinc-400 mb-2">
                    <span>Credits remaining</span>
                    <span>{credits.remaining} / {(credits.remaining || 0) + (credits.usedThisPeriod || 0)}</span>
                  </div>
                  <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-violet-500 to-purple-500 rounded-full"
                      style={{
                        width: `${Math.min(100, ((credits.remaining || 0) / ((credits.remaining || 0) + (credits.usedThisPeriod || 0))) * 100)}%`
                      }}
                    />
                  </div>
                  {credits.remaining !== undefined && credits.remaining <= 5 && (
                    <p className="text-amber-400 text-sm mt-2">
                      Running low on credits! <Link href="/upgrade" className="underline">Upgrade now</Link>
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Buy Credits */}
            <div className="p-6 rounded-xl border border-white/10 bg-zinc-900/50">
              <h2 className="text-lg font-semibold text-white mb-4">Need More Credits?</h2>
              <p className="text-zinc-400 text-sm mb-4">Purchase additional credits without changing your plan.</p>
              <div className="grid sm:grid-cols-2 gap-3">
                {[
                  { id: 'starter_pack', name: 'Starter', credits: 50, price: '$4.99' },
                  { id: 'standard_pack', name: 'Standard', credits: 150, price: '$11.99', popular: true },
                  { id: 'pro_pack', name: 'Pro', credits: 500, price: '$29.99' },
                  { id: 'enterprise_pack', name: 'Enterprise', credits: 2000, price: '$99.99' },
                ].map(pack => (
                  <button type="button"
                    key={pack.id}
                    onClick={async () => {
                      try {
                        const res = await fetch('/api/credits/purchase', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ package_id: pack.id }),
                        });
                        const data = await res.json();
                        if (data.url) window.location.href = data.url;
                        else showError(data.error || 'Failed to start checkout');
                      } catch {
                        showError('Failed to start checkout');
                      }
                    }}
                    className={`p-4 rounded-lg border text-left transition-colors ${
                      pack.popular
                        ? 'border-violet-500/50 bg-violet-500/10 hover:bg-violet-500/20'
                        : 'border-white/10 hover:border-white/20 hover:bg-zinc-800/50'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-medium text-white">{pack.name}</div>
                        <div className="text-sm text-zinc-400">{pack.credits} credits</div>
                      </div>
                      <div className="text-lg font-bold text-white">{pack.price}</div>
                    </div>
                    {pack.popular && (
                      <span className="inline-block mt-2 px-2 py-0.5 text-xs bg-violet-500/20 text-violet-300 rounded">
                        Most Popular
                      </span>
                    )}
                  </button>
                ))}
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

        {/* API Keys Tab */}
        {activeTab === 'api-keys' && (
          <div className="space-y-6">
            {/* Create Key Section */}
            <div className="p-6 rounded-xl border border-white/10 bg-zinc-900/50">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-white">API Keys</h2>
                  <p className="text-sm text-zinc-400 mt-1">Create keys for machine-to-machine access to the FlashFlow API</p>
                </div>
                {!showCreateKey && !newKeyPlaintext && (
                  <button
                    type="button"
                    onClick={() => setShowCreateKey(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-500 text-sm font-medium"
                  >
                    <Plus className="w-4 h-4" />
                    Create Key
                  </button>
                )}
              </div>

              {/* New Key Plaintext Display */}
              {newKeyPlaintext && (
                <div className="p-4 rounded-lg border border-amber-500/30 bg-amber-500/10 mb-4">
                  <div className="flex items-start gap-3 mb-3">
                    <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-amber-300">Copy your API key now</p>
                      <p className="text-sm text-amber-400/80 mt-1">This key will only be shown once. Store it securely.</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 px-3 py-2 bg-zinc-900 border border-zinc-700 rounded text-sm text-zinc-200 font-mono break-all">
                      {newKeyPlaintext}
                    </code>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(newKeyPlaintext)}
                      className="flex items-center gap-1 px-3 py-2 bg-zinc-800 text-zinc-200 rounded hover:bg-zinc-700 border border-zinc-600 text-sm"
                    >
                      <Copy className="w-4 h-4" />
                      {copied ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setNewKeyPlaintext(null)}
                    className="mt-3 text-sm text-zinc-400 hover:text-zinc-200"
                  >
                    Done
                  </button>
                </div>
              )}

              {/* Create Key Form */}
              {showCreateKey && !newKeyPlaintext && (
                <div className="mb-4 space-y-3">
                  <div className="flex items-end gap-3">
                    <div className="flex-1">
                      <label className="block text-sm text-zinc-400 mb-1">Key Name</label>
                      <input
                        type="text"
                        placeholder="e.g. OpenClaw Production"
                        value={newKeyName}
                        onChange={(e) => setNewKeyName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && createApiKey()}
                        className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={createApiKey}
                      disabled={creatingKey || !newKeyName.trim()}
                      className="px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-500 text-sm font-medium disabled:opacity-50"
                    >
                      {creatingKey ? 'Creating...' : 'Create'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowCreateKey(false); setNewKeyName(''); setNewKeyScopes(['read']); }}
                      className="px-4 py-2 bg-zinc-800 text-zinc-400 rounded-lg hover:text-zinc-200 border border-zinc-700 text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                  <div>
                    <label className="block text-sm text-zinc-400 mb-2">Scopes</label>
                    <div className="flex gap-2">
                      {['read', 'write', 'admin'].map((scope) => {
                        const active = newKeyScopes.includes(scope);
                        return (
                          <button
                            key={scope}
                            type="button"
                            onClick={() => {
                              if (scope === 'read') return; // read is always required
                              setNewKeyScopes(prev =>
                                active ? prev.filter(s => s !== scope) : [...prev, scope]
                              );
                            }}
                            className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                              active
                                ? 'bg-violet-600/20 text-violet-300 border-violet-500/50'
                                : 'bg-zinc-800 text-zinc-500 border-zinc-700 hover:text-zinc-300 hover:border-zinc-600'
                            } ${scope === 'read' ? 'cursor-default' : 'cursor-pointer'}`}
                          >
                            {scope}{scope === 'read' ? ' (required)' : ''}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Keys List */}
              {apiKeysLoading ? (
                <div className="flex items-center gap-2 text-zinc-400 py-4">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading keys...
                </div>
              ) : apiKeys.length === 0 ? (
                <p className="text-zinc-500 text-sm py-4">No API keys yet. Create one to get started.</p>
              ) : (
                <div className="space-y-3">
                  {apiKeys.map(key => (
                    <div
                      key={key.id}
                      className={`flex items-center justify-between p-4 rounded-lg border ${
                        key.revoked_at
                          ? 'border-zinc-800 bg-zinc-900/30 opacity-60'
                          : 'border-white/10 bg-zinc-800/50'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-zinc-200">{key.name}</span>
                          {key.revoked_at && (
                            <span className="px-2 py-0.5 text-xs bg-red-500/20 text-red-400 rounded">Revoked</span>
                          )}
                          {key.scopes.map(scope => (
                            <span key={scope} className="px-2 py-0.5 text-xs bg-zinc-700 text-zinc-300 rounded">{scope}</span>
                          ))}
                        </div>
                        <div className="flex items-center gap-4 mt-1 text-xs text-zinc-500">
                          <span className="font-mono">{key.key_prefix}</span>
                          <span>Created {formatDate(key.created_at)}</span>
                          {key.last_used_at && <span>Last used {formatDate(key.last_used_at)}</span>}
                        </div>
                      </div>
                      {!key.revoked_at && (
                        <button
                          type="button"
                          onClick={() => revokeApiKey(key.id)}
                          disabled={revokingId === key.id}
                          className="flex items-center gap-1 px-3 py-1.5 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg border border-transparent hover:border-red-500/20 disabled:opacity-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          {revokingId === key.id ? 'Revoking...' : 'Revoke'}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Usage Info */}
            <div className="p-4 rounded-xl border border-white/10 bg-zinc-900/30">
              <h3 className="text-sm font-medium text-zinc-300 mb-2">Usage</h3>
              <p className="text-xs text-zinc-500 mb-2">Include your API key in the Authorization header:</p>
              <code className="block px-3 py-2 bg-zinc-900 border border-zinc-800 rounded text-xs text-zinc-400 font-mono">
                curl -H &quot;Authorization: Bearer ff_ak_your_key_here&quot; https://your-domain/api/products
              </code>
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
              <h2 className="text-lg font-semibold text-white mb-4">Posting Schedule</h2>
              <p className="text-sm text-zinc-500 mb-4">Configure your default posting cadence for auto-scheduling</p>
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                  <span className="text-sm text-zinc-400 sm:w-40">Videos per day</span>
                  <select
                    value={settings.posting?.videos_per_day || 1}
                    onChange={(e) => updateSettings({ posting: { ...(settings.posting || { posting_time_1: '09:00', posting_time_2: '18:00' }), videos_per_day: parseInt(e.target.value) } })}
                    className="flex-1 max-w-xs px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                  >
                    <option value="1">1 video per day</option>
                    <option value="2">2 videos per day</option>
                    <option value="3">3 videos per day</option>
                    <option value="4">4 videos per day</option>
                  </select>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                  <span className="text-sm text-zinc-400 sm:w-40">Posting time 1</span>
                  <input
                    type="time"
                    value={settings.posting?.posting_time_1 || '09:00'}
                    onChange={(e) => updateSettings({ posting: { ...(settings.posting || { videos_per_day: 1, posting_time_2: '18:00' }), posting_time_1: e.target.value } })}
                    className="flex-1 max-w-xs px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                  <span className="text-sm text-zinc-400 sm:w-40">Posting time 2</span>
                  <input
                    type="time"
                    value={settings.posting?.posting_time_2 || '18:00'}
                    onChange={(e) => updateSettings({ posting: { ...(settings.posting || { videos_per_day: 1, posting_time_1: '09:00' }), posting_time_2: e.target.value } })}
                    className="flex-1 max-w-xs px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>
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
                    <button type="button"
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

        {/* Webhooks Tab */}
        {activeTab === 'webhooks' && (
          <div className="space-y-6">
            <div className="p-6 rounded-xl border border-white/10 bg-zinc-900/50">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-white">Webhooks</h2>
                  <p className="text-sm text-zinc-400 mt-1">Receive real-time HTTP callbacks when events occur</p>
                </div>
                {!showCreateWebhook && (
                  <button
                    type="button"
                    onClick={() => setShowCreateWebhook(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-500 text-sm font-medium"
                  >
                    <Plus className="w-4 h-4" />
                    Add Webhook
                  </button>
                )}
              </div>

              {/* Secret display */}
              {newWebhookSecret && (
                <div className="p-4 rounded-lg border border-amber-500/30 bg-amber-500/10 mb-4">
                  <div className="flex items-start gap-3 mb-3">
                    <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-amber-300">Copy your webhook signing secret</p>
                      <p className="text-sm text-amber-400/80 mt-1">Use this to verify webhook payloads. It won&apos;t be shown again.</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 px-3 py-2 bg-zinc-900 border border-zinc-700 rounded text-sm text-zinc-200 font-mono break-all">
                      {newWebhookSecret}
                    </code>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(newWebhookSecret)}
                      className="flex items-center gap-1 px-3 py-2 bg-zinc-800 text-zinc-200 rounded hover:bg-zinc-700 border border-zinc-600 text-sm"
                    >
                      <Copy className="w-4 h-4" />
                      {copied ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => setNewWebhookSecret(null)}
                    className="mt-3 text-sm text-zinc-400 hover:text-zinc-200"
                  >
                    Done
                  </button>
                </div>
              )}

              {/* Create Webhook Form */}
              {showCreateWebhook && (
                <div className="mb-6 p-4 rounded-lg border border-white/10 bg-zinc-800/50 space-y-3">
                  <div>
                    <label className="block text-sm text-zinc-400 mb-1">Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Production Alerts"
                      value={newWebhookName}
                      onChange={(e) => setNewWebhookName(e.target.value)}
                      className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-zinc-400 mb-1">Endpoint URL</label>
                    <input
                      type="url"
                      placeholder="https://example.com/webhook"
                      value={newWebhookUrl}
                      onChange={(e) => setNewWebhookUrl(e.target.value)}
                      className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-zinc-400 mb-2">Events</label>
                    <div className="flex flex-wrap gap-2">
                      {availableEvents.map((evt) => {
                        const selected = newWebhookEvents.includes(evt);
                        return (
                          <button
                            key={evt}
                            type="button"
                            onClick={() => {
                              setNewWebhookEvents(prev =>
                                selected ? prev.filter(e => e !== evt) : [...prev, evt]
                              );
                            }}
                            className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                              selected
                                ? 'bg-violet-600/20 text-violet-300 border-violet-500/50'
                                : 'bg-zinc-800 text-zinc-500 border-zinc-700 hover:text-zinc-300 hover:border-zinc-600'
                            }`}
                          >
                            {evt}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pt-2">
                    <button
                      type="button"
                      onClick={createWebhook}
                      disabled={creatingWebhook || !newWebhookName.trim() || !newWebhookUrl.trim() || newWebhookEvents.length === 0}
                      className="px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-500 text-sm font-medium disabled:opacity-50"
                    >
                      {creatingWebhook ? 'Creating...' : 'Create Webhook'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowCreateWebhook(false); setNewWebhookName(''); setNewWebhookUrl(''); setNewWebhookEvents([]); }}
                      className="px-4 py-2 bg-zinc-800 text-zinc-400 rounded-lg hover:text-zinc-200 border border-zinc-700 text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Webhooks List */}
              {webhooksLoading ? (
                <div className="flex items-center gap-2 text-zinc-400 py-4">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading webhooks...
                </div>
              ) : webhooks.length === 0 ? (
                <p className="text-zinc-500 text-sm py-4">No webhooks configured. Add one to receive real-time event notifications.</p>
              ) : (
                <div className="space-y-3">
                  {webhooks.map(wh => (
                    <div
                      key={wh.id}
                      className={`p-4 rounded-lg border ${
                        wh.is_active
                          ? 'border-white/10 bg-zinc-800/50'
                          : 'border-zinc-800 bg-zinc-900/30 opacity-60'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-medium text-zinc-200">{wh.name}</span>
                            {!wh.is_active && (
                              <span className="px-2 py-0.5 text-xs bg-zinc-700 text-zinc-400 rounded">Disabled</span>
                            )}
                            {wh.failure_count > 0 && wh.is_active && (
                              <span className="px-2 py-0.5 text-xs bg-amber-500/20 text-amber-400 rounded">{wh.failure_count} failures</span>
                            )}
                          </div>
                          <p className="text-xs text-zinc-500 font-mono truncate">{wh.url}</p>
                          <div className="flex flex-wrap gap-1 mt-2">
                            {wh.events.map(evt => (
                              <span key={evt} className="px-2 py-0.5 text-[10px] bg-zinc-700/50 text-zinc-400 rounded">{evt}</span>
                            ))}
                          </div>
                          {wh.last_triggered_at && (
                            <p className="text-[11px] text-zinc-600 mt-2">
                              Last triggered: {new Date(wh.last_triggered_at).toLocaleString()} (HTTP {wh.last_status_code})
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => testWebhook(wh.id)}
                            disabled={testingWebhookId === wh.id}
                            title="Send test ping"
                            className="p-2 text-zinc-400 hover:text-teal-400 hover:bg-teal-500/10 rounded-lg disabled:opacity-50"
                          >
                            {testingWebhookId === wh.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleWebhook(wh.id, wh.is_active)}
                            title={wh.is_active ? 'Disable' : 'Enable'}
                            className="p-2 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 rounded-lg"
                          >
                            {wh.is_active ? <ToggleRight className="w-4 h-4 text-green-400" /> : <ToggleLeft className="w-4 h-4" />}
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteWebhook(wh.id)}
                            title="Delete"
                            className="p-2 text-zinc-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Webhook Docs */}
            <div className="p-4 rounded-xl border border-white/10 bg-zinc-900/30">
              <h3 className="text-sm font-medium text-zinc-300 mb-2">Payload Format</h3>
              <p className="text-xs text-zinc-500 mb-2">Each webhook delivery sends a JSON POST with this structure:</p>
              <code className="block px-3 py-2 bg-zinc-900 border border-zinc-800 rounded text-xs text-zinc-400 font-mono whitespace-pre">{`{
  "event": "video.status_changed",
  "timestamp": "2026-02-10T12:00:00Z",
  "data": { ... }
}`}</code>
              <p className="text-xs text-zinc-500 mt-2">Verify payloads using the <code className="text-zinc-400">X-Webhook-Signature</code> header (HMAC SHA-256).</p>
            </div>
          </div>
        )}

        {/* Data Tab */}
        {activeTab === 'data' && (
          <div className="space-y-6">
            {/* Export Section */}
            <div className="p-6 rounded-xl border border-white/10 bg-zinc-900/50">
              <h2 className="text-lg font-semibold text-white mb-1">Export Data</h2>
              <p className="text-sm text-zinc-400 mb-4">Download your data in JSON or CSV format</p>
              <div className="space-y-3">
                {EXPORT_TYPES.map((et) => (
                  <div key={et.id} className="flex items-center justify-between p-3 rounded-lg border border-white/5 bg-zinc-800/30">
                    <div>
                      <span className="text-sm font-medium text-zinc-200">{et.label}</span>
                      <p className="text-xs text-zinc-500">{et.description}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleExport(et.id, 'json')}
                        disabled={exporting === `${et.id}-json`}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-zinc-700 text-zinc-200 rounded-lg hover:bg-zinc-600 disabled:opacity-50"
                      >
                        {exporting === `${et.id}-json` ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                        JSON
                      </button>
                      <button
                        type="button"
                        onClick={() => handleExport(et.id, 'csv')}
                        disabled={exporting === `${et.id}-csv`}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-zinc-700 text-zinc-200 rounded-lg hover:bg-zinc-600 disabled:opacity-50"
                      >
                        {exporting === `${et.id}-csv` ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                        CSV
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Import Section */}
            <div className="p-6 rounded-xl border border-white/10 bg-zinc-900/50">
              <h2 className="text-lg font-semibold text-white mb-1">Import Data</h2>
              <p className="text-sm text-zinc-400 mb-4">Restore from a JSON export file (products or winners)</p>

              <label className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-zinc-700 rounded-xl hover:border-zinc-500 cursor-pointer transition-colors">
                <Upload className="w-8 h-8 text-zinc-500 mb-2" />
                <span className="text-sm text-zinc-400">
                  {importing ? 'Importing...' : 'Click to select a JSON file'}
                </span>
                <input
                  type="file"
                  accept=".json"
                  onChange={handleImportFile}
                  disabled={importing}
                  className="hidden"
                />
              </label>

              {importResult && (
                <div className="mt-4 p-3 rounded-lg bg-teal-500/10 border border-teal-500/20">
                  <p className="text-sm text-teal-300">
                    Import complete: <strong>{importResult.imported}</strong> imported, <strong>{importResult.skipped}</strong> skipped
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
    </div>
  );
}
