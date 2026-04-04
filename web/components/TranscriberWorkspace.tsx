'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  MessageSquare,
  FileText,
  Loader2,
  Send,
  Sparkles,
  Check,
  AlertCircle,
  Clipboard,
  Save,
  RefreshCw,
  ChevronUp,
  X,
  Package,
} from 'lucide-react';
import TranscriberCore from './TranscriberCore';
import type { TranscriberCoreProps } from './TranscriberCore';
import VisualHooksPanel from './VisualHooksPanel';
import type { VibeContext } from '@/lib/visual-hooks/types';

// ============================================================================
// Types
// ============================================================================

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface GeneratedScript {
  hook: string;
  setup: string;
  body: string;
  cta: string;
  full_script: string;
  on_screen_text: string[];
  filming_notes: string;
  estimated_length: string;
  angle_used: string;
  persona_used: string;
  tone_used: string;
}

interface TranscriptContext {
  transcript: string;
  analysis: {
    hook?: { line: string; style: string; strength: number };
    content?: { format: string; pacing: string; structure: string };
    keyPhrases?: string[];
    emotionalTriggers?: string[];
    whatWorks?: string[];
    targetEmotion?: string;
  } | null;
  sourceUrl: string;
}

interface VibeAnalysisData {
  delivery_style: string;
  pacing_style: string;
  hook_energy: string;
  visual_style: string;
  visual_rhythm: string;
  cta_tone: string;
  reveal_timing: string;
  recreate_guidance: string[];
  [key: string]: unknown;
}

type ActiveTool = 'none' | 'script' | 'chat';

const ANGLES = [
  { id: 'educational', name: 'Educational' },
  { id: 'testimonial', name: 'Testimonial' },
  { id: 'story', name: 'Story/Narrative' },
  { id: 'problem_solution', name: 'Problem \u2192 Solution' },
  { id: 'controversy', name: 'Hot Take / Controversy' },
  { id: 'listicle', name: 'Listicle / Tips' },
  { id: 'before_after', name: 'Before & After' },
] as const;

const PERSONAS = [
  { id: 'skeptic', name: 'The Skeptic' },
  { id: 'educator', name: 'The Educator' },
  { id: 'hype_man', name: 'The Hype Man' },
  { id: 'honest_reviewer', name: 'Honest Reviewer' },
  { id: 'relatable_friend', name: 'Relatable Friend' },
  { id: 'storyteller', name: 'The Storyteller' },
] as const;

const TONES = [
  { id: 'conversational', name: 'Conversational' },
  { id: 'high_energy', name: 'High Energy' },
  { id: 'empathetic', name: 'Empathetic' },
  { id: 'authoritative', name: 'Authoritative' },
  { id: 'raw_authentic', name: 'Raw & Authentic' },
] as const;

const LENGTHS = [
  { id: '15_sec', name: '15s' },
  { id: '30_sec', name: '30s' },
  { id: '45_sec', name: '45s' },
  { id: '60_sec', name: '60s' },
] as const;

// ============================================================================
// Component
// ============================================================================

export default function TranscriberWorkspace(props: TranscriberCoreProps) {
  // Tool panel state — explicit, button-driven only
  const [activeTool, setActiveTool] = useState<ActiveTool>('none');

  // Transcript context (populated when TranscriberCore produces results)
  const [ctx, setCtx] = useState<TranscriptContext | null>(null);

  // Ref for scrolling to tool panel
  const toolPanelRef = useRef<HTMLDivElement>(null);

  // Script generator state
  const [scriptAngle, setScriptAngle] = useState('problem_solution');
  const [scriptPersona, setScriptPersona] = useState('skeptic');
  const [scriptTone, setScriptTone] = useState('conversational');
  const [scriptLength, setScriptLength] = useState('30_sec');
  const [scriptProduct, setScriptProduct] = useState('');
  const [scriptInstructions, setScriptInstructions] = useState('');
  const [scriptLoading, setScriptLoading] = useState(false);
  const [scriptResult, setScriptResult] = useState<GeneratedScript | null>(null);
  const [scriptError, setScriptError] = useState('');
  const [scriptCopied, setScriptCopied] = useState(false);

  // Save to content item state
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState('');

  // Vibe analysis (from VibeAnalysisCard "Generate In This Style" button)
  const [vibeAnalysis, setVibeAnalysis] = useState<VibeAnalysisData | null>(null);

  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);

  // Scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // Listen for transcript results from TranscriberCore via custom DOM event
  useEffect(() => {
    function handleTranscriptReady(e: Event) {
      const detail = (e as CustomEvent).detail as TranscriptContext;
      if (!detail?.transcript) return;
      setCtx(detail);
      // Do NOT auto-open any tool panel — user must explicitly choose
      setActiveTool('none');
      // Seed chat with a helpful greeting on first transcript
      setChatMessages(prev => {
        if (prev.length > 0) return prev;
        return [{
          role: 'assistant' as const,
          content: `I've analyzed this video. I can help you:\n\n- Understand why this format works\n- Write your own version with a different angle\n- Suggest hooks, structures, or improvements\n- Iterate on any rewrites\n\nWhat would you like to explore?`,
        }];
      });
    }

    window.addEventListener('transcriber:result', handleTranscriptReady);
    return () => window.removeEventListener('transcriber:result', handleTranscriptReady);
  }, []);

  // Listen for "Generate In This Style" from VibeAnalysisCard
  useEffect(() => {
    function handleVibeGenerate(e: Event) {
      const vibe = (e as CustomEvent).detail as VibeAnalysisData;
      if (!vibe?.delivery_style) return;
      setVibeAnalysis(vibe);
      setActiveTool('script');
    }

    window.addEventListener('transcriber:generate-in-style', handleVibeGenerate);
    return () => window.removeEventListener('transcriber:generate-in-style', handleVibeGenerate);
  }, []);

  // Scroll to tool panel when one is opened
  useEffect(() => {
    if (activeTool !== 'none') {
      setTimeout(() => {
        toolPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  }, [activeTool]);

  // Toggle tool — clicking same tool closes it
  function handleToolToggle(tool: 'script' | 'chat') {
    setActiveTool(prev => prev === tool ? 'none' : tool);
  }

  // ── Script Generation ────────────────────────────────────────────────

  async function handleGenerateScript() {
    if (!ctx || scriptLoading) return;
    setScriptLoading(true);
    setScriptError('');
    setSavedId(null);
    setSaveError('');

    try {
      const res = await fetch('/api/transcribe/generate-script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript: ctx.transcript,
          analysis: ctx.analysis,
          angle: scriptAngle,
          persona: scriptPersona,
          tone: scriptTone,
          targetLength: scriptLength,
          productName: scriptProduct.trim() || undefined,
          instructions: scriptInstructions.trim() || undefined,
          vibe_analysis: vibeAnalysis || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setScriptError(data.error || 'Script failed — try again');
        return;
      }

      setScriptResult(data.data);
    } catch {
      setScriptError('Connection issue — try again');
    } finally {
      setScriptLoading(false);
    }
  }

  function handleCopyScript() {
    if (!scriptResult) return;
    const text = [
      `HOOK: ${scriptResult.hook}`,
      '',
      scriptResult.full_script,
      '',
      `CTA: ${scriptResult.cta}`,
      '',
      scriptResult.on_screen_text.length > 0 ? `ON-SCREEN TEXT:\n${scriptResult.on_screen_text.map((t, i) => `${i + 1}. ${t}`).join('\n')}` : '',
      scriptResult.filming_notes ? `\nFILMING NOTES: ${scriptResult.filming_notes}` : '',
    ].filter(Boolean).join('\n');

    navigator.clipboard.writeText(text);
    setScriptCopied(true);
    setTimeout(() => setScriptCopied(false), 2000);
  }

  async function handleSaveAsContentItem() {
    if (!scriptResult || saving) return;
    setSaving(true);
    setSaveError('');

    try {
      const res = await fetch('/api/content-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: scriptResult.hook.slice(0, 80) || 'Transcript-inspired script',
          source_type: 'script_generator',
          primary_hook: scriptResult.hook,
          script_text: scriptResult.full_script,
          creative_notes: [
            `Angle: ${scriptResult.angle_used}`,
            `Persona: ${scriptResult.persona_used}`,
            `Tone: ${scriptResult.tone_used}`,
            scriptResult.filming_notes ? `Filming: ${scriptResult.filming_notes}` : '',
            ctx?.sourceUrl ? `Source: ${ctx.sourceUrl}` : '',
          ].filter(Boolean).join('\n'),
          status: 'scripted',
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setSaveError(data.error || 'Save failed — try again');
        return;
      }

      setSavedId(data.id || data.content_item?.id);
    } catch {
      setSaveError('Connection issue — try again');
    } finally {
      setSaving(false);
    }
  }

  // ── Chat ──────────────────────────────────────────────────────────────

  const handleSendChat = useCallback(async () => {
    if (!ctx || !chatInput.trim() || chatLoading) return;

    const userMsg = chatInput.trim();
    setChatInput('');
    setChatError('');
    setChatMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setChatLoading(true);

    try {
      const res = await fetch('/api/transcribe/workspace-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMsg,
          transcript: ctx.transcript,
          analysis: ctx.analysis,
          generatedScript: scriptResult?.full_script,
          history: chatMessages.slice(-8),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setChatError(data.error || 'Chat failed');
        return;
      }

      setChatMessages(prev => [...prev, { role: 'assistant', content: data.response }]);
    } catch {
      setChatError('Connection issue — try again');
    } finally {
      setChatLoading(false);
      chatInputRef.current?.focus();
    }
  }, [ctx, chatInput, chatLoading, chatMessages, scriptResult]);

  // ── Quick prompts for chat ────────────────────────────────────────────

  const quickPrompts = [
    'Why does this video work so well?',
    'Give me 3 hook alternatives',
    'How would I recreate this format for my product?',
    'What makes the pacing and structure effective?',
  ];

  function handleQuickPrompt(prompt: string) {
    setChatInput(prompt);
    chatInputRef.current?.focus();
  }

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className="h-full overflow-y-auto">
      {/* Step 1 & 2: TranscriberCore handles input + transcript output */}
      <TranscriberCore {...props} />

      {/* Step 3: Action buttons + tool panels — only shown when transcript exists */}
      {ctx && (
        <div className="max-w-4xl pb-12">
          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 mb-6 px-0">
            <button
              onClick={() => handleToolToggle('script')}
              className={`flex-1 flex items-center justify-center gap-2.5 px-5 py-3.5 rounded-xl text-sm font-semibold transition-all ${
                activeTool === 'script'
                  ? 'bg-teal-500/15 border-2 border-teal-500/50 text-teal-400 shadow-lg shadow-teal-500/10'
                  : 'bg-zinc-900/50 border border-white/10 text-zinc-300 hover:bg-zinc-800 hover:text-white hover:border-white/20'
              }`}
            >
              <FileText size={18} />
              Write My Version
              {activeTool === 'script' && <ChevronUp size={16} className="ml-auto" />}
            </button>
            <button
              onClick={() => handleToolToggle('chat')}
              className={`flex-1 flex items-center justify-center gap-2.5 px-5 py-3.5 rounded-xl text-sm font-semibold transition-all ${
                activeTool === 'chat'
                  ? 'bg-violet-500/15 border-2 border-violet-500/50 text-violet-400 shadow-lg shadow-violet-500/10'
                  : 'bg-zinc-900/50 border border-white/10 text-zinc-300 hover:bg-zinc-800 hover:text-white hover:border-white/20'
              }`}
            >
              <MessageSquare size={18} />
              Chat About This Video
              {activeTool === 'chat' && <ChevronUp size={16} className="ml-auto" />}
            </button>
          </div>

          {/* Secondary action: Build Content Pack from this video */}
          <div className="flex items-center gap-3 mb-6 -mt-2">
            <button
              onClick={() => {
                const hook = ctx.analysis?.hook?.line || '';
                const params = new URLSearchParams({
                  topic: hook || ctx.transcript.slice(0, 80),
                  source: 'transcript',
                  context: ctx.transcript.slice(0, 300),
                  ...(hook ? { seed_hook: hook } : {}),
                });
                window.location.href = `/admin/content-pack?${params.toString()}`;
              }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-900/50 border border-white/10 text-zinc-400 hover:text-teal-400 hover:border-teal-500/30 text-sm rounded-xl transition-colors"
            >
              <Package size={16} />
              Build Content Pack from this video
            </button>
          </div>

          {/* Tool Panel — renders inline below buttons */}
          {activeTool !== 'none' && (
            <div ref={toolPanelRef} className="animate-in fade-in slide-in-from-top-2 duration-200">
              {activeTool === 'script' ? (
                <div className="bg-zinc-900/50 border border-white/10 rounded-xl overflow-hidden">
                  {/* Panel header */}
                  <div className="flex items-center justify-between px-5 py-3 border-b border-white/10">
                    <h3 className="text-sm font-semibold text-teal-400 flex items-center gap-2">
                      <FileText size={16} />
                      Write My Version
                    </h3>
                    <button
                      onClick={() => setActiveTool('none')}
                      className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors rounded-lg hover:bg-white/5"
                      title="Close panel"
                    >
                      <X size={16} />
                    </button>
                  </div>
                  <ScriptPanel
                    ctx={ctx}
                    angle={scriptAngle}
                    setAngle={setScriptAngle}
                    persona={scriptPersona}
                    setPersona={setScriptPersona}
                    tone={scriptTone}
                    setTone={setScriptTone}
                    length={scriptLength}
                    setLength={setScriptLength}
                    product={scriptProduct}
                    setProduct={setScriptProduct}
                    instructions={scriptInstructions}
                    setInstructions={setScriptInstructions}
                    loading={scriptLoading}
                    result={scriptResult}
                    error={scriptError}
                    copied={scriptCopied}
                    saving={saving}
                    savedId={savedId}
                    saveError={saveError}
                    vibeAnalysis={vibeAnalysis}
                    onClearVibe={() => setVibeAnalysis(null)}
                    onGenerate={handleGenerateScript}
                    onCopy={handleCopyScript}
                    onSave={handleSaveAsContentItem}
                    onRegenerate={handleGenerateScript}
                  />
                </div>
              ) : (
                <div className="bg-zinc-900/50 border border-white/10 rounded-xl overflow-hidden">
                  {/* Panel header */}
                  <div className="flex items-center justify-between px-5 py-3 border-b border-white/10">
                    <h3 className="text-sm font-semibold text-violet-400 flex items-center gap-2">
                      <MessageSquare size={16} />
                      Chat About This Video
                    </h3>
                    <button
                      onClick={() => setActiveTool('none')}
                      className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors rounded-lg hover:bg-white/5"
                      title="Close panel"
                    >
                      <X size={16} />
                    </button>
                  </div>
                  <ChatPanel
                    messages={chatMessages}
                    input={chatInput}
                    setInput={setChatInput}
                    loading={chatLoading}
                    error={chatError}
                    quickPrompts={quickPrompts}
                    onSend={handleSendChat}
                    onQuickPrompt={handleQuickPrompt}
                    chatEndRef={chatEndRef}
                    chatInputRef={chatInputRef}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Script Panel
// ============================================================================

function ScriptPanel({
  ctx, angle, setAngle, persona, setPersona, tone, setTone, length, setLength,
  product, setProduct, instructions, setInstructions, loading, result, error,
  copied, saving, savedId, saveError, vibeAnalysis, onClearVibe, onGenerate, onCopy, onSave, onRegenerate,
}: {
  ctx: TranscriptContext;
  angle: string;
  setAngle: (v: string) => void;
  persona: string;
  setPersona: (v: string) => void;
  tone: string;
  setTone: (v: string) => void;
  length: string;
  setLength: (v: string) => void;
  product: string;
  setProduct: (v: string) => void;
  instructions: string;
  setInstructions: (v: string) => void;
  loading: boolean;
  result: GeneratedScript | null;
  error: string;
  copied: boolean;
  saving: boolean;
  savedId: string | null;
  saveError: string;
  vibeAnalysis: VibeAnalysisData | null;
  onClearVibe: () => void;
  onGenerate: () => void;
  onCopy: () => void;
  onSave: () => void;
  onRegenerate: () => void;
}) {
  return (
    <div className="p-5 space-y-5">
      {/* Vibe style badge — shown when generating in a reference style */}
      {vibeAnalysis && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-violet-500/10 border border-violet-500/20">
          <Sparkles size={14} className="text-violet-400 shrink-0" />
          <span className="text-sm text-violet-300 flex-1">
            Writing in style: <span className="font-medium text-violet-200">{vibeAnalysis.delivery_style.replace(/_/g, ' ')}</span> · {vibeAnalysis.pacing_style.replace(/_/g, ' ')}
          </span>
          <button
            onClick={onClearVibe}
            className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors rounded"
            title="Remove vibe style"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Source context — shows what we're building from */}
      {ctx.analysis && (
        <div className="bg-zinc-800/30 border border-white/5 rounded-lg p-4 space-y-3">
          <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wide">Building from this video</div>

          {/* Original hook */}
          {ctx.analysis.hook && (
            <div>
              <span className="text-[10px] text-zinc-500 uppercase tracking-wide">Original Hook</span>
              <p className="text-zinc-300 text-sm mt-0.5 italic">&ldquo;{ctx.analysis.hook.line}&rdquo;</p>
              <div className="flex gap-2 mt-1">
                <span className="px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-400 text-[11px] capitalize">{ctx.analysis.hook.style}</span>
                <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${
                  ctx.analysis.hook.strength >= 8 ? 'bg-green-500/10 text-green-400'
                    : ctx.analysis.hook.strength >= 5 ? 'bg-yellow-500/10 text-yellow-400'
                    : 'bg-red-500/10 text-red-400'
                }`}>{ctx.analysis.hook.strength}/10</span>
              </div>
            </div>
          )}

          {/* Why this works */}
          {ctx.analysis.whatWorks && ctx.analysis.whatWorks.length > 0 && (
            <div>
              <span className="text-[10px] text-zinc-500 uppercase tracking-wide">Why this works</span>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {ctx.analysis.whatWorks.slice(0, 3).map((item, i) => (
                  <span key={i} className="px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 text-[11px]">{item}</span>
                ))}
              </div>
            </div>
          )}

          {/* Key phrases + emotion in a row */}
          <div className="flex flex-wrap gap-1.5">
            {ctx.analysis.targetEmotion && (
              <span className="px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-400 text-[11px]">{ctx.analysis.targetEmotion}</span>
            )}
            {ctx.analysis.keyPhrases?.slice(0, 4).map((phrase, i) => (
              <span key={i} className="px-2 py-0.5 rounded-full bg-zinc-700/50 text-zinc-400 text-[11px]">{phrase}</span>
            ))}
          </div>

          {/* Content format/pacing */}
          {ctx.analysis.content && (
            <p className="text-[11px] text-zinc-500">
              {ctx.analysis.content.format} &middot; {ctx.analysis.content.pacing}
            </p>
          )}
        </div>
      )}

      {/* Transcript preview */}
      <div className="bg-zinc-800/30 border border-white/5 rounded-lg p-4">
        <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wide mb-1">Original script</div>
        <p className="text-zinc-400 text-xs leading-relaxed line-clamp-3">{ctx.transcript}</p>
      </div>

      {/* Config — customize the generated script */}
      <div className="space-y-4">
        <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wide">Make it yours</div>

        {/* Angle chips */}
        <div>
          <label className="text-xs text-zinc-500 block mb-2">Angle</label>
          <div className="flex flex-wrap gap-2">
            {ANGLES.map(a => (
              <button
                key={a.id}
                onClick={() => setAngle(a.id)}
                className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                  angle === a.id
                    ? 'bg-teal-500/15 border-teal-500/40 text-teal-400'
                    : 'bg-zinc-800/50 border-white/5 text-zinc-400 hover:text-zinc-200 hover:border-white/10'
                }`}
              >
                {a.name}
              </button>
            ))}
          </div>
        </div>

        {/* Persona + Tone row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-zinc-500 block mb-1.5">Persona</label>
            <select
              value={persona}
              onChange={e => setPersona(e.target.value)}
              className="w-full h-10 px-3 bg-zinc-800 border border-white/10 rounded-lg text-white text-sm focus:ring-1 focus:ring-teal-500 outline-none appearance-none"
            >
              {PERSONAS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-zinc-500 block mb-1.5">Tone</label>
            <select
              value={tone}
              onChange={e => setTone(e.target.value)}
              className="w-full h-10 px-3 bg-zinc-800 border border-white/10 rounded-lg text-white text-sm focus:ring-1 focus:ring-teal-500 outline-none appearance-none"
            >
              {TONES.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        </div>

        {/* Length chips */}
        <div>
          <label className="text-xs text-zinc-500 block mb-2">Target Length</label>
          <div className="flex gap-2">
            {LENGTHS.map(l => (
              <button
                key={l.id}
                onClick={() => setLength(l.id)}
                className={`px-4 py-1.5 text-xs rounded-lg border transition-colors ${
                  length === l.id
                    ? 'bg-teal-500/15 border-teal-500/40 text-teal-400'
                    : 'bg-zinc-800/50 border-white/5 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {l.name}
              </button>
            ))}
          </div>
        </div>

        {/* Product (optional) */}
        <div>
          <label className="text-xs text-zinc-500 block mb-1.5">Product (optional)</label>
          <input
            type="text"
            value={product}
            onChange={e => setProduct(e.target.value)}
            placeholder="e.g. Athletic Greens, Bloom Nutrition..."
            className="w-full h-10 px-3 bg-zinc-800 border border-white/10 rounded-lg text-white text-sm placeholder-zinc-500 focus:ring-1 focus:ring-teal-500 outline-none"
          />
        </div>

        {/* Additional instructions */}
        <div>
          <label className="text-xs text-zinc-500 block mb-1.5">Extra Instructions (optional)</label>
          <textarea
            value={instructions}
            onChange={e => setInstructions(e.target.value)}
            placeholder="e.g. Focus on the health benefits, keep it under 30 words..."
            rows={2}
            className="w-full px-3 py-2 bg-zinc-800 border border-white/10 rounded-lg text-white text-sm placeholder-zinc-500 focus:ring-1 focus:ring-teal-500 outline-none resize-none"
          />
        </div>

        {/* Generate button */}
        <button
          onClick={onGenerate}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 h-11 bg-gradient-to-r from-teal-500 to-violet-500 hover:from-teal-600 hover:to-violet-600 text-white text-sm font-semibold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Writing...
            </>
          ) : result ? (
            <>
              <RefreshCw size={16} />
              Rewrite
            </>
          ) : (
            <>
              <Sparkles size={16} />
              Write My Version
            </>
          )}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 flex items-start gap-2">
          <AlertCircle size={14} className="text-red-400 mt-0.5 shrink-0" />
          <p className="text-red-300 text-sm">{error}</p>
        </div>
      )}

      {/* Script Result */}
      {result && (
        <div className="space-y-4 pt-2">
          {/* Metadata badges */}
          <div className="flex flex-wrap gap-2">
            <span className="px-2.5 py-1 rounded-full bg-teal-500/10 text-teal-400 text-xs font-medium">
              {result.angle_used}
            </span>
            <span className="px-2.5 py-1 rounded-full bg-violet-500/10 text-violet-400 text-xs font-medium">
              {result.persona_used}
            </span>
            <span className="px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 text-xs font-medium">
              {result.tone_used}
            </span>
            {result.estimated_length && (
              <span className="px-2.5 py-1 rounded-full bg-zinc-700/50 text-zinc-300 text-xs font-medium">
                {result.estimated_length}
              </span>
            )}
          </div>

          {/* Hook */}
          <div className="bg-teal-500/5 border border-teal-500/20 rounded-lg p-4">
            <span className="text-[10px] text-teal-400 uppercase tracking-wide font-semibold">Hook</span>
            <p className="text-white font-semibold mt-1 text-sm leading-snug">&ldquo;{result.hook}&rdquo;</p>
          </div>

          {/* Full script */}
          <div className="bg-zinc-800/50 border border-white/5 rounded-lg p-4">
            <span className="text-[10px] text-zinc-400 uppercase tracking-wide font-semibold">Full Script</span>
            <p className="text-zinc-300 mt-1 text-sm leading-relaxed whitespace-pre-wrap">{result.full_script}</p>
          </div>

          {/* CTA */}
          {result.cta && (
            <div className="bg-zinc-800/50 border border-white/5 rounded-lg p-4">
              <span className="text-[10px] text-zinc-400 uppercase tracking-wide font-semibold">CTA</span>
              <p className="text-zinc-200 mt-1 text-sm font-medium">{result.cta}</p>
            </div>
          )}

          {/* On-screen text */}
          {result.on_screen_text?.length > 0 && (
            <div>
              <span className="text-[10px] text-zinc-400 uppercase tracking-wide font-semibold">On-Screen Text</span>
              <div className="flex flex-wrap gap-2 mt-2">
                {result.on_screen_text.map((t, i) => (
                  <span key={i} className="px-2.5 py-1 rounded-lg bg-zinc-800 text-zinc-300 text-xs border border-white/5">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Filming notes */}
          {result.filming_notes && (
            <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-4">
              <span className="text-[10px] text-amber-400 uppercase tracking-wide font-semibold">Filming Notes</span>
              <p className="text-zinc-300 mt-1 text-sm">{result.filming_notes}</p>
            </div>
          )}

          {/* Visual Ideas — vibe-aware when available */}
          <VisualHooksPanel
            topic={product || result.hook}
            verbalHook={result.hook}
            scriptContext={result.full_script.slice(0, 200)}
            vibe={vibeAnalysis ? {
              delivery_style: vibeAnalysis.delivery_style,
              pacing_style: vibeAnalysis.pacing_style,
              hook_energy: vibeAnalysis.hook_energy,
              visual_style: vibeAnalysis.visual_style,
              visual_rhythm: vibeAnalysis.visual_rhythm,
              reveal_timing: vibeAnalysis.reveal_timing,
              recreate_guidance: vibeAnalysis.recreate_guidance,
              timing_arc: vibeAnalysis.timing_arc as VibeContext['timing_arc'],
            } : undefined}
            variant="inline"
          />

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              onClick={onCopy}
              className="flex items-center gap-1.5 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm rounded-lg transition-colors"
            >
              {copied ? <><Check size={14} className="text-green-400" /> Copied!</> : <><Clipboard size={14} /> Copy</>}
            </button>

            {savedId ? (
              <button
                onClick={() => window.location.href = `/admin/content-studio`}
                className="flex items-center gap-1.5 px-4 py-2 bg-green-500/10 border border-green-500/30 text-green-400 text-sm rounded-lg transition-colors hover:bg-green-500/20"
              >
                <Check size={14} />
                Saved! View in Studio
              </button>
            ) : (
              <button
                onClick={onSave}
                disabled={saving}
                className="flex items-center gap-1.5 px-4 py-2 bg-violet-500/10 hover:bg-violet-500/20 border border-violet-500/30 text-violet-400 text-sm rounded-lg transition-colors disabled:opacity-50"
              >
                {saving ? <><Loader2 size={14} className="animate-spin" /> Saving...</> : <><Save size={14} /> Save to Content Studio</>}
              </button>
            )}

            {/* Build Content Pack from this video */}
            <button
              onClick={() => {
                const params = new URLSearchParams({
                  topic: product || result.hook,
                  source: 'transcript',
                  context: result.full_script.slice(0, 300),
                  seed_hook: result.hook,
                });
                window.location.href = `/admin/content-pack?${params.toString()}`;
              }}
              className="flex items-center gap-1.5 px-4 py-2 bg-teal-500/10 hover:bg-teal-500/20 border border-teal-500/30 text-teal-400 text-sm rounded-lg transition-colors"
            >
              Build Content Pack
            </button>
          </div>

          {saveError && <p className="text-red-400 text-sm">{saveError}</p>}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Chat Panel
// ============================================================================

function ChatPanel({
  messages, input, setInput, loading, error, quickPrompts,
  onSend, onQuickPrompt, chatEndRef, chatInputRef,
}: {
  messages: ChatMessage[];
  input: string;
  setInput: (v: string) => void;
  loading: boolean;
  error: string;
  quickPrompts: string[];
  onSend: () => void;
  onQuickPrompt: (p: string) => void;
  chatEndRef: React.RefObject<HTMLDivElement | null>;
  chatInputRef: React.RefObject<HTMLTextAreaElement | null>;
}) {
  return (
    <div className="flex flex-col" style={{ minHeight: '400px', maxHeight: '600px' }}>
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-5 space-y-3">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-xl px-4 py-2.5 text-sm leading-relaxed ${
              msg.role === 'user'
                ? 'bg-teal-500/15 text-teal-100 border border-teal-500/20'
                : 'bg-zinc-800/80 text-zinc-300 border border-white/5'
            }`}>
              <p className="whitespace-pre-wrap">{msg.content}</p>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-zinc-800/80 text-zinc-400 border border-white/5 rounded-xl px-4 py-2.5 text-sm flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" />
              Thinking...
            </div>
          </div>
        )}

        {error && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 flex items-start gap-2">
            <AlertCircle size={14} className="text-red-400 mt-0.5 shrink-0" />
            <p className="text-red-300 text-sm">{error}</p>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Quick prompts (shown when few messages) */}
      {messages.length <= 1 && (
        <div className="px-5 pb-3 flex flex-wrap gap-2">
          {quickPrompts.map((prompt, i) => (
            <button
              key={i}
              onClick={() => onQuickPrompt(prompt)}
              className="px-3 py-1.5 text-xs rounded-lg bg-zinc-800/50 border border-white/5 text-zinc-400 hover:text-zinc-200 hover:border-white/10 transition-colors"
            >
              {prompt}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="border-t border-white/10 p-4 shrink-0">
        <div className="flex items-end gap-2">
          <textarea
            ref={chatInputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
            placeholder="Ask about the transcript..."
            rows={1}
            className="flex-1 px-3 py-2.5 bg-zinc-800 border border-white/10 rounded-lg text-white text-sm placeholder-zinc-500 focus:ring-1 focus:ring-violet-500 outline-none resize-none max-h-24"
          />
          <button
            onClick={onSend}
            disabled={loading || !input.trim()}
            className="h-[38px] w-[38px] flex items-center justify-center bg-violet-500/20 hover:bg-violet-500/30 border border-violet-500/30 text-violet-400 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
