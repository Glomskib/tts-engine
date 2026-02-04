'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { useHydrated, formatDateString } from '@/lib/useHydrated';
import IncidentBanner from '../components/IncidentBanner';

interface HealthData {
  ok: boolean;
  env: Record<string, boolean>;
  SUPABASE_SERVICE_ROLE_KEY_PRESENT: boolean;
  USING_SERVICE_ROLE_FOR_ADMIN: boolean;
  env_report: {
    env_ok: boolean;
    required_present: number;
    required_total: number;
    optional_present: number;
    optional_total: number;
  };
}

interface RuntimeConfig {
  is_admin: boolean;
  subscription_gating_enabled: boolean;
  email_enabled: boolean;
  slack_enabled: boolean;
  assignment_ttl_minutes: number;
  user_plan: string;
  user_plan_active: boolean;
  incident_mode_enabled: boolean;
  incident_mode_message: string;
  incident_mode_read_only: boolean;
  is_allowlisted: boolean;
}

interface EffectiveSetting {
  key: string;
  effective_value: boolean | number | string | string[];
  source: 'system_setting' | 'env_default';
  last_updated_at: string | null;
}

export default function AdminStatusPage() {
  const router = useRouter();
  const hydrated = useHydrated();
  const [authLoading, setAuthLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [healthData, setHealthData] = useState<HealthData | null>(null);
  const [runtimeConfig, setRuntimeConfig] = useState<RuntimeConfig | null>(null);
  const [settings, setSettings] = useState<EffectiveSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  // Fetch authenticated user and check admin status
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const supabase = createBrowserSupabaseClient();
        const { data: { user }, error } = await supabase.auth.getUser();

        if (error || !user) {
          router.push('/login?redirect=/admin/status');
          return;
        }

        // Check if admin
        const roleRes = await fetch('/api/auth/me');
        const roleData = await roleRes.json();

        if (roleData.role !== 'admin') {
          router.push('/admin/pipeline');
          return;
        }

        setIsAdmin(true);
      } catch (err) {
        console.error('Auth error:', err);
        router.push('/login?redirect=/admin/status');
      } finally {
        setAuthLoading(false);
      }
    };

    checkAuth();
  }, [router]);

  // Fetch all status data
  const fetchStatus = async () => {
    setLoading(true);
    try {
      const [healthRes, configRes, settingsRes] = await Promise.all([
        fetch('/api/health'),
        fetch('/api/auth/runtime-config'),
        fetch('/api/admin/settings'),
      ]);

      const [healthJson, configJson, settingsJson] = await Promise.all([
        healthRes.json(),
        configRes.json(),
        settingsRes.json(),
      ]);

      if (healthRes.ok) {
        setHealthData(healthJson);
      }

      if (configJson.ok) {
        setRuntimeConfig(configJson.data);
      }

      if (settingsJson.ok) {
        setSettings(settingsJson.data.settings || []);
      }

      setLastRefresh(new Date());
      setError('');
    } catch (err) {
      setError('Failed to fetch status data');
      console.error('Status fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      fetchStatus();
    }
  }, [isAdmin]);

  if (authLoading) {
    return <div style={{ padding: '20px' }}>Checking access...</div>;
  }

  if (!isAdmin) {
    return <div style={{ padding: '20px' }}>Redirecting...</div>;
  }

  const formatValue = (value: boolean | number | string | string[]): string => {
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (Array.isArray(value)) return value.join(', ');
    return String(value);
  };

  return (
    <div style={{ padding: '20px', maxWidth: '1000px', margin: '0 auto' }} className="pb-24 lg:pb-6">
      {/* Incident Mode Banner */}
      <IncidentBanner />


      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ margin: 0 }}>System Status</h1>
        <button type="button"
          onClick={fetchStatus}
          disabled={loading}
          style={{
            padding: '8px 16px',
            backgroundColor: loading ? '#adb5bd' : '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontSize: '13px',
          }}
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {lastRefresh && hydrated && (
        <div style={{ marginBottom: '15px', fontSize: '12px', color: '#6c757d' }}>
          Last updated: {formatDateString(lastRefresh.toISOString())}
        </div>
      )}

      {error && (
        <div style={{
          padding: '15px',
          backgroundColor: '#f8d7da',
          borderRadius: '4px',
          color: '#721c24',
          marginBottom: '20px',
        }}>
          {error}
        </div>
      )}

      {/* Health Status */}
      <div style={{
        marginBottom: '20px',
        padding: '20px',
        backgroundColor: healthData?.ok ? '#d3f9d8' : '#f8d7da',
        borderRadius: '8px',
        border: `1px solid ${healthData?.ok ? '#69db7c' : '#f5c6cb'}`,
      }}>
        <h2 style={{ margin: '0 0 15px 0', fontSize: '18px', color: healthData?.ok ? '#2b8a3e' : '#c92a2a' }}>
          Health Check: {healthData?.ok ? 'Healthy' : 'Issues Detected'}
        </h2>

        {healthData?.env_report && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
            <div style={{ padding: '10px', backgroundColor: 'rgba(255,255,255,0.7)', borderRadius: '4px' }}>
              <div style={{ fontSize: '12px', color: '#6c757d' }}>Required Env Vars</div>
              <div style={{ fontSize: '18px', fontWeight: 'bold', color: healthData.env_report.env_ok ? '#2b8a3e' : '#c92a2a' }}>
                {healthData.env_report.required_present} / {healthData.env_report.required_total}
              </div>
            </div>
            <div style={{ padding: '10px', backgroundColor: 'rgba(255,255,255,0.7)', borderRadius: '4px' }}>
              <div style={{ fontSize: '12px', color: '#6c757d' }}>Optional Env Vars</div>
              <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#495057' }}>
                {healthData.env_report.optional_present} / {healthData.env_report.optional_total}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Notification Channels */}
      <div style={{
        marginBottom: '20px',
        padding: '20px',
        backgroundColor: '#f8f9fa',
        borderRadius: '8px',
        border: '1px solid #dee2e6',
      }}>
        <h2 style={{ margin: '0 0 15px 0', fontSize: '18px' }}>Notification Channels</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
          <div style={{
            padding: '12px',
            backgroundColor: runtimeConfig?.email_enabled ? '#d3f9d8' : '#fff',
            borderRadius: '4px',
            border: `1px solid ${runtimeConfig?.email_enabled ? '#69db7c' : '#dee2e6'}`,
          }}>
            <div style={{ fontSize: '14px', fontWeight: 'bold' }}>Email</div>
            <div style={{
              fontSize: '13px',
              color: runtimeConfig?.email_enabled ? '#2b8a3e' : '#6c757d',
            }}>
              {runtimeConfig?.email_enabled ? 'Enabled' : 'Disabled'}
            </div>
          </div>
          <div style={{
            padding: '12px',
            backgroundColor: runtimeConfig?.slack_enabled ? '#d3f9d8' : '#fff',
            borderRadius: '4px',
            border: `1px solid ${runtimeConfig?.slack_enabled ? '#69db7c' : '#dee2e6'}`,
          }}>
            <div style={{ fontSize: '14px', fontWeight: 'bold' }}>Slack</div>
            <div style={{
              fontSize: '13px',
              color: runtimeConfig?.slack_enabled ? '#2b8a3e' : '#6c757d',
            }}>
              {runtimeConfig?.slack_enabled ? 'Enabled' : 'Disabled'}
            </div>
          </div>
        </div>
      </div>

      {/* Incident Mode Status */}
      <div style={{
        marginBottom: '20px',
        padding: '20px',
        backgroundColor: runtimeConfig?.incident_mode_enabled ? '#fff9db' : '#f8f9fa',
        borderRadius: '8px',
        border: `1px solid ${runtimeConfig?.incident_mode_enabled ? '#ffe066' : '#dee2e6'}`,
      }}>
        <h2 style={{ margin: '0 0 15px 0', fontSize: '18px' }}>Incident Mode</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
          <div style={{ padding: '10px', backgroundColor: 'rgba(255,255,255,0.7)', borderRadius: '4px' }}>
            <div style={{ fontSize: '12px', color: '#6c757d' }}>Status</div>
            <div style={{
              fontSize: '14px',
              fontWeight: 'bold',
              color: runtimeConfig?.incident_mode_enabled ? '#e67700' : '#2b8a3e',
            }}>
              {runtimeConfig?.incident_mode_enabled ? 'Active' : 'Inactive'}
            </div>
          </div>
          <div style={{ padding: '10px', backgroundColor: 'rgba(255,255,255,0.7)', borderRadius: '4px' }}>
            <div style={{ fontSize: '12px', color: '#6c757d' }}>Read-Only</div>
            <div style={{
              fontSize: '14px',
              fontWeight: 'bold',
              color: runtimeConfig?.incident_mode_read_only ? '#c92a2a' : '#2b8a3e',
            }}>
              {runtimeConfig?.incident_mode_read_only ? 'Yes' : 'No'}
            </div>
          </div>
          <div style={{ padding: '10px', backgroundColor: 'rgba(255,255,255,0.7)', borderRadius: '4px' }}>
            <div style={{ fontSize: '12px', color: '#6c757d' }}>You Are Allowlisted</div>
            <div style={{ fontSize: '14px', fontWeight: 'bold' }}>
              {runtimeConfig?.is_allowlisted ? 'Yes' : 'No'}
            </div>
          </div>
        </div>
        {runtimeConfig?.incident_mode_enabled && runtimeConfig?.incident_mode_message && (
          <div style={{ marginTop: '10px', padding: '10px', backgroundColor: 'rgba(255,255,255,0.7)', borderRadius: '4px' }}>
            <div style={{ fontSize: '12px', color: '#6c757d' }}>Message</div>
            <div style={{ fontSize: '14px' }}>{runtimeConfig.incident_mode_message}</div>
          </div>
        )}
      </div>

      {/* System Configuration */}
      <div style={{
        marginBottom: '20px',
        padding: '20px',
        backgroundColor: '#f8f9fa',
        borderRadius: '8px',
        border: '1px solid #dee2e6',
      }}>
        <h2 style={{ margin: '0 0 15px 0', fontSize: '18px' }}>System Configuration</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
          <div style={{ padding: '10px', backgroundColor: '#fff', borderRadius: '4px', border: '1px solid #dee2e6' }}>
            <div style={{ fontSize: '12px', color: '#6c757d' }}>Subscription Gating</div>
            <div style={{
              fontSize: '14px',
              fontWeight: 'bold',
              color: runtimeConfig?.subscription_gating_enabled ? '#e67700' : '#2b8a3e',
            }}>
              {runtimeConfig?.subscription_gating_enabled ? 'Enabled' : 'Disabled'}
            </div>
          </div>
          <div style={{ padding: '10px', backgroundColor: '#fff', borderRadius: '4px', border: '1px solid #dee2e6' }}>
            <div style={{ fontSize: '12px', color: '#6c757d' }}>Assignment TTL</div>
            <div style={{ fontSize: '14px', fontWeight: 'bold' }}>
              {runtimeConfig?.assignment_ttl_minutes || 240} minutes
            </div>
          </div>
        </div>
      </div>

      {/* Settings Summary */}
      <div style={{
        padding: '20px',
        backgroundColor: '#f8f9fa',
        borderRadius: '8px',
        border: '1px solid #dee2e6',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <h2 style={{ margin: 0, fontSize: '18px' }}>Effective Settings</h2>
          <Link
            href="/admin/settings"
            style={{
              padding: '6px 12px',
              backgroundColor: '#007bff',
              color: 'white',
              borderRadius: '4px',
              textDecoration: 'none',
              fontSize: '12px',
            }}
          >
            Manage Settings
          </Link>
        </div>
        <div style={{ fontSize: '13px' }}>
          {settings.length === 0 ? (
            <div style={{ color: '#6c757d' }}>Loading settings...</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #dee2e6' }}>
                  <th style={{ textAlign: 'left', padding: '8px', fontSize: '12px', color: '#6c757d' }}>Key</th>
                  <th style={{ textAlign: 'left', padding: '8px', fontSize: '12px', color: '#6c757d' }}>Value</th>
                  <th style={{ textAlign: 'left', padding: '8px', fontSize: '12px', color: '#6c757d' }}>Source</th>
                </tr>
              </thead>
              <tbody>
                {settings.map((setting) => (
                  <tr key={setting.key} style={{ borderBottom: '1px solid #f1f3f5' }}>
                    <td style={{ padding: '8px', fontFamily: 'monospace', fontSize: '12px' }}>{setting.key}</td>
                    <td style={{ padding: '8px', fontSize: '12px' }}>
                      <span style={{
                        color: typeof setting.effective_value === 'boolean'
                          ? (setting.effective_value ? '#2b8a3e' : '#c92a2a')
                          : '#495057',
                      }}>
                        {formatValue(setting.effective_value)}
                      </span>
                    </td>
                    <td style={{ padding: '8px' }}>
                      <span style={{
                        padding: '2px 6px',
                        backgroundColor: setting.source === 'system_setting' ? '#d3f9d8' : '#f8f9fa',
                        color: setting.source === 'system_setting' ? '#2b8a3e' : '#6c757d',
                        borderRadius: '4px',
                        fontSize: '10px',
                        fontWeight: 'bold',
                        textTransform: 'uppercase',
                      }}>
                        {setting.source === 'system_setting' ? 'System' : 'Env'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
