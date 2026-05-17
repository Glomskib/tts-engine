'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Mic, Sparkles, Loader2, Check, AlertCircle, Upload, Play, ChevronDown, ChevronUp } from 'lucide-react';

interface Archetype {
  key: string; display_name: string; niche: string; tagline: string; face_seed: string;
  personality: string; tone_descriptor: string; target_audience: string; prohibited_phrases: string;
  default_traits: { label: string }[];
}

const ARCHETYPES: Archetype[] = [
  { key: 'wellness-mom', display_name: 'Mia', niche: 'Wellness creator, 30s', tagline: 'Warm, plain-talk. Mom-friend energy.', face_seed: 'mia-wellness',
    personality: "Warm, conversational, never pushy. Shares her own routine. Honest about what works and what doesn't.",
    tone_descriptor: 'Plain talk, friend-to-friend. Soft, never salesy.',
    target_audience: 'Women 28-42 interested in clean-ingredient products',
    prohibited_phrases: 'cures, treats, prevents, FDA-approved, guaranteed',
    default_traits: [{ label: 'Warm' }, { label: 'Honest' }, { label: 'Calm' }] },
  { key: 'tech-founder', display_name: 'Jordan', niche: 'Tech founder, B2B SaaS', tagline: 'Direct, confident. Sells the why before the what.', face_seed: 'jordan-founder',
    personality: 'Direct, founder-style. Comfortable explaining technical things in human terms. Sells the why before the what.',
    tone_descriptor: 'Confident, no fluff. Drops one specific number per video.',
    target_audience: 'B2B buyers, founders, ops leaders', prohibited_phrases: '',
    default_traits: [{ label: 'Confident' }, { label: 'Sharp' }, { label: 'Direct' }] },
  { key: 'fitness-coach', display_name: 'Jake', niche: 'Fitness coach, 30s', tagline: 'High-energy, demo-first.', face_seed: 'jake-fitness',
    personality: "High-energy, demo-first. Talks like he's mid-workout. Pushes hard but never preachy.",
    tone_descriptor: 'Energetic, punchy hooks, short sentences.',
    target_audience: 'Gym-goers, lifters, athletes 22-40', prohibited_phrases: '',
    default_traits: [{ label: 'Energetic' }, { label: 'Direct' }, { label: 'Bold' }] },
  { key: 'creative-director', display_name: 'Ella', niche: 'Creative director / brand voice', tagline: 'Polished, taste-forward. Curates rather than sells.', face_seed: 'ella-creative',
    personality: 'Polished, taste-forward. Curates rather than sells. Knows what looks good and says why.',
    tone_descriptor: 'Refined, considered. Uses one strong adjective per beat.',
    target_audience: 'Designers, brand owners, creatives', prohibited_phrases: '',
    default_traits: [{ label: 'Refined' }, { label: 'Curious' }, { label: 'Warm' }] },
  { key: 'product-educator', display_name: 'Sam', niche: 'Product educator', tagline: 'Calm explainer. Breaks things down without dumbing them down.', face_seed: 'sam-educator',
    personality: 'Calm explainer. Breaks complex topics into clean steps. Patient, never condescending.',
    tone_descriptor: 'Clear, step-by-step. Anchors with examples.',
    target_audience: 'Buyers researching before purchase', prohibited_phrases: '',
    default_traits: [{ label: 'Clear' }, { label: 'Patient' }, { label: 'Smart' }] },
  { key: 'gen-z-creator', display_name: 'Avi', niche: 'Gen Z creator', tagline: 'Casual, funny, unfiltered.', face_seed: 'avi-genz',
    personality: 'Casual, funny, unfiltered. Talks like texting a friend. Drops self-aware observations.',
    tone_descriptor: 'Conversational, slangy, lots of filler that lands.',
    target_audience: 'Gen Z, college, young pros', prohibited_phrases: '',
    default_traits: [{ label: 'Funny' }, { label: 'Casual' }, { label: 'Quick' }] },
];

interface VoicePreset { key: string; label: string; blurb: string; emoji: string; }
const VOICE_PRESETS: VoicePreset[] = [
  { key: 'warm-female-30s', label: 'Warm female · 30s', blurb: 'Calm, friend-to-friend',  emoji: '🌿' },
  { key: 'direct-male-30s', label: 'Direct male · 30s',  blurb: 'Confident, founder',     emoji: '🎙️' },
  { key: 'bright-female-20s', label: 'Bright female · 20s', blurb: 'Energetic, casual',   emoji: '⚡' },
  { key: 'mellow-male-40s', label: 'Mellow male · 40s',  blurb: 'Polished, narrator',    emoji: '🎬' },
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

function faceUrlFor(seed: string) {
  return `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0%25' stop-color='%23475569'/><stop offset='100%25' stop-color='%231e293b'/></linearGradient></defs><rect width='200' height='200' fill='url(%23g)' rx='100'/><circle cx='100' cy='75' r='30' fill='%23cbd5e1' opacity='0.5'/><path d='M 50 165 Q 50 115 100 115 Q 150 115 150 165 Z' fill='%23cbd5e1' opacity='0.5'/></svg>`;
}

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
  const [uploadedFace, setUploadedFace] = useState<string | null>(null);
  const previewFace = uploadedFace || faceUrlFor(arch.face_seed);
  const [voiceKey, setVoiceKey] = useState<string>(VOICE_PRESETS[0].key);
  const [platforms, setPlatforms] = useState<string[]>(PLATFORMS.filter(p => p.default).map(p => p.key));
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [stage, setStage] = useState<'creating' | 'ingesting' | 'done' | null>(null);
  const archChangedRef = useRef(false);
  useEffect(() => {
    if (!archChangedRef.current) { archChangedRef.current = true; return; }
    setDisplayName(arch.display_name); setNiche(arch.niche); setPersonality(arch.personality);
    setTone(arch.tone_descriptor); setAudience(arch.target_audience); setProhibited(arch.prohibited_phrases);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [archetypeKey]);
  const pendingFileRef = useRef<File | null>(null);
  function handleUpload(file: File) { setUploadedFace(URL.createObjectURL(file)); pendingFileRef.current = file; }
  function togglePlatform(key: string) { setPlatforms(p => p.includes(key) ? p.filter(k => k !== key) : [...p, key]); }

  async function bringToLife() {
    if (!displayName.trim()) { setErr('Pick a name'); return; }
    setSubmitting(true); setErr(null); setStage('creating');
    try {
      const internalName = displayName.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60) || `avatar-${Date.now()}`;
      const createRes = await fetch('/api/avatars', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: internalName, avatar_display_name: displayName.trim(), niche, personality, tone_descriptor: tone, target_audience: audience, prohibited_phrases: prohibited, knowledge_bank: { platforms, archetype: archetypeKey, voice_preset: voiceKey },
          voice_preset_id: voiceKey ?? null,
          voice_provider: voiceKey ? 'preset' : null,
        }),
      });
      const createJson = await createRes.json() as { ok: boolean; id?: string; error?: string };
      if (!createJson.ok || !createJson.id) throw new Error(createJson.error || 'create failed');
      const avatarId = createJson.id;
      setStage('ingesting');
      let refUrl: string | null = null;
      if (pendingFileRef.current) {
        const file = pendingFileRef.current;
        const up = await fetch(`/api/avatars/${avatarId}/visual/upload`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ filename: file.name, mime: file.type, size: file.size,
          voice_preset_id: voiceKey ?? null,
          voice_provider: voiceKey ? 'preset' : null,
        }) });
        const upJ = await up.json() as { signed_url?: string; public_url?: string };
        if (upJ.signed_url && upJ.public_url) {
          await fetch(upJ.signed_url, { method: 'PUT', headers: { 'content-type': file.type }, body: file });
          refUrl = upJ.public_url;
        }
      }
      if (!refUrl) refUrl = faceUrlFor(arch.face_seed);
      await fetch(`/api/avatars/${avatarId}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ avatar_visual_reference_url: refUrl, setup_status: 'face',
          voice_preset_id: voiceKey ?? null,
          voice_provider: voiceKey ? 'preset' : null,
        }) });
      setStage('done');
      setTimeout(() => router.push(`/avatars/${avatarId}`), 700);
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : 'Something went wrong'); setStage(null);
    } finally { setSubmitting(false); }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="max-w-6xl mx-auto px-4 py-6 lg:py-10">
        <Link href="/avatars" className="inline-flex items-center gap-1.5 text-sm text-zinc-300 hover:text-white mb-6"><ArrowLeft className="w-4 h-4" /> Back to avatars</Link>
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-8">
          <div className="space-y-10">
            <section>
              <h2 className="text-xl font-bold mb-1">1. Pick a starting point</h2>
              <p className="text-sm text-zinc-300 mb-4">Each one gives sensible defaults you can tweak. Or upload your own photo.</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {ARCHETYPES.map(a => {
                  const on = archetypeKey === a.key;
                  return (
                    <button key={a.key} onClick={() => { setArchetypeKey(a.key); setUploadedFace(null); pendingFileRef.current = null; }}
                      className={`text-left rounded-xl border overflow-hidden transition-colors ${on ? 'bg-teal-600/30 border-teal-400 ring-2 ring-teal-400/50' : 'bg-zinc-900 border-zinc-700 hover:border-zinc-500'}`}>
                      <div className="aspect-square bg-gradient-to-br from-teal-900/40 to-purple-900/40 p-2">
                        <img src={faceUrlFor(a.face_seed)} alt="" className="w-full h-full object-contain" />
                      </div>
                      <div className="p-3">
                        <div className="text-sm font-semibold">{a.display_name}</div>
                        <div className="text-[11px] text-zinc-300 truncate">{a.niche}</div>
                        <div className="text-[11px] text-zinc-400 mt-1 leading-snug">{a.tagline}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
              <label className="mt-4 flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-dashed border-zinc-600 hover:border-teal-400 cursor-pointer transition-colors">
                <input type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && handleUpload(e.target.files[0])} />
                <Upload className="w-5 h-5 text-zinc-300" />
                <div className="flex-1">
                  <div className="text-sm font-medium">Upload a reference photo (recommended)</div>
                  <div className="text-[11px] text-zinc-400">These are just personality presets. To render videos, upload your own photo below — the silhouettes are placeholders, not the actual avatar face.</div>
                </div>
                {uploadedFace && <Check className="w-4 h-4 text-emerald-400" />}
              </label>
            </section>
            <section>
              <h2 className="text-xl font-bold mb-1">2. Make them yours</h2>
              <p className="text-sm text-zinc-300 mb-4">Pre-filled from the starting point. Tweak whatever you want.</p>
              <div className="space-y-3">
                <div><label className="block text-xs font-semibold uppercase tracking-wider text-zinc-300 mb-1.5">Name</label>
                  <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)} className="w-full px-3 py-2.5 rounded-lg bg-zinc-900 border border-zinc-600 text-base text-white placeholder-zinc-500 focus:border-teal-400 outline-none" /></div>
                <div><label className="block text-xs font-semibold uppercase tracking-wider text-zinc-300 mb-1.5">Niche / what they're known for</label>
                  <input type="text" value={niche} onChange={e => setNiche(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-600 text-sm text-white focus:border-teal-400 outline-none" /></div>
                <div><label className="block text-xs font-semibold uppercase tracking-wider text-zinc-300 mb-1.5">Personality</label>
                  <textarea value={personality} onChange={e => setPersonality(e.target.value)} rows={3} className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-600 text-sm text-white focus:border-teal-400 outline-none resize-none" /></div>
                <div><label className="block text-xs font-semibold uppercase tracking-wider text-zinc-300 mb-1.5">How they talk</label>
                  <input type="text" value={tone} onChange={e => setTone(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-600 text-sm text-white focus:border-teal-400 outline-none" /></div>
              </div>
            </section>
            <section>
              <h2 className="text-xl font-bold mb-1">3. Voice</h2>
              <p className="text-sm text-zinc-300 mb-4">Pick what matches their vibe. Swap or clone your own later from their page.</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {VOICE_PRESETS.map(v => {
                  const on = voiceKey === v.key;
                  return (
                    <button key={v.key} onClick={() => setVoiceKey(v.key)} className={`text-left p-3 rounded-xl border ${on ? 'bg-teal-600/30 border-teal-400' : 'bg-zinc-900 border-zinc-700 hover:border-zinc-500'}`}>
                      <div className="flex items-center gap-2 mb-1.5"><span className="text-lg">{v.emoji}</span><Play className="w-3.5 h-3.5 text-zinc-300 ml-auto" /></div>
                      <div className="text-xs font-semibold">{v.label}</div>
                      <div className="text-[10px] text-zinc-400 mt-0.5">{v.blurb}</div>
                    </button>
                  );
                })}
              </div>
            </section>
            <section>
              <button onClick={() => setAdvancedOpen(o => !o)} className="flex items-center gap-2 text-sm font-semibold text-zinc-200">
                {advancedOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                Advanced (target audience · platforms · things they never say)
              </button>
              {advancedOpen && (
                <div className="mt-4 space-y-4">
                  <div><label className="block text-xs font-semibold uppercase tracking-wider text-zinc-300 mb-1.5">Target audience</label>
                    <input type="text" value={audience} onChange={e => setAudience(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-600 text-sm text-white focus:border-teal-400 outline-none" /></div>
                  <div><label className="block text-xs font-semibold uppercase tracking-wider text-zinc-300 mb-1.5">Platforms</label>
                    <div className="flex flex-wrap gap-2">
                      {PLATFORMS.map(p => { const on = platforms.includes(p.key); return (
                        <button key={p.key} type="button" onClick={() => togglePlatform(p.key)} className={`px-3 py-1.5 rounded-full text-xs border ${on ? 'bg-teal-600/40 border-teal-400 text-teal-100' : 'bg-zinc-900 border-zinc-700 text-zinc-300'}`}>{p.label}</button>
                      ); })}
                    </div></div>
                  <div><label className="block text-xs font-semibold uppercase tracking-wider text-zinc-300 mb-1.5">Things they NEVER say</label>
                    <textarea value={prohibited} onChange={e => setProhibited(e.target.value)} rows={2} placeholder="cures, treats, prevents, guaranteed" className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-600 text-sm text-white placeholder-zinc-500 focus:border-teal-400 outline-none resize-none" />
                    <div className="text-[11px] text-zinc-400 mt-1">Every generated script auto-respects this list.</div></div>
                </div>
              )}
            </section>
            {err && <div className="p-3 rounded-lg bg-red-900/40 border border-red-500/50 text-sm text-red-200 flex items-start gap-2"><AlertCircle className="w-4 h-4 mt-0.5" />{err}</div>}
          </div>
          <aside className="lg:sticky lg:top-6 self-start">
            <div className="rounded-2xl border border-zinc-700 bg-zinc-900 overflow-hidden">
              <div className="aspect-[3/4] bg-gradient-to-br from-zinc-800 to-zinc-900 flex items-center justify-center">
                <img src={previewFace} alt="" className="w-full h-full object-contain" />
              </div>
              <div className="p-4 space-y-3">
                <div><div className="text-lg font-bold">{displayName || 'Unnamed'}</div><div className="text-[12px] text-zinc-300">{niche || '—'}</div></div>
                <div className="flex flex-wrap gap-1.5">{arch.default_traits.map(t => (<span key={t.label} className="px-2 py-0.5 rounded-full bg-teal-600/30 border border-teal-500/50 text-teal-100 text-[10px] font-semibold">{t.label}</span>))}</div>
                <div className="flex items-center gap-2 text-[11px] text-zinc-300 pt-1 border-t border-zinc-800"><Mic className="w-3.5 h-3.5" />{VOICE_PRESETS.find(v => v.key === voiceKey)?.label || '—'}</div>
                <button onClick={bringToLife} disabled={submitting} className="w-full py-3 rounded-xl bg-gradient-to-r from-teal-500 to-purple-600 hover:opacity-90 disabled:opacity-50 text-white font-bold flex items-center justify-center gap-2">
                  {submitting ? <><Loader2 className="w-4 h-4 animate-spin" />{stage === 'ingesting' ? 'Bringing them to life…' : stage === 'done' ? 'Done!' : 'Creating…'}</> : <><Sparkles className="w-4 h-4" /> Bring {displayName || 'them'} to life</>}
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
