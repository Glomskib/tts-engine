'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, MicOff, Loader2, Check, X, Send, AlertTriangle } from 'lucide-react';
import type { SpeechRecognition } from '@/lib/speech-recognition-types';
import '@/lib/speech-recognition-types';

interface Product {
  id: string;
  name: string;
  brand: string;
}

interface Persona {
  id: string;
  name: string;
}

export interface VoiceBriefParams {
  product_id: string;
  product_name: string;
  platform: string;
  content_type_id: string;
  content_subtype_id: string;
  presentation_style_id: string;
  target_length_id: string;
  humor_level_id: string;
  risk_tier: string;
  creator_persona_id: string;
  audience_persona_id: string;
  pain_points: string[];
  creative_direction: string;
  variation_count: number;
  confidence: 'high' | 'medium' | 'low';
  interpretation_notes: string;
}

interface TalkThroughItModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  audiencePersonas: Persona[];
  creatorPersonas: Persona[];
  onApplyAndGenerate: (params: VoiceBriefParams) => void;
}

type Phase = 'recording' | 'interpreting' | 'review' | 'generating';

export default function TalkThroughItModal({
  isOpen,
  onClose,
  products,
  audiencePersonas,
  creatorPersonas,
  onApplyAndGenerate,
}: TalkThroughItModalProps) {
  const [phase, setPhase] = useState<Phase>('recording');
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(true);
  const [textFallback, setTextFallback] = useState('');
  const [error, setError] = useState('');
  const [interpretedParams, setInterpretedParams] = useState<VoiceBriefParams | null>(null);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Check speech support on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const supported = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
      setSpeechSupported(supported);
    }
  }, []);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setPhase('recording');
      setTranscript('');
      setInterimTranscript('');
      setTextFallback('');
      setError('');
      setInterpretedParams(null);
      setIsListening(false);
    } else {
      stopListening();
    }
  }, [isOpen]);

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const startSilenceTimer = useCallback(() => {
    clearSilenceTimer();
    silenceTimerRef.current = setTimeout(() => {
      // Auto-stop after 4 seconds of silence
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    }, 4000);
  }, [clearSilenceTimer]);

  const startListening = useCallback(() => {
    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) {
      setSpeechSupported(false);
      return;
    }

    setError('');
    let hasSpoken = false;
    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event) => {
      hasSpoken = true;
      let final = '';
      let interim = '';

      // Rebuild full transcript from all results each time (Web Speech API
      // replays the entire result list on every event)
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          final += result[0].transcript + ' ';
        } else {
          interim += result[0].transcript;
        }
      }

      setTranscript(final.trim());
      setInterimTranscript(interim);

      // Only start silence auto-stop after user has spoken
      clearSilenceTimer();
      startSilenceTimer();
    };

    recognition.onerror = (event) => {
      if (event.error === 'not-allowed') {
        setError('Microphone access denied. You can type your idea instead.');
        setSpeechSupported(false);
        setIsListening(false);
      } else if (event.error !== 'aborted') {
        setError(`Speech error: ${event.error}. You can type your idea instead.`);
        setIsListening(false);
      }
    };

    recognition.onend = () => {
      // If user hasn't spoken yet and we're still in recording phase, restart
      if (!hasSpoken && phase === 'recording') {
        try {
          recognition.start();
          return;
        } catch {
          // Can't restart, fall through to stop
        }
      }
      setIsListening(false);
      clearSilenceTimer();
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
    // Don't start silence timer here — wait until user actually speaks
  }, [startSilenceTimer, clearSilenceTimer, phase]);

  const stopListening = useCallback(() => {
    clearSilenceTimer();
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsListening(false);
  }, [clearSilenceTimer]);

  const handleDoneSpeaking = useCallback(async () => {
    stopListening();
    const finalTranscript = transcript.trim() || textFallback.trim();

    if (!finalTranscript) {
      setError("I didn't catch that. Try speaking again or type your idea below.");
      return;
    }

    setPhase('interpreting');

    try {
      const res = await fetch('/api/ai/interpret-voice-brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript: finalTranscript,
          available_products: products.map(p => ({ id: p.id, name: p.name, brand: p.brand })),
          available_personas: audiencePersonas.map(p => ({ id: p.id, name: p.name })),
          available_creator_personas: creatorPersonas.map(p => ({ id: p.id, name: p.name })),
        }),
      });

      const data = await res.json();

      if (!data.ok || !data.params) {
        throw new Error(data.message || 'Failed to interpret voice brief');
      }

      const params = data.params as VoiceBriefParams;
      setInterpretedParams(params);

      if (params.confidence === 'low') {
        // Show review mode for low confidence
        setPhase('review');
      } else {
        // Brief flash of summary, then auto-generate
        setPhase('generating');
        setTimeout(() => {
          onApplyAndGenerate(params);
          onClose();
        }, 1500);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to interpret your idea. Please try again.');
      setPhase('recording');
    }
  }, [transcript, textFallback, products, audiencePersonas, creatorPersonas, stopListening, onApplyAndGenerate, onClose]);

  const handleReviewConfirm = useCallback(() => {
    if (!interpretedParams) return;
    setPhase('generating');
    setTimeout(() => {
      onApplyAndGenerate(interpretedParams);
      onClose();
    }, 1000);
  }, [interpretedParams, onApplyAndGenerate, onClose]);

  const handleClose = useCallback(() => {
    stopListening();
    onClose();
  }, [stopListening, onClose]);

  if (!isOpen) return null;

  const fullTranscript = (transcript + ' ' + interimTranscript).trim();

  // Label lookups for review
  const getProductLabel = (id: string) => products.find(p => p.id === id)?.name || id;

  const LABEL_MAPS: Record<string, Record<string, string>> = {
    content_type_id: {
      tof: 'Top of Funnel', mof: 'Middle of Funnel', ugc_short: 'UGC Short',
      bof: 'Bottom of Funnel', testimonial: 'Testimonial', skit: 'Skit/Comedy',
      slideshow_story: 'Slideshow Story', educational: 'Educational', story: 'Story',
    },
    presentation_style_id: {
      talking_head: 'Talking Head', human_actor: 'Human Actor', ai_avatar: 'AI Avatar',
      voiceover: 'Voiceover', text_overlay: 'Text Overlay', ugc_style: 'UGC Style', mixed: 'Mixed',
    },
    target_length_id: { micro: 'Micro (5-15s)', short: 'Short (15-30s)', medium: 'Medium (30-60s)', long: 'Long (60-90s)' },
    humor_level_id: { none: 'None', light: 'Light', moderate: 'Moderate', heavy: 'Heavy' },
    platform: { tiktok: 'TikTok', youtube_shorts: 'YouTube Shorts', youtube_long: 'YouTube Long', instagram: 'Instagram' },
  };

  const getLabel = (field: string, value: string) => LABEL_MAPS[field]?.[value] || value;

  return (
    <div
      style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0, 0, 0, 0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
      onClick={handleClose}
    >
      <div
        className="w-full max-w-lg mx-4 sm:mx-0"
        style={{
          backgroundColor: '#18181b',
          borderRadius: '20px',
          border: '1px solid rgba(255,255,255,0.1)',
          overflow: 'hidden',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Mic size={20} className="text-violet-400" />
            Talk Through It
          </h2>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-6 pb-6">
          {/* Phase: Recording */}
          {phase === 'recording' && (
            <div className="space-y-4">
              <p className="text-sm text-zinc-400">
                Describe your video idea — product, style, tone, length, anything. AI will fill in the form for you.
              </p>

              {/* Error message */}
              {error && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                  <AlertTriangle size={16} className="text-amber-400 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-amber-300">{error}</p>
                </div>
              )}

              {/* Mic recording area */}
              {speechSupported && (
                <div className="flex flex-col items-center py-4 space-y-4">
                  <button
                    onClick={isListening ? stopListening : startListening}
                    className={`w-20 h-20 rounded-full flex items-center justify-center transition-all ${
                      isListening
                        ? 'bg-red-500/20 border-2 border-red-500 shadow-[0_0_30px_rgba(239,68,68,0.3)]'
                        : 'bg-violet-500/20 border-2 border-violet-500/50 hover:border-violet-400 hover:bg-violet-500/30'
                    }`}
                    style={isListening ? { animation: 'pulse 2s ease-in-out infinite' } : {}}
                  >
                    {isListening ? (
                      <MicOff size={32} className="text-red-400" />
                    ) : (
                      <Mic size={32} className="text-violet-400" />
                    )}
                  </button>
                  <p className="text-sm text-zinc-500">
                    {isListening ? 'Listening... tap to stop' : 'Tap to start speaking'}
                  </p>
                </div>
              )}

              {/* Real-time transcript display */}
              {fullTranscript && (
                <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                  <p className="text-sm text-zinc-300 leading-relaxed">
                    {transcript}
                    {interimTranscript && (
                      <span className="text-zinc-500"> {interimTranscript}</span>
                    )}
                  </p>
                </div>
              )}

              {/* Text fallback */}
              {(!speechSupported || !isListening) && (
                <div>
                  {!speechSupported && (
                    <p className="text-xs text-zinc-500 mb-2">
                      Voice not available in this browser. Type your idea instead:
                    </p>
                  )}
                  <textarea
                    value={textFallback}
                    onChange={(e) => setTextFallback(e.target.value)}
                    placeholder={speechSupported ? 'Or type your idea here...' : 'Describe your video idea...'}
                    className="w-full h-24 p-3 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder-zinc-600 resize-none focus:outline-none focus:border-violet-500/50"
                  />
                </div>
              )}

              {/* Done button */}
              <button
                onClick={handleDoneSpeaking}
                disabled={!fullTranscript && !textFallback.trim()}
                className="w-full py-3 rounded-xl font-medium text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-30 disabled:cursor-not-allowed bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white"
              >
                <Send size={16} />
                {isListening ? 'Done Speaking' : 'Interpret & Generate'}
              </button>
            </div>
          )}

          {/* Phase: Interpreting */}
          {phase === 'interpreting' && (
            <div className="flex flex-col items-center py-8 space-y-4">
              <Loader2 size={40} className="text-violet-400 animate-spin" />
              <p className="text-white font-medium">Interpreting your idea...</p>
              <div className="p-3 rounded-xl bg-white/5 border border-white/10 max-h-24 overflow-y-auto w-full">
                <p className="text-xs text-zinc-400 leading-relaxed">
                  &ldquo;{transcript.trim() || textFallback.trim()}&rdquo;
                </p>
              </div>
            </div>
          )}

          {/* Phase: Review (low confidence) */}
          {phase === 'review' && interpretedParams && (
            <div className="space-y-4">
              <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                <AlertTriangle size={16} className="text-amber-400 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-amber-300">
                  I&apos;m not fully sure about some choices. Please review before generating.
                </p>
              </div>

              {interpretedParams.interpretation_notes && (
                <p className="text-sm text-zinc-400 italic">
                  {interpretedParams.interpretation_notes}
                </p>
              )}

              <div className="space-y-2 p-4 rounded-xl bg-white/5 border border-white/10">
                {interpretedParams.product_id && (
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-500">Product</span>
                    <span className="text-white">{getProductLabel(interpretedParams.product_id)}</span>
                  </div>
                )}
                {interpretedParams.product_name && !interpretedParams.product_id && (
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-500">Product</span>
                    <span className="text-white">{interpretedParams.product_name}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-500">Platform</span>
                  <span className="text-white">{getLabel('platform', interpretedParams.platform)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-500">Content Type</span>
                  <span className="text-white">{getLabel('content_type_id', interpretedParams.content_type_id)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-500">Style</span>
                  <span className="text-white">{getLabel('presentation_style_id', interpretedParams.presentation_style_id)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-500">Length</span>
                  <span className="text-white">{getLabel('target_length_id', interpretedParams.target_length_id)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-500">Humor</span>
                  <span className="text-white">{getLabel('humor_level_id', interpretedParams.humor_level_id)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-500">Risk</span>
                  <span className="text-white">{interpretedParams.risk_tier}</span>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => { setPhase('recording'); setError(''); }}
                  className="flex-1 py-3 rounded-xl font-medium text-sm bg-zinc-800 border border-white/10 text-white hover:bg-zinc-700 transition-colors"
                >
                  Try Again
                </button>
                <button
                  onClick={handleReviewConfirm}
                  className="flex-1 py-3 rounded-xl font-medium text-sm bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white flex items-center justify-center gap-2 transition-all"
                >
                  <Check size={16} />
                  Looks Good
                </button>
              </div>
            </div>
          )}

          {/* Phase: Generating (brief flash) */}
          {phase === 'generating' && interpretedParams && (
            <div className="flex flex-col items-center py-8 space-y-4">
              <div className="w-14 h-14 rounded-full bg-green-500/20 flex items-center justify-center">
                <Check size={28} className="text-green-400" />
              </div>
              <p className="text-white font-medium">Got it! Generating your script...</p>
              {interpretedParams.interpretation_notes && (
                <p className="text-sm text-zinc-400 text-center max-w-sm">
                  {interpretedParams.interpretation_notes}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Pulse animation */}
        <style>{`
          @keyframes pulse {
            0%, 100% { box-shadow: 0 0 20px rgba(239, 68, 68, 0.2); }
            50% { box-shadow: 0 0 40px rgba(239, 68, 68, 0.4); }
          }
        `}</style>
      </div>
    </div>
  );
}
