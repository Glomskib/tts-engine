'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Webhook, Plus, Trash2, Play, Check, X, AlertCircle,
  Loader2, ChevronDown, ExternalLink, RefreshCw,
} from 'lucide-react';

interface WebhookEntry {
  id: string;
  name: string;
  url: string;
  events: string[];
  is_active: boolean;
  secret: string | null;
  created_at: string;
  last_triggered_at: string | null;
  failure_count: number;
}

const WEBHOOK_EVENTS = [
  { key: 'video.created', label: 'Video Created', description: 'New video added to pipeline' },
  { key: 'video.status_changed', label: 'Status Changed', description: 'Video status updated' },
  { key: 'video.posted', label: 'Video Posted', description: 'Video published to platform' },
  { key: 'winner.detected', label: 'Winner Detected', description: 'Auto-detected winning video' },
  { key: 'script.approved', label: 'Script Approved', description: 'Script approved for production' },
  { key: 'sla.breach', label: 'SLA Breach', description: 'Video exceeds 24h in stage' },
  { key: 'quota.reached', label: 'Quota Reached', description: 'Brand video quota hit' },
  { key: 'daily.summary', label: 'Daily Summary', description: 'End-of-day digest' },
];

interface IntegrationTemplate {
  name: string;
  icon: string;
  color: string;
  description: string;
  url_placeholder: string;
  recommended_events: string[];
  setup_guide: string;
}

const INTEGRATION_TEMPLATES: IntegrationTemplate[] = [
  {
    name: 'Telegram',
    icon: '✈️',
    color: '#229ED9',
    description: 'Send notifications to a Telegram channel or group',
    url_placeholder: 'https://api.telegram.org/bot<TOKEN>/sendMessage?chat_id=<CHAT_ID>',
    recommended_events: ['winner.detected', 'sla.breach', 'daily.summary'],
    setup_guide: 'Create a bot via @BotFather, get the chat ID from getUpdates',
  },
  {
    name: 'Discord',
    icon: '🎮',
    color: '#5865F2',
    description: 'Post updates to a Discord channel via webhook',
    url_placeholder: 'https://discord.com/api/webhooks/...',
    recommended_events: ['video.posted', 'winner.detected', 'script.approved'],
    setup_guide: 'Channel Settings > Integrations > Webhooks > New Webhook',
  },
  {
    name: 'Slack',
    icon: '💬',
    color: '#4A154B',
    description: 'Send messages to a Slack channel',
    url_placeholder: 'https://hooks.slack.com/services/...',
    recommended_events: ['video.status_changed', 'sla.breach', 'daily.summary'],
    setup_guide: 'Create a Slack app > Incoming Webhooks > Add New Webhook to Workspace',
  },
  {
    name: 'Google Sheets',
    icon: '📊',
    color: '#0F9D58',
    description: 'Log events to a Google Sheet via Apps Script',
    url_placeholder: 'https://script.google.com/macros/s/.../exec',
    recommended_events: ['video.posted', 'winner.detected', 'video.created'],
    setup_guide: 'Create a Google Apps Script web app that accepts POST requests',
  },
  {
    name: 'Email (Zapier)',
    icon: '📧',
    color: '#FF4A00',
    description: 'Trigger email notifications via Zapier webhook',
    url_placeholder: 'https://hooks.zapier.com/hooks/catch/...',
    recommended_events: ['sla.breach', 'quota.reached', 'winner.detected'],
    setup_guide: 'Create a Zap with "Webhooks by Zapier" trigger',
  },
  {
    name: 'Custom URL',
    icon: '🔗',
    color: '#6366F1',
    description: 'Send to any HTTP endpoint',
    url_placeholder: 'https://your-server.com/webhook',
    recommended_events: [],
    setup_guide: 'Provide any HTTPS URL that accepts POST requests with JSON body',
  },
];

export default function IntegrationsPage() {
  const [webhooks, setWebhooks] = useState<WebhookEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<IntegrationTemplate | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; ok: boolean; message: string } | null>(null);

  const fetchWebhooks = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/webhooks');
      const data = await res.json();
      if (data.ok) setWebhooks(data.data || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchWebhooks(); }, [fetchWebhooks]);

  const handleTest = async (webhook: WebhookEntry) => {
    setTesting(webhook.id);
    setTestResult(null);
    try {
      const res = await fetch('/api/admin/webhooks/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ webhook_id: webhook.id }),
      });
      const data = await res.json();
      setTestResult({ id: webhook.id, ok: data.ok, message: data.ok ? 'Test sent successfully' : (data.message || 'Test failed') });
    } catch {
      setTestResult({ id: webhook.id, ok: false, message: 'Network error' });
    } finally {
      setTesting(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this webhook?')) return;
    try {
      await fetch(`/api/admin/webhooks/${id}`, { method: 'DELETE' });
      fetchWebhooks();
    } catch {
      // ignore
    }
  };

  const handleToggle = async (webhook: WebhookEntry) => {
    try {
      await fetch(`/api/admin/webhooks/${webhook.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !webhook.is_active }),
      });
      fetchWebhooks();
    } catch {
      // ignore
    }
  };

  return (
    <div className="max-w-5xl mx-auto pb-24 lg:pb-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Webhook className="w-6 h-6 text-teal-400" />
          <div>
            <h1 className="text-xl font-bold text-white">Integrations</h1>
            <p className="text-xs text-zinc-500">Connect FlashFlow to your favorite tools</p>
          </div>
        </div>
        <button
          onClick={() => { setShowCreate(true); setSelectedTemplate(null); }}
          className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 text-white rounded-lg text-xs font-medium hover:bg-teal-500 transition-colors"
        >
          <Plus className="w-4 h-4" /> Add Integration
        </button>
      </div>

      {/* Pre-built Templates */}
      {!showCreate && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-zinc-400 mb-3">Quick Setup</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {INTEGRATION_TEMPLATES.map(template => (
              <button
                key={template.name}
                onClick={() => { setSelectedTemplate(template); setShowCreate(true); }}
                className="p-4 bg-zinc-900/50 border border-zinc-800 rounded-xl text-center hover:border-zinc-600 transition-colors group"
              >
                <div className="text-2xl mb-2">{template.icon}</div>
                <div className="text-xs font-semibold text-zinc-300 group-hover:text-white transition-colors">{template.name}</div>
                <div className="text-[10px] text-zinc-600 mt-1">{template.description.split(' ').slice(0, 4).join(' ')}...</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Create Form */}
      {showCreate && (
        <CreateWebhookForm
          template={selectedTemplate}
          onClose={() => { setShowCreate(false); setSelectedTemplate(null); }}
          onCreated={() => { setShowCreate(false); setSelectedTemplate(null); fetchWebhooks(); }}
        />
      )}

      {/* Existing Webhooks */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-zinc-400">Active Integrations ({webhooks.length})</h2>
          <button onClick={fetchWebhooks} className="text-xs text-zinc-500 hover:text-white flex items-center gap-1">
            <RefreshCw className="w-3 h-3" /> Refresh
          </button>
        </div>

        {loading ? (
          <div className="text-center py-12 text-zinc-500 text-sm">Loading...</div>
        ) : webhooks.length === 0 ? (
          <div className="text-center py-16 bg-zinc-900/50 border border-zinc-800 rounded-xl">
            <Webhook className="w-10 h-10 mx-auto mb-3 text-zinc-700" />
            <p className="text-sm text-zinc-500">No integrations configured</p>
            <p className="text-xs text-zinc-600 mt-1">Click a quick setup template above to get started</p>
          </div>
        ) : (
          <div className="space-y-2">
            {webhooks.map(webhook => (
              <div key={webhook.id} className="p-4 bg-zinc-900/50 border border-zinc-800 rounded-xl">
                <div className="flex items-center gap-3">
                  {/* Status dot */}
                  <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${webhook.is_active ? 'bg-green-500' : 'bg-zinc-600'}`} />

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-white">{webhook.name}</div>
                    <div className="text-[10px] text-zinc-500 truncate font-mono">{webhook.url}</div>
                  </div>

                  {/* Events */}
                  <div className="hidden sm:flex flex-wrap gap-1 max-w-[200px]">
                    {webhook.events.slice(0, 3).map(e => (
                      <span key={e} className="px-1.5 py-0.5 bg-zinc-800 text-[9px] text-zinc-400 rounded">{e}</span>
                    ))}
                    {webhook.events.length > 3 && (
                      <span className="px-1.5 py-0.5 text-[9px] text-zinc-500">+{webhook.events.length - 3}</span>
                    )}
                  </div>

                  {/* Failure indicator */}
                  {webhook.failure_count > 0 && (
                    <span className="text-[10px] text-red-400 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> {webhook.failure_count} failures
                    </span>
                  )}

                  {/* Actions */}
                  <div className="flex gap-1">
                    <button
                      onClick={() => handleTest(webhook)}
                      disabled={testing === webhook.id}
                      className="p-1.5 text-zinc-400 hover:text-teal-400 hover:bg-zinc-800 rounded transition-colors disabled:opacity-50"
                      title="Send test"
                    >
                      {testing === webhook.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => handleToggle(webhook)}
                      className={`p-1.5 hover:bg-zinc-800 rounded transition-colors ${webhook.is_active ? 'text-green-400' : 'text-zinc-500'}`}
                      title={webhook.is_active ? 'Disable' : 'Enable'}
                    >
                      {webhook.is_active ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => handleDelete(webhook.id)}
                      className="p-1.5 text-zinc-400 hover:text-red-400 hover:bg-zinc-800 rounded transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Test result */}
                {testResult?.id === webhook.id && (
                  <div className={`mt-2 p-2 rounded text-xs ${testResult.ok ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                    {testResult.message}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CreateWebhookForm({
  template,
  onClose,
  onCreated,
}: {
  template: IntegrationTemplate | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState(template?.name || '');
  const [url, setUrl] = useState('');
  const [selectedEvents, setSelectedEvents] = useState<Set<string>>(
    new Set(template?.recommended_events || [])
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleEvent = (key: string) => {
    setSelectedEvents(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !url || selectedEvents.size === 0) {
      setError('Name, URL, and at least one event are required');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          url,
          events: Array.from(selectedEvents),
        }),
      });
      const data = await res.json();
      if (data.ok) {
        onCreated();
      } else {
        setError(data.message || 'Failed to create webhook');
      }
    } catch {
      setError('Network error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mb-6 p-6 bg-zinc-900/50 border border-zinc-800 rounded-xl">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-white">
          {template ? `Set up ${template.name}` : 'New Integration'}
        </h3>
        <button onClick={onClose} className="text-zinc-400 hover:text-white">
          <X className="w-4 h-4" />
        </button>
      </div>

      {template && (
        <div className="mb-4 p-3 bg-zinc-800/50 rounded-lg border border-zinc-700/50">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">{template.icon}</span>
            <span className="text-xs font-semibold text-zinc-300">{template.name}</span>
          </div>
          <p className="text-xs text-zinc-500">{template.setup_guide}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-xs font-semibold text-zinc-400 mb-1 block">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Webhook"
            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-teal-500"
            required
          />
        </div>

        <div>
          <label className="text-xs font-semibold text-zinc-400 mb-1 block">Webhook URL</label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={template?.url_placeholder || 'https://...'}
            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-teal-500 font-mono"
            required
          />
        </div>

        <div>
          <label className="text-xs font-semibold text-zinc-400 mb-2 block">Events</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {WEBHOOK_EVENTS.map(event => {
              const isSelected = selectedEvents.has(event.key);
              const isRecommended = template?.recommended_events.includes(event.key);
              return (
                <button
                  key={event.key}
                  type="button"
                  onClick={() => toggleEvent(event.key)}
                  className={`p-2.5 rounded-lg border text-left transition-all ${
                    isSelected
                      ? 'border-teal-500 bg-teal-500/10'
                      : 'border-zinc-700 bg-zinc-800/50 hover:border-zinc-600'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <div className={`w-3 h-3 rounded border ${isSelected ? 'bg-teal-500 border-teal-500' : 'border-zinc-600'}`}>
                      {isSelected && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <span className={`text-xs font-medium ${isSelected ? 'text-teal-300' : 'text-zinc-400'}`}>
                      {event.label}
                    </span>
                  </div>
                  <p className="text-[9px] text-zinc-600 mt-1 ml-4.5">{event.description}</p>
                  {isRecommended && !isSelected && (
                    <span className="text-[8px] text-teal-600 ml-4.5">Recommended</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {error && (
          <div className="p-3 bg-red-900/30 border border-red-500/30 rounded-lg text-sm text-red-400">
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-500 transition-colors disabled:opacity-50"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {saving ? 'Creating...' : 'Create Integration'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 bg-zinc-800 text-zinc-400 rounded-lg text-sm hover:text-white transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
