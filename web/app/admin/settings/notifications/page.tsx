'use client';

import { useState, useEffect, useCallback } from 'react';
import AdminPageLayout, { AdminCard, AdminButton } from '../../components/AdminPageLayout';
import { useToast } from '@/contexts/ToastContext';
import { Mail, Send, Loader2, Check, Info } from 'lucide-react';

interface NotificationPrefs {
  email_script_of_day: boolean;
  email_credits_low: boolean;
  email_monthly_summary: boolean;
  email_winner_pattern: boolean;
  email_retainer_milestone: boolean;
  telegram_new_subscriber: boolean;
  telegram_payment_failed: boolean;
  telegram_bug_report: boolean;
  telegram_pipeline_error: boolean;
  telegram_every_script: boolean;
}

interface PrefItem {
  key: keyof NotificationPrefs;
  label: string;
  description: string;
}

const EMAIL_PREFS: PrefItem[] = [
  {
    key: 'email_script_of_day',
    label: 'Script of the Day ready',
    description: 'Daily email when your auto-generated script angle is ready',
  },
  {
    key: 'email_credits_low',
    label: 'Credits running low (< 5)',
    description: 'Alert when your credit balance drops below 5',
  },
  {
    key: 'email_monthly_summary',
    label: 'Monthly usage summary',
    description: 'End-of-month report with videos created, credits used, and performance stats',
  },
  {
    key: 'email_winner_pattern',
    label: 'New winner pattern found',
    description: 'Notification when the AI identifies a new winning content pattern',
  },
  {
    key: 'email_retainer_milestone',
    label: 'Retainer milestone hit',
    description: 'Alert when a brand retainer reaches a usage milestone',
  },
];

const TELEGRAM_PREFS: PrefItem[] = [
  {
    key: 'telegram_new_subscriber',
    label: 'New subscriber',
    description: 'Ping when someone subscribes to a paid plan',
  },
  {
    key: 'telegram_payment_failed',
    label: 'Payment failed',
    description: 'Alert on Stripe payment failures or subscription issues',
  },
  {
    key: 'telegram_bug_report',
    label: 'Bug report submitted',
    description: 'Notification when a user submits feedback or a bug report',
  },
  {
    key: 'telegram_pipeline_error',
    label: 'Pipeline errors',
    description: 'Alert on stuck renders, failed video generations, or queue issues',
  },
  {
    key: 'telegram_every_script',
    label: 'Every script generated',
    description: 'High-volume: sends a message for every script created by any user',
  },
];

function ToggleRow({
  item,
  checked,
  onChange,
}: {
  item: PrefItem;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-4 px-4 py-3.5 rounded-lg hover:bg-white/[0.03] transition-colors cursor-pointer group">
      <div className="relative shrink-0">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="sr-only peer"
        />
        <div className="w-9 h-5 rounded-full bg-zinc-700 peer-checked:bg-violet-600 transition-colors" />
        <div className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-zinc-200 group-hover:text-white transition-colors">
          {item.label}
        </div>
        <div className="text-xs text-zinc-500 mt-0.5">{item.description}</div>
      </div>
    </label>
  );
}

export default function NotificationPreferencesPage() {
  const { showSuccess, showError } = useToast();
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const fetchPrefs = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/notifications');
      const json = await res.json();
      if (json.ok) {
        setPrefs(json.data);
      } else {
        showError('Failed to load notification preferences');
      }
    } catch {
      showError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchPrefs();
  }, [fetchPrefs]);

  function updatePref(key: keyof NotificationPrefs, value: boolean) {
    if (!prefs) return;
    setPrefs({ ...prefs, [key]: value });
    setDirty(true);
  }

  async function savePrefs() {
    if (!prefs) return;
    setSaving(true);
    try {
      const res = await fetch('/api/settings/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(prefs),
      });
      const json = await res.json();
      if (json.ok) {
        setPrefs(json.data);
        setDirty(false);
        showSuccess('Notification preferences saved');
      } else {
        showError(json.error || 'Failed to save preferences');
      }
    } catch {
      showError('Network error saving preferences');
    } finally {
      setSaving(false);
    }
  }

  if (loading || !prefs) {
    return (
      <AdminPageLayout title="Notification Preferences" subtitle="Control what notifications you receive">
        <AdminCard>
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
            <span className="ml-3 text-zinc-500">Loading preferences...</span>
          </div>
        </AdminCard>
      </AdminPageLayout>
    );
  }

  return (
    <AdminPageLayout
      title="Notification Preferences"
      subtitle="Control what notifications you receive"
      headerActions={
        <AdminButton onClick={savePrefs} disabled={saving || !dirty} variant={dirty ? 'primary' : 'secondary'}>
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : dirty ? (
            <>
              <Check className="w-4 h-4 mr-2" />
              Save Preferences
            </>
          ) : (
            'Saved'
          )}
        </AdminButton>
      }
    >
      {/* Email Notifications */}
      <AdminCard
        title="Email Notifications"
        headerActions={
          <div className="flex items-center gap-1.5 text-zinc-500">
            <Mail className="w-4 h-4" />
          </div>
        }
      >
        <div className="-mx-5 divide-y divide-white/5">
          {EMAIL_PREFS.map((item) => (
            <ToggleRow
              key={item.key}
              item={item}
              checked={prefs[item.key]}
              onChange={(val) => updatePref(item.key, val)}
            />
          ))}
        </div>
      </AdminCard>

      {/* Telegram Alerts */}
      <AdminCard
        title="Telegram Alerts"
        subtitle="Admin-only alerts sent to your Telegram bot"
        headerActions={
          <div className="flex items-center gap-1.5 text-zinc-500">
            <Send className="w-4 h-4" />
          </div>
        }
      >
        <div className="-mx-5 divide-y divide-white/5">
          {TELEGRAM_PREFS.map((item) => (
            <ToggleRow
              key={item.key}
              item={item}
              checked={prefs[item.key]}
              onChange={(val) => updatePref(item.key, val)}
            />
          ))}
        </div>
        <div className="mt-4 pt-4 border-t border-white/10">
          <div className="flex items-start gap-2.5 text-xs text-zinc-500">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              Telegram alerts require a configured bot. Manage your bot connection in{' '}
              <a href="/admin/settings/telegram" className="text-violet-400 hover:text-violet-300 underline underline-offset-2">
                Telegram Settings
              </a>.
            </span>
          </div>
        </div>
      </AdminCard>

      {/* Unsaved changes banner */}
      {dirty && (
        <div className="fixed bottom-0 left-0 right-0 lg:left-72 z-40 px-4 py-3 bg-zinc-900/95 border-t border-violet-500/30 backdrop-blur-sm">
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <span className="text-sm text-zinc-300">You have unsaved changes</span>
            <div className="flex items-center gap-3">
              <button
                onClick={() => { fetchPrefs(); setDirty(false); }}
                className="text-sm text-zinc-400 hover:text-white transition-colors"
              >
                Discard
              </button>
              <AdminButton onClick={savePrefs} disabled={saving} size="sm">
                {saving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  'Save'
                )}
              </AdminButton>
            </div>
          </div>
        </div>
      )}
    </AdminPageLayout>
  );
}
