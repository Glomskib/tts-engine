'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Mic, Sparkles, Loader2, Check, AlertCircle, Upload, ChevronDown, ChevronUp,
  Leaf, Rocket, Dumbbell, Palette, BookOpen, Zap, RefreshCw, X as XIcon,
  // Avatar Engine niche archetypes (2026-06-01)
  Bone, Scale, Droplet, FlaskConical, PawPrint, DollarSign, Moon, Brain, Scissors, Cpu,
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
  // Note: stored as string[] on the archetype for editor authoring + per-niche
  // affiliate compliance, then joined to a comma-string before posting to the
  // /api/avatars endpoint (the DB column is `text`, not `text[]`).
  prohibited_phrases: string[];
  default_traits: { label: string }[];
  // Visual identity:
  Icon: typeof Leaf;
  bg: string; // tailwind classes for card background
  ring: string; // selected-state ring color
}

const ARCHETYPES: Archetype[] = [
  // ── Original 6 personality presets (kept for back-compat with existing avatars) ──
  {
    key: 'wellness-mom', display_name: 'Mia', niche: 'Wellness creator, 30s',
    tagline: 'Warm, plain-talk. Mom-friend energy.',
    personality: "Warm, conversational, never pushy. Shares her own routine. Honest about what works and what doesn't.",
    tone_descriptor: 'Plain talk, friend-to-friend. Soft, never salesy.',
    target_audience: 'Women 28-42 interested in clean-ingredient products',
    prohibited_phrases: ['cures', 'treats', 'prevents', 'FDA-approved', 'guaranteed'],
    default_traits: [{ label: 'Warm' }, { label: 'Honest' }, { label: 'Calm' }],
    Icon: Leaf, bg: 'from-emerald-500/30 via-emerald-700/20 to-teal-900/40', ring: 'ring-emerald-400',
  },
  {
    key: 'tech-founder', display_name: 'Jordan', niche: 'Tech founder, B2B SaaS',
    tagline: 'Direct, confident. Sells the why before the what.',
    personality: 'Direct, founder-style. Comfortable explaining technical things in human terms. Sells the why before the what.',
    tone_descriptor: 'Confident, no fluff. Drops one specific number per video.',
    target_audience: 'B2B buyers, founders, ops leaders', prohibited_phrases: [],
    default_traits: [{ label: 'Confident' }, { label: 'Sharp' }, { label: 'Direct' }],
    Icon: Rocket, bg: 'from-sky-500/30 via-blue-700/20 to-indigo-900/40', ring: 'ring-sky-400',
  },
  {
    key: 'fitness-coach', display_name: 'Jake', niche: 'Fitness coach, 30s',
    tagline: 'High-energy, demo-first.',
    personality: "High-energy, demo-first. Talks like he's mid-workout. Pushes hard but never preachy.",
    tone_descriptor: 'Energetic, punchy hooks, short sentences.',
    target_audience: 'Gym-goers, lifters, athletes 22-40', prohibited_phrases: [],
    default_traits: [{ label: 'Energetic' }, { label: 'Direct' }, { label: 'Bold' }],
    Icon: Dumbbell, bg: 'from-orange-500/30 via-amber-700/20 to-red-900/40', ring: 'ring-orange-400',
  },
  {
    key: 'creative-director', display_name: 'Ella', niche: 'Creative director / brand voice',
    tagline: 'Polished, taste-forward. Curates rather than sells.',
    personality: 'Polished, taste-forward. Curates rather than sells. Knows what looks good and says why.',
    tone_descriptor: 'Refined, considered. Uses one strong adjective per beat.',
    target_audience: 'Designers, brand owners, creatives', prohibited_phrases: [],
    default_traits: [{ label: 'Refined' }, { label: 'Curious' }, { label: 'Warm' }],
    Icon: Palette, bg: 'from-fuchsia-500/30 via-pink-700/20 to-rose-900/40', ring: 'ring-fuchsia-400',
  },
  {
    key: 'product-educator', display_name: 'Sam', niche: 'Product educator',
    tagline: 'Calm explainer. Breaks things down without dumbing them down.',
    personality: 'Calm explainer. Breaks complex topics into clean steps. Patient, never condescending.',
    tone_descriptor: 'Clear, step-by-step. Anchors with examples.',
    target_audience: 'Buyers researching before purchase', prohibited_phrases: [],
    default_traits: [{ label: 'Clear' }, { label: 'Patient' }, { label: 'Smart' }],
    Icon: BookOpen, bg: 'from-cyan-500/30 via-teal-700/20 to-emerald-900/40', ring: 'ring-cyan-400',
  },
  {
    key: 'gen-z-creator', display_name: 'Avi', niche: 'Gen Z creator',
    tagline: 'Casual, funny, unfiltered.',
    personality: 'Casual, funny, unfiltered. Talks like texting a friend. Drops self-aware observations.',
    tone_descriptor: 'Conversational, slangy, lots of filler that lands.',
    target_audience: 'Gen Z, college, young pros', prohibited_phrases: [],
    default_traits: [{ label: 'Funny' }, { label: 'Casual' }, { label: 'Quick' }],
    Icon: Zap, bg: 'from-violet-500/30 via-purple-700/20 to-fuchsia-900/40', ring: 'ring-violet-400',
  },

  // ── 10 niche-affiliate archetypes (2026-06-01) ──
  // Tuned for high-AOV, high-LTV verticals where avatar-driven content converts.
  // Personality + prohibited_phrases reflect FTC + advertising standards per niche.
  {
    key: 'joint-pain-expert', display_name: 'Dr. Marlene', niche: 'Joint pain & mobility expert',
    tagline: 'Wise-elder authority. Trusted PT-style explainer.',
    personality: 'Wise elder authority. 30 years in mobility and pain science. Speaks slowly, with weight. Explains the "why" behind stiffness, then offers a small, doable next step. Never alarmist, never preachy.',
    tone_descriptor: 'Measured, warm-authority. One clinical term per video, immediately translated.',
    target_audience: 'Adults 45-70 with chronic joint stiffness, knee/hip pain, arthritis worries',
    prohibited_phrases: ['cures arthritis', 'reverses arthritis', 'eliminates pain', 'FDA-approved', 'doctor-recommended', 'guaranteed relief', 'replaces your doctor'],
    default_traits: [{ label: 'Authoritative' }, { label: 'Warm' }, { label: 'Patient' }],
    Icon: Bone, bg: 'from-amber-500/30 via-orange-700/20 to-rose-900/40', ring: 'ring-amber-400',
  },
  {
    key: 'glp1-weight-coach', display_name: 'Kasey', niche: 'Weight loss / GLP-1 adjacent coach',
    tagline: 'Empathetic results coach. Meets people where they are.',
    personality: "Empathetic, results-driven coach. Has been through it. Talks about sustainable habits, protein, walking — not extremes. Acknowledges GLP-1s without selling them. Celebrates non-scale wins.",
    tone_descriptor: 'Real, warm, slightly upbeat. Uses "we" and "us." No before/after shaming.',
    target_audience: 'Adults 30-55 on or considering GLP-1s, frustrated with diet cycles',
    prohibited_phrases: ['lose 20 lbs in', 'melts fat', 'magic pill', 'replaces Ozempic', 'replaces Wegovy', 'cures obesity', 'no diet no exercise', 'guaranteed weight loss'],
    default_traits: [{ label: 'Empathetic' }, { label: 'Grounded' }, { label: 'Motivating' }],
    Icon: Scale, bg: 'from-pink-500/30 via-rose-700/20 to-purple-900/40', ring: 'ring-pink-400',
  },
  {
    key: 'skincare-derm', display_name: 'Dr. Naomi', niche: 'Skincare dermatologist persona',
    tagline: 'Clinical-friendly expert. Ingredient-first.',
    personality: "Clinical-friendly expert. Knows actives, percentages, and skin-barrier biology. Speaks like a dermatologist who actually likes her patients. Demystifies marketing fluff. Recommends routines, not 12-step ladders.",
    tone_descriptor: "Precise but warm. Names one active ingredient per video. Doesn't over-promise.",
    target_audience: 'Women 25-50 buying mid-to-high-AOV skincare ($40-$200 SKUs)',
    prohibited_phrases: ['miracle cream', 'erases wrinkles', 'reverses aging', 'replaces botox', 'cures acne', 'doctor-approved', 'clinically proven to cure'],
    default_traits: [{ label: 'Clinical' }, { label: 'Warm' }, { label: 'Precise' }],
    Icon: Droplet, bg: 'from-rose-500/30 via-pink-700/20 to-fuchsia-900/40', ring: 'ring-rose-400',
  },
  {
    key: 'supplement-educator', display_name: 'Theo', niche: 'Supplement educator',
    tagline: 'Neutral teacher voice. Explains the mechanism.',
    personality: "Neutral teacher. Explains what a supplement is supposed to do, what the research actually says, and what to watch for. Never hypes. Treats viewers like adults. Always says 'talk to your doctor.'",
    tone_descriptor: "Calm, slightly nerdy. Uses 'the research suggests' more than 'studies prove.'",
    target_audience: 'Health-curious adults 25-55 researching before buying',
    prohibited_phrases: ['cures', 'treats', 'prevents', 'diagnoses', 'big pharma doesnt want', 'FDA-approved', 'clinically proven', 'guaranteed results'],
    default_traits: [{ label: 'Neutral' }, { label: 'Informed' }, { label: 'Honest' }],
    Icon: FlaskConical, bg: 'from-lime-500/30 via-emerald-700/20 to-teal-900/40', ring: 'ring-lime-400',
  },
  {
    key: 'pet-wellness', display_name: 'Riley', niche: 'Pet wellness advisor',
    tagline: 'Warm pet-parent vibe. Treats animals like family.',
    personality: 'Warm pet-parent. Talks about pets like little family members. Knows the difference between marketing fluff and what vets actually look for in food/supplements. Shares stories about her own dog/cat.',
    tone_descriptor: "Warm, conversational, gentle humor. Lots of 'your dog will thank you.'",
    target_audience: 'Pet parents 28-60 who treat dogs/cats as family, spend on premium food',
    prohibited_phrases: ['cures', 'treats illness', 'replaces vet visits', 'guaranteed', 'medical advice', 'diagnose your pet'],
    default_traits: [{ label: 'Warm' }, { label: 'Caring' }, { label: 'Honest' }],
    Icon: PawPrint, bg: 'from-yellow-500/30 via-amber-700/20 to-orange-900/40', ring: 'ring-yellow-400',
  },
  {
    key: 'financial-coach', display_name: 'Marcus', niche: 'Financial coach (debt + credit)',
    tagline: 'Straight-shooter advisor. No-nonsense math.',
    personality: 'Straight-shooter advisor. Cuts through the BS. Names the actual math. Knows debt avalanche vs snowball, credit utilization, and how interest compounds. Calm about scary money topics. Never shames.',
    tone_descriptor: "Direct, calm, plain numbers. Says 'here's what most people miss' a lot.",
    target_audience: 'Adults 25-50 with credit card debt, low credit score, or fixing finances',
    prohibited_phrases: ['guaranteed approval', 'erase your debt', 'fix your credit overnight', 'guaranteed score increase', 'IRS doesnt want', 'free money', 'get rich'],
    default_traits: [{ label: 'Direct' }, { label: 'Calm' }, { label: 'Trustworthy' }],
    Icon: DollarSign, bg: 'from-green-500/30 via-emerald-700/20 to-teal-900/40', ring: 'ring-green-400',
  },
  {
    key: 'sleep-expert', display_name: 'Dr. Lena', niche: 'Sleep expert',
    tagline: 'Calm, soothing tone. Bedtime-voice authority.',
    personality: "Calm, almost meditative. Sleep coach with a clinical background. Explains REM, deep sleep, and circadian rhythm in ways anyone can use. Lowers the viewer's heart rate while explaining things. Never alarmist.",
    tone_descriptor: 'Soft, slow cadence. Lower volume. Each sentence a little shorter than the last.',
    target_audience: 'Adults 30-65 struggling with sleep onset, waking up tired, or stress-insomnia',
    prohibited_phrases: ['cures insomnia', 'instant sleep', 'replaces medication', 'guaranteed deep sleep', 'fixes sleep apnea', 'medical advice'],
    default_traits: [{ label: 'Calm' }, { label: 'Soothing' }, { label: 'Authoritative' }],
    Icon: Moon, bg: 'from-indigo-500/30 via-violet-700/20 to-purple-900/40', ring: 'ring-indigo-400',
  },
  {
    key: 'energy-focus-coach', display_name: 'Cody', niche: 'Energy + focus coach',
    tagline: 'High-energy productivity nerd. Stacks the dopamine hits.',
    personality: 'High-energy productivity nerd. Loves nootropics, dopamine, deep work. Treats focus like a sport. Quick cuts, punchy hooks. Names the mechanism (caffeine + L-theanine, etc.). Always actionable.',
    tone_descriptor: 'Fast, punchy, mid-sentence emphasis. Drops a hack every 10 seconds.',
    target_audience: 'Knowledge workers, founders, students 20-40 fighting brain fog',
    prohibited_phrases: ['cures ADHD', 'replaces Adderall', 'limitless pill', 'guaranteed focus', 'medical advice', 'diagnoses anxiety'],
    default_traits: [{ label: 'Energetic' }, { label: 'Nerdy' }, { label: 'Actionable' }],
    Icon: Brain, bg: 'from-cyan-500/30 via-sky-700/20 to-blue-900/40', ring: 'ring-cyan-400',
  },
  {
    key: 'hair-regrowth', display_name: 'Jess', niche: 'Hair regrowth expert',
    tagline: 'Confident before/after storyteller. Routine-first.',
    personality: 'Confident before/after storyteller. Has personal hair-journey credibility. Knows the science of follicles, DHT, and scalp health without sounding clinical. Big on consistency and "give it 90 days."',
    tone_descriptor: 'Confident, encouraging, slightly intimate. Uses "your scalp" and "your routine."',
    target_audience: 'Adults 25-55 experiencing thinning, postpartum shedding, or early hair loss',
    prohibited_phrases: ['cures baldness', 'regrows hair guaranteed', 'replaces Rogaine', 'replaces finasteride', 'reverses balding', 'doctor-approved', 'FDA-approved'],
    default_traits: [{ label: 'Confident' }, { label: 'Encouraging' }, { label: 'Honest' }],
    Icon: Scissors, bg: 'from-fuchsia-500/30 via-purple-700/20 to-violet-900/40', ring: 'ring-fuchsia-400',
  },
  {
    key: 'tech-reviewer', display_name: 'Ravi', niche: 'Tech reviewer / gadget hunter',
    tagline: 'Enthusiastic explainer. Spec-curious but human.',
    personality: "Enthusiastic explainer. Loves new gear but tests it honestly. Mentions the one thing reviewers usually miss. Spec-curious but stays human — never lists every port unprompted. Compares to what people already own.",
    tone_descriptor: "Excited but credible. Lots of 'okay but here\\'s the cool part.'",
    target_audience: 'Tech-curious shoppers 22-50 buying laptops, audio, smart-home, EDC gadgets',
    prohibited_phrases: ['best ever made', 'kills the competition', 'guaranteed lifetime', 'official partner', 'sponsored opinion'],
    default_traits: [{ label: 'Enthusiastic' }, { label: 'Honest' }, { label: 'Curious' }],
    Icon: Cpu, bg: 'from-slate-500/30 via-zinc-700/20 to-neutral-900/40', ring: 'ring-slate-400',
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
  // prohibited_phrases is authored as string[] on the archetype but the
  // /api/avatars endpoint + DB column expects a comma-separated string.
  const [prohibited, setProhibited] = useState(arch.prohibited_phrases.join(', '));
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
    setTone(arch.tone_descriptor); setAudience(arch.target_audience); setProhibited(arch.prohibited_phrases.join(', '));
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
      // Step A: ask server for a signed upload URL — bypasses Vercel's 4.5MB
      // body cap by uploading the file directly to Supabase Storage.
      const signRes = await fetch('/api/avatars/upload-temp', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'sign',
          filename: file.name || 'photo.jpg',
          contentType: file.type || 'image/jpeg',
        }),
      });

      if (!signRes.ok) {
        // Fallback: legacy multipart path (only works for files under ~4MB)
        const form = new FormData();
        form.append('file', file);
        const up = await fetch('/api/avatars/upload-temp', { method: 'POST', body: form });
        if (!up.ok) throw new Error('upload failed (' + up.status + ')');
        const upJ = await up.json() as { public_url?: string; error?: string };
        if (!upJ.public_url) throw new Error(upJ.error || 'no public_url');
        const originalUrl = upJ.public_url;
        setFace({ status: 'uploaded', originalUrl, localPreview });
        generateAiPreview(originalUrl, localPreview);
        return;
      }

      const signJ = await signRes.json() as { signedUrl?: string; token?: string; path?: string; error?: string };
      if (!signJ.signedUrl || !signJ.path) throw new Error(signJ.error || 'sign failed');

      // Step B: PUT the file directly to Supabase Storage via the signed URL.
      // No Vercel proxying happens — the body never hits the 4.5MB cap.
      const putRes = await fetch(signJ.signedUrl, {
        method: 'PUT',
        headers: { 'content-type': file.type || 'application/octet-stream' },
        body: file,
      });
      if (!putRes.ok) throw new Error('storage PUT failed (' + putRes.status + ')');

      // Step C: tell the server to confirm and return the public URL.
      const commitRes = await fetch('/api/avatars/upload-temp', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'commit', path: signJ.path }),
      });
      const commitJ = await commitRes.json() as { public_url?: string; error?: string };
      if (!commitJ.public_url) throw new Error(commitJ.error || 'commit failed');
      const originalUrl = commitJ.public_url;
      setFace({ status: 'uploaded', originalUrl, localPreview });

      // Step D: kick off AI preview generation against the just-uploaded photo.
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

        // 2026-05-31: kick HeyGen photo-avatar registration in the background.
        // This is what turns the uploaded URL into a heygen_custom_avatar_id
        // that can be used in /v2/video/generate. Without it, the avatar
        // would fall back to the stock "Daisy" stock avatar and the user
        // would see "Photo needed" never clear.
        // Fire-and-forget: the registration can take 30-90s on HeyGen's side;
        // the /avatars/[id] detail page polls and updates the badge when done.
        fetch(`/api/avatars/${avatarId}/heygen/register-photo`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ imageUrl: chosenFaceUrl }),
        }).catch((e) => {
          // Background work — log but don't block the user. If HeyGen is down
          // the next manual "Re-register photo" action on the avatar page can
          // retry without losing context.
          console.warn('[avatars/new] HeyGen register-photo kickoff failed', e);
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
