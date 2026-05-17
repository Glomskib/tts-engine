'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Mic, Sparkles, Loader2, Check, AlertCircle, Upload, ChevronDown, ChevronUp,
  Leaf, Rocket, Dumbbell, Palette, BookOpen, Zap, RefreshCw, X as XIcon,
} from 'lucide-react';

// ------------------------------------------------------------------
// Archetypes — themed cards, no fake silhouettes. Each one has a
// distinct gradient + lucide icon so users can tell them apart at a glance.
// ------------------------------------------------------------------
interface Archetype {
  key: string;
  display_name: string;
  niche: string;
  tagline: string;
  personality: string;
  tone_descriptor: string;
  target_audience: string;
  prohibited_phrases: string;
  default_traits: { label: string }[];
  // Visual identity:
  Icon: typeof Leaf;
  bg: string; // tailwind classes for card background
  ring: string; // selected-state ring color
}

const ARCHETYPES: Archetype[] = [
  {
    key: 'wellness-mom', display_name: 'Mia', niche: 'Wellness creator, 30s',
    tagline: 'Warm, plain-talk. Mom-friend energy.',
    personality: "Warm, conversational, never pushy. Shares her own routine. Honest about what works and what doesn't.",
    tone_descriptor: 'Plain talk, friend-to-friend. Soft, never salesy.',
    target_audience: 'Women 28-42 interested in clean-ingredient products',
    prohibited_phrases: 'cures, treats, prevents, FDA-approved, guaranteed',
    default_traits: [{ label: 'Warm' }, { label: 'Honest' }, { label: 'Calm' }],
    Icon: Leaf, bg: 'from-emerald-500/30 via-emerald-700/20 to-teal-900/40', ring: 'ring-emerald-400',
  },
  {
    key: 'tech-founder', display_name: 'Jordan', niche: 'Tech founder, B2B SaaS',
    tagline: 'Direct, confident. Sells the why before the what.',
    personality: 'Direct, founder-style. Comfortable explaining technical things in human terms. Sells the why before the what.',
    tone_descriptor: 'Confident, no fluff. Drops one specific number per video.',
    target_audience: 'B2B buyers, founders, ops leaders', prohibited_phrases: '',
    default_traits: [{ label: 'Confident' }, { label: 'Sharp' }, { label: 'Direct' }],
    Icon: Rocket, bg: 'from-sky-500/30 via-blue-700/20 to-indigo-900/40', ring: 'ring-sky-400',
  },
  {
    key: 'fitness-coach', display_name: 'Jake', niche: 'Fitness coach, 30s',
    tagline: 'High-energy, demo-first.',
    personality: "High-energy, demo-first. Talks like he's mid-workout. Pushes hard but never preachy.",
    tone_descriptor: 'Energetic, punchy hooks, short sentences.',
    target_audience: 'Gym-goers, lifters, athletes 22-40', prohibited_phrases: '',
    default_traits: [{ label: 'Energetic' }, { label: 'Direct' }, { label: 'Bold' }],
    Icon: Dumbbell, bg: 'from-orange-500/30 via-amber-700/20 to-red-900/40', ring: 'ring-orange-400',
  },
  {
    key: 'creative-director', display_name: 'Ella', niche: 'Creative director / brand voice',
    tagline: 'Polished, taste-forward. Curates rather than sells.',
    personality: 'Polished, taste-forward. Curates rather than sells. Knows what looks good and says why.',
    tone_descriptor: 'Refined, considered. Uses one strong adjective per beat.',
    target_audience: 'Designers, brand owners, creatives', prohibited_phrases: '',
    default_traits: [{ label: 'Refined' }, { label: 'Curious' }, { label: 'Warm' }],
    Icon: Palette, bg: 'from-fuchsia-500/30 via-pink-700/20 to-rose-900/40', ring: 'ring-fuchsia-400',
  },
  {
    key: 'product-educator', display_name: 'Sam', niche: 'Product educator',
    tagline: 'Calm explainer. Breaks things down without dumbing them down.',
    personality: 'Calm explainer. Breaks complex topics into clean steps. Patient, never condescending.',
    tone_descriptor: 'Clear, step-by-step. Anchors with examples.',
    target_audience: 'Buyers researching before purchase', prohibited_phrases: '',
    default_traits: [{ label: 'Clear' }, { label: 'Patient' }, { label: 'Smart' }],
    Icon: BookOpen, bg: 'from-cyan-500/30 via-teal-700/20 to-emerald-900/40', ring: 'ring-cyan-400',
  },
  {
    key: 'gen-z-creator', display_name: 'Avi', niche: 'Gen Z creator',
    tagline: 'Casual, funny, unfiltered.',
    personality: 'Casual, funny, unfiltered. Talks like texting a friend. Drops self-aware observations.',
    tone_descriptor: 'Conversational, slangy, lots of filler that lands.',
    target_audience: 'Gen Z, college, young pros', prohibited_phrases: '',
    default_traits: [{ label: 'Funny' }, { label: 'Casual' }, { label: 'Quick' }],
    Icon: Zap, bg: 'from-violet-500/30 via-purple-700/20 to-fuchsia-900/40', ring: 'ring-violet-400',
  },
];

interface VoicePreset { key: string; label: string; blurb: string; emoji: string; }
const VOICE_PRESETS: VoicePreset[] = [
  { key: 'warm-female-30s', label: 'Warm female · 30s', blurb: 'Calm, friend-to-friend', emoji: '🌿' },
  { key: 'direct-male-30s', label: 'Direct male · 30s', blurb: 'Confident, founder', emoji: '🎙️' },
  { key: 'bright-female-20s', label: 'Bright female · 20s', blurb: 'Energetic, casual', emoji: '⚡' },
  { key: 'mellow-male-40s', label: 'Mellow male · 40s', blurb: 'Polished, narrator', emoji: '🎬' },
  { key: 'playful-female-20s', label: 'Playful female · 20s', blurb: 'Funny, conversational', emoji: '😂' },
  { key: 'authoritative-male-50s', label: 'Authoritative male · 50s', blurb: 'Expert, measured', emoji: '🧭' },
];

const PLATFORMS = [
  { key: 'ig_reels', label: 'IG Reels', default: true }, { key: 'yt_shorts', label: 'YT Shorts', default: true },
  { key: 'linkedin', label: 'LinkedIn', default: true }, { key: 'tiktok', label: 'TikTok', default: false },
  { key: 'ig_feed', label: 'IG Feed', default: false }, { key: 'yt_long', label: 'YouTube long', default: false },
  { key: 'x', label: 'X', default: false }, { key: 'paid_ads', label: 'Paid ads', default: false },
  { key: 'brand_video', label: 'Brand video', default: false },
];

// ------------------------------------------------------------------
// Upload + preview state machine
//   idle              → no photo
//   uploading         → file picked, uploading to storage
//   uploaded          → original photo URL ready; offer AI preview
//   generating        → AI preview in progress
//   preview-ready     → side-by-side picker: original vs AI
//   chosen            → user picked one; that's the avatar's face
//   error             → something failed; show retry
// ------------------------------------------------------------------
type FaceState =
  | { status: 'idle' }
  | { status: 'uploading'; localPreview: string }
  | { status: 'uploaded'; originalUrl: string; localPreview: string }
  | { status: 'generating'; originalUrl: string; localPreview: string }
  | { status: 'preview-ready'; originalUrl: string; aiUrl: string; localPreview: string }
  | { status: 'chosen'; chosenUrl: string; choseAi: boolean; originalUrl: string; aiUrl?: string }
  | { status: 'error'; message: string; originalUrl?: string; localPreview?: string };

export default function NewAvatarPage() {
  const router = useRouter();
  const [archetypeKey, setArchetypeKey] = useState<string>(ARCHETYPES[0].key);
  const arch = useMemo(() => ARCHETYPES.find(a => a.key === archetypeKey) || ARCHETYPES[0], [archetypeKey]);

  const [displayName, setDisplayName] = useState(arch.display_name);
  const [niche, setNiche] = useState(arch.niche);
  const [personality, setPersonality] = useState(arch.personality);
  const [tone, setTone] = useState(arch.tone_descriptor);
  const [audience, setAudience] = useState(arch.target_audience);
  const [prohibited, setProhibited] = useState(arch.prohibited_phrases);
  const [voiceKey, setVoiceKey] = useState<string>(VOICE_PRESETS[0].key);
  const [platforms, setPlatforms] = useState<string[]>(PLATFORMS.filter(p => p.default).map(p => p.key));
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [face, setFace] = useState<FaceState>({ status: 'idle' });
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [stage, setStage] = useState<'creating' | 'finalizing' | 'done' | null>(null);

  const archChangedRef = useRef(false);
  useEffect(() => {
    if (!archChangedRef.current) { archChangedRef.current = true; return; }
    setDisplayName(arch.display_name); setNiche(arch.niche); setPersonality(arch.personality);
    setTone(arch.tone_descriptor); setAudience(arch.target_audience); setProhibited(arch.prohibited_phrases);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [archetypeKey]);

  function togglePlatform(key: string) { setPlatforms(p => p.includes(key) ? p.filter(k => k !== key) : [...p, key]); }

  // ----------------------------------------------------------------
  // Upload + AI preview pipeline
  // ----------------------------------------------------------------
  async function handleFile(file: File) {
    const localPreview = URL.createObjectURL(file);
    setFace({ status: 'uploading', localPreview });
    try {
      // Step A: ask server for a signed URL (use the existing /api/avatars/preview-upload
      // helper if it exists; otherwise we upload via FormData directly to Supabase).
      // For now, we POST the file as multipart to /api/avatars/upload-temp which the
      // server will route to Supabase Storage. If that endpoint doesn't exist we fall
      // back to /api/avatars/[id]/visual/upload after the avatar is created — but for
      // the upload-first flow we need a temp upload path.
      // Two-step upload: get a signed Supabase URL, then PUT the file directly.
      // Bypasses Vercel's ~4.5MB serverless function body cap.
      const sign = await fetch('/api/avatars/upload-temp', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ filename: file.name, mime: file.type, size: file.size }),
      });
      if (!sign.ok) {
        const errJson = await sign.json().catch(() => ({} as { error?: string }));
        throw new Error(errJson.error || ('upload sign failed: ' + sign.status));
      }
      const signJ = await sign.json() as { signed_url?: string; public_url?: string; error?: string };
      if (!signJ.signed_url || !signJ.public_url) {
        throw new Error(signJ.error || 'no signed_url returned');
      }
      const put = await fetch(signJ.signed_url, {
        method: 'PUT',
        headers: { 'content-type': file.type || 'image/jpeg' },
        body: file,
      });
      if (!put.ok) throw new Error('storage upload failed: ' + put.status);
      const originalUrl = signJ.public_url;
      setFace({ status: 'uploaded', originalUrl, localPreview });

      // Step B: auto-trigger AI preview generation
      generateAiPreview(originalUrl, localPreview);
    } catch (e: any) {
      setFace({ status: 'error', message: e?.message || 'Upload failed', localPreview });
    }
  }

  async function generateAiPreview(originalUrl: string, localPreview: string) {
    setFace({ status: 'generating', originalUrl, localPreview });
    try {
      const r = await fetch('/api/avatars/preview', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reference_image_url: originalUrl }),
      });
      const j = await r.json() as { ok?: boolean; preview_url?: string; error?: string };
      if (!r.ok || !j.ok || !j.preview_url) {
        // Fallback: skip preview, just use original
        setFace({ status: 'chosen', chosenUrl: originalUrl, choseAi: false, originalUrl });
        return;
      }
      setFace({ status: 'preview-ready', originalUrl, aiUrl: j.preview_url, localPreview });
    } catch (e: any) {
      // Network or server error — fall back to using original
      setFace({ status: 'chosen', chosenUrl: originalUrl, choseAi: false, originalUrl });
    }
  }

  function pickOriginal() {
    if (face.status !== 'preview-ready') return;
    setFace({ status: 'chosen', chosenUrl: face.originalUrl, choseAi: false, originalUrl: face.originalUrl, aiUrl: face.aiUrl });
  }
  function pickAi() {
    if (face.status !== 'preview-ready') return;
    setFace({ status: 'chosen', chosenUrl: face.aiUrl, choseAi: true, originalUrl: face.originalUrl, aiUrl: face.aiUrl });
  }
  function resetFace() {
    setFace({ status: 'idle' });
  }

  // The URL to use as the avatar's face when submitting. Null if none chosen.
  // If the user uploaded a photo but didn't tap through to pick, auto-use the original.
  // This way submitting 'Bring [Name] to life' never silently drops the photo.
  const chosenFaceUrl: string | null =
    face.status === 'chosen' ? face.chosenUrl :
    face.status === 'preview-ready' ? face.originalUrl :
    face.status === 'generating' ? face.originalUrl :
    face.status === 'uploaded' ? face.originalUrl :
    null;
  // For the sticky preview pane:
  const previewImageUrl: string | null =
    face.status === 'chosen' ? face.chosenUrl :
    face.status === 'preview-ready' ? face.originalUrl :
    face.status === 'generating' ? face.originalUrl :
    face.status === 'uploaded' ? face.originalUrl :
    face.status === 'uploading' ? face.localPreview :
    face.status === 'error' ? (face.localPreview ?? null) :
    null;

  async function bringToLife() {
    if (!displayName.trim()) { setErr('Pick a name'); return; }
    setSubmitting(true); setErr(null); setStage('creating');
    try {
      const internalName = displayName.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60) || `avatar-${Date.now()}`;
      const createRes = await fetch('/api/avatars', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: internalName,
          avatar_display_name: displayName.trim(),
          niche, personality,
          tone_descriptor: tone,
          target_audience: audience,
          prohibited_phrases: prohibited,
          voice_preset_id: voiceKey ?? null,
          voice_provider: voiceKey ? 'preset' : null,
          knowledge_bank: { platforms, archetype: archetypeKey, voice_preset: voiceKey },
        }),
      });
      const createJson = await createRes.json() as { ok: boolean; id?: string; error?: string };
      if (!createJson.ok || !createJson.id) throw new Error(createJson.error || 'create failed');
      const avatarId = createJson.id;
      setStage('finalizing');

      if (chosenFaceUrl) {
        await fetch(`/api/avatars/${avatarId}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ avatar_visual_reference_url: chosenFaceUrl, setup_status: 'face' }),
        });
      }

      setStage('done');
      setTimeout(() => router.push(`/avatars/${avatarId}`), 700);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Something went wrong');
      setStage(null);
    } finally {
      setSubmitting(false);
    }
  }

  // ----------------------------------------------------------------
  // Render
  // ----------------------------------------------------------------
  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="max-w-6xl mx-auto px-4 py-6 lg:py-10">
        <Link href="/avatars" className="inline-flex items-center gap-1.5 text-sm text-zinc-300 hover:text-white mb-6">
          <ArrowLeft className="w-4 h-4" /> Back to avatars
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-8">
          <div className="space-y-10">

            {/* STEP 1: PHOTO */}
            <section>
              <div className="flex items-baseline gap-3 mb-1">
                <h2 className="text-xl font-bold">1. Drop a face</h2>
                <span className="text-xs text-zinc-400">(needed to film — you can skip and add one later)</span>
              </div>
              <p className="text-sm text-zinc-300 mb-4">
                The face of your avatar. We'll show you an AI-styled version side-by-side so you can pick which one to use.
              </p>

              <FaceUploadCard
                face={face}
                onFile={handleFile}
                onPickOriginal={pickOriginal}
                onPickAi={pickAi}
                onReset={resetFace}
                onRetryPreview={() => face.status === 'uploaded' || face.status === 'chosen' ? generateAiPreview((face as any).originalUrl, '') : null}
              />
            </section>

            {/* STEP 2: PERSONALITY */}
            <section>
              <h2 className="text-xl font-bold mb-1">2. Pick a vibe</h2>
              <p className="text-sm text-zinc-300 mb-4">These are personality presets — pick the one that fits how you want them to talk. The actual face is whatever photo you dropped above.</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {ARCHETYPES.map(a => {
                  const on = archetypeKey === a.key;
                  const A = a.Icon;
                  return (
                    <button
                      key={a.key}
                      onClick={() => setArchetypeKey(a.key)}
                      className={`text-left rounded-xl border overflow-hidden transition-all ${
                        on ? `border-transparent ${a.ring} ring-2` : 'border-zinc-700 hover:border-zinc-500'
                      }`}
                    >
                      <div className={`relative aspect-[5/4] bg-gradient-to-br ${a.bg} flex items-center justify-center p-4`}>
                        <A className="w-12 h-12 text-white/90" strokeWidth={1.5} />
                        <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-black/40 text-[10px] font-semibold uppercase tracking-wider text-white/80">
                          {a.display_name}
                        </div>
                      </div>
                      <div className="p-3 bg-zinc-900">
                        <div className="text-sm font-semibold">{a.niche}</div>
                        <div className="text-[11px] text-zinc-400 mt-1 leading-snug">{a.tagline}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* STEP 3: CUSTOMIZE */}
            <section>
              <h2 className="text-xl font-bold mb-1">3. Make them yours</h2>
              <p className="text-sm text-zinc-300 mb-4">Pre-filled from the vibe. Tweak anything.</p>
              <div className="space-y-3">
                <Field label="Name">
                  <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg bg-zinc-900 border border-zinc-600 text-base text-white focus:border-teal-400 outline-none" />
                </Field>
                <Field label="Niche / what they're known for">
                  <input type="text" value={niche} onChange={e => setNiche(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-600 text-sm text-white focus:border-teal-400 outline-none" />
                </Field>
                <Field label="Personality">
                  <textarea value={personality} onChange={e => setPersonality(e.target.value)} rows={3}
                    className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-600 text-sm text-white focus:border-teal-400 outline-none resize-none" />
                </Field>
                <Field label="How they talk">
                  <input type="text" value={tone} onChange={e => setTone(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-600 text-sm text-white focus:border-teal-400 outline-none" />
                </Field>
              </div>
            </section>

            {/* STEP 4: VOICE */}
            <section>
              <h2 className="text-xl font-bold mb-1">4. Voice</h2>
              <p className="text-sm text-zinc-300 mb-4">Pick a voice that fits. Clone your own later.</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {VOICE_PRESETS.map(v => {
                  const on = voiceKey === v.key;
                  return (
                    <button key={v.key} onClick={() => setVoiceKey(v.key)}
                      className={`text-left p-3 rounded-xl border ${on ? 'bg-teal-600/30 border-teal-400' : 'bg-zinc-900 border-zinc-700 hover:border-zinc-500'}`}>
                      <div className="flex items-center gap-2 mb-1.5"><span className="text-lg">{v.emoji}</span></div>
                      <div className="text-xs font-semibold">{v.label}</div>
                      <div className="text-[10px] text-zinc-400 mt-0.5">{v.blurb}</div>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* ADVANCED */}
            <section>
              <button onClick={() => setAdvancedOpen(o => !o)} className="flex items-center gap-2 text-sm font-semibold text-zinc-200">
                {advancedOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                Optional: who they talk to, platforms, words they don’t say
              </button>
              {advancedOpen && (
                <div className="mt-4 space-y-4">
                  <Field label="Target audience">
                    <input type="text" value={audience} onChange={e => setAudience(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-600 text-sm text-white focus:border-teal-400 outline-none" />
                  </Field>
                  <Field label="Platforms">
                    <div className="flex flex-wrap gap-2">
                      {PLATFORMS.map(p => {
                        const on = platforms.includes(p.key);
                        return (
                          <button key={p.key} type="button" onClick={() => togglePlatform(p.key)}
                            className={`px-3 py-1.5 rounded-full text-xs border ${on ? 'bg-teal-600/40 border-teal-400 text-teal-100' : 'bg-zinc-900 border-zinc-700 text-zinc-300'}`}>
                            {p.label}
                          </button>
                        );
                      })}
                    </div>
                  </Field>
                  <Field label="Words they don’t say">
                    <textarea value={prohibited} onChange={e => setProhibited(e.target.value)} rows={2}
                      placeholder="cures, treats, prevents, guaranteed"
                      className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-600 text-sm text-white placeholder-zinc-500 focus:border-teal-400 outline-none resize-none" />
                    <div className="text-[11px] text-zinc-400 mt-1">Every script avoids these words automatically.</div>
                  </Field>
                </div>
              )}
            </section>

            {err && (
              <div className="p-3 rounded-lg bg-red-900/40 border border-red-500/50 text-sm text-red-200 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5" />{err}
              </div>
            )}
          </div>

          {/* Sticky preview pane */}
          <aside className="lg:sticky lg:top-6 self-start">
            <div className="rounded-2xl border border-zinc-700 bg-zinc-900 overflow-hidden">
              <div className={`aspect-[3/4] relative ${previewImageUrl ? '' : `bg-gradient-to-br ${arch.bg}`}`}>
                {previewImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={previewImageUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <arch.Icon className="w-20 h-20 text-white/80" strokeWidth={1.5} />
                  </div>
                )}
                {face.status === 'chosen' && face.choseAi && (
                  <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-violet-500/80 text-[10px] font-semibold uppercase text-white">AI</div>
                )}
              </div>
              <div className="p-4 space-y-3">
                <div>
                  <div className="text-lg font-bold">{displayName || 'Unnamed'}</div>
                  <div className="text-[12px] text-zinc-300">{niche || '—'}</div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {arch.default_traits.map(t => (
                    <span key={t.label} className="px-2 py-0.5 rounded-full bg-teal-600/30 border border-teal-500/50 text-teal-100 text-[10px] font-semibold">{t.label}</span>
                  ))}
                </div>
                <div className="flex items-center gap-2 text-[11px] text-zinc-300 pt-1 border-t border-zinc-800">
                  <Mic className="w-3.5 h-3.5" />{VOICE_PRESETS.find(v => v.key === voiceKey)?.label || '—'}
                </div>
                <button onClick={bringToLife} disabled={submitting}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-teal-500 to-purple-600 hover:opacity-90 disabled:opacity-50 text-white font-bold flex items-center justify-center gap-2">
                  {submitting ? (
                    <><Loader2 className="w-4 h-4 animate-spin" />
                    {stage === 'finalizing' ? 'Adding them to your cast…' : stage === 'done' ? 'Done!' : 'Creating…'}
                    </>
                  ) : (
                    <><Sparkles className="w-4 h-4" /> Bring {displayName || 'them'} to life</>
                  )}
                </button>
                <div className="text-[10px] text-zinc-400 text-center">You can edit anything later from this avatar's page.</div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------
// Subcomponents
// ------------------------------------------------------------------

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-300 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function FaceUploadCard(props: {
  face: FaceState;
  onFile: (file: File) => void;
  onPickOriginal: () => void;
  onPickAi: () => void;
  onReset: () => void;
  onRetryPreview: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { face, onFile, onPickOriginal, onPickAi, onReset } = props;

  // Drop handlers
  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) onFile(f);
  }

  if (face.status === 'idle' || face.status === 'error') {
    return (
      <label
        onDrop={onDrop}
        onDragOver={(e) => e.preventDefault()}
        className="flex flex-col items-center justify-center gap-3 px-6 py-12 rounded-xl border-2 border-dashed border-zinc-600 hover:border-teal-400 cursor-pointer transition-colors bg-zinc-950"
      >
        <input ref={inputRef} type="file" accept="image/*" className="hidden"
          onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        <Upload className="w-8 h-8 text-zinc-400" />
        <div className="text-center">
          <div className="text-base font-semibold">Drop a photo here, or click to pick one</div>
          <div className="text-xs text-zinc-400 mt-1">JPG or PNG. A face you own or have permission to use. ~5MB works best.</div>
        </div>
        {face.status === 'error' && (
          <div className="text-xs text-red-300 mt-2">{face.message}</div>
        )}
      </label>
    );
  }

  if (face.status === 'uploading') {
    return (
      <div className="flex items-center gap-4 p-4 rounded-xl border border-zinc-700 bg-zinc-900">
        <div className="w-20 h-20 rounded-lg overflow-hidden bg-zinc-800">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={face.localPreview} alt="" className="w-full h-full object-cover" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 text-sm font-semibold"><Loader2 className="w-4 h-4 animate-spin" />Uploading…</div>
          <div className="text-xs text-zinc-400 mt-1">Then we'll generate the AI-styled version.</div>
        </div>
      </div>
    );
  }

  if (face.status === 'uploaded' || face.status === 'generating') {
    return (
      <div className="flex items-center gap-4 p-4 rounded-xl border border-zinc-700 bg-zinc-900">
        <div className="w-20 h-20 rounded-lg overflow-hidden bg-zinc-800">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={face.localPreview} alt="" className="w-full h-full object-cover" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Loader2 className="w-4 h-4 animate-spin" />
            {face.status === 'uploaded' ? 'Setting up the AI version…' : 'Making the AI version (10–25s)…'}
          </div>
          <div className="text-xs text-zinc-400 mt-1">You'll be able to pick original or AI version.</div>
        </div>
        <button onClick={onReset} className="p-2 text-zinc-400 hover:text-white" aria-label="Reset"><XIcon className="w-4 h-4" /></button>
      </div>
    );
  }

  if (face.status === 'preview-ready') {
    return (
      <div className="rounded-xl border border-zinc-700 bg-zinc-900 overflow-hidden">
        <div className="p-3 border-b border-zinc-800 flex items-center justify-between">
          <div className="text-sm font-semibold">Which face do you want to film with?</div>
          <button onClick={onReset} className="text-xs text-zinc-400 hover:text-white flex items-center gap-1">
            <RefreshCw className="w-3 h-3" /> Try another photo
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3 p-3">
          <button onClick={onPickOriginal}
            className="text-left rounded-lg border-2 border-zinc-700 hover:border-teal-400 overflow-hidden transition-colors">
            <div className="aspect-square bg-zinc-800">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={face.originalUrl} alt="Your original photo" className="w-full h-full object-cover" />
            </div>
            <div className="p-3">
              <div className="text-sm font-semibold">Use my photo</div>
              <div className="text-[11px] text-zinc-400 mt-0.5">The one you uploaded</div>
            </div>
          </button>
          <button onClick={onPickAi}
            className="text-left rounded-lg border-2 border-violet-500/50 hover:border-violet-400 overflow-hidden transition-colors">
            <div className="aspect-square bg-zinc-800 relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={face.aiUrl} alt="AI-styled spokesperson version" className="w-full h-full object-cover" />
              <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-violet-500/80 text-[10px] font-semibold uppercase text-white">AI</div>
            </div>
            <div className="p-3">
              <div className="text-sm font-semibold">Use AI version</div>
              <div className="text-[11px] text-zinc-400 mt-0.5">Studio-look — same person, cleaner setting</div>
            </div>
          </button>
        </div>
      </div>
    );
  }

  // chosen
  return (
    <div className="flex items-center gap-4 p-4 rounded-xl border border-zinc-700 bg-zinc-900">
      <div className="w-20 h-20 rounded-lg overflow-hidden bg-zinc-800 relative">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={face.chosenUrl} alt="" className="w-full h-full object-cover" />
        {face.choseAi && <div className="absolute top-1 right-1 px-1.5 py-0 rounded bg-violet-500/80 text-[9px] font-semibold uppercase text-white">AI</div>}
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2 text-sm font-semibold"><Check className="w-4 h-4 text-emerald-400" />Face set</div>
        <div className="text-xs text-zinc-400 mt-1">{face.choseAi ? 'Using the AI version.' : 'Using your photo.'} Swap any time from their page.</div>
      </div>
      <button onClick={onReset} className="text-xs text-zinc-300 hover:text-white px-3 py-1.5 rounded border border-zinc-700">
        Change
      </button>
    </div>
  );
}
