'use client';

import { useState, useEffect, useCallback, useRef, use } from 'react';
import { Loader2, Send, StickyNote, Sparkles } from 'lucide-react';
import AdminPageLayout, { AdminCard } from '@/app/admin/components/AdminPageLayout';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';

const STATUS_OPTIONS = [
  { value: 'open', label: 'Open', color: 'bg-blue-500' },
  { value: 'waiting_on_customer', label: 'Waiting', color: 'bg-amber-500' },
  { value: 'resolved', label: 'Resolved', color: 'bg-emerald-500' },
  { value: 'closed', label: 'Closed', color: 'bg-zinc-500' },
];

const PRIORITY_OPTIONS = ['low', 'normal', 'high', 'urgent'];

interface SupportThread {
  id: string;
  user_email: string | null;
  subject: string;
  status: string;
  priority: string;
  tags: string[] | null;
  assigned_to: string | null;
  last_message_at: string;
  created_at: string;
}

interface SupportMessage {
  id: string;
  sender_type: string;
  sender_email: string | null;
  body: string;
  is_internal: boolean;
  created_at: string;
}

export default function AdminThreadDetailPage({ params }: { params: Promise<{ threadId: string }> }) {
  const { threadId } = use(params);
  const { isAdmin, loading: authLoading } = useAuth();
  const { showSuccess, showError } = useToast();

  const [thread, setThread] = useState<SupportThread | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [isInternal, setIsInternal] = useState(false);
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftConfidence, setDraftConfidence] = useState<number | null>(null);
  const [suggestedTags, setSuggestedTags] = useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchThread = useCallback(async () => {
    try {
      const res = await fetch(`/api/support/threads/${threadId}`);
      if (res.ok) {
        const json = await res.json();
        setThread(json.thread);
        setMessages(json.messages || []);
      }
    } catch {
      showError('Failed to load thread');
    } finally {
      setLoading(false);
    }
  }, [threadId, showError]);

  useEffect(() => {
    if (isAdmin) fetchThread();
  }, [isAdmin, fetchThread]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (internal: boolean) => {
    if (!reply.trim()) return;
    setSending(true);
    try {
      const res = await fetch(`/api/support/threads/${threadId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: reply.trim(), is_internal: internal }),
      });
      if (res.ok) {
        setReply('');
        showSuccess(internal ? 'Internal note added' : 'Reply sent');
        fetchThread();
      } else {
        showError('Failed to send');
      }
    } catch {
      showError('Failed to send');
    } finally {
      setSending(false);
    }
  };

  const updateThread = async (field: string, value: string) => {
    try {
      const res = await fetch(`/api/support/threads/${threadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      });
      if (res.ok) {
        setThread((prev) => prev ? { ...prev, [field]: value } : prev);
        showSuccess(`${field} updated`);
      }
    } catch {
      showError('Failed to update');
    }
  };

  const draftAiReply = async () => {
    setDraftLoading(true);
    setDraftConfidence(null);
    setSuggestedTags([]);
    try {
      const res = await fetch('/api/support/draft-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thread_id: threadId }),
      });
      const json = await res.json();
      if (res.ok && json.ok) {
        setReply(json.draft || '');
        setDraftConfidence(json.confidence ?? null);
        setSuggestedTags(json.suggested_tags || []);
        const level = json.confidence >= 0.8 ? 'high' : json.confidence >= 0.5 ? 'medium' : 'low';
        showSuccess(`AI draft generated (${level} confidence)`);
      } else {
        showError(json.message || json.error || 'Failed to draft reply');
      }
    } catch {
      showError('Failed to draft reply');
    } finally {
      setDraftLoading(false);
    }
  };

  if (authLoading || loading) {
    return (
      <AdminPageLayout title="Support Thread" breadcrumbs={[{ label: 'Support', href: '/admin/support' }, { label: 'Thread' }]}>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
        </div>
      </AdminPageLayout>
    );
  }

  if (!isAdmin || !thread) {
    return (
      <AdminPageLayout title="Support Thread" breadcrumbs={[{ label: 'Support', href: '/admin/support' }, { label: 'Thread' }]}>
        <p className="text-zinc-500">{!isAdmin ? 'Admin access required.' : 'Thread not found.'}</p>
      </AdminPageLayout>
    );
  }

  return (
    <AdminPageLayout
      title={thread.subject}
      subtitle={`From ${thread.user_email || 'anonymous'} — ${new Date(thread.created_at).toLocaleDateString()}`}
      breadcrumbs={[{ label: 'Support', href: '/admin/support' }, { label: thread.subject }]}
    >
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Messages - Main Column */}
        <div className="lg:col-span-3 space-y-4">
          <AdminCard title="Conversation" noPadding>
            <div className="max-h-[500px] overflow-y-auto p-5 space-y-3">
              {messages.map((msg) => {
                const isUser = msg.sender_type === 'user';
                const isNote = msg.is_internal;
                return (
                  <div
                    key={msg.id}
                    className={`rounded-xl px-4 py-3 ${
                      isNote
                        ? 'bg-amber-500/10 border border-amber-500/20'
                        : isUser
                          ? 'bg-zinc-800'
                          : 'bg-violet-600/20 border border-violet-500/20'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-zinc-400">
                        {isNote ? '(Internal Note)' : isUser ? (msg.sender_email || 'User') : 'Admin'}
                      </span>
                      <span className="text-[10px] text-zinc-600">
                        {new Date(msg.created_at).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-sm text-zinc-200 whitespace-pre-wrap">{msg.body}</p>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          </AdminCard>

          {/* Reply Box */}
          <AdminCard title="Reply">
            <div className="space-y-3">
              <textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="Type your reply..."
                rows={4}
                className="w-full px-3 py-2.5 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-violet-500 resize-none"
              />
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => sendMessage(false)}
                  disabled={sending || !reply.trim()}
                  className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  <Send className="w-4 h-4" />
                  Send to Customer
                </button>
                <button
                  onClick={() => sendMessage(true)}
                  disabled={sending || !reply.trim()}
                  className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  <StickyNote className="w-4 h-4" />
                  Add Internal Note
                </button>
                <button
                  onClick={draftAiReply}
                  disabled={draftLoading}
                  className="flex items-center gap-2 px-4 py-2 bg-zinc-800 text-zinc-400 text-sm font-medium rounded-lg transition-colors hover:bg-zinc-700 hover:text-zinc-300 disabled:opacity-50"
                >
                  {draftLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {draftLoading ? 'Drafting...' : 'Draft Reply (AI)'}
                </button>
                {draftConfidence !== null && (
                  <span className={`text-[10px] px-2 py-0.5 rounded-full leading-none font-medium ${
                    draftConfidence >= 0.8
                      ? 'bg-emerald-900/40 text-emerald-400'
                      : draftConfidence >= 0.5
                        ? 'bg-amber-900/40 text-amber-400'
                        : 'bg-red-900/40 text-red-400'
                  }`}>
                    {Math.round(draftConfidence * 100)}% confidence
                  </span>
                )}
              </div>
              {suggestedTags.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] text-zinc-500 uppercase font-medium">Suggested tags:</span>
                  {suggestedTags.map((tag) => (
                    <button
                      key={tag}
                      onClick={() => {
                        const currentTags = thread?.tags || [];
                        if (!currentTags.includes(tag)) {
                          updateThread('tags', [...currentTags, tag] as unknown as string);
                          showSuccess(`Tag "${tag}" applied`);
                        }
                      }}
                      className="text-[11px] px-2 py-0.5 bg-violet-900/30 text-violet-400 rounded-full hover:bg-violet-900/50 transition-colors cursor-pointer"
                    >
                      + {tag}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </AdminCard>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <AdminCard title="Details">
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-zinc-500 uppercase mb-1.5 block">Status</label>
                <select
                  value={thread.status}
                  onChange={(e) => updateThread('status', e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-200 focus:outline-none focus:border-violet-500"
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-500 uppercase mb-1.5 block">Priority</label>
                <select
                  value={thread.priority}
                  onChange={(e) => updateThread('priority', e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-200 focus:outline-none focus:border-violet-500"
                >
                  {PRIORITY_OPTIONS.map((p) => (
                    <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-500 uppercase mb-1.5 block">Assigned To</label>
                <input
                  type="text"
                  value={thread.assigned_to || ''}
                  onChange={(e) => updateThread('assigned_to', e.target.value)}
                  placeholder="Unassigned"
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-violet-500"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-500 uppercase mb-1.5 block">Customer</label>
                <p className="text-sm text-zinc-300">{thread.user_email || 'anonymous'}</p>
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-500 uppercase mb-1.5 block">Created</label>
                <p className="text-sm text-zinc-300">{new Date(thread.created_at).toLocaleString()}</p>
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-500 uppercase mb-1.5 block">Last Activity</label>
                <p className="text-sm text-zinc-300">{new Date(thread.last_message_at).toLocaleString()}</p>
              </div>
            </div>
          </AdminCard>
        </div>
      </div>
    </AdminPageLayout>
  );
}
