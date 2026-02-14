'use client';

import { useState, useEffect, useCallback } from 'react';
import AdminPageLayout, { AdminCard, AdminButton } from '../../components/AdminPageLayout';
import { useToast } from '@/contexts/ToastContext';
import {
  ShoppingBag,
  Check,
  Loader2,
  AlertTriangle,
  ExternalLink,
  RefreshCw,
  Unlink,
  Package,
  DollarSign,
  Store,
  Globe,
  Video,
  Link2,
  User,
} from 'lucide-react';

interface ConnectionStatus {
  app_configured: boolean;
  connected: boolean;
  token_expired: boolean;
  shop_name: string | null;
  shop_id: string | null;
  seller_name: string | null;
  seller_region: string | null;
  status: string;
  last_synced_at: string | null;
  last_error: string | null;
  authorize_url: string | null;
}

interface TikTokProduct {
  id: string;
  title: string;
  status: string;
  images?: { url: string }[];
  skus?: {
    id: string;
    price: { amount: string; currency: string };
    inventory?: { quantity: number };
  }[];
}

// ---------------------------------------------------------------------------
// Content Posting Section (separate from Shop)
// ---------------------------------------------------------------------------

interface ContentAccount {
  account_id: string;
  account_name: string;
  account_handle: string;
  content_connection: {
    status: string;
    display_name: string | null;
    privacy_level: string | null;
    token_expires_at: string | null;
    last_error: string | null;
  } | null;
}

function ContentPostingSection() {
  const { showSuccess, showError } = useToast();
  const [accounts, setAccounts] = useState<ContentAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [appConfigured, setAppConfigured] = useState(false);
  const [connecting, setConnecting] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('content_connected') === 'true') {
      showSuccess('TikTok Content Posting connected successfully!');
      window.history.replaceState({}, '', '/admin/settings/tiktok');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetch('/api/tiktok-content/status')
      .then(res => res.json())
      .then(json => {
        if (json.ok) {
          setAccounts(json.data.accounts || []);
          setAppConfigured(json.data.app_configured);
        }
      })
      .catch(() => showError('Failed to load content posting status'))
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleConnect = (accountId: string) => {
    setConnecting(accountId);
    window.location.href = `/api/tiktok-content/connect?account_id=${accountId}`;
  };

  if (loading) {
    return (
      <AdminCard title="Content Posting" subtitle="Auto-post videos to TikTok via Content Posting API">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
          <span className="ml-2 text-sm text-zinc-500">Loading...</span>
        </div>
      </AdminCard>
    );
  }

  return (
    <AdminCard
      title="Content Posting"
      subtitle="Auto-post videos to TikTok via Content Posting API (separate from Shop)"
    >
      <div className="space-y-4">
        {!appConfigured && (
          <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-300">
              Content Posting API not configured. Set{' '}
              <code className="px-1.5 py-0.5 rounded bg-zinc-800 text-amber-200 font-mono text-xs">
                TIKTOK_CONTENT_APP_KEY
              </code>{' '}
              and{' '}
              <code className="px-1.5 py-0.5 rounded bg-zinc-800 text-amber-200 font-mono text-xs">
                TIKTOK_CONTENT_APP_SECRET
              </code>{' '}
              in Vercel environment variables.
            </p>
          </div>
        )}

        <div className="text-xs text-zinc-500 mb-2">
          Connect your TikTok posting accounts to enable auto-posting. Videos at READY_TO_POST will be submitted automatically every 15 minutes.
        </div>

        {accounts.length === 0 ? (
          <div className="text-center py-6">
            <Video className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
            <p className="text-sm text-zinc-500">No TikTok accounts found.</p>
            <p className="text-xs text-zinc-600 mt-1">
              Add TikTok accounts first (they are managed separately from Shop connections).
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {accounts.map((account) => {
              const conn = account.content_connection;
              const isConnected = conn?.status === 'active';
              const isExpired = conn?.status === 'expired';

              return (
                <div
                  key={account.account_id}
                  className="flex items-center gap-3 px-4 py-3 rounded-lg bg-zinc-900 border border-zinc-700"
                >
                  <div
                    className={`w-3 h-3 rounded-full shrink-0 ${
                      isConnected
                        ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]'
                        : isExpired
                          ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.4)]'
                          : 'bg-zinc-600'
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-zinc-200">
                      {account.account_name}
                    </div>
                    <div className="text-xs text-zinc-500">
                      {account.account_handle}
                      {isConnected && conn?.display_name && ` — ${conn.display_name}`}
                      {isConnected && conn?.privacy_level && (
                        <span className="ml-2 text-zinc-600">
                          ({conn.privacy_level.replace(/_/g, ' ').toLowerCase()})
                        </span>
                      )}
                    </div>
                    {conn?.last_error && (
                      <div className="text-xs text-red-400 mt-1">{conn.last_error}</div>
                    )}
                    {isExpired && (
                      <div className="text-xs text-amber-400 mt-1">Token expired — reconnect to refresh</div>
                    )}
                    {isConnected && conn?.token_expires_at && (
                      <div className="text-xs text-zinc-600 mt-1">
                        Token expires: {new Date(conn.token_expires_at).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                  {isConnected ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-full">
                      <Check className="w-3 h-3" />
                      Connected
                    </span>
                  ) : appConfigured ? (
                    <AdminButton
                      variant="secondary"
                      onClick={() => handleConnect(account.account_id)}
                      disabled={connecting === account.account_id}
                    >
                      {connecting === account.account_id ? (
                        <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                      ) : (
                        <Link2 className="w-4 h-4 mr-1" />
                      )}
                      {isExpired ? 'Reconnect' : 'Connect'}
                    </AdminButton>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}

        <div className="pt-2 text-xs text-zinc-600">
          Note: Posts will be <span className="text-zinc-400 font-medium">SELF_ONLY</span> (private) until the TikTok developer app passes audit review (1-2 weeks).
        </div>
      </div>
    </AdminCard>
  );
}

// ---------------------------------------------------------------------------
// TikTok Login Kit Section
// ---------------------------------------------------------------------------

interface LoginConnection {
  open_id: string;
  display_name: string | null;
  avatar_url: string | null;
  token_expires_at: string | null;
  status: string;
  last_error: string | null;
}

function TikTokLoginSection() {
  const { showSuccess, showError } = useToast();
  const [loading, setLoading] = useState(true);
  const [appConfigured, setAppConfigured] = useState(false);
  const [connected, setConnected] = useState(false);
  const [connection, setConnection] = useState<LoginConnection | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('login_connected') === 'true') {
      showSuccess('TikTok Login connected successfully!');
      window.history.replaceState({}, '', '/admin/settings/tiktok');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchStatus = useCallback(() => {
    fetch('/api/tiktok/status')
      .then(res => res.json())
      .then(json => {
        if (json.ok) {
          setAppConfigured(json.data.app_configured);
          setConnected(json.data.connected);
          setConnection(json.data.connection);
        }
      })
      .catch(() => showError('Failed to load TikTok Login status'))
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleConnect = () => {
    setConnecting(true);
    window.location.href = '/api/tiktok/connect';
  };

  const handleDisconnect = async () => {
    if (!confirm('Are you sure you want to disconnect your TikTok Login?')) return;
    setDisconnecting(true);
    try {
      const res = await fetch('/api/tiktok/disconnect', { method: 'POST' });
      const json = await res.json();
      if (json.ok) {
        showSuccess('TikTok Login disconnected');
        setConnected(false);
        setConnection(null);
      } else {
        showError(json.error || 'Failed to disconnect');
      }
    } catch {
      showError('Failed to disconnect');
    } finally {
      setDisconnecting(false);
    }
  };

  if (loading) {
    return (
      <AdminCard title="TikTok Login" subtitle="Link your TikTok identity via Login Kit">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
          <span className="ml-2 text-sm text-zinc-500">Loading...</span>
        </div>
      </AdminCard>
    );
  }

  return (
    <AdminCard
      title="TikTok Login"
      subtitle="Link your TikTok identity via Login Kit (basic profile data)"
    >
      <div className="space-y-4">
        {!appConfigured && (
          <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-300">
              TikTok Login Kit not configured. Set{' '}
              <code className="px-1.5 py-0.5 rounded bg-zinc-800 text-amber-200 font-mono text-xs">
                TIKTOK_CLIENT_KEY
              </code>
              ,{' '}
              <code className="px-1.5 py-0.5 rounded bg-zinc-800 text-amber-200 font-mono text-xs">
                TIKTOK_CLIENT_SECRET
              </code>
              , and{' '}
              <code className="px-1.5 py-0.5 rounded bg-zinc-800 text-amber-200 font-mono text-xs">
                TIKTOK_REDIRECT_URI
              </code>{' '}
              in Vercel environment variables.
            </p>
          </div>
        )}

        {connected && connection ? (
          <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-zinc-900 border border-zinc-700">
            <div className="w-3 h-3 rounded-full shrink-0 bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]" />
            {connection.avatar_url ? (
              <img
                src={connection.avatar_url}
                alt=""
                className="w-8 h-8 rounded-full object-cover bg-zinc-800"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center">
                <User className="w-4 h-4 text-zinc-600" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-zinc-200">
                {connection.display_name || 'TikTok User'}
              </div>
              <div className="text-xs text-zinc-500">
                open_id: {connection.open_id}
              </div>
              {connection.token_expires_at && (
                <div className="text-xs text-zinc-600 mt-0.5">
                  Token expires: {new Date(connection.token_expires_at).toLocaleDateString()}
                </div>
              )}
              {connection.last_error && (
                <div className="text-xs text-red-400 mt-1">{connection.last_error}</div>
              )}
            </div>
            <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-full">
              <Check className="w-3 h-3" />
              Connected
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-zinc-900 border border-zinc-700">
            <div className="w-3 h-3 rounded-full shrink-0 bg-zinc-600" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-zinc-400">Not connected</div>
              <div className="text-xs text-zinc-600">
                Connect your TikTok account to link your identity.
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center gap-3 pt-1">
          {!connected && appConfigured && (
            <AdminButton onClick={handleConnect} disabled={connecting}>
              {connecting ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <Link2 className="w-4 h-4 mr-1" />
              )}
              Connect TikTok
            </AdminButton>
          )}
          {connected && (
            <AdminButton
              variant="secondary"
              onClick={handleDisconnect}
              disabled={disconnecting}
            >
              {disconnecting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Unlink className="w-4 h-4 mr-2" />
              )}
              {disconnecting ? 'Disconnecting...' : 'Disconnect'}
            </AdminButton>
          )}
        </div>
      </div>
    </AdminCard>
  );
}

export default function TikTokShopSettingsPage() {
  const { showSuccess, showError } = useToast();
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);
  const [products, setProducts] = useState<TikTokProduct[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{
    total_fetched: number;
    synced: number;
    created: number;
    updated: number;
    skipped: number;
  } | null>(null);

  // Check URL params for callback results
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('connected') === 'true') {
      showSuccess('TikTok Shop connected successfully!');
      // Clean URL
      window.history.replaceState({}, '', '/admin/settings/tiktok');
    }
    const error = params.get('error');
    if (error) {
      showError(`Connection error: ${decodeURIComponent(error)}`);
      window.history.replaceState({}, '', '/admin/settings/tiktok');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/tiktok-shop/status');
      const json = await res.json();
      if (json.ok) {
        setStatus(json.data);
      } else {
        showError('Failed to load TikTok Shop status');
      }
    } catch {
      showError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleConnect = () => {
    if (status?.authorize_url) {
      window.location.href = status.authorize_url;
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Are you sure you want to disconnect TikTok Shop?')) return;
    setDisconnecting(true);
    try {
      const res = await fetch('/api/tiktok-shop/disconnect', { method: 'POST' });
      const json = await res.json();
      if (json.ok) {
        showSuccess('TikTok Shop disconnected');
        setProducts([]);
        fetchStatus();
      } else {
        showError(json.error || 'Failed to disconnect');
      }
    } catch {
      showError('Failed to disconnect');
    } finally {
      setDisconnecting(false);
    }
  };

  const fetchProducts = async () => {
    setProductsLoading(true);
    try {
      const res = await fetch('/api/tiktok-shop/products?page_size=50');
      const json = await res.json();
      if (json.ok) {
        setProducts(json.data?.products || []);
      } else {
        showError(json.error || 'Failed to fetch products');
      }
    } catch {
      showError('Failed to fetch products');
    } finally {
      setProductsLoading(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch('/api/tiktok-shop/sync', { method: 'POST' });
      const json = await res.json();
      if (json.ok) {
        setSyncResult(json.data);
        showSuccess(
          `Synced ${json.data.synced} products from TikTok Shop (${json.data.created} new, ${json.data.updated} updated)`
        );
        // Also refresh the product preview
        fetchProducts();
        fetchStatus();
      } else {
        showError(json.error || 'Sync failed');
      }
    } catch {
      showError('Failed to sync products');
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return (
      <AdminPageLayout
        title="TikTok Shop"
        subtitle="Connect your TikTok Shop for product sync and analytics"
      >
        <AdminCard>
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
            <span className="ml-3 text-zinc-500">Loading configuration...</span>
          </div>
        </AdminCard>
      </AdminPageLayout>
    );
  }

  const isConnected = status?.connected ?? false;
  const isConfigured = status?.app_configured ?? false;

  return (
    <AdminPageLayout
      title="TikTok Shop"
      subtitle="Connect your TikTok Shop for product sync and analytics"
      headerActions={
        isConnected ? (
          <AdminButton variant="secondary" onClick={handleSync} disabled={syncing}>
            <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
            Sync Products
          </AdminButton>
        ) : undefined
      }
    >
      {/* TikTok Login Kit */}
      <TikTokLoginSection />

      {/* Connection Status */}
      <AdminCard title="Connection Status">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div
              className={`w-3 h-3 rounded-full ${
                isConnected
                  ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]'
                  : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.4)]'
              }`}
            />
            <span className="text-sm font-medium text-zinc-100">
              {isConnected
                ? 'TikTok Shop is connected'
                : 'TikTok Shop is not connected'}
            </span>
          </div>

          {/* Connection Details */}
          {isConnected && status && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-zinc-900 border border-zinc-700">
                <Store className="w-5 h-5 text-zinc-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-zinc-300">Shop</div>
                  <div className="text-xs text-zinc-500 truncate">
                    {status.shop_name || status.shop_id || 'Unknown'}
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-full">
                  <Check className="w-3 h-3" />
                  Active
                </span>
              </div>

              <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-zinc-900 border border-zinc-700">
                <Globe className="w-5 h-5 text-zinc-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-zinc-300">Seller</div>
                  <div className="text-xs text-zinc-500 truncate">
                    {status.seller_name || 'Unknown'} ({status.seller_region || '?'})
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Token Expired Warning */}
          {status?.token_expired && (
            <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-sm text-amber-300">
                Your access token has expired. Reconnect to refresh your credentials.
              </p>
            </div>
          )}

          {/* Last Error */}
          {status?.last_error && (
            <div className="flex items-start gap-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
              <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-300">Last Error</p>
                <p className="text-xs text-red-400/80 mt-1">{status.last_error}</p>
              </div>
            </div>
          )}

          {/* Not Configured */}
          {!isConfigured && (
            <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-sm text-amber-300">
                TikTok Shop is not configured. Set{' '}
                <code className="px-1.5 py-0.5 rounded bg-zinc-800 text-amber-200 font-mono text-xs">
                  TIKTOK_SHOP_APP_KEY
                </code>{' '}
                and{' '}
                <code className="px-1.5 py-0.5 rounded bg-zinc-800 text-amber-200 font-mono text-xs">
                  TIKTOK_SHOP_APP_SECRET
                </code>{' '}
                in your Vercel environment variables.
              </p>
            </div>
          )}

          {/* Connect / Disconnect Button */}
          <div className="flex items-center gap-3 pt-2">
            {!isConnected && isConfigured && (
              <AdminButton onClick={handleConnect}>
                <ShoppingBag className="w-4 h-4 mr-2" />
                Connect TikTok Shop
              </AdminButton>
            )}
            {isConnected && (
              <AdminButton
                variant="secondary"
                onClick={handleDisconnect}
                disabled={disconnecting}
              >
                {disconnecting ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Unlink className="w-4 h-4 mr-2" />
                )}
                {disconnecting ? 'Disconnecting...' : 'Disconnect'}
              </AdminButton>
            )}
            {status?.last_synced_at && (
              <span className="text-xs text-zinc-500">
                Last synced: {new Date(status.last_synced_at).toLocaleString()}
              </span>
            )}
          </div>
        </div>
      </AdminCard>

      {/* Products */}
      {/* Sync Result Banner */}
      {syncResult && (
        <div className="p-4 rounded-xl border border-teal-500/20 bg-teal-500/10">
          <div className="flex items-center gap-3">
            <Check className="w-5 h-5 text-teal-400 shrink-0" />
            <div>
              <p className="text-sm font-medium text-teal-300">
                Synced {syncResult.synced} products from TikTok Shop
              </p>
              <p className="text-xs text-teal-400/70 mt-0.5">
                {syncResult.created} created, {syncResult.updated} updated
                {syncResult.skipped > 0 ? `, ${syncResult.skipped} skipped` : ''}
                {' '}&middot; {syncResult.total_fetched} total in shop
              </p>
            </div>
          </div>
        </div>
      )}

      {isConnected && (
        <AdminCard
          title="Shop Products"
          subtitle="Products synced from your TikTok Shop"
        >
          {productsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
              <span className="ml-2 text-sm text-zinc-500">
                Fetching products from TikTok Shop...
              </span>
            </div>
          ) : products.length === 0 ? (
            <div className="text-center py-8">
              <Package className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
              <p className="text-sm text-zinc-500">No products loaded yet.</p>
              <p className="text-xs text-zinc-600 mt-1">
                Click &quot;Sync Products&quot; to fetch your shop catalog.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="text-xs text-zinc-500 mb-3">
                {products.length} product{products.length !== 1 ? 's' : ''} loaded
              </div>
              <div className="overflow-x-auto -mx-4 sm:mx-0">
                <table className="w-full text-xs sm:text-sm min-w-[500px]">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="px-4 py-2 text-left font-medium text-zinc-500">
                        Product
                      </th>
                      <th className="px-4 py-2 text-center font-medium text-zinc-500">
                        Status
                      </th>
                      <th className="px-4 py-2 text-right font-medium text-zinc-500">
                        Price
                      </th>
                      <th className="px-4 py-2 text-right font-medium text-zinc-500">
                        Stock
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((product) => {
                      const firstSku = product.skus?.[0];
                      const price = firstSku?.price;
                      const stock = firstSku?.inventory?.quantity;
                      const statusColor =
                        product.status === 'LIVE'
                          ? 'text-emerald-400 bg-emerald-500/10'
                          : product.status === 'DRAFT'
                            ? 'text-zinc-400 bg-zinc-500/10'
                            : 'text-amber-400 bg-amber-500/10';

                      return (
                        <tr
                          key={product.id}
                          className="border-b border-white/5 hover:bg-white/[0.02]"
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              {product.images?.[0]?.url ? (
                                <img
                                  src={product.images[0].url}
                                  alt=""
                                  className="w-8 h-8 rounded object-cover bg-zinc-800"
                                />
                              ) : (
                                <div className="w-8 h-8 rounded bg-zinc-800 flex items-center justify-center">
                                  <Package className="w-4 h-4 text-zinc-600" />
                                </div>
                              )}
                              <span className="text-zinc-200 font-medium truncate max-w-[200px]">
                                {product.title}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span
                              className={`px-2 py-1 rounded-md text-xs font-medium ${statusColor}`}
                            >
                              {product.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right text-zinc-300">
                            {price
                              ? `${price.currency} ${(Number(price.amount) / 100).toFixed(2)}`
                              : '-'}
                          </td>
                          <td className="px-4 py-3 text-right text-zinc-400">
                            {stock !== undefined ? stock : '-'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </AdminCard>
      )}

      {/* Content Posting Section */}
      <ContentPostingSection />

      {/* Setup Instructions */}
      <AdminCard
        title="Setup Instructions"
        subtitle="How to connect your TikTok Shop account"
      >
        <div className="space-y-6">
          {/* Step 1 */}
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-violet-600/20 border border-violet-500/30 flex items-center justify-center">
              <span className="text-sm font-semibold text-violet-400">1</span>
            </div>
            <div className="min-w-0 flex-1">
              <h4 className="text-sm font-medium text-zinc-200">
                Register as a TikTok Shop Partner
              </h4>
              <p className="text-xs text-zinc-500 mt-1">
                Go to the{' '}
                <a
                  href="https://partner.tiktokshop.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-violet-400 hover:text-violet-300 inline-flex items-center gap-1"
                >
                  TikTok Shop Partner Center
                  <ExternalLink className="w-3 h-3" />
                </a>{' '}
                and register as a developer. Create a new app and note your App Key and
                App Secret.
              </p>
            </div>
          </div>

          {/* Step 2 */}
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-violet-600/20 border border-violet-500/30 flex items-center justify-center">
              <span className="text-sm font-semibold text-violet-400">2</span>
            </div>
            <div className="min-w-0 flex-1">
              <h4 className="text-sm font-medium text-zinc-200">
                Configure environment variables
              </h4>
              <p className="text-xs text-zinc-500 mt-1">
                Add these to your Vercel project settings:
              </p>
              <div className="mt-2 p-3 rounded-lg bg-zinc-900 border border-zinc-700 font-mono text-xs text-zinc-300 space-y-1 overflow-x-auto">
                <div className="whitespace-nowrap">
                  <span className="text-violet-400">TIKTOK_SHOP_APP_KEY</span>=
                  <span className="text-zinc-500">your_app_key</span>
                </div>
                <div className="whitespace-nowrap">
                  <span className="text-violet-400">TIKTOK_SHOP_APP_SECRET</span>=
                  <span className="text-zinc-500">your_app_secret</span>
                </div>
              </div>
            </div>
          </div>

          {/* Step 3 */}
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-violet-600/20 border border-violet-500/30 flex items-center justify-center">
              <span className="text-sm font-semibold text-violet-400">3</span>
            </div>
            <div className="min-w-0 flex-1">
              <h4 className="text-sm font-medium text-zinc-200">
                Set your OAuth callback URL
              </h4>
              <p className="text-xs text-zinc-500 mt-1">
                In your TikTok Shop Partner Center app settings, set the OAuth redirect
                URL to:
              </p>
              <div className="mt-2 p-3 rounded-lg bg-zinc-900 border border-zinc-700 font-mono text-xs text-zinc-300 overflow-x-auto">
                <span className="whitespace-nowrap">https://flashflowai.com/api/tiktok-shop/callback</span>
              </div>
            </div>
          </div>

          {/* Step 4 */}
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-violet-600/20 border border-violet-500/30 flex items-center justify-center">
              <span className="text-sm font-semibold text-violet-400">4</span>
            </div>
            <div className="min-w-0 flex-1">
              <h4 className="text-sm font-medium text-zinc-200">Connect your shop</h4>
              <p className="text-xs text-zinc-500 mt-1">
                After deploying with the env vars, click the &quot;Connect TikTok
                Shop&quot; button above. You&apos;ll be redirected to TikTok to
                authorize access, then back here with your shop connected.
              </p>
            </div>
          </div>
        </div>
      </AdminCard>

      {/* API Info */}
      <AdminCard title="API Reference" subtitle="Available endpoints for TikTok Shop data">
        <div className="space-y-3">
          {[
            {
              method: 'GET',
              path: '/api/tiktok-shop/status',
              desc: 'Connection status, shop info, auth URL',
            },
            {
              method: 'GET',
              path: '/api/tiktok-shop/products',
              desc: 'List products (supports page_size, page_token, status params)',
            },
            {
              method: 'GET',
              path: '/api/tiktok-shop/callback',
              desc: 'OAuth2 callback (handled automatically)',
            },
            {
              method: 'POST',
              path: '/api/tiktok-shop/sync',
              desc: 'Sync TikTok products into FlashFlow products table',
            },
            {
              method: 'POST',
              path: '/api/tiktok-shop/disconnect',
              desc: 'Disconnect the integration',
            },
          ].map((ep) => (
            <div
              key={ep.path}
              className="flex items-start gap-3 px-4 py-3 rounded-lg bg-zinc-900/50 border border-white/5"
            >
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wide ${
                  ep.method === 'GET'
                    ? 'bg-emerald-500/15 text-emerald-400'
                    : 'bg-amber-500/15 text-amber-400'
                }`}
              >
                {ep.method}
              </span>
              <div className="flex-1 min-w-0">
                <code className="text-xs text-zinc-300 font-mono">{ep.path}</code>
                <p className="text-xs text-zinc-500 mt-0.5">{ep.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </AdminCard>
    </AdminPageLayout>
  );
}

