'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Clipboard,
  Check,
  Loader2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  MessageSquareText,
  Sparkles,
  Send,
  FileText,
  Tag,
  Lightbulb,
  Youtube,
  X,
  Play,
  Languages,
  Lock,
} from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

interface VideoResult {
  url: string;
  label: string;
  status: 'pending' | 'loading' | 'done' | 'error';
  transcript?: string;
  videoId?: string;
  error?: string;
}

interface CombinedAnalysis {
  summary: string;
  keyPoints: string[];
  topics: string[];
  takeaways: string[];
  suggestedQuestions: string[];
  perVideoHighlights?: { label: string; highlight: string }[];
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface TranslateResult {
  translated_text: string;
  source_language: string;
  target_language: string;
  notes?: string;
}

const TARGET_LANGUAGES = [
  { id: 'english', name: 'English' },
  { id: 'spanish', name: 'Spanish' },
  { id: 'french', name: 'French' },
  { id: 'portuguese', name: 'Portuguese' },
  { id: 'german', name: 'German' },
  { id: 'italian', name: 'Italian' },
  { id: 'dutch', name: 'Dutch' },
  { id: 'japanese', name: 'Japanese' },
  { id: 'korean', name: 'Korean' },
  { id: 'chinese', name: 'Chinese (Simplified)' },
  { id: 'arabic', name: 'Arabic' },
  { id: 'hindi', name: 'Hindi' },
  { id: 'russian', name: 'Russian' },
  { id: 'turkish', name: 'Turkish' },
  { id: 'vietnamese', name: 'Vietnamese' },
  { id: 'thai', name: 'Thai' },
  { id: 'custom', name: 'Custom...' },
] as const;

// ============================================================================
// Copy helper
// ============================================================================

function useCopyState() {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const copy = useCallback((text: string, key: string) => {
    navigator.clipboard.writeText(text);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setCopiedKey(key);
    timeoutRef.current = setTimeout(() => setCopiedKey(null), 2000);
  }, []);

  return { copiedKey, copy };
}

function CopyButton({ text, copyKey, copiedKey, copy, size = 'sm' }: {
  text: string;
  copyKey: string;
  copiedKey: string | null;
  copy: (text: string, key: string) => void;
  size?: 'sm' | 'xs';
}) {
  const isCopied = copiedKey === copyKey;
  const sizeClasses = size === 'xs'
    ? 'px-2 py-1 text-xs gap-1'
    : 'px-3 py-1.5 text-sm gap-2';

  return (
    <button
      onClick={() => copy(text, copyKey)}
      className={`inline-flex items-center ${sizeClasses} rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors shrink-0`}
    >
      {isCopied ? (
        <><Check size={size === 'xs' ? 12 : 14} className="text-green-400" /> Copied!</>
      ) : (
        <><Clipboard size={size === 'xs' ? 12 : 14} /> Copy</>
      )}
    </button>
  );
}

// ============================================================================
// URL parsing helper
// ============================================================================

function parseUrls(text: string): string[] {
  return text
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && (s.includes('youtube.com') || s.includes('youtu.be')));
}

// ============================================================================
// Component
// ============================================================================

export default function YouTubeTranscriberCore() {
  const [urlInput, setUrlInput] = useState('');
  const [videos, setVideos] = useState<VideoResult[]>([]);
  const [analysis, setAnalysis] = useState<CombinedAnalysis | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [error, setError] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);
  const { copiedKey, copy } = useCopyState();

  // Per-video transcript collapse
  const [openTranscripts, setOpenTranscripts] = useState<Set<number>>(new Set());

  // Translation state
  const [translateOpen, setTranslateOpen] = useState(false);
  const [translateLoading, setTranslateLoading] = useState(false);
  const [translateResult, setTranslateResult] = useState<TranslateResult | null>(null);
  const [translateError, setTranslateError] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState('spanish');
  const [customLanguage, setCustomLanguage] = useState('');

  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const parsedUrls = parseUrls(urlInput);
  const urlCount = parsedUrls.length;
  const isMulti = urlCount > 1;

  // ---- Transcribe all videos ----
  async function handleTranscribe() {
    if (parsedUrls.length === 0) return;

    setError('');
    setAnalysis(null);
    setChatMessages([]);
    setIsProcessing(true);
    setOpenTranscripts(new Set());

    // Initialize video states
    const initialVideos: VideoResult[] = parsedUrls.map((url, i) => ({
      url,
      label: `Video ${i + 1}`,
      status: 'pending',
    }));
    setVideos(initialVideos);

    // Transcribe all in parallel
    const results = await Promise.allSettled(
      parsedUrls.map(async (url, i) => {
        // Mark as loading
        setVideos((prev) => {
          const updated = [...prev];
          updated[i] = { ...updated[i], status: 'loading' };
          return updated;
        });

        const res = await fetch('/api/youtube-transcribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url }),
        });

        const data = await res.json();

        if (!res.ok) {
          setVideos((prev) => {
            const updated = [...prev];
            updated[i] = { ...updated[i], status: 'error', error: data.error || 'Failed' };
            return updated;
          });
          throw new Error(data.error);
        }

        setVideos((prev) => {
          const updated = [...prev];
          updated[i] = {
            ...updated[i],
            status: 'done',
            transcript: data.transcript,
            videoId: data.videoId,
          };
          return updated;
        });

        return { index: i, transcript: data.transcript, videoId: data.videoId };
      })
    );

    // Collect successful transcripts
    const successful = results
      .filter((r): r is PromiseFulfilledResult<{ index: number; transcript: string; videoId: string }> =>
        r.status === 'fulfilled'
      )
      .map((r) => r.value);

    if (successful.length === 0) {
      setError('All videos failed to transcribe. Please check the URLs and try again.');
      setIsProcessing(false);
      return;
    }

    // Scroll to results
    setTimeout(() => {
      resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);

    // Generate combined summary
    setAnalysisLoading(true);

    try {
      if (successful.length === 1 && parsedUrls.length === 1) {
        // Single video — use the inline analysis from the transcribe response
        // (already returned by the route), or call summarize with 1 video
        const vid = successful[0];
        const sumRes = await fetch('/api/youtube-transcribe/summarize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            videos: [{
              videoId: vid.videoId,
              url: parsedUrls[vid.index],
              transcript: vid.transcript,
              label: 'Video 1',
            }],
          }),
        });

        if (sumRes.ok) {
          const sumData = await sumRes.json();
          setAnalysis(sumData.analysis);
        }
      } else {
        // Multi-video — combined summary
        const videoPayloads = successful.map((v) => ({
          videoId: v.videoId,
          url: parsedUrls[v.index],
          transcript: v.transcript,
          label: `Video ${v.index + 1}`,
        }));

        const sumRes = await fetch('/api/youtube-transcribe/summarize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ videos: videoPayloads }),
        });

        if (sumRes.ok) {
          const sumData = await sumRes.json();
          setAnalysis(sumData.analysis);
        }
      }
    } catch {
      // Summary failed — transcripts are still available
    } finally {
      setAnalysisLoading(false);
      setIsProcessing(false);
    }
  }

  // ---- Build combined transcript for chat ----
  function getCombinedTranscript(): string {
    const doneVideos = videos.filter((v) => v.status === 'done' && v.transcript);
    if (doneVideos.length === 1) return doneVideos[0].transcript!;
    return doneVideos
      .map((v) => `=== ${v.label} (${v.url}) ===\n${v.transcript}`)
      .join('\n\n');
  }

  // ---- AI Translation ----
  async function handleTranslate() {
    const transcript = getCombinedTranscript();
    if (!transcript) return;
    const targetLang = selectedLanguage === 'custom' ? customLanguage.trim() : TARGET_LANGUAGES.find(l => l.id === selectedLanguage)?.name || selectedLanguage;
    if (!targetLang) return;
    setTranslateLoading(true);
    setTranslateError('');

    try {
      const res = await fetch('/api/transcribe/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript,
          targetLanguage: targetLang,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setTranslateError(data.error || 'Failed to translate transcript.');
        return;
      }

      setTranslateResult(data.data);
    } catch {
      setTranslateError('Network error. Please try again.');
    } finally {
      setTranslateLoading(false);
    }
  }

  // ---- Chat ----
  async function handleSendMessage(question?: string) {
    const q = question || chatInput.trim();
    const doneVideos = videos.filter((v) => v.status === 'done');
    if (!q || doneVideos.length === 0 || chatLoading) return;

    const userMsg: ChatMessage = { role: 'user', content: q };
    setChatMessages((prev) => [...prev, userMsg]);
    setChatInput('');
    setChatLoading(true);

    const assistantMsg: ChatMessage = { role: 'assistant', content: '' };
    setChatMessages((prev) => [...prev, assistantMsg]);

    try {
      const res = await fetch('/api/youtube-transcribe/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript: getCombinedTranscript(),
          summary: analysis?.summary || '',
          messages: chatMessages,
          question: q,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        setChatMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: 'assistant',
            content: errData.error || 'Sorry, something went wrong. Please try again.',
          };
          return updated;
        });
        setChatLoading(false);
        return;
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            if (parsed.text) {
              setChatMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                updated[updated.length - 1] = {
                  ...last,
                  content: last.content + parsed.text,
                };
                return updated;
              });
            }
          } catch {
            // Skip
          }
        }
      }
    } catch {
      setChatMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: 'assistant',
          content: 'Network error. Please check your connection and try again.',
        };
        return updated;
      });
    } finally {
      setChatLoading(false);
      chatInputRef.current?.focus();
    }
  }

  const suggestedQuestions = analysis?.suggestedQuestions || [];
  const doneCount = videos.filter((v) => v.status === 'done').length;
  const hasResults = doneCount > 0 && !isProcessing;

  return (
    <div className="relative">
      {/* Hero / Input Section */}
      <section className="pb-6">
        <div className="max-w-4xl text-center">
          <h1 className="text-2xl sm:text-3xl font-bold text-white mb-4 leading-tight">
            YouTube Video Summarizer
          </h1>
          <p className="text-zinc-400 text-base mb-6">
            Paste one or more YouTube URLs &mdash; get a combined AI summary, key points,
            and ask questions across all videos.
          </p>

          <div className="max-w-3xl">
            <textarea
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder={"Paste YouTube URLs (one per line):\nhttps://www.youtube.com/watch?v=abc123\nhttps://www.youtube.com/watch?v=def456"}
              className="w-full h-32 px-5 py-4 bg-zinc-900 border border-white/10 rounded-xl text-white placeholder-zinc-500 focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none text-sm font-mono resize-none"
              disabled={isProcessing}
            />

            <div className="flex items-center justify-between mt-3">
              <span className="text-sm text-zinc-500">
                {urlCount === 0
                  ? 'No YouTube URLs detected'
                  : `${urlCount} video${urlCount > 1 ? 's' : ''} detected`}
              </span>
              <button
                onClick={handleTranscribe}
                disabled={isProcessing || urlCount === 0}
                className="h-12 px-8 bg-gradient-to-r from-red-600 to-red-500 hover:from-red-700 hover:to-red-600 text-white font-semibold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isProcessing ? (
                  <><Loader2 size={18} className="animate-spin" /> Processing...</>
                ) : (
                  <><Youtube size={18} /> {urlCount > 1 ? `Summarize ${urlCount} Videos` : 'Summarize'}</>
                )}
              </button>
            </div>

            {error && (
              <div className="mt-4 p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex items-start gap-3 text-left">
                <AlertCircle size={18} className="text-red-400 mt-0.5 shrink-0" />
                <p className="text-red-300 text-sm">{error}</p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Quick guide — shown before any results */}
      {!hasResults && !isProcessing && videos.length === 0 && (
        <section className="pb-6">
          <div className="max-w-4xl">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {[
                { icon: Youtube, title: 'Paste URLs', desc: 'One or multiple YouTube videos' },
                { icon: FileText, title: 'AI summarizes', desc: 'Key points, topics & takeaways' },
                { icon: MessageSquareText, title: 'Ask questions', desc: 'Chat with the video content' },
              ].map((item) => (
                <div key={item.title} className="flex items-start gap-3 p-3 rounded-lg bg-zinc-900/30 border border-white/5">
                  <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center shrink-0">
                    <item.icon size={14} className="text-red-400" />
                  </div>
                  <div>
                    <div className="text-xs font-medium text-zinc-200">{item.title}</div>
                    <div className="text-[11px] text-zinc-500">{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Per-Video Progress */}
      {videos.length > 0 && isProcessing && (
        <section className="pb-6">
          <div className="max-w-4xl">
            <div className="bg-zinc-900/50 border border-white/10 rounded-xl p-6">
              <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide mb-4">
                Transcribing {videos.length} video{videos.length > 1 ? 's' : ''}...
              </h3>
              <div className="space-y-3">
                {videos.map((v, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-6 h-6 flex items-center justify-center shrink-0">
                      {v.status === 'pending' && (
                        <div className="w-2 h-2 rounded-full bg-zinc-600" />
                      )}
                      {v.status === 'loading' && (
                        <Loader2 size={16} className="animate-spin text-red-400" />
                      )}
                      {v.status === 'done' && (
                        <Check size={16} className="text-green-400" />
                      )}
                      {v.status === 'error' && (
                        <X size={16} className="text-red-400" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm truncate ${
                        v.status === 'done' ? 'text-zinc-300' :
                        v.status === 'error' ? 'text-red-400' :
                        'text-zinc-500'
                      }`}>
                        {v.label}: {v.url}
                      </p>
                      {v.status === 'error' && v.error && (
                        <p className="text-xs text-red-400/70 mt-0.5">{v.error}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {analysisLoading && (
                <div className="flex items-center gap-3 mt-4 pt-4 border-t border-white/5">
                  <Loader2 size={16} className="animate-spin text-amber-400" />
                  <span className="text-sm text-zinc-400">Generating combined summary...</span>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Results Section */}
      {hasResults && (
        <section ref={resultRef} className="pb-8">
          <div className="max-w-4xl space-y-6">

            {/* Combined AI Summary */}
            {analysis && (
              <>
                {/* Summary */}
                <div className="bg-zinc-900/50 border border-white/10 rounded-xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                      <Sparkles size={18} className="text-red-400" />
                      {isMulti ? 'Combined Summary' : 'Summary'}
                    </h2>
                    <CopyButton
                      text={analysis.summary}
                      copyKey="summary"
                      copiedKey={copiedKey}
                      copy={copy}
                    />
                  </div>
                  <p className="text-zinc-300 leading-relaxed whitespace-pre-wrap">
                    {analysis.summary}
                  </p>
                </div>

                {/* Per-Video Highlights (multi-video only) */}
                {isMulti && analysis.perVideoHighlights && analysis.perVideoHighlights.length > 0 && (
                  <div className="bg-zinc-900/50 border border-white/10 rounded-xl p-6">
                    <h3 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
                      <Play size={18} className="text-red-400" />
                      Per-Video Highlights
                    </h3>
                    <div className="space-y-3">
                      {analysis.perVideoHighlights.map((vh, i) => (
                        <div key={i} className="flex items-start gap-3 bg-zinc-800/50 rounded-lg p-3">
                          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-red-500/10 text-red-400 text-xs font-bold shrink-0">
                            {i + 1}
                          </span>
                          <div className="min-w-0">
                            <span className="text-sm font-medium text-zinc-200">{vh.label}</span>
                            <p className="text-sm text-zinc-400 mt-0.5">{vh.highlight}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Key Points + Takeaways grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {analysis.keyPoints.length > 0 && (
                    <div className="bg-zinc-900/50 border border-white/10 rounded-xl p-6">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                          <FileText size={18} className="text-blue-400" />
                          Key Points
                        </h3>
                        <CopyButton
                          text={analysis.keyPoints.map((p, i) => `${i + 1}. ${p}`).join('\n')}
                          copyKey="keypoints"
                          copiedKey={copiedKey}
                          copy={copy}
                          size="xs"
                        />
                      </div>
                      <ul className="space-y-2">
                        {analysis.keyPoints.map((point, i) => (
                          <li key={i} className="flex items-start gap-2 text-zinc-300 text-sm">
                            <Check size={14} className="text-blue-400 mt-0.5 shrink-0" />
                            {point}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {analysis.takeaways.length > 0 && (
                    <div className="bg-zinc-900/50 border border-white/10 rounded-xl p-6">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                          <Lightbulb size={18} className="text-amber-400" />
                          Takeaways
                        </h3>
                        <CopyButton
                          text={analysis.takeaways.map((t, i) => `${i + 1}. ${t}`).join('\n')}
                          copyKey="takeaways"
                          copiedKey={copiedKey}
                          copy={copy}
                          size="xs"
                        />
                      </div>
                      <ul className="space-y-2">
                        {analysis.takeaways.map((item, i) => (
                          <li key={i} className="flex items-start gap-2 text-zinc-300 text-sm">
                            <Lightbulb size={14} className="text-amber-400 mt-0.5 shrink-0" />
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                {/* Topics */}
                {analysis.topics.length > 0 && (
                  <div className="bg-zinc-900/50 border border-white/10 rounded-xl p-6">
                    <h3 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
                      <Tag size={18} className="text-violet-400" />
                      Topics
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {analysis.topics.map((topic, i) => {
                        const colors = [
                          'bg-red-500/10 text-red-400',
                          'bg-blue-500/10 text-blue-400',
                          'bg-green-500/10 text-green-400',
                          'bg-violet-500/10 text-violet-400',
                          'bg-amber-500/10 text-amber-400',
                          'bg-pink-500/10 text-pink-400',
                        ];
                        return (
                          <span
                            key={i}
                            className={`px-3 py-1.5 rounded-full text-sm font-medium ${colors[i % colors.length]}`}
                          >
                            {topic}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Per-Video Transcripts (collapsible) */}
            {videos.filter((v) => v.status === 'done').map((v, idx) => {
              const isOpen = openTranscripts.has(idx);
              return (
                <div key={idx} className="bg-zinc-900/50 border border-white/10 rounded-xl overflow-hidden">
                  <button
                    onClick={() => {
                      setOpenTranscripts((prev) => {
                        const next = new Set(prev);
                        if (next.has(idx)) next.delete(idx);
                        else next.add(idx);
                        return next;
                      });
                    }}
                    className="w-full flex items-center justify-between p-6 text-left hover:bg-white/[0.02] transition-colors"
                  >
                    <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                      <MessageSquareText size={18} className="text-zinc-400" />
                      {videos.length > 1 ? `${v.label} Transcript` : 'Full Transcript'}
                      <span className="text-sm font-normal text-zinc-500">
                        ({v.transcript!.split(' ').length} words)
                      </span>
                    </h3>
                    <div className="flex items-center gap-2">
                      <CopyButton
                        text={v.transcript!}
                        copyKey={`transcript-${idx}`}
                        copiedKey={copiedKey}
                        copy={copy}
                        size="xs"
                      />
                      {isOpen ? (
                        <ChevronUp size={20} className="text-zinc-400" />
                      ) : (
                        <ChevronDown size={20} className="text-zinc-400" />
                      )}
                    </div>
                  </button>
                  {isOpen && (
                    <div className="px-6 pb-6">
                      <p className="text-xs text-zinc-500 mb-2 truncate">{v.url}</p>
                      <p className="text-zinc-300 leading-relaxed whitespace-pre-wrap text-sm max-h-96 overflow-y-auto">
                        {v.transcript}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}

            {/* ============================================================ */}
            {/* AI Translation Section */}
            {/* ============================================================ */}
            <div className="bg-zinc-900/50 border border-white/10 rounded-xl overflow-hidden">
              <button
                onClick={() => setTranslateOpen(!translateOpen)}
                className="w-full flex items-center justify-between p-6 text-left hover:bg-white/[0.02] transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center shrink-0">
                    <Languages size={20} className="text-sky-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white">Translate</h3>
                    <p className="text-sm text-zinc-400">AI-powered translation to or from any language</p>
                  </div>
                </div>
                {translateOpen ? <ChevronUp size={20} className="text-zinc-400" /> : <ChevronDown size={20} className="text-zinc-400" />}
              </button>

              {translateOpen && (
                <div className="px-6 pb-6 space-y-4">
                  {/* Language selector */}
                  <div>
                    <label className="text-xs text-zinc-500 uppercase tracking-wide block mb-1.5">Translate to</label>
                    <select
                      value={selectedLanguage}
                      onChange={(e) => setSelectedLanguage(e.target.value)}
                      className="w-full h-11 px-3 bg-zinc-800 border border-white/10 rounded-lg text-white text-sm focus:ring-2 focus:ring-sky-500 focus:border-transparent outline-none appearance-none"
                    >
                      {TARGET_LANGUAGES
                        .filter((lang) => lang.id !== 'english')
                        .map((lang) => (
                          <option key={lang.id} value={lang.id}>{lang.name}</option>
                        ))}
                    </select>
                  </div>

                  {/* Custom language input */}
                  {selectedLanguage === 'custom' && (
                    <div>
                      <label className="text-xs text-zinc-500 uppercase tracking-wide block mb-1.5">Enter Language</label>
                      <input
                        type="text"
                        value={customLanguage}
                        onChange={(e) => setCustomLanguage(e.target.value)}
                        placeholder="e.g. Tagalog, Swahili, Urdu..."
                        className="w-full h-11 px-3 bg-zinc-800 border border-white/10 rounded-lg text-white text-sm placeholder-zinc-500 focus:ring-2 focus:ring-sky-500 focus:border-transparent outline-none"
                      />
                    </div>
                  )}

                  {/* Translate button */}
                  <div className="flex justify-center">
                    <button
                      onClick={handleTranslate}
                      disabled={translateLoading || (selectedLanguage === 'custom' && !customLanguage.trim())}
                      className="inline-flex items-center gap-2 px-6 py-3 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 text-sky-400 font-semibold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {translateLoading ? (
                        <><Loader2 size={18} className="animate-spin" /> Translating...</>
                      ) : (
                        <><Languages size={18} /> {translateResult ? 'Translate Again' : 'Translate Transcript'}</>
                      )}
                    </button>
                  </div>

                  {translateError && (
                    <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex items-start gap-3">
                      <AlertCircle size={16} className="text-red-400 mt-0.5 shrink-0" />
                      <p className="text-red-300 text-sm">{translateError}</p>
                    </div>
                  )}

                  {/* Translation Result */}
                  {translateResult && (
                    <div className="space-y-4 pt-2">
                      {/* Language badges */}
                      <div className="flex flex-wrap gap-2">
                        <span className="px-2.5 py-1 rounded-full bg-zinc-700/50 text-zinc-300 text-xs font-medium">
                          {translateResult.source_language}
                        </span>
                        <span className="text-zinc-500 text-xs flex items-center">→</span>
                        <span className="px-2.5 py-1 rounded-full bg-sky-500/10 text-sky-400 text-xs font-medium">
                          {translateResult.target_language}
                        </span>
                      </div>

                      {/* Translated text */}
                      <div className="bg-zinc-800/50 border border-white/5 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs text-zinc-400 uppercase tracking-wide font-semibold">Translated Transcript</span>
                          <CopyButton
                            text={translateResult.translated_text}
                            copyKey="translate-text"
                            copiedKey={copiedKey}
                            copy={copy}
                            size="xs"
                          />
                        </div>
                        <p className="text-zinc-300 leading-relaxed whitespace-pre-wrap text-sm">{translateResult.translated_text}</p>
                      </div>

                      {/* Translation notes */}
                      {translateResult.notes && (
                        <div className="bg-sky-500/5 border border-sky-500/20 rounded-lg p-3">
                          <span className="text-xs text-sky-400 uppercase tracking-wide font-semibold">Translation Notes</span>
                          <p className="text-zinc-400 text-sm mt-1">{translateResult.notes}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ============================================================ */}
            {/* Chat Interface */}
            {/* ============================================================ */}
            <div className="bg-zinc-900/50 border border-white/10 rounded-xl overflow-hidden">
              <div className="p-6 border-b border-white/5">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                  <MessageSquareText size={18} className="text-teal-400" />
                  {isMulti ? 'Ask Across All Videos' : 'Ask About This Video'}
                </h3>
                <p className="text-sm text-zinc-400 mt-1">
                  {isMulti
                    ? `Ask any question — AI has full context of all ${doneCount} videos.`
                    : 'Ask any question about the video content and get instant answers.'}
                </p>
              </div>

              {/* Suggested Questions */}
              {suggestedQuestions.length > 0 && chatMessages.length === 0 && (
                <div className="px-6 pt-4 flex flex-wrap gap-2">
                  {suggestedQuestions.map((q, i) => (
                    <button
                      key={i}
                      onClick={() => handleSendMessage(q)}
                      disabled={chatLoading}
                      className="px-3 py-1.5 rounded-full bg-teal-500/10 border border-teal-500/20 text-teal-400 text-sm hover:bg-teal-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              )}

              {/* Messages */}
              {chatMessages.length > 0 && (
                <div className="px-6 py-4 space-y-4 max-h-[500px] overflow-y-auto">
                  {chatMessages.map((msg, i) => (
                    <div
                      key={i}
                      className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[80%] rounded-xl px-4 py-3 text-sm whitespace-pre-wrap ${
                          msg.role === 'user'
                            ? 'bg-teal-600 text-white'
                            : 'bg-zinc-800 border border-white/5 text-zinc-300'
                        }`}
                      >
                        {msg.content || (
                          <span className="inline-flex items-center gap-2 text-zinc-400">
                            <Loader2 size={14} className="animate-spin" />
                            Thinking...
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </div>
              )}

              {/* Input bar */}
              <div className="p-4 border-t border-white/5">
                <div className="flex gap-2">
                  <input
                    ref={chatInputRef}
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !chatLoading && handleSendMessage()}
                    placeholder={isMulti ? 'Ask a question across all videos...' : 'Ask a question about this video...'}
                    className="flex-1 h-11 px-4 bg-zinc-800 border border-white/10 rounded-lg text-white placeholder-zinc-500 focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none text-sm"
                    disabled={chatLoading}
                  />
                  <button
                    onClick={() => handleSendMessage()}
                    disabled={chatLoading || !chatInput.trim()}
                    className="h-11 px-4 bg-teal-600 hover:bg-teal-500 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {chatLoading ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Send size={16} />
                    )}
                  </button>
                </div>

                {suggestedQuestions.length > 0 && chatMessages.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {suggestedQuestions.map((q, i) => (
                      <button
                        key={i}
                        onClick={() => handleSendMessage(q)}
                        disabled={chatLoading}
                        className="px-2.5 py-1 rounded-full bg-zinc-800 border border-white/5 text-zinc-400 text-xs hover:bg-zinc-700 hover:text-zinc-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
