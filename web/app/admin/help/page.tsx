'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Loader2, Bot, User, LifeBuoy, MessageSquare } from 'lucide-react';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const SUGGESTIONS = [
  'How do I generate a script?',
  'What are credits used for?',
  'How do I upgrade my plan?',
  'What is Winners Bank?',
];

export default function HelpPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content:
        "Hi! I'm FlashFlow's AI assistant. Ask me anything about features, plans, credits, or troubleshooting. I'm here to help!",
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showTicketForm, setShowTicketForm] = useState(false);
  const [ticketTitle, setTicketTitle] = useState('');
  const [ticketDescription, setTicketDescription] = useState('');
  const [ticketSubmitting, setTicketSubmitting] = useState(false);
  const [ticketSuccess, setTicketSuccess] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (text?: string) => {
    const messageText = text || input.trim();
    if (!messageText || loading) return;

    const userMessage: ChatMessage = { role: 'user', content: messageText };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/help/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: messageText,
          history: messages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      const data = await res.json();

      if (data.ok && data.response) {
        setMessages((prev) => [...prev, { role: 'assistant', content: data.response }]);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: data.error || 'Sorry, something went wrong. Please try again.' },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Network error. Please check your connection and try again.' },
      ]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleSubmitTicket = async () => {
    if (!ticketTitle.trim() || !ticketDescription.trim() || ticketSubmitting) return;

    setTicketSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('type', 'support');
      formData.append('title', ticketTitle.trim());
      formData.append('description', ticketDescription.trim());
      formData.append('page_url', window.location.href);
      formData.append('user_agent', navigator.userAgent);

      const res = await fetch('/api/feedback', { method: 'POST', body: formData });
      const data = await res.json();

      if (data.ok) {
        setTicketSuccess(true);
        setTicketTitle('');
        setTicketDescription('');
        setTimeout(() => {
          setShowTicketForm(false);
          setTicketSuccess(false);
        }, 3000);
      }
    } catch {
      // Silent fail — user can retry
    } finally {
      setTicketSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto pb-24 lg:pb-6 flex flex-col" style={{ height: 'calc(100vh - 80px)' }}>
      {/* Header */}
      <div className="mb-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal-500/20 flex items-center justify-center">
            <MessageSquare className="w-5 h-5 text-teal-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">FlashFlow Help</h1>
            <p className="text-sm text-zinc-500">AI assistant + support tickets</p>
          </div>
        </div>
      </div>

      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 space-y-4 min-h-0">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
          >
            <div
              className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                msg.role === 'assistant' ? 'bg-teal-500/20' : 'bg-zinc-700'
              }`}
            >
              {msg.role === 'assistant' ? (
                <Bot className="w-4 h-4 text-teal-400" />
              ) : (
                <User className="w-4 h-4 text-zinc-300" />
              )}
            </div>
            <div
              className={`max-w-[80%] rounded-xl px-4 py-2.5 text-sm leading-relaxed ${
                msg.role === 'assistant'
                  ? 'bg-zinc-800 text-zinc-200'
                  : 'bg-teal-600 text-white'
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex gap-3">
            <div className="w-7 h-7 rounded-lg bg-teal-500/20 flex items-center justify-center shrink-0">
              <Bot className="w-4 h-4 text-teal-400" />
            </div>
            <div className="bg-zinc-800 rounded-xl px-4 py-2.5">
              <Loader2 className="w-4 h-4 text-zinc-400 animate-spin" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggestions (only show when there's just the welcome message) */}
      {messages.length === 1 && (
        <div className="flex flex-wrap gap-2 mt-3 shrink-0">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => sendMessage(s)}
              className="px-3 py-1.5 text-xs bg-zinc-800 text-zinc-400 rounded-lg hover:bg-zinc-700 hover:text-zinc-300 transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="mt-3 shrink-0">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage();
          }}
          className="flex gap-2"
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about FlashFlow features, plans, credits..."
            className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/20"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="px-4 py-3 bg-teal-600 text-white rounded-xl hover:bg-teal-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>

        {/* Support Ticket Toggle */}
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowTicketForm(!showTicketForm)}
            className="flex items-center gap-2 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <LifeBuoy className="w-3.5 h-3.5" />
            {showTicketForm ? 'Hide support form' : 'Need more help? Submit a support ticket'}
          </button>
        </div>
      </div>

      {/* Support Ticket Form */}
      {showTicketForm && (
        <div className="mt-3 bg-zinc-900 border border-zinc-800 rounded-xl p-4 shrink-0">
          {ticketSuccess ? (
            <div className="text-sm text-teal-400 text-center py-2">
              Ticket submitted! We'll get back to you soon.
            </div>
          ) : (
            <>
              <h3 className="text-sm font-semibold text-zinc-300 mb-3">Submit Support Ticket</h3>
              <input
                type="text"
                value={ticketTitle}
                onChange={(e) => setTicketTitle(e.target.value)}
                placeholder="Brief summary of your issue"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-teal-500/50 mb-2"
                maxLength={200}
              />
              <textarea
                value={ticketDescription}
                onChange={(e) => setTicketDescription(e.target.value)}
                placeholder="Describe your issue in detail (min 10 characters)..."
                rows={3}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-teal-500/50 mb-3 resize-none"
                maxLength={5000}
              />
              <button
                type="button"
                onClick={handleSubmitTicket}
                disabled={
                  ticketSubmitting ||
                  ticketTitle.trim().length < 3 ||
                  ticketDescription.trim().length < 10
                }
                className="w-full py-2.5 bg-zinc-700 text-zinc-200 rounded-lg text-sm font-medium hover:bg-zinc-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {ticketSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                ) : (
                  'Submit Ticket'
                )}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
