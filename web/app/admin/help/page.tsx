"use client";

import { useState, useRef, useEffect } from "react";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getApiAuthContext } from "@/lib/supabase/api-auth";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

export default function HelpPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "Hi! I'm FlashFlow's AI assistant. Ask me anything about using FlashFlow.",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [supportTicketOpen, setSupportTicketOpen] = useState(false);
  const [ticketMessage, setTicketMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMessage = input.trim();
    setInput("");
    setError(null);

    // Add user message to chat
    const newUserMessage: ChatMessage = {
      role: "user",
      content: userMessage,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, newUserMessage]);

    // Send to API
    setLoading(true);
    try {
      const response = await fetch("/api/help/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage,
          history: messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to get response");
      }

      const data = await response.json();
      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: data.response,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      setError("Failed to get response. Please try again.");
      console.error("[help] Error:", err);
      // Remove the user message if request failed
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitTicket = async () => {
    if (!ticketMessage.trim()) return;

    try {
      // Create feedback entry with type='support'
      const { error: feedbackError } = await supabaseAdmin.from("feedback").insert({
        type: "support",
        message: ticketMessage,
        metadata: {
          chat_history: messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        },
      });

      if (feedbackError) {
        throw feedbackError;
      }

      // Show success and close modal
      alert(
        "Support ticket submitted! Our team will respond within 24 hours."
      );
      setSupportTicketOpen(false);
      setTicketMessage("");
    } catch (err) {
      console.error("[help] Error submitting ticket:", err);
      alert("Failed to submit ticket. Please try again.");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="max-w-2xl mx-auto h-screen flex flex-col">
        {/* Header */}
        <div className="bg-slate-800 border-b border-slate-700 px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">FlashFlow Help</h1>
            <p className="text-sm text-slate-400 mt-1">
              AI assistant available 24/7
            </p>
          </div>
          <button
            onClick={() => setSupportTicketOpen(true)}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
          >
            Submit Ticket
          </button>
        </div>

        {/* Messages Container */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex ${
                msg.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`max-w-xs lg:max-w-md px-4 py-3 rounded-lg ${
                  msg.role === "user"
                    ? "bg-blue-600 text-white rounded-br-none"
                    : "bg-slate-700 text-slate-100 rounded-bl-none"
                }`}
              >
                <p className="text-sm leading-relaxed">{msg.content}</p>
                <p
                  className={`text-xs mt-1.5 ${
                    msg.role === "user"
                      ? "text-blue-200"
                      : "text-slate-400"
                  }`}
                >
                  {msg.timestamp.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            </div>
          ))}

          {/* Loading indicator */}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-slate-700 text-slate-100 px-4 py-3 rounded-lg rounded-bl-none">
                <div className="flex gap-2">
                  <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" />
                  <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce delay-100" />
                  <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce delay-200" />
                </div>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex justify-center">
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-2 rounded-lg text-sm">
                {error}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Form */}
        <div className="bg-slate-800 border-t border-slate-700 px-6 py-4">
          <form onSubmit={handleSendMessage} className="flex gap-3">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about FlashFlow features, pricing, troubleshooting..."
              disabled={loading}
              className="flex-1 px-4 py-3 rounded-lg bg-slate-700 border border-slate-600 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="px-6 py-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {loading ? "..." : "Send"}
            </button>
          </form>
          <p className="text-xs text-slate-500 mt-2">
            AI responses are based on FlashFlow's knowledge base. For urgent
            issues, use "Submit Ticket".
          </p>
        </div>
      </div>

      {/* Support Ticket Modal */}
      {supportTicketOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-800 rounded-lg max-w-md w-full p-6 border border-slate-700">
            <h2 className="text-xl font-bold text-white mb-4">
              Submit Support Ticket
            </h2>
            <textarea
              value={ticketMessage}
              onChange={(e) => setTicketMessage(e.target.value)}
              placeholder="Describe your issue in detail. Include any error messages or context."
              className="w-full px-4 py-3 rounded-lg bg-slate-700 border border-slate-600 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none h-32 mb-4"
            />
            <div className="flex gap-3">
              <button
                onClick={() => setSupportTicketOpen(false)}
                className="flex-1 px-4 py-2 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitTicket}
                disabled={!ticketMessage.trim()}
                className="flex-1 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Submit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
