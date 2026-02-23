'use client';

import { useState, useRef, useEffect } from 'react';
import { Sparkles, ChevronDown, ChevronUp, Send } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface ScriptAssistantChatProps {
  scriptBody: string;
  hookLine: string;
  productName: string;
  brandName: string;
}

const NUDGES = [
  'Make the hook more attention-grabbing',
  'Tighten up the pacing',
  'Make it sound more conversational',
  'Add more urgency',
  'Rewrite for a younger audience',
  'Suggest a stronger CTA',
];

export default function ScriptAssistantChat({
  scriptBody,
  hookLine,
  productName,
  brandName,
}: ScriptAssistantChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (expanded) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, expanded]);

  const sendMessage = async (text?: string) => {
    const userMessage = (text ?? input).trim();
    if (!userMessage || loading) return;

    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setLoading(true);

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          context: {
            brand: brandName,
            product: productName,
            current_script: `Hook: ${hookLine}\n\n${scriptBody}`,
          },
        }),
      });

      const data = await res.json();
      if (data.ok && data.response) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.response }]);
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, I could not process that request.' }]);
      }
    } catch (err) {
      console.error('Script assistant chat error:', err);
      setMessages(prev => [...prev, { role: 'assistant', content: 'Error connecting to AI service.' }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ marginBottom: '28px' }}>
      {/* Toggle bar */}
      <button
        type="button"
        onClick={() => setExpanded(prev => !prev)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '12px 16px',
          backgroundColor: '#18181b',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: expanded ? '12px 12px 0 0' : '12px',
          color: '#a1a1aa',
          fontSize: '13px',
          fontWeight: 600,
          cursor: 'pointer',
          transition: 'all 0.2s ease',
        }}
      >
        <Sparkles size={14} style={{ color: '#a78bfa' }} />
        <span style={{ flex: 1, textAlign: 'left' }}>AI Script Assistant</span>
        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {/* Expanded panel */}
      {expanded && (
        <div style={{
          padding: '16px',
          backgroundColor: '#18181b',
          border: '1px solid rgba(255,255,255,0.1)',
          borderTop: 'none',
          borderRadius: '0 0 12px 12px',
        }}>
          {/* Messages area */}
          <div style={{
            maxHeight: '300px',
            overflow: 'auto',
            marginBottom: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}>
            {messages.length === 0 && (
              <div style={{
                textAlign: 'center',
                padding: '24px 16px',
                color: '#71717a',
              }}>
                <div style={{ fontSize: '13px', marginBottom: '6px' }}>
                  Ask AI for help with your script — hooks, pacing, wording, and more
                </div>
                <div style={{ fontSize: '11px', color: '#52525b' }}>
                  Try the suggestions below or type your own request
                </div>
              </div>
            )}
            {messages.map((msg, idx) => (
              <div
                key={idx}
                style={{
                  padding: '10px 12px',
                  borderRadius: '8px',
                  backgroundColor: msg.role === 'user' ? '#2d5a87' : '#27272a',
                  alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '85%',
                  fontSize: '13px',
                  lineHeight: 1.5,
                  color: '#fff',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {msg.content}
              </div>
            ))}
            {loading && (
              <div style={{
                padding: '10px 12px',
                borderRadius: '8px',
                backgroundColor: '#27272a',
                alignSelf: 'flex-start',
                fontSize: '13px',
                color: '#71717a',
              }}>
                Thinking...
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input row */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              placeholder="Ask AI for help with your script..."
              style={{
                flex: 1,
                padding: '10px 12px',
                backgroundColor: '#09090b',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '8px',
                fontSize: '13px',
                color: '#fff',
              }}
              disabled={loading}
            />
            <button
              type="button"
              onClick={() => sendMessage()}
              disabled={loading || !input.trim()}
              style={{
                padding: '10px 14px',
                backgroundColor: loading || !input.trim() ? '#3f3f46' : '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
                fontSize: '13px',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <Send size={14} />
            </button>
          </div>

          {/* Nudge buttons */}
          <div style={{ marginTop: '10px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {NUDGES.map((prompt) => (
              <button
                type="button"
                key={prompt}
                onClick={() => setInput(prompt)}
                style={{
                  padding: '4px 10px',
                  backgroundColor: 'transparent',
                  border: 'none',
                  fontSize: '11px',
                  color: '#71717a',
                  cursor: 'pointer',
                }}
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
