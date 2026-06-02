'use client';

/**
 * VoicePicker
 *
 * Modal voice picker for an avatar. Loads HeyGen stock voices from
 * /api/heygen-voices on first open, lets the user search/filter/preview,
 * and PATCHes /api/avatars/[id]/voice with the chosen voice_id.
 *
 * Plain language throughout. No "configure", no "select voice profile".
 *
 * 2026-06-01: built so /avatars no longer ships "voice unset" forever.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Mic, Search, X, Loader2, Play, Pause, Check, AlertCircle } from 'lucide-react';

interface HeygenVoice {
  voice_id: string;
  name: string;
  language: string;
  gender: string;
  preview_audio: string;
  emotion_support: boolean;
  support_pause: boolean;
}

interface VoicePickerProps {
  avatarId: string;
  currentVoiceId?: string | null;
  onSaved?: () => void;
}

export default function VoicePicker({ avatarId, currentVoiceId, onSaved }: VoicePickerProps) {
  const [open, setOpen] = useState(false);
  const [voices, setVoices] = useState<HeygenVoice[] | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null); // voice_id being saved
  const [saveErr, setSaveErr] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [langFilter, setLangFilter] = useState<string>('all');
  const [genderFilter, setGenderFilter] = useState<string>('all');

  // Audio preview — only one plays at a time. Track which voice_id is playing
  // so the row's icon can flip between play/pause.
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);

  // Used both inside the modal (to show "Currently: X") and outside (to show
  // the button label "Change voice — X" vs "Set voice").
  const currentVoice = useMemo(() => {
    if (!currentVoiceId || !voices) return null;
    return voices.find(v => v.voice_id === currentVoiceId) || null;
  }, [currentVoiceId, voices]);

  async function loadVoices() {
    setLoading(true);
    setLoadErr(null);
    try {
      const r = await fetch('/api/heygen-voices');
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error || `Server returned ${r.status}`);
      }
      const j = await r.json() as { ok?: boolean; voices?: HeygenVoice[]; error?: string };
      if (!j.ok || !j.voices) throw new Error(j.error || 'No voices returned');
      setVoices(j.voices);
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : 'Could not load voices, try again');
    } finally {
      setLoading(false);
    }
  }

  // Lazy-load: only hit the API on first open.
  useEffect(() => {
    if (open && voices === null && !loading) {
      loadVoices();
    }
  }, [open, voices, loading]);

  // Also load once on mount (in the background) so we can show the current
  // voice name on the button without forcing the user to open the modal.
  useEffect(() => {
    if (currentVoiceId && voices === null && !loading) {
      loadVoices();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentVoiceId]);

  // Stop preview audio whenever the modal closes.
  useEffect(() => {
    if (!open && audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
      setPlayingId(null);
    }
  }, [open]);

  function playPreview(v: HeygenVoice) {
    if (!v.preview_audio) return;

    // If this row is already playing, toggle pause.
    if (playingId === v.voice_id && audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
      setPlayingId(null);
      return;
    }

    // Stop whatever was playing.
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    const a = new Audio(v.preview_audio);
    a.onended = () => {
      if (audioRef.current === a) {
        audioRef.current = null;
        setPlayingId(null);
      }
    };
    a.onerror = () => {
      if (audioRef.current === a) {
        audioRef.current = null;
        setPlayingId(null);
      }
    };
    audioRef.current = a;
    setPlayingId(v.voice_id);
    a.play().catch(() => {
      if (audioRef.current === a) {
        audioRef.current = null;
        setPlayingId(null);
      }
    });
  }

  async function pickVoice(v: HeygenVoice) {
    setSaving(v.voice_id);
    setSaveErr(null);
    try {
      const r = await fetch(`/api/avatars/${avatarId}/voice`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ voice_id: v.voice_id }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !(j as { ok?: boolean }).ok) {
        throw new Error((j as { error?: string }).error || `Server returned ${r.status}`);
      }
      // Done — close, tell the parent to refresh.
      setOpen(false);
      onSaved?.();
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : 'Could not save, try again');
    } finally {
      setSaving(null);
    }
  }

  // Build filter options from the loaded voice catalog.
  const languages = useMemo(() => {
    const set = new Set<string>();
    (voices || []).forEach(v => { if (v.language) set.add(v.language); });
    return Array.from(set).sort((a, b) => {
      if (a.toLowerCase() === 'english') return -1;
      if (b.toLowerCase() === 'english') return 1;
      return a.localeCompare(b);
    });
  }, [voices]);

  const genders = useMemo(() => {
    const set = new Set<string>();
    (voices || []).forEach(v => { if (v.gender) set.add(v.gender); });
    return Array.from(set).sort();
  }, [voices]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (voices || []).filter(v => {
      if (langFilter !== 'all' && v.language !== langFilter) return false;
      if (genderFilter !== 'all' && v.gender !== genderFilter) return false;
      if (q && !v.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [voices, search, langFilter, genderFilter]);

  // ---------------------------------------------------------------- TRIGGER

  const buttonLabel = currentVoiceId ? 'Change voice' : 'Set voice';
  const currentLabel = currentVoice
    ? `Voice: ${currentVoice.name}`
    : currentVoiceId
      ? 'Voice set'
      : 'No voice picked yet';

  return (
    <div>
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={() => setOpen(true)}
          className="px-3 py-2 rounded-lg bg-teal-500 hover:bg-teal-600 text-sm font-semibold flex items-center gap-1.5"
        >
          <Mic className="w-4 h-4" /> {buttonLabel}
        </button>
        <span className="text-xs text-zinc-400">{currentLabel}</span>
      </div>

      {/* ---------------------------------------------------------- MODAL */}
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-stretch sm:items-center justify-center sm:p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full sm:max-w-2xl bg-zinc-900 sm:rounded-2xl border border-white/10 flex flex-col max-h-screen sm:max-h-[85vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <div>
                <div className="text-base font-semibold text-white">Pick a voice</div>
                <div className="text-xs text-zinc-400 mt-0.5">Hear it, then use the one you like.</div>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search + filters */}
            <div className="px-4 py-3 border-b border-white/10 space-y-2">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name"
                  className="w-full pl-9 pr-3 py-2 rounded-lg bg-zinc-950 border border-white/10 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-teal-500"
                />
              </div>

              {voices && voices.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  <Chip active={langFilter === 'all'} onClick={() => setLangFilter('all')}>All languages</Chip>
                  {languages.slice(0, 8).map(l => (
                    <Chip key={l} active={langFilter === l} onClick={() => setLangFilter(l)}>{l}</Chip>
                  ))}
                </div>
              )}

              {voices && voices.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  <Chip active={genderFilter === 'all'} onClick={() => setGenderFilter('all')}>Any voice</Chip>
                  {genders.map(g => (
                    <Chip key={g} active={genderFilter === g} onClick={() => setGenderFilter(g)}>{g}</Chip>
                  ))}
                </div>
              )}
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-2 py-2">
              {loading && (
                <div className="flex items-center justify-center py-12 text-zinc-400">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading voices…
                </div>
              )}

              {loadErr && !loading && (
                <div className="m-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-300 mt-0.5 shrink-0" />
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-amber-100">Could not load voices, try again</div>
                      <div className="text-[11px] text-amber-200/80 mt-1 font-mono break-words">{loadErr}</div>
                      <button
                        onClick={loadVoices}
                        className="mt-2 px-3 py-1.5 rounded-md bg-amber-500 hover:bg-amber-400 text-zinc-900 text-xs font-semibold"
                      >
                        Try again
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {!loading && !loadErr && voices && filtered.length === 0 && (
                <div className="text-center py-12 text-sm text-zinc-400">
                  No voices match your filters.
                </div>
              )}

              {!loading && !loadErr && voices && filtered.length > 0 && (
                <ul className="divide-y divide-white/5">
                  {filtered.map(v => {
                    const isCurrent = v.voice_id === currentVoiceId;
                    const isPlaying = playingId === v.voice_id;
                    const isSaving = saving === v.voice_id;
                    return (
                      <li key={v.voice_id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-white/5">
                        <button
                          onClick={() => playPreview(v)}
                          disabled={!v.preview_audio}
                          title={v.preview_audio ? 'Hear voice' : 'No preview available'}
                          className="shrink-0 w-9 h-9 rounded-full bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 disabled:hover:bg-zinc-800 flex items-center justify-center text-white"
                        >
                          {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                        </button>

                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-white truncate flex items-center gap-1.5">
                            {v.name}
                            {isCurrent && (
                              <span className="text-[10px] font-semibold text-teal-300 inline-flex items-center gap-0.5">
                                <Check className="w-3 h-3" /> picked
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-zinc-400 truncate">
                            {[v.language, v.gender].filter(Boolean).join(' · ') || '—'}
                          </div>
                        </div>

                        <button
                          onClick={() => pickVoice(v)}
                          disabled={isSaving || isCurrent}
                          className="shrink-0 px-2.5 py-1.5 rounded-md text-xs font-semibold bg-teal-500 hover:bg-teal-600 disabled:opacity-60 disabled:hover:bg-teal-500 text-white flex items-center gap-1"
                        >
                          {isSaving ? (
                            <><Loader2 className="w-3 h-3 animate-spin" /> Saving</>
                          ) : isCurrent ? (
                            <>In use</>
                          ) : (
                            <>Use this voice</>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Footer (save error) */}
            {saveErr && (
              <div className="px-4 py-2 border-t border-white/10 text-xs text-red-300 bg-red-500/10">
                {saveErr}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={
        'px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ' +
        (active
          ? 'bg-teal-500 border-teal-400 text-white'
          : 'bg-zinc-950 border-white/10 text-zinc-300 hover:border-white/30')
      }
    >
      {children}
    </button>
  );
}
