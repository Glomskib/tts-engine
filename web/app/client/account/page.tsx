'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useSearchParams } from 'next/navigation';
import ClientNav from '../components/ClientNav';
import { EffectiveOrgBranding, getDefaultOrgBranding } from '@/lib/org-branding';

interface DiscordStatus {
  connected: boolean;
  discord?: {
    username: string;
    linked_at: string;
    last_role_sync: string | null;
  };
}

export default function ClientAccountPage() {
  const { user } = useAuth();
  const authUser = { id: user?.id || '', email: user?.email || null };
  const searchParams = useSearchParams();
  const [branding, setBranding] = useState<EffectiveOrgBranding | null>(null);
  const [discord, setDiscord] = useState<DiscordStatus | null>(null);
  const [discordLoading, setDiscordLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);
  const [flash, setFlash] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Flash messages from OAuth redirects
  useEffect(() => {
    const discordParam = searchParams.get('discord');
    if (!discordParam) return;

    const messages: Record<string, { type: 'success' | 'error'; message: string }> = {
      connected: { type: 'success', message: 'Discord account connected successfully.' },
      denied: { type: 'error', message: 'Discord authorization was denied.' },
      already_linked: { type: 'error', message: 'That Discord account is already linked to another FlashFlow account.' },
      invalid_state: { type: 'error', message: 'Invalid OAuth state. Please try again.' },
      unauthorized: { type: 'error', message: 'You must be logged in to connect Discord.' },
      token_error: { type: 'error', message: 'Failed to exchange Discord token. Please try again.' },
      user_error: { type: 'error', message: 'Failed to get Discord user info. Please try again.' },
      save_error: { type: 'error', message: 'Failed to save Discord link. Please try again.' },
    };

    setFlash(messages[discordParam] || { type: 'error', message: 'An unknown error occurred.' });

    // Clear the query param from URL without reload
    window.history.replaceState({}, '', '/client/account');
  }, [searchParams]);

  // Fetch branding
  useEffect(() => {
    const fetchBranding = async () => {
      try {
        const res = await fetch('/api/client/branding');
        const data = await res.json();
        if (res.ok && data.ok && data.data?.branding) {
          setBranding(data.data.branding);
        } else {
          setBranding(getDefaultOrgBranding());
        }
      } catch {
        setBranding(getDefaultOrgBranding());
      }
    };
    fetchBranding();
  }, []);

  // Fetch Discord status
  const fetchDiscordStatus = useCallback(async () => {
    setDiscordLoading(true);
    try {
      const res = await fetch('/api/integrations/discord/status');
      const data = await res.json();
      setDiscord(data);
    } catch {
      setDiscord({ connected: false });
    } finally {
      setDiscordLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDiscordStatus();
  }, [fetchDiscordStatus]);

  const handleDisconnect = async () => {
    if (!confirm('Are you sure you want to disconnect your Discord account? Your roles will be removed.')) {
      return;
    }

    setDisconnecting(true);
    try {
      const res = await fetch('/api/integrations/discord/disconnect', { method: 'DELETE' });
      if (res.ok) {
        setDiscord({ connected: false });
        setFlash({ type: 'success', message: 'Discord account disconnected.' });
      } else {
        setFlash({ type: 'error', message: 'Failed to disconnect Discord. Please try again.' });
      }
    } catch {
      setFlash({ type: 'error', message: 'Failed to disconnect Discord. Please try again.' });
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        <ClientNav userName={authUser.email || undefined} branding={branding} />

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-slate-800">Account</h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage your account settings and integrations.
          </p>
        </div>

        {/* Flash message */}
        {flash && (
          <div
            className={`mb-4 px-4 py-3 rounded-md text-sm ${
              flash.type === 'success'
                ? 'bg-green-50 text-green-800 border border-green-200'
                : 'bg-red-50 text-red-800 border border-red-200'
            }`}
          >
            {flash.message}
            <button
              onClick={() => setFlash(null)}
              className="float-right text-current opacity-50 hover:opacity-100"
            >
              &times;
            </button>
          </div>
        )}

        {/* Account Info */}
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-6 mb-6">
          <h2 className="text-lg font-medium text-slate-800 mb-4">Account Info</h2>
          <div className="text-sm text-slate-600">
            <span className="font-medium text-slate-700">Email:</span>{' '}
            {authUser.email || 'Not available'}
          </div>
        </div>

        {/* Discord Integration */}
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-6">
          <h2 className="text-lg font-medium text-slate-800 mb-4">Discord Integration</h2>

          {discordLoading ? (
            <div className="text-sm text-slate-500">Loading...</div>
          ) : discord?.connected ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
                <span className="text-sm font-medium text-slate-700">Connected</span>
              </div>
              <div className="text-sm text-slate-600">
                <span className="font-medium text-slate-700">Username:</span>{' '}
                {discord.discord?.username}
              </div>
              <div className="text-sm text-slate-600">
                <span className="font-medium text-slate-700">Linked:</span>{' '}
                {discord.discord?.linked_at
                  ? new Date(discord.discord.linked_at).toLocaleDateString()
                  : 'Unknown'}
              </div>
              {discord.discord?.last_role_sync && (
                <div className="text-sm text-slate-600">
                  <span className="font-medium text-slate-700">Last role sync:</span>{' '}
                  {new Date(discord.discord.last_role_sync).toLocaleString()}
                </div>
              )}
              <button
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="mt-2 px-4 py-2 text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-md hover:bg-red-100 transition-colors disabled:opacity-50"
              >
                {disconnecting ? 'Disconnecting...' : 'Disconnect Discord'}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">
                Connect your Discord account to get roles in the FlashFlow server based on your plan.
              </p>
              <a
                href="/api/integrations/discord/connect"
                className="inline-block px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 transition-colors"
              >
                Connect Discord
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
