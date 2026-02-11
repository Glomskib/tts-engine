'use client';

import { useState, useEffect } from 'react';
import AdminPageLayout, { AdminCard, AdminButton } from '../../components/AdminPageLayout';
import { useToast } from '@/contexts/ToastContext';
import { Bot, Send, Check, Loader2, AlertTriangle, Bell, Zap } from 'lucide-react';

interface TelegramStatus {
  telegram_configured: boolean;
  bot_token_set: boolean;
  chat_id_set: boolean;
  supported_events: string[];
}

interface DispatchLog {
  id: string;
  event: string;
  success: boolean;
  status_code: number | null;
  created_at: string;
  payload: Record<string, unknown>;
}

const EVENT_LABELS: Record<string, { label: string; description: string }> = {
  video_status_changed: {
    label: 'Video Status Changed',
    description: 'Notifies when a video moves to a new pipeline stage',
  },
  winner_detected: {
    label: 'Winner Detected',
    description: 'Alerts when a video is identified as a winner',
  },
  pipeline_empty: {
    label: 'Pipeline Empty',
    description: 'Warns when a brand has no content in the pipeline',
  },
  va_submitted: {
    label: 'VA Submitted',
    description: 'Notifies when a VA submits a video for review',
  },
  content_package_ready: {
    label: 'Content Package Ready',
    description: 'Alerts when a daily content package has been generated',
  },
  daily_summary: {
    label: 'Daily Summary',
    description: 'Sends a daily overview of video creation and performance',
  },
};

export default function TelegramSettingsPage() {
  const { showSuccess, showError } = useToast();
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [testSent, setTestSent] = useState(false);
  const [enabledEvents, setEnabledEvents] = useState<Record<string, boolean>>({});
  const [logs, setLogs] = useState<DispatchLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  // Fetch Telegram configuration status
  useEffect(() => {
    async function fetchStatus() {
      try {
        const res = await fetch('/api/webhooks/dispatch');
        const json = await res.json();
        if (json.ok) {
          setStatus(json.data);
          // Initialize all events as enabled by default
          const initialEvents: Record<string, boolean> = {};
          for (const evt of json.data.supported_events) {
            initialEvents[evt] = true;
          }
          // Load saved preferences from localStorage
          const saved = localStorage.getItem('telegram_enabled_events');
          if (saved) {
            try {
              const parsed = JSON.parse(saved);
              for (const evt of json.data.supported_events) {
                if (typeof parsed[evt] === 'boolean') {
                  initialEvents[evt] = parsed[evt];
                }
              }
            } catch {
              // Ignore parse errors
            }
          }
          setEnabledEvents(initialEvents);
        } else {
          showError('Failed to load Telegram status');
        }
      } catch {
        showError('Failed to connect to server');
      } finally {
        setLoading(false);
      }
    }

    fetchStatus();
    fetchLogs();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch recent dispatch logs
  async function fetchLogs() {
    setLogsLoading(true);
    try {
      const res = await fetch('/api/webhooks?type=deliveries&limit=10');
      const json = await res.json();
      if (json.ok && Array.isArray(json.data)) {
        setLogs(json.data.filter((d: DispatchLog) => d.event?.startsWith('telegram.')));
      }
    } catch {
      // Non-critical — silently fail
    } finally {
      setLogsLoading(false);
    }
  }

  // Toggle an event on/off
  function toggleEvent(event: string) {
    setEnabledEvents((prev) => {
      const updated = { ...prev, [event]: !prev[event] };
      localStorage.setItem('telegram_enabled_events', JSON.stringify(updated));
      return updated;
    });
  }

  // Send test message
  async function sendTestMessage() {
    setSending(true);
    setTestSent(false);
    try {
      const res = await fetch('/api/webhooks/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'test',
          data: { message: 'Test from FlashFlow' },
        }),
      });
      const json = await res.json();

      // The API may reject 'test' as unsupported — try daily_summary as fallback
      if (!res.ok && json.error?.includes('Unsupported event')) {
        const fallbackRes = await fetch('/api/webhooks/dispatch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event: 'daily_summary',
            data: {
              videos_created: 0,
              videos_posted: 0,
              total_views: 0,
            },
          }),
        });
        const fallbackJson = await fallbackRes.json();
        if (fallbackRes.ok && fallbackJson.ok) {
          setTestSent(true);
          showSuccess('Test message sent to Telegram (via daily_summary event)');
          fetchLogs();
          return;
        } else {
          showError(fallbackJson.error || 'Failed to send test message');
          return;
        }
      }

      if (res.ok && json.ok) {
        setTestSent(true);
        showSuccess('Test message sent to Telegram');
        fetchLogs();
      } else {
        showError(json.error || 'Failed to send test message');
      }
    } catch {
      showError('Network error — could not send test message');
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <AdminPageLayout title="Telegram Integration" subtitle="Configure Telegram bot notifications">
        <AdminCard>
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
            <span className="ml-3 text-zinc-500">Loading configuration...</span>
          </div>
        </AdminCard>
      </AdminPageLayout>
    );
  }

  const isConfigured = status?.telegram_configured ?? false;

  return (
    <AdminPageLayout title="Telegram Integration" subtitle="Configure Telegram bot notifications for real-time alerts">
      {/* Connection Status */}
      <AdminCard title="Connection Status">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div
              className={`w-3 h-3 rounded-full ${
                isConfigured ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.4)]'
              }`}
            />
            <span className="text-sm font-medium text-zinc-100">
              {isConfigured ? 'Telegram bot is connected and ready' : 'Telegram bot is not configured'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Bot Token Status */}
            <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-zinc-900 border border-zinc-700">
              <Bot className="w-5 h-5 text-zinc-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-zinc-300">Bot Token</div>
                <div className="text-xs text-zinc-500">TELEGRAM_BOT_TOKEN</div>
              </div>
              {status?.bot_token_set ? (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-full">
                  <Check className="w-3 h-3" />
                  Configured
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-red-400 bg-red-500/10 px-2 py-1 rounded-full">
                  <AlertTriangle className="w-3 h-3" />
                  Not set
                </span>
              )}
            </div>

            {/* Chat ID Status */}
            <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-zinc-900 border border-zinc-700">
              <Send className="w-5 h-5 text-zinc-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-zinc-300">Chat ID</div>
                <div className="text-xs text-zinc-500">TELEGRAM_CHAT_ID</div>
              </div>
              {status?.chat_id_set ? (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-full">
                  <Check className="w-3 h-3" />
                  Configured
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-red-400 bg-red-500/10 px-2 py-1 rounded-full">
                  <AlertTriangle className="w-3 h-3" />
                  Not set
                </span>
              )}
            </div>
          </div>

          {!isConfigured && (
            <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-sm text-amber-300">
                Telegram is not fully configured. Set both <code className="px-1.5 py-0.5 rounded bg-zinc-800 text-amber-200 font-mono text-xs">TELEGRAM_BOT_TOKEN</code> and{' '}
                <code className="px-1.5 py-0.5 rounded bg-zinc-800 text-amber-200 font-mono text-xs">TELEGRAM_CHAT_ID</code> in your Vercel environment variables.
              </p>
            </div>
          )}
        </div>
      </AdminCard>

      {/* Event Configuration */}
      <AdminCard title="Event Notifications" subtitle="Choose which events trigger Telegram notifications">
        <div className="space-y-1">
          {Object.entries(EVENT_LABELS).map(([event, { label, description }]) => (
            <label
              key={event}
              className="flex items-center gap-4 px-4 py-3 rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
            >
              <input
                type="checkbox"
                checked={enabledEvents[event] ?? true}
                onChange={() => toggleEvent(event)}
                className="w-4 h-4 rounded border-zinc-600 bg-zinc-900 text-violet-500 focus:ring-violet-500 focus:ring-offset-0 cursor-pointer"
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-zinc-200">{label}</div>
                <div className="text-xs text-zinc-500">{description}</div>
              </div>
              <div className="text-xs font-mono text-zinc-600 hidden sm:block">{event}</div>
            </label>
          ))}
        </div>
        <div className="mt-4 pt-4 border-t border-white/10">
          <p className="text-xs text-zinc-500">
            Event preferences are saved locally. Server-side event filtering is not yet implemented — all dispatched events will be delivered.
          </p>
        </div>
      </AdminCard>

      {/* Test Message */}
      <AdminCard title="Send Test Message" subtitle="Verify your Telegram bot connection is working">
        <div className="flex items-center gap-4">
          <AdminButton
            onClick={sendTestMessage}
            disabled={sending || !isConfigured}
            variant={testSent ? 'secondary' : 'primary'}
          >
            {sending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Sending...
              </>
            ) : testSent ? (
              <>
                <Check className="w-4 h-4 mr-2" />
                Sent
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                Send Test Message
              </>
            )}
          </AdminButton>
          {testSent && (
            <span className="text-sm text-emerald-400">Check your Telegram chat for the test message.</span>
          )}
          {!isConfigured && (
            <span className="text-sm text-zinc-500">Configure bot token and chat ID first.</span>
          )}
        </div>
      </AdminCard>

      {/* Recent Dispatch Log */}
      <AdminCard title="Recent Dispatches" subtitle="Last 10 Telegram messages sent">
        {logsLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
            <span className="ml-2 text-sm text-zinc-500">Loading logs...</span>
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-8">
            <Bell className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
            <p className="text-sm text-zinc-500">No dispatch logs yet.</p>
            <p className="text-xs text-zinc-600 mt-1">Logs will appear here after messages are sent via the dispatch API.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left">
                  <th className="pb-2 text-xs font-medium text-zinc-500 uppercase tracking-wide">Event</th>
                  <th className="pb-2 text-xs font-medium text-zinc-500 uppercase tracking-wide">Status</th>
                  <th className="pb-2 text-xs font-medium text-zinc-500 uppercase tracking-wide">Code</th>
                  <th className="pb-2 text-xs font-medium text-zinc-500 uppercase tracking-wide">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-white/5">
                    <td className="py-2.5 pr-4">
                      <span className="font-mono text-xs text-zinc-300">{log.event.replace('telegram.', '')}</span>
                    </td>
                    <td className="py-2.5 pr-4">
                      {log.success ? (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
                          <Check className="w-3 h-3" />
                          Delivered
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-red-400">
                          <AlertTriangle className="w-3 h-3" />
                          Failed
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 pr-4">
                      <span className="text-xs text-zinc-500">{log.status_code ?? '---'}</span>
                    </td>
                    <td className="py-2.5">
                      <span className="text-xs text-zinc-500">
                        {new Date(log.created_at).toLocaleString()}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminCard>

      {/* Setup Instructions */}
      <AdminCard title="Setup Instructions" subtitle="How to configure your Telegram bot">
        <div className="space-y-6">
          {/* Step 1 */}
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-violet-600/20 border border-violet-500/30 flex items-center justify-center">
              <span className="text-sm font-semibold text-violet-400">1</span>
            </div>
            <div>
              <h4 className="text-sm font-medium text-zinc-200">Create a bot via @BotFather</h4>
              <p className="text-xs text-zinc-500 mt-1">
                Open Telegram and search for <code className="px-1 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono text-xs">@BotFather</code>. Send{' '}
                <code className="px-1 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono text-xs">/newbot</code> and follow the prompts to create a new bot. Give it a name like
                &quot;FlashFlow Alerts&quot;.
              </p>
            </div>
          </div>

          {/* Step 2 */}
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-violet-600/20 border border-violet-500/30 flex items-center justify-center">
              <span className="text-sm font-semibold text-violet-400">2</span>
            </div>
            <div>
              <h4 className="text-sm font-medium text-zinc-200">Copy the bot token</h4>
              <p className="text-xs text-zinc-500 mt-1">
                After creation, BotFather will give you a token that looks like{' '}
                <code className="px-1 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono text-xs">123456789:ABCdefGhIJKlmNoPQRstuVWXyz</code>. Save this — you will need it for the next step.
              </p>
            </div>
          </div>

          {/* Step 3 */}
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-violet-600/20 border border-violet-500/30 flex items-center justify-center">
              <span className="text-sm font-semibold text-violet-400">3</span>
            </div>
            <div>
              <h4 className="text-sm font-medium text-zinc-200">Get your chat ID</h4>
              <p className="text-xs text-zinc-500 mt-1">
                Start a conversation with your new bot in Telegram (send any message). Then visit{' '}
                <code className="px-1 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono text-xs break-all">
                  https://api.telegram.org/bot&lt;TOKEN&gt;/getUpdates
                </code>{' '}
                in your browser to find your <code className="px-1 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono text-xs">chat.id</code> value in the JSON response.
              </p>
            </div>
          </div>

          {/* Step 4 */}
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-violet-600/20 border border-violet-500/30 flex items-center justify-center">
              <span className="text-sm font-semibold text-violet-400">4</span>
            </div>
            <div>
              <h4 className="text-sm font-medium text-zinc-200">Add environment variables</h4>
              <p className="text-xs text-zinc-500 mt-1">
                In your Vercel project settings (or <code className="px-1 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono text-xs">.env.local</code> for development), add:
              </p>
              <div className="mt-2 p-3 rounded-lg bg-zinc-900 border border-zinc-700 font-mono text-xs text-zinc-300 space-y-1">
                <div>
                  <span className="text-violet-400">TELEGRAM_BOT_TOKEN</span>=<span className="text-zinc-500">your_bot_token_here</span>
                </div>
                <div>
                  <span className="text-violet-400">TELEGRAM_CHAT_ID</span>=<span className="text-zinc-500">your_chat_id_here</span>
                </div>
              </div>
              <p className="text-xs text-zinc-500 mt-2">
                After adding the variables, redeploy your application. The status indicators above will update automatically.
              </p>
            </div>
          </div>
        </div>
      </AdminCard>
    </AdminPageLayout>
  );
}
