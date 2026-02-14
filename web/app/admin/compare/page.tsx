'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  GitCompareArrows, ChevronDown, Trophy, FileText, Clock,
  ArrowRight, Check, X, AlertCircle,
} from 'lucide-react';

interface Script {
  id: string;
  title: string | null;
  status: string;
  version: number;
  created_at: string;
  script_json: {
    hook?: string;
    body?: string;
    cta?: string;
    bullets?: string[];
    on_screen_text?: string[];
    b_roll?: string[];
    pacing?: string;
    compliance_notes?: string;
    uploader_instructions?: string;
    product_tags?: string[];
    sections?: Array<{ name: string; content: string }>;
  } | null;
  script_text: string | null;
  spoken_script: string | null;
  product_id: string | null;
}

interface DiffSegment {
  type: 'same' | 'added' | 'removed';
  text: string;
}

function computeWordDiff(textA: string, textB: string): { left: DiffSegment[]; right: DiffSegment[] } {
  const wordsA = textA.split(/(\s+)/);
  const wordsB = textB.split(/(\s+)/);

  // Simple LCS-based diff
  const m = wordsA.length;
  const n = wordsB.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (wordsA[i - 1] === wordsB[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to find diff
  const left: DiffSegment[] = [];
  const right: DiffSegment[] = [];
  let i = m, j = n;

  const leftStack: DiffSegment[] = [];
  const rightStack: DiffSegment[] = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && wordsA[i - 1] === wordsB[j - 1]) {
      leftStack.push({ type: 'same', text: wordsA[i - 1] });
      rightStack.push({ type: 'same', text: wordsB[j - 1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      rightStack.push({ type: 'added', text: wordsB[j - 1] });
      j--;
    } else {
      leftStack.push({ type: 'removed', text: wordsA[i - 1] });
      i--;
    }
  }

  leftStack.reverse();
  rightStack.reverse();

  // Merge consecutive same-type segments
  const merge = (segments: DiffSegment[]): DiffSegment[] => {
    const merged: DiffSegment[] = [];
    for (const seg of segments) {
      if (merged.length > 0 && merged[merged.length - 1].type === seg.type) {
        merged[merged.length - 1].text += seg.text;
      } else {
        merged.push({ ...seg });
      }
    }
    return merged;
  };

  return { left: merge(leftStack), right: merge(rightStack) };
}

function getScriptText(script: Script): string {
  if (script.script_json) {
    const parts: string[] = [];
    if (script.script_json.hook) parts.push(`HOOK: ${script.script_json.hook}`);
    if (script.script_json.body) parts.push(`BODY: ${script.script_json.body}`);
    if (script.script_json.cta) parts.push(`CTA: ${script.script_json.cta}`);
    if (script.script_json.bullets?.length) {
      parts.push(`BULLETS:\n${script.script_json.bullets.map(b => `- ${b}`).join('\n')}`);
    }
    if (parts.length > 0) return parts.join('\n\n');
  }
  return script.script_text || script.spoken_script || '(No content)';
}

function getWordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function getEstimatedDuration(wordCount: number): string {
  const minutes = wordCount / 150; // average speaking rate
  if (minutes < 1) return `${Math.round(minutes * 60)}s`;
  return `${minutes.toFixed(1)}m`;
}

function ScriptPanel({
  script,
  diffSegments,
  side,
  isWinner,
  onSelectWinner,
}: {
  script: Script;
  diffSegments?: DiffSegment[];
  side: 'left' | 'right';
  isWinner: boolean;
  onSelectWinner: () => void;
}) {
  const text = getScriptText(script);
  const wordCount = getWordCount(text);
  const statusColor = script.status === 'APPROVED' ? 'text-green-400' :
    script.status === 'REVIEW' ? 'text-yellow-400' :
    script.status === 'DRAFT' ? 'text-zinc-400' : 'text-zinc-500';

  return (
    <div className={`flex-1 min-w-0 rounded-xl border ${isWinner ? 'border-teal-500 bg-teal-500/5' : 'border-zinc-800 bg-zinc-900/50'}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-zinc-800">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-white truncate">
            {script.title || `Script ${script.id.slice(0, 8)}`}
          </h3>
          <div className="flex items-center gap-3 mt-1 text-xs text-zinc-500">
            <span className={statusColor}>{script.status}</span>
            <span>v{script.version}</span>
            <span>{new Date(script.created_at).toLocaleDateString()}</span>
          </div>
        </div>
        <button
          onClick={onSelectWinner}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            isWinner
              ? 'bg-teal-500 text-white'
              : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
          }`}
        >
          <Trophy className="w-3.5 h-3.5" />
          {isWinner ? 'Winner' : 'Pick'}
        </button>
      </div>

      {/* Stats Bar */}
      <div className="flex items-center gap-4 px-4 py-2 border-b border-zinc-800/50 text-xs text-zinc-500">
        <span className="flex items-center gap-1">
          <FileText className="w-3 h-3" /> {wordCount} words
        </span>
        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3" /> ~{getEstimatedDuration(wordCount)}
        </span>
        {script.script_json?.pacing && (
          <span className="px-1.5 py-0.5 bg-zinc-800 rounded text-[10px] uppercase">
            {script.script_json.pacing}
          </span>
        )}
      </div>

      {/* Content with diff highlighting */}
      <div className="p-4 text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap max-h-[60vh] overflow-y-auto">
        {diffSegments ? (
          diffSegments.map((seg, i) => (
            <span
              key={i}
              className={
                seg.type === 'removed' ? 'bg-red-500/20 text-red-300 line-through' :
                seg.type === 'added' ? 'bg-green-500/20 text-green-300' :
                ''
              }
            >
              {seg.text}
            </span>
          ))
        ) : (
          text
        )}
      </div>

      {/* Structured sections */}
      {script.script_json && (
        <div className="px-4 pb-4 space-y-3">
          {script.script_json.on_screen_text && script.script_json.on_screen_text.length > 0 && (
            <div>
              <h4 className="text-[10px] font-bold text-zinc-500 uppercase mb-1">On-Screen Text</h4>
              <div className="space-y-1">
                {script.script_json.on_screen_text.map((t, i) => (
                  <div key={i} className="text-xs text-zinc-400 bg-zinc-800/50 px-2 py-1 rounded">{t}</div>
                ))}
              </div>
            </div>
          )}
          {script.script_json.b_roll && script.script_json.b_roll.length > 0 && (
            <div>
              <h4 className="text-[10px] font-bold text-zinc-500 uppercase mb-1">B-Roll</h4>
              <div className="space-y-1">
                {script.script_json.b_roll.map((b, i) => (
                  <div key={i} className="text-xs text-zinc-400 bg-zinc-800/50 px-2 py-1 rounded">{b}</div>
                ))}
              </div>
            </div>
          )}
          {script.script_json.product_tags && script.script_json.product_tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {script.script_json.product_tags.map((tag, i) => (
                <span key={i} className="px-2 py-0.5 bg-teal-500/10 text-teal-400 text-[10px] rounded-full border border-teal-500/20">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ComparePage() {
  const searchParams = useSearchParams();
  const [scripts, setScripts] = useState<Script[]>([]);
  const [loading, setLoading] = useState(true);
  const [scriptA, setScriptA] = useState<Script | null>(null);
  const [scriptB, setScriptB] = useState<Script | null>(null);
  const [winner, setWinner] = useState<'a' | 'b' | null>(null);
  const [showDiff, setShowDiff] = useState(true);
  const [approving, setApproving] = useState(false);

  // Load scripts
  useEffect(() => {
    const loadScripts = async () => {
      try {
        const res = await fetch('/api/scripts');
        const data = await res.json();
        if (data.ok) {
          setScripts(data.data || []);
          // Auto-select from URL params
          const idA = searchParams.get('a');
          const idB = searchParams.get('b');
          if (idA) {
            const found = (data.data || []).find((s: Script) => s.id === idA);
            if (found) setScriptA(found);
          }
          if (idB) {
            const found = (data.data || []).find((s: Script) => s.id === idB);
            if (found) setScriptB(found);
          }
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    };
    loadScripts();
  }, [searchParams]);

  const diff = scriptA && scriptB && showDiff
    ? computeWordDiff(getScriptText(scriptA), getScriptText(scriptB))
    : null;

  const handleApproveWinner = useCallback(async () => {
    const winnerScript = winner === 'a' ? scriptA : scriptB;
    if (!winnerScript) return;

    setApproving(true);
    try {
      await fetch(`/api/scripts/${winnerScript.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'APPROVED' }),
      });
      // Update local state
      const updated = { ...winnerScript, status: 'APPROVED' };
      if (winner === 'a') setScriptA(updated);
      else setScriptB(updated);
    } finally {
      setApproving(false);
    }
  }, [winner, scriptA, scriptB]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-zinc-500 text-sm">Loading scripts...</div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto pb-24 lg:pb-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <GitCompareArrows className="w-6 h-6 text-teal-400" />
          <div>
            <h1 className="text-xl font-bold text-white">Script Comparison</h1>
            <p className="text-xs text-zinc-500">Compare two scripts side-by-side</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
            <input
              type="checkbox"
              checked={showDiff}
              onChange={(e) => setShowDiff(e.target.checked)}
              className="rounded border-zinc-700"
            />
            Show diff
          </label>
          {winner && (
            <button
              onClick={handleApproveWinner}
              disabled={approving}
              className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 text-white rounded-lg text-xs font-medium hover:bg-teal-500 transition-colors disabled:opacity-50"
            >
              <Check className="w-3.5 h-3.5" />
              {approving ? 'Approving...' : 'Approve Winner'}
            </button>
          )}
        </div>
      </div>

      {/* Script Selectors */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <ScriptSelector
          label="Script A"
          scripts={scripts}
          selected={scriptA}
          onSelect={setScriptA}
          excludeId={scriptB?.id}
        />
        <ScriptSelector
          label="Script B"
          scripts={scripts}
          selected={scriptB}
          onSelect={setScriptB}
          excludeId={scriptA?.id}
        />
      </div>

      {/* Comparison Panels */}
      {scriptA && scriptB ? (
        <>
          {/* Quick Stats Comparison */}
          <ComparisonStats scriptA={scriptA} scriptB={scriptB} />

          {/* Side by Side */}
          <div className="flex gap-4 mt-4">
            <ScriptPanel
              script={scriptA}
              diffSegments={diff?.left}
              side="left"
              isWinner={winner === 'a'}
              onSelectWinner={() => setWinner(winner === 'a' ? null : 'a')}
            />
            <div className="flex items-center">
              <ArrowRight className="w-5 h-5 text-zinc-600" />
            </div>
            <ScriptPanel
              script={scriptB}
              diffSegments={diff?.right}
              side="right"
              isWinner={winner === 'b'}
              onSelectWinner={() => setWinner(winner === 'b' ? null : 'b')}
            />
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
          <GitCompareArrows className="w-12 h-12 mb-4 opacity-30" />
          <p className="text-sm">Select two scripts above to compare</p>
        </div>
      )}
    </div>
  );
}

function ScriptSelector({
  label,
  scripts,
  selected,
  onSelect,
  excludeId,
}: {
  label: string;
  scripts: Script[];
  selected: Script | null;
  onSelect: (script: Script | null) => void;
  excludeId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = scripts.filter(s => {
    if (s.id === excludeId) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (s.title || '').toLowerCase().includes(q) ||
      s.id.toLowerCase().includes(q) ||
      s.status.toLowerCase().includes(q);
  });

  return (
    <div className="relative">
      <label className="text-[10px] font-bold text-zinc-500 uppercase mb-1 block">{label}</label>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full px-3 py-2.5 bg-zinc-900 border border-zinc-700 rounded-lg text-sm text-zinc-300 hover:border-zinc-600 transition-colors"
      >
        <span className="truncate">
          {selected ? (selected.title || `Script ${selected.id.slice(0, 8)}`) : 'Select a script...'}
        </span>
        <ChevronDown className={`w-4 h-4 text-zinc-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl max-h-64 overflow-hidden">
          <div className="p-2 border-b border-zinc-800">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search scripts..."
              className="w-full px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-teal-500"
              autoFocus
            />
          </div>
          <div className="overflow-y-auto max-h-48">
            {selected && (
              <button
                onClick={() => { onSelect(null); setOpen(false); setSearch(''); }}
                className="flex items-center gap-2 w-full px-3 py-2 text-xs text-red-400 hover:bg-zinc-800 transition-colors"
              >
                <X className="w-3 h-3" /> Clear selection
              </button>
            )}
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-xs text-zinc-600 text-center">No scripts found</div>
            ) : (
              filtered.map(script => (
                <button
                  key={script.id}
                  onClick={() => { onSelect(script); setOpen(false); setSearch(''); }}
                  className={`flex items-center justify-between w-full px-3 py-2 text-left hover:bg-zinc-800 transition-colors ${
                    selected?.id === script.id ? 'bg-teal-500/10' : ''
                  }`}
                >
                  <div className="min-w-0">
                    <div className="text-xs text-zinc-300 truncate">
                      {script.title || `Script ${script.id.slice(0, 8)}`}
                    </div>
                    <div className="text-[10px] text-zinc-600">
                      v{script.version} &middot; {script.status}
                    </div>
                  </div>
                  {selected?.id === script.id && <Check className="w-3.5 h-3.5 text-teal-400 flex-shrink-0" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ComparisonStats({ scriptA, scriptB }: { scriptA: Script; scriptB: Script }) {
  const textA = getScriptText(scriptA);
  const textB = getScriptText(scriptB);
  const wordsA = getWordCount(textA);
  const wordsB = getWordCount(textB);
  const hookA = scriptA.script_json?.hook?.length || 0;
  const hookB = scriptB.script_json?.hook?.length || 0;
  const sectionsA = (scriptA.script_json?.bullets?.length || 0) + (scriptA.script_json?.on_screen_text?.length || 0);
  const sectionsB = (scriptB.script_json?.bullets?.length || 0) + (scriptB.script_json?.on_screen_text?.length || 0);

  const stats = [
    { label: 'Words', a: wordsA, b: wordsB },
    { label: 'Hook Length', a: hookA, b: hookB, suffix: ' chars' },
    { label: 'Elements', a: sectionsA, b: sectionsB },
    { label: 'Version', a: scriptA.version, b: scriptB.version },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {stats.map((stat) => {
        const diff = stat.a - stat.b;
        return (
          <div key={stat.label} className="p-3 bg-zinc-900/50 border border-zinc-800 rounded-xl">
            <div className="text-[10px] font-bold text-zinc-500 uppercase mb-2">{stat.label}</div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-mono text-zinc-300">{stat.a}{stat.suffix || ''}</span>
              <span className={`text-[10px] font-medium ${
                diff > 0 ? 'text-green-400' : diff < 0 ? 'text-red-400' : 'text-zinc-600'
              }`}>
                {diff === 0 ? '=' : diff > 0 ? `+${diff}` : diff}
              </span>
              <span className="text-sm font-mono text-zinc-300">{stat.b}{stat.suffix || ''}</span>
            </div>
            <div className="flex items-center gap-1 mt-1.5">
              <div className="h-1 flex-1 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-teal-500 rounded-full"
                  style={{ width: `${Math.min(100, (stat.a / Math.max(stat.a, stat.b, 1)) * 100)}%` }}
                />
              </div>
              <div className="h-1 flex-1 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-teal-500 rounded-full"
                  style={{ width: `${Math.min(100, (stat.b / Math.max(stat.a, stat.b, 1)) * 100)}%` }}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
