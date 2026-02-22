'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { X, Loader2, ChevronRight, ArrowLeft, Send } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';

interface SupportThread {
  id: string;
  subject: string;
  status: string;
  priority: string;
  last_message_at: string;
  created_at: string;
}

interface SupportMessage {
  id: string;
  thread_id: string;
  sender_type: string;
  sender_email: string | null;
  body: string;
  is_internal: boolean;
  created_at: string;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  open: { label: 'Open', color: 'bg-blue-500' },
  waiting_on_customer: { label: 'Awaiting Reply', color: 'bg-amber-500' },
  resolved: { label: 'Resolved', color: 'bg-emerald-500' },
  closed: { label: 'Closed', color: 'bg-zinc-500' },
};

function getAnonSessionId(): string {
  if (typeof window === 'undefined') return 'anon';
  let id = sessionStorage.getItem('ff-support-anon-id');
  if (!id) {
    id = `anon-${crypto.randomUUID()}`;
    sessionStorage.setItem('ff-support-anon-id', id);
  }
  return id;
}

export function SupportWidget({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { authenticated, user } = useAuth();
  const { showSuccess, showError } = useToast();
  const isGuest = !authenticated || !user;

  const [view, setView] = useState<'list' | 'thread' | 'new'>('list');
  const [threads, setThreads] = useState<SupportThread[]>([]);
  const [loadingThreads, setLoadingThreads] = useState(false);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [threadDetail, setThreadDetail] = useState<SupportThread | null>(null);
  const [loadingMessages, setLoadingMessages] = useState(false);

  // New thread form
  const [newSubject, setNewSubject] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Reply
  const [reply, setReply] = useState('');
  const [sendingReply, setSendingReply] = useState(false);

  // Guest live-chat state
  const [guestThreadId, setGuestThreadId] = useState<string | null>(null);
  const [guestInput, setGuestInput] = useState('');
  const [guestSending, setGuestSending] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const fetchThreads = useCallback(async () => {
    setLoadingThreads(true);
    try {
      const res = await fetch('/api/support/threads');
      if (res.ok) {
        const json = await res.json();
        setThreads(json.data || []);
      }
    } catch {
      // Silent fail
    } finally {
      setLoadingThreads(false);
    }
  }, []);

  const fetchMessages = useCallback(async (threadId: string) => {
    setLoadingMessages(true);
    try {
      const res = await fetch(`/api/support/threads/${threadId}`);
      if (res.ok) {
        const json = await res.json();
        setMessages(json.messages || []);
        setThreadDetail(json.thread || null);
      }
    } catch {
      // Silent fail
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  // Load threads when opened (authenticated only)
  useEffect(() => {
    if (isOpen && !isGuest) {
      fetchThreads();
      setView('list');
    } else if (isOpen && isGuest) {
      setView('new');
    }
  }, [isOpen, isGuest, fetchThreads]);

  // Poll for new messages when viewing a thread
  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (view === 'thread' && selectedThreadId) {
      pollRef.current = setInterval(() => {
        fetchMessages(selectedThreadId);
      }, 15000);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [view, selectedThreadId, fetchMessages]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const openThread = (threadId: string) => {
    setSelectedThreadId(threadId);
    setView('thread');
    fetchMessages(threadId);
  };

  const handleNewThread = async () => {
    if (!newSubject.trim() || !newMessage.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/support/threads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: newSubject.trim(), message: newMessage.trim() }),
      });
      if (res.ok) {
        const json = await res.json();
        showSuccess('Support thread created!');
        setNewSubject('');
        setNewMessage('');
        openThread(json.thread_id);
        fetchThreads();
      } else {
        const json = await res.json();
        showError(json.error || 'Failed to create thread');
      }
    } catch {
      showError('Failed to create thread');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReply = async () => {
    if (!reply.trim() || !selectedThreadId) return;
    setSendingReply(true);
    try {
      const res = await fetch(`/api/support/threads/${selectedThreadId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: reply.trim() }),
      });
      if (res.ok) {
        setReply('');
        fetchMessages(selectedThreadId);
        fetchThreads();
      } else {
        showError('Failed to send message');
      }
    } catch {
      showError('Failed to send message');
    } finally {
      setSendingReply(false);
    }
  };

  // Guest live-chat: sends message to /api/support/live with anon session
  const handleGuestSend = async (initialMessage?: string) => {
    const msg = initialMessage || guestInput.trim();
    if (!msg) return;
    setGuestSending(true);

    // Optimistically add the user message to the local messages list
    const tempUserMsg: SupportMessage = {
      id: `temp-${Date.now()}`,
      thread_id: guestThreadId || '',
      sender_type: 'user',
      sender_email: null,
      body: msg,
      is_internal: false,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);
    setGuestInput('');

    try {
      const res = await fetch('/api/support/live', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: msg,
          thread_id: guestThreadId,
          visitor_email: getAnonSessionId(),
          subject: !guestThreadId ? msg.slice(0, 100) : undefined,
        }),
      });

      if (res.ok) {
        const json = await res.json();
        if (!guestThreadId) {
          setGuestThreadId(json.thread_id);
        }
        // Add bot response
        const botMsg: SupportMessage = {
          id: `bot-${Date.now()}`,
          thread_id: json.thread_id,
          sender_type: 'system',
          sender_email: 'support-bot@flashflowai.com',
          body: json.response,
          is_internal: false,
          created_at: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, botMsg]);
        setView('thread');
      } else {
        showError('Failed to send message');
      }
    } catch {
      showError('Failed to send message');
    } finally {
      setGuestSending(false);
    }
  };

  const handleClose = () => {
    onClose();
    setTimeout(() => {
      setView('list');
      setSelectedThreadId(null);
      setMessages([]);
      setNewSubject('');
      setNewMessage('');
      setReply('');
      if (isGuest) {
        setGuestThreadId(null);
        setGuestInput('');
      }
    }, 300);
  };

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-50 lg:bg-transparent lg:pointer-events-none"
          onClick={handleClose}
        />
      )}

      {/* Slide-out Drawer */}
      <div
        className={`fixed top-0 right-0 bottom-0 z-50 w-full sm:w-[420px] bg-zinc-950 border-l border-zinc-800 shadow-2xl transform transition-transform duration-300 ease-out flex flex-col ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-zinc-950/95 backdrop-blur-sm border-b border-zinc-800 px-5 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            {view !== 'list' && !isGuest && (
              <button
                onClick={() => { setView('list'); setSelectedThreadId(null); setMessages([]); }}
                className="p-1 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <h2 className="text-lg font-semibold text-zinc-100">
              {isGuest ? 'Support Chat' : view === 'list' ? 'Support' : view === 'new' ? 'New Thread' : threadDetail?.subject || 'Thread'}
            </h2>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {view === 'list' && (
            <div className="p-5 space-y-3">
              <button
                onClick={() => setView('new')}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-violet-600 hover:bg-violet-500 text-white font-medium rounded-xl transition-colors"
              >
                New Support Thread
                <ChevronRight className="w-4 h-4" />
              </button>

              {loadingThreads ? (
                <div className="flex items-center gap-2 text-sm text-zinc-500 justify-center py-8">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading...
                </div>
              ) : threads.length === 0 ? (
                <p className="text-sm text-zinc-600 text-center py-8">No support threads yet.</p>
              ) : (
                <div className="space-y-2">
                  {threads.map((t) => {
                    const statusInfo = STATUS_LABELS[t.status] || STATUS_LABELS.open;
                    return (
                      <button
                        key={t.id}
                        onClick={() => openThread(t.id)}
                        className="w-full flex items-center gap-3 p-3 bg-zinc-900/50 hover:bg-zinc-800/50 rounded-xl transition-colors text-left"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-zinc-200 truncate">{t.subject}</p>
                          <p className="text-xs text-zinc-500 mt-0.5">
                            {new Date(t.last_message_at).toLocaleDateString()}
                          </p>
                        </div>
                        <span className={`px-2 py-0.5 text-[10px] font-medium text-white rounded-full flex-shrink-0 ${statusInfo.color}`}>
                          {statusInfo.label}
                        </span>
                        <ChevronRight className="w-4 h-4 text-zinc-600 flex-shrink-0" />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {view === 'new' && isGuest && (
            <div className="p-5 space-y-4">
              <p className="text-sm text-zinc-400">Ask us anything — no account needed.</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={guestInput}
                  onChange={(e) => setGuestInput(e.target.value)}
                  placeholder="Type your question..."
                  maxLength={5000}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleGuestSend(); } }}
                  className="flex-1 px-3 py-2.5 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-violet-500 transition-colors"
                />
                <button
                  onClick={() => handleGuestSend()}
                  disabled={guestSending || !guestInput.trim()}
                  className="px-3 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white rounded-lg transition-colors"
                >
                  {guestSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}

          {view === 'new' && !isGuest && (
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">Subject</label>
                <input
                  type="text"
                  value={newSubject}
                  onChange={(e) => setNewSubject(e.target.value)}
                  placeholder="What do you need help with?"
                  maxLength={200}
                  className="w-full px-3 py-2.5 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-colors"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">Message</label>
                <textarea
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Describe your issue or question in detail..."
                  rows={5}
                  maxLength={5000}
                  className="w-full px-3 py-2.5 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-colors resize-none"
                />
              </div>
              <button
                onClick={handleNewThread}
                disabled={submitting || !newSubject.trim() || newMessage.trim().length < 5}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-violet-600 hover:bg-violet-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white font-medium rounded-xl transition-colors"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    Submit Thread
                    <ChevronRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          )}

          {view === 'thread' && (
            <div className="flex flex-col h-full">
              {/* Status (authenticated only) */}
              {!isGuest && threadDetail && (
                <div className="px-5 py-2 border-b border-zinc-800 flex items-center gap-2">
                  <span className={`px-2 py-0.5 text-[10px] font-medium text-white rounded-full ${(STATUS_LABELS[threadDetail.status] || STATUS_LABELS.open).color}`}>
                    {(STATUS_LABELS[threadDetail.status] || STATUS_LABELS.open).label}
                  </span>
                  <span className="text-xs text-zinc-500">
                    Created {new Date(threadDetail.created_at).toLocaleDateString()}
                  </span>
                </div>
              )}

              {/* Messages */}
              {loadingMessages && !isGuest ? (
                <div className="flex items-center gap-2 text-sm text-zinc-500 justify-center py-8">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading...
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto p-5 space-y-3">
                  {messages.map((msg) => {
                    const isUser = msg.sender_type === 'user';
                    return (
                      <div
                        key={msg.id}
                        className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
                            isUser
                              ? 'bg-violet-600 text-white'
                              : 'bg-zinc-800 text-zinc-200'
                          }`}
                        >
                          <p className="text-sm whitespace-pre-wrap">{msg.body}</p>
                          <p className={`text-[10px] mt-1 ${isUser ? 'text-violet-200' : 'text-zinc-500'}`}>
                            {new Date(msg.created_at).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                  {guestSending && (
                    <div className="flex justify-start">
                      <div className="bg-zinc-800 text-zinc-400 rounded-2xl px-4 py-2.5">
                        <Loader2 className="w-4 h-4 animate-spin" />
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Reply box — guest uses live chat, authenticated uses thread reply */}
        {view === 'thread' && isGuest && (
          <div className="border-t border-zinc-800 p-4">
            <div className="flex gap-2">
              <input
                type="text"
                value={guestInput}
                onChange={(e) => setGuestInput(e.target.value)}
                placeholder="Type your message..."
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleGuestSend(); } }}
                className="flex-1 px-3 py-2.5 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-violet-500 transition-colors"
              />
              <button
                onClick={() => handleGuestSend()}
                disabled={guestSending || !guestInput.trim()}
                className="px-3 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white rounded-lg transition-colors"
              >
                {guestSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
          </div>
        )}
        {view === 'thread' && !isGuest && selectedThreadId && (
          <div className="border-t border-zinc-800 p-4">
            <div className="flex gap-2">
              <input
                type="text"
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="Type your reply..."
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleReply(); } }}
                className="flex-1 px-3 py-2.5 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-violet-500 transition-colors"
              />
              <button
                onClick={handleReply}
                disabled={sendingReply || !reply.trim()}
                className="px-3 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white rounded-lg transition-colors"
              >
                {sendingReply ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
