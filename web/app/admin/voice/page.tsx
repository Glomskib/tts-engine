'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, MicOff, Send, Volume2, Loader2, Square, Trash2 } from 'lucide-react';

// Web Speech API type declarations
interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: (event: SpeechRecognitionEvent) => void;
  onerror: (event: SpeechRecognitionErrorEvent) => void;
  onend: () => void;
}

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
  isFinal: boolean;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message: string;
}

declare global {
  interface Window {
    SpeechRecognition: {
      new(): SpeechRecognition;
    };
    webkitSpeechRecognition: {
      new(): SpeechRecognition;
    };
  }
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export default function VoicePage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [textInput, setTextInput] = useState('');
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const synthRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Initialize speech recognition
  const startListening = useCallback(() => {
    setError(null);

    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) {
      setError('Speech recognition not supported in this browser. Try Chrome or Edge.');
      return;
    }

    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const results = Array.from(event.results);
      const transcript = results.map(r => r[0].transcript).join('');
      setTranscript(transcript);

      if (event.results[event.results.length - 1].isFinal) {
        handleSendMessage(transcript);
        setTranscript('');
        setIsListening(false);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error('Speech recognition error:', event.error);
      if (event.error !== 'no-speech') {
        setError(`Recognition error: ${event.error}`);
      }
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, []);

  const stopListening = () => {
    recognitionRef.current?.stop();
    setIsListening(false);
    if (transcript) {
      handleSendMessage(transcript);
      setTranscript('');
    }
  };

  const speak = (text: string) => {
    if (!window.speechSynthesis) return;

    // Cancel any current speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    // Try to find a good English voice
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(v => v.name.includes('Samantha') || v.name.includes('Google US'));
    if (preferred) utterance.voice = preferred;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);

    synthRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  };

  const stopSpeaking = () => {
    window.speechSynthesis?.cancel();
    setIsSpeaking(false);
  };

  const handleSendMessage = async (text: string) => {
    if (!text.trim() || isProcessing) return;

    const userMsg: Message = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: text.trim(),
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);
    setIsProcessing(true);

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text.trim(),
          context: {
            interface: 'voice',
          },
        }),
      });

      const data = await res.json();
      const responseText = data.ok ? data.response : (data.message || 'Sorry, something went wrong.');

      const assistantMsg: Message = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: responseText,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, assistantMsg]);

      if (autoSpeak) {
        speak(responseText);
      }
    } catch {
      const errorMsg: Message = {
        id: `e-${Date.now()}`,
        role: 'assistant',
        content: 'Connection error. Please check your network and try again.',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMsg]);
    }

    setIsProcessing(false);
  };

  const handleTextSubmit = () => {
    if (textInput.trim()) {
      handleSendMessage(textInput);
      setTextInput('');
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
      {/* Header */}
      <div className="border-b border-zinc-800 bg-zinc-900/50 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
            <Mic className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">Voice Assistant</h1>
            <p className="text-xs text-zinc-500">Talk to Bolt — push the mic to speak</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={autoSpeak}
              onChange={e => setAutoSpeak(e.target.checked)}
              className="w-4 h-4 rounded bg-zinc-800 border-zinc-600 text-indigo-600 focus:ring-indigo-500/50"
            />
            <span className="text-xs text-zinc-400">Auto-speak responses</span>
          </label>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={() => setMessages([])}
              className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-500"
              title="Clear conversation"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-auto px-4 py-6 max-w-2xl mx-auto w-full">
        {messages.length === 0 && !isListening && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-20 h-20 rounded-full bg-indigo-600/20 flex items-center justify-center mb-4">
              <Mic className="w-10 h-10 text-indigo-400" />
            </div>
            <h2 className="text-xl font-semibold mb-2">Hey Brandon!</h2>
            <p className="text-zinc-400 text-sm max-w-sm">
              Tap the microphone to start talking, or type below. I can help with scripts,
              pipeline status, performance data, and more.
            </p>
          </div>
        )}

        {messages.map(msg => (
          <div key={msg.id} className={`mb-4 flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${
              msg.role === 'user'
                ? 'bg-indigo-600 text-white'
                : 'bg-zinc-800 text-zinc-200'
            }`}>
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
              <p className={`text-[10px] mt-1 ${msg.role === 'user' ? 'text-indigo-200' : 'text-zinc-500'}`}>
                {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
            {msg.role === 'assistant' && !isSpeaking && (
              <button
                type="button"
                onClick={() => speak(msg.content)}
                className="ml-2 p-1.5 rounded-full hover:bg-zinc-800 self-end"
                title="Read aloud"
              >
                <Volume2 className="w-3.5 h-3.5 text-zinc-500" />
              </button>
            )}
          </div>
        ))}

        {/* Processing indicator */}
        {isProcessing && (
          <div className="mb-4 flex justify-start">
            <div className="bg-zinc-800 rounded-2xl px-4 py-3 flex items-center gap-2">
              <Loader2 className="w-4 h-4 text-zinc-400 animate-spin" />
              <span className="text-sm text-zinc-400">Thinking...</span>
            </div>
          </div>
        )}

        {/* Live transcript */}
        {isListening && transcript && (
          <div className="mb-4 flex justify-end">
            <div className="bg-indigo-600/50 rounded-2xl px-4 py-3 border border-indigo-500/30">
              <p className="text-sm text-indigo-200 italic">{transcript}</p>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 pb-2 max-w-2xl mx-auto w-full">
          <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">
            {error}
          </div>
        </div>
      )}

      {/* Input area */}
      <div className="border-t border-zinc-800 bg-zinc-900/50 px-4 py-4">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          {/* Text input */}
          <div className="flex-1 relative">
            <input
              type="text"
              value={textInput}
              onChange={e => setTextInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleTextSubmit(); }}
              placeholder="Type a message..."
              className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 pr-12"
              disabled={isProcessing}
            />
            {textInput.trim() && (
              <button
                type="button"
                onClick={handleTextSubmit}
                disabled={isProcessing}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg bg-indigo-600 hover:bg-indigo-500"
              >
                <Send className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Mic button */}
          {isSpeaking ? (
            <button
              type="button"
              onClick={stopSpeaking}
              className="w-14 h-14 rounded-full bg-orange-600 hover:bg-orange-500 flex items-center justify-center shadow-lg shadow-orange-600/30 transition-all"
              title="Stop speaking"
            >
              <Square className="w-5 h-5 text-white" />
            </button>
          ) : isListening ? (
            <button
              type="button"
              onClick={stopListening}
              className="w-14 h-14 rounded-full bg-red-600 hover:bg-red-500 flex items-center justify-center shadow-lg shadow-red-600/30 animate-pulse transition-all"
              title="Stop listening"
            >
              <MicOff className="w-5 h-5 text-white" />
            </button>
          ) : (
            <button
              type="button"
              onClick={startListening}
              disabled={isProcessing}
              className="w-14 h-14 rounded-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/50 flex items-center justify-center shadow-lg shadow-indigo-600/30 transition-all hover:scale-105"
              title="Start listening"
            >
              <Mic className="w-5 h-5 text-white" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
