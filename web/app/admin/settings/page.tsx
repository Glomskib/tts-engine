'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { useHydrated, formatDateString } from '@/lib/useHydrated';

interface EffectiveSetting {
  key: string;
  effective_value: boolean | number | string | string[];
  source: 'system_setting' | 'env_default';
  last_updated_at: string | null;
}

// Setting type info for proper input rendering
const SETTING_TYPES: Record<string, 'boolean' | 'number' | 'string[]'> = {
  SUBSCRIPTION_GATING_ENABLED: 'boolean',
  EMAIL_ENABLED: 'boolean',
  SLACK_ENABLED: 'boolean',
  ASSIGNMENT_TTL_MINUTES: 'number',
  SLACK_OPS_EVENTS: 'string[]',
  ANALYTICS_DEFAULT_WINDOW_DAYS: 'number',
};

const SETTING_DESCRIPTIONS: Record<string, string> = {
  SUBSCRIPTION_GATING_ENABLED: 'When enabled, only Pro users can perform certain actions (claim videos, etc.)',
  EMAIL_ENABLED: 'When enabled, the system will send email notifications',
  SLACK_ENABLED: 'When enabled, the system will send Slack notifications for ops events',
  ASSIGNMENT_TTL_MINUTES: 'Default assignment TTL in minutes (1-10080, i.e., up to 7 days)',
  SLACK_OPS_EVENTS: 'List of event types that trigger Slack notifications',
  ANALYTICS_DEFAULT_WINDOW_DAYS: 'Default analytics time window (7, 14, or 30 days)',
};

export default function AdminSettingsPage() {
  const router = useRouter();
  const hydrated = useHydrated();
  const [authLoading, setAuthLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [settings, setSettings] = useState<EffectiveSetting[]>([]);
  const [allowedKeys, setAllowedKeys] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');

  // Fetch authenticated user and check admin status
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const supabase = createBrowserSupabaseClient();
        const { data: { user }, error } = await supabase.auth.getUser();

        if (error || !user) {
          router.push('/login?redirect=/admin/settings');
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
        router.push('/login?redirect=/admin/settings');
      } finally {
        setAuthLoading(false);
      }
    };

    checkAuth();
  }, [router]);

  // Fetch settings
  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/admin/settings');
      const data = await res.json();

      if (data.ok) {
        setSettings(data.data.settings);
        setAllowedKeys(data.data.allowed_keys);
        setError('');
      } else {
        setError(data.error || 'Failed to load settings');
      }
    } catch (err) {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      fetchSettings();
    }
  }, [isAdmin]);

  // Format value for display
  const formatValue = (value: boolean | number | string | string[]): string => {
    if (typeof value === 'boolean') {
      return value ? 'true' : 'false';
    }
    if (Array.isArray(value)) {
      return value.join(', ');
    }
    return String(value);
  };

  // Parse input value based on setting type
  const parseValue = (key: string, inputValue: string): boolean | number | string[] | null => {
    const type = SETTING_TYPES[key];

    if (type === 'boolean') {
      const lower = inputValue.toLowerCase().trim();
      if (lower === 'true' || lower === '1') return true;
      if (lower === 'false' || lower === '0') return false;
      return null;
    }

    if (type === 'number') {
      const num = parseInt(inputValue, 10);
      if (isNaN(num)) return null;
      // Special validation for ANALYTICS_DEFAULT_WINDOW_DAYS
      if (key === 'ANALYTICS_DEFAULT_WINDOW_DAYS') {
        if (![7, 14, 30].includes(num)) return null;
        return num;
      }
      // General number validation
      if (num < 1 || num > 10080) return null;
      return num;
    }

    if (type === 'string[]') {
      return inputValue.split(',').map(s => s.trim()).filter(s => s.length > 0);
    }

    return null;
  };

  // Start editing a setting
  const startEdit = (setting: EffectiveSetting) => {
    setEditingKey(setting.key);
    setEditValue(formatValue(setting.effective_value));
    setMessage(null);
  };

  // Cancel editing
  const cancelEdit = () => {
    setEditingKey(null);
    setEditValue('');
  };

  // Save a setting
  const saveSetting = async (key: string) => {
    const parsedValue = parseValue(key, editValue);

    if (parsedValue === null) {
      setMessage({ type: 'error', text: `Invalid value for ${key}` });
      return;
    }

    setSavingKey(key);
    setMessage(null);

    try {
      const res = await fetch('/api/admin/settings/set', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value: parsedValue }),
      });

      const data = await res.json();

      if (data.ok) {
        setMessage({ type: 'success', text: `${key} updated successfully` });
        setEditingKey(null);
        setEditValue('');
        await fetchSettings();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to save setting' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Network error' });
    } finally {
      setSavingKey(null);
    }
  };

  if (authLoading) {
    return <div style={{ padding: '20px' }}>Checking access...</div>;
  }

  if (!isAdmin) {
    return <div style={{ padding: '20px' }}>Redirecting...</div>;
  }

  return (
    <div style={{ padding: '20px', maxWidth: '1000px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ margin: 0 }}>System Settings</h1>
        <Link
          href="/admin/pipeline"
          style={{
            padding: '8px 16px',
            backgroundColor: '#6c757d',
            color: 'white',
            borderRadius: '4px',
            textDecoration: 'none',
            fontSize: '13px',
          }}
        >
          Back to Pipeline
        </Link>
      </div>

      {/* Info Box */}
      <div style={{
        padding: '15px',
        backgroundColor: '#e7f5ff',
        borderRadius: '8px',
        border: '1px solid #74c0fc',
        marginBottom: '20px',
        fontSize: '13px',
        color: '#1864ab',
      }}>
        <strong>Resolution Order:</strong> System Setting &rarr; Environment Variable &rarr; Default
        <br />
        <span style={{ color: '#495057' }}>
          Changes here override environment variables. Set a system setting to use runtime configuration without redeploying.
        </span>
      </div>

      {/* Message */}
      {message && (
        <div style={{
          marginBottom: '15px',
          padding: '12px 16px',
          backgroundColor: message.type === 'success' ? '#d4edda' : '#f8d7da',
          color: message.type === 'success' ? '#155724' : '#721c24',
          borderRadius: '4px',
          border: `1px solid ${message.type === 'success' ? '#c3e6cb' : '#f5c6cb'}`,
        }}>
          {message.text}
        </div>
      )}

      {/* Loading/Error */}
      {loading && (
        <div style={{ padding: '40px', textAlign: 'center', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
          Loading settings...
        </div>
      )}

      {error && (
        <div style={{
          padding: '20px',
          backgroundColor: '#f8d7da',
          borderRadius: '4px',
          color: '#721c24',
        }}>
          {error}
        </div>
      )}

      {/* Settings List */}
      {!loading && !error && (
        <div style={{
          border: '1px solid #dee2e6',
          borderRadius: '8px',
          overflow: 'hidden',
        }}>
          {settings.map((setting, index) => (
            <div
              key={setting.key}
              style={{
                padding: '16px 20px',
                borderBottom: index < settings.length - 1 ? '1px solid #dee2e6' : 'none',
                backgroundColor: editingKey === setting.key ? '#fff9db' : 'white',
              }}
            >
              {/* Setting Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                <div>
                  <div style={{ fontWeight: 'bold', fontFamily: 'monospace', fontSize: '14px' }}>
                    {setting.key}
                  </div>
                  <div style={{ fontSize: '12px', color: '#6c757d', marginTop: '4px' }}>
                    {SETTING_DESCRIPTIONS[setting.key] || 'No description'}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{
                    padding: '3px 8px',
                    backgroundColor: setting.source === 'system_setting' ? '#d3f9d8' : '#f8f9fa',
                    color: setting.source === 'system_setting' ? '#2b8a3e' : '#6c757d',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: 'bold',
                    textTransform: 'uppercase',
                  }}>
                    {setting.source === 'system_setting' ? 'System' : 'Env/Default'}
                  </span>
                </div>
              </div>

              {/* Current Value or Edit Form */}
              {editingKey === setting.key ? (
                <div style={{ marginTop: '12px' }}>
                  {SETTING_TYPES[setting.key] === 'boolean' ? (
                    <select
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      style={{
                        padding: '8px 12px',
                        border: '1px solid #ced4da',
                        borderRadius: '4px',
                        fontSize: '14px',
                        width: '150px',
                      }}
                    >
                      <option value="true">true</option>
                      <option value="false">false</option>
                    </select>
                  ) : SETTING_TYPES[setting.key] === 'number' ? (
                    <input
                      type="number"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      min={1}
                      max={10080}
                      style={{
                        padding: '8px 12px',
                        border: '1px solid #ced4da',
                        borderRadius: '4px',
                        fontSize: '14px',
                        width: '150px',
                      }}
                    />
                  ) : (
                    <textarea
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      rows={3}
                      placeholder="Comma-separated values"
                      style={{
                        padding: '8px 12px',
                        border: '1px solid #ced4da',
                        borderRadius: '4px',
                        fontSize: '13px',
                        width: '100%',
                        fontFamily: 'monospace',
                        resize: 'vertical',
                      }}
                    />
                  )}
                  <div style={{ marginTop: '10px', display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => saveSetting(setting.key)}
                      disabled={savingKey === setting.key}
                      style={{
                        padding: '8px 16px',
                        backgroundColor: savingKey === setting.key ? '#adb5bd' : '#28a745',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: savingKey === setting.key ? 'not-allowed' : 'pointer',
                        fontSize: '13px',
                        fontWeight: 'bold',
                      }}
                    >
                      {savingKey === setting.key ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      onClick={cancelEdit}
                      style={{
                        padding: '8px 16px',
                        backgroundColor: '#6c757d',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '13px',
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
                  <div>
                    <span style={{
                      fontFamily: 'monospace',
                      fontSize: '14px',
                      backgroundColor: '#f8f9fa',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      color: typeof setting.effective_value === 'boolean'
                        ? (setting.effective_value ? '#2b8a3e' : '#c92a2a')
                        : '#495057',
                    }}>
                      {formatValue(setting.effective_value)}
                    </span>
                    {setting.last_updated_at && hydrated && (
                      <span style={{ marginLeft: '12px', fontSize: '12px', color: '#adb5bd' }}>
                        Updated: {formatDateString(setting.last_updated_at)}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => startEdit(setting)}
                    style={{
                      padding: '6px 14px',
                      backgroundColor: '#007bff',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '12px',
                    }}
                  >
                    Edit
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Footer Note */}
      <div style={{
        marginTop: '20px',
        padding: '12px 16px',
        backgroundColor: '#f8f9fa',
        borderRadius: '4px',
        fontSize: '12px',
        color: '#6c757d',
      }}>
        <strong>Note:</strong> Changes take effect immediately for new requests. Existing in-progress operations may use cached values.
      </div>
    </div>
  );
}
