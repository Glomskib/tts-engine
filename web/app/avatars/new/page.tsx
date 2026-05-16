'use client';

/**
 * /avatars/new — 4-step wizard for creating a new avatar.
 * Platform-agnostic: brands pick where they publish (IG Reels, YT Shorts, TikTok,
 * IG Feed, YT Long, LinkedIn, X, Pinterest, Paid Ads, Brand Video).
 *
 * Steps:
 *   1. Identity — name, niche, personality, audience, platforms
 *   2. Face — upload photo OR generate via Nano Banana (Gemini)
 *   3. Voice — upload samples OR pick preset
 *   4. Test render — produce a 5s HeyGen clip
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, User, Camera, Mic, Play, Loader2, Check, AlertCircle, Upload, Sparkles } from 'lucide-react';

type Step = 'identity' | 'face' | 'voice' | 'test';

const PLATFORMS = [
  { key: 'ig_reels', label: 'IG Reels', default: true },
  { key: 'yt_shorts', label: 'YT Shorts', default: true },
  { key: 'linkedin', label: 'LinkedIn', default: true },
  { key: 'tiktok', label: 'TikTok', default: false },
  { key: 'ig_feed', label: 'IG Feed', default: false },
  { key: 'yt_long', label: 'YouTube long', default: false },
  { key: 'x', label: 'X', default: false },
  { key: 'pinterest', label: 'Pinterest', default: false },
  { key: 'paid_ads', label: 'Paid ads', default: false },
  { key: 'brand_video', label: 'Brand video', default: false },
];

export default function NewAvatarPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('identity');
  const [avatarId, setAvatarId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // step 1 fields
  const [name, setName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [niche, setNiche] = useState('');
  const [personality, setPersonality] = useState('');
  const [audience, setAudience] = useState('');
  const [appearance, setAppearance] = useState('');
  const [tone, setTone] = useState('');
  const [prohibited, setProhibited] = useState('');
  const [platforms, setPlatforms] = useState<string[]>(PLATFORMS.filter(p => p.default).map(p => p.key));

  // step 2 — face
  const [faceUrl, setFaceUrl] = useState<string | null>(null);
  const [faceMode, setFaceMode] = useState<'upload' | 'generate'>('upload');
  const [faceRecipe, setFaceRecipe] = useState('');
  const [faceBusy, setFaceBusy] = useState(false);

  // step 3 — voice
  const [voiceClonedId, setVoiceClonedId] = useState<string | null>(null);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [voiceSampleUrls, setVoiceSampleUrls] = useState<string[]>([]);
  const [voiceMode, setVoiceMode] = useState<'clone' | 'preset'>('preset');

  // step 4 — test render
  const [renderBusy, setRenderBusy] = useState(false);
  const [renderUrl, setRenderUrl] = useState<string | null>(null);
  const [renderJobId, setRenderJobId] = useState<string | null>(null);

  function togglePlatform(key: string) {
    setPlatforms(p => p.includes(key) ? p.filter(k => k !== key) : [...p, key]);
  }

  async function createAvatar() {
    setSubmitting(true); setErr(null);
    try {
      const r = await fetch('/api/avatars', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          avatar_display_name: displayName.trim() || name.trim(),
          niche, personality, target_audience: audience,
          avatar_appearance: appearance,
          avatar_visual_recipe: appearance,
          tone_descriptor: tone,
          prohibited_phrases: prohibited,
          knowledge_bank: { platforms },
        }),
      });
      const j = await r.json() as { ok: boolean; id?: string; error?: string };
      if (!j.ok || !j.id) throw new Error(j.error || 'create failed');
      setAvatarId(j.id);
      setStep('face');
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'create failed');
    } finally {
      setSubmitting(false);
    }
  }

  async function uploadFace(file: File) {
    if (!avatarId) return;
    setFaceBusy(true); setErr(null);
    try {
      // 1. presigned URL
      const up = await fetch(`/api/avatars/${avatarId}/visual/upload`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ filename: file.name, mime: file.type, size: file.size }),
      });
      const upJ = await up.json() as { signed_url?: string; public_url?: string; error?: string };
      if (!upJ.signed_url || !upJ.public_url) throw new Error(upJ.error || 'upload-url failed');

      // 2. PUT
      const put = await fetch(upJ.signed_url, { method: 'PUT', headers: { 'content-type': file.type }, body: file });
      if (!put.ok) throw new Error(`PUT ${put.status}`);

      // 3. save URL on avatar
      await fetch(`/api/avatars/${avatarId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ avatar_visual_reference_url: upJ.public_url, setup_status: 'face' }),
      });
      setFaceUrl(upJ.public_url);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'upload failed');
    } finally {
      setFaceBusy(false);
    }
  }

  async function generateFace() {
    if (!avatarId) return;
    setFaceBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/avatars/${avatarId}/visual/generate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ recipe: faceRecipe || appearance }),
      });
      const j = await r.json() as { ok: boolean; image_urls?: string[]; error?: string };
      if (!j.ok || !j.image_urls?.[0]) throw new Error(j.error || 'generation failed');
      setFaceUrl(j.image_urls[0]);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'generate failed');
    } finally {
      setFaceBusy(false);
    }
  }

  async function cloneVoice() {
    if (!avatarId || voiceSampleUrls.length === 0) return;
    setVoiceBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/avatars/${avatarId}/voice/clone`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sample_urls: voiceSampleUrls, name: displayName || name }),
      });
      const j = await r.json() as { ok: boolean; voice_id?: string; error?: string };
      if (!j.ok || !j.voice_id) throw new Error(j.error || 'voice clone failed');
      setVoiceClonedId(j.voice_id);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'voice clone failed');
    } finally {
      setVoiceBusy(false);
    }
  }

  async function startTestRender() {
    if (!avatarId) return;
    setRenderBusy(true); setErr(null); setRenderUrl(null);
    try {
      const r = await fetch(`/api/avatars/${avatarId}/render/test`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      const j = await r.json() as { ok: boolean; heygen_video_id?: string; error?: string };
      if (!j.ok || !j.heygen_video_id) throw new Error(j.error || 'render kick failed');
      setRenderJobId(j.heygen_video_id);
      // Poll
      const poll = setInterval(async () => {
        const s = await fetch(`/api/avatars/${avatarId}/render/test?video_id=${j.heygen_video_id}`);
        const sj = await s.json() as { status?: string; video_url?: string };
        if (sj.status === 'completed' && sj.video_url) {
          setRenderUrl(sj.video_url);
          setRenderBusy(false);
          clearInterval(poll);
        }
        if (sj.status === 'failed') {
          setErr('Render failed');
          setRenderBusy(false);
          clearInterval(poll);
        }
      }, 5000);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'render failed');
      setRenderBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <Link href="/avatars" className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to avatars
        </Link>

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-6 text-xs">
          {(['identity','face','voice','test'] as Step[]).map((s, i) => {
            const active = step === s;
            const done = (['identity','face','voice','test'] as Step[]).indexOf(step) > i;
            return (
              <div key={s} className="flex items-center gap-2">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center font-semibold text-[10px] ${
                  done ? 'bg-teal-500 text-white'
                  : active ? 'bg-teal-500/20 border border-teal-500 text-teal-300'
                  : 'bg-zinc-800 text-zinc-500'
                }`}>{done ? <Check className="w-3 h-3" /> : i+1}</div>
                <div className={active ? 'text-white' : done ? 'text-teal-300' : 'text-zinc-500'}>{s}</div>
                {i < 3 && <div className="w-6 h-px bg-zinc-700 mx-1" />}
              </div>
            );
          })}
        </div>

        {err && (
          <div className="mb-4 p-3 rounded-lg bg-red-900/30 border border-red-500/30 text-sm text-red-200 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />{err}
          </div>
        )}

        {/* STEP 1 — IDENTITY */}
        {step === 'identity' && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold flex items-center gap-2"><User className="w-5 h-5" /> Identity</h2>
            <Field label="Avatar name (internal)" value={name} onChange={setName} placeholder="e.g. mia-wellness-v1" />
            <Field label="Display name" value={displayName} onChange={setDisplayName} placeholder="e.g. Mia" />
            <Field label="Niche" value={niche} onChange={setNiche} placeholder="e.g. wellness mom, 30s, supplement reviewer" />
            <Textarea label="Personality" value={personality} onChange={setPersonality} placeholder="Friendly, conversational, never pushy. Warm but informed. Mentions her own routine." />
            <Field label="Target audience" value={audience} onChange={setAudience} placeholder="e.g. moms 28-42 buying clean-ingredient supplements" />
            <Textarea label="Visual appearance (used if you generate face)" value={appearance} onChange={setAppearance} placeholder="30s, warm features, brown hair, neutral natural light, soft smile" />
            <Textarea label="Tone descriptor" value={tone} onChange={setTone} placeholder="Plain talk, friend-to-friend. Casual hooks like 'wait til you hear this'." />
            <Textarea label="Prohibited phrases / claims" value={prohibited} onChange={setProhibited} placeholder="cures, treats, prevents, guaranteed, FDA-approved (anything regulated)" />
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">Where do you publish?</label>
              <div className="flex flex-wrap gap-2">
                {PLATFORMS.map(p => {
                  const on = platforms.includes(p.key);
                  return (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => togglePlatform(p.key)}
                      className={`px-3 py-1.5 rounded-full text-xs border ${on ? 'bg-teal-600/20 border-teal-500 text-teal-200' : 'bg-zinc-900 border-white/10 text-zinc-400'}`}
                    >{p.label}</button>
                  );
                })}
              </div>
              <div className="text-[11px] text-zinc-500 mt-2">Multiple platforms is fine — each script can target a specific one later.</div>
            </div>
            <button
              onClick={createAvatar}
              disabled={!name.trim() || submitting}
              className="w-full mt-4 py-3 rounded-xl bg-teal-500 hover:bg-teal-600 disabled:bg-zinc-700 font-semibold flex items-center justify-center gap-2"
            >{submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Next: Face <ArrowRight className="w-4 h-4" /></>}</button>
          </div>
        )}

        {/* STEP 2 — FACE */}
        {step === 'face' && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold flex items-center gap-2"><Camera className="w-5 h-5" /> Face</h2>
            <p className="text-sm text-zinc-400">Pick how to set the avatar's face. Both produce a consistent character HeyGen can render forever.</p>

            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setFaceMode('upload')} className={`p-4 rounded-lg border text-left ${faceMode === 'upload' ? 'bg-teal-600/20 border-teal-500' : 'bg-zinc-900 border-white/10'}`}>
                <Upload className="w-5 h-5 mb-2" />
                <div className="text-sm font-semibold">Upload photo</div>
                <div className="text-[11px] text-zinc-400">Best for: real-creator likenesses, brand photoshoots</div>
              </button>
              <button onClick={() => setFaceMode('generate')} className={`p-4 rounded-lg border text-left ${faceMode === 'generate' ? 'bg-teal-600/20 border-teal-500' : 'bg-zinc-900 border-white/10'}`}>
                <Sparkles className="w-5 h-5 mb-2" />
                <div className="text-sm font-semibold">Generate (Nano Banana)</div>
                <div className="text-[11px] text-zinc-400">Best for: fictional avatars, "wellness mom" archetypes</div>
              </button>
            </div>

            {faceMode === 'upload' && (
              <div>
                <label className="block w-full p-6 rounded-lg border-2 border-dashed border-white/10 hover:border-teal-500 cursor-pointer text-center">
                  <input type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && uploadFace(e.target.files[0])} />
                  <Upload className="w-10 h-10 mx-auto text-zinc-600 mb-2" />
                  <div className="text-sm font-medium">{faceBusy ? 'Uploading…' : 'Drop or click to upload reference photo'}</div>
                  <div className="text-[11px] text-zinc-500 mt-1">PNG / JPG. Clear face, neutral background, head-and-shoulders works best.</div>
                </label>
              </div>
            )}

            {faceMode === 'generate' && (
              <div className="space-y-2">
                <Textarea label="Description (what does this person look like?)" value={faceRecipe || appearance} onChange={setFaceRecipe} placeholder="30s woman, warm features, brown hair, neutral lighting, soft smile, business casual" />
                <button
                  onClick={generateFace}
                  disabled={faceBusy || !(faceRecipe || appearance)}
                  className="w-full py-2.5 rounded-lg bg-teal-500/20 border border-teal-500 hover:bg-teal-500/30 text-teal-200 font-semibold flex items-center justify-center gap-2"
                >{faceBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Sparkles className="w-4 h-4" /> Generate with Nano Banana</>}</button>
                <div className="text-[11px] text-zinc-500">Each generation produces a consistent character based on prior references for this avatar.</div>
              </div>
            )}

            {faceUrl && (
              <div className="rounded-lg overflow-hidden border border-white/10 max-w-xs mx-auto">
                <img src={faceUrl} alt="" className="w-full aspect-[3/4] object-cover" />
              </div>
            )}

            <div className="flex gap-2 pt-4">
              <button onClick={() => setStep('identity')} className="flex-1 py-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm">Back</button>
              <button onClick={() => setStep('voice')} disabled={!faceUrl} className="flex-1 py-2.5 rounded-lg bg-teal-500 hover:bg-teal-600 disabled:bg-zinc-700 font-semibold text-sm flex items-center justify-center gap-1">Next: Voice <ArrowRight className="w-4 h-4" /></button>
            </div>
          </div>
        )}

        {/* STEP 3 — VOICE */}
        {step === 'voice' && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold flex items-center gap-2"><Mic className="w-5 h-5" /> Voice</h2>
            <p className="text-sm text-zinc-400">Same voice on every video. Brands recognize voice as fast as they recognize the face.</p>

            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setVoiceMode('preset')} className={`p-4 rounded-lg border text-left ${voiceMode === 'preset' ? 'bg-teal-600/20 border-teal-500' : 'bg-zinc-900 border-white/10'}`}>
                <Mic className="w-5 h-5 mb-2" />
                <div className="text-sm font-semibold">Pick a preset voice</div>
                <div className="text-[11px] text-zinc-400">Fastest. HeyGen's voice library. Free.</div>
              </button>
              <button onClick={() => setVoiceMode('clone')} className={`p-4 rounded-lg border text-left ${voiceMode === 'clone' ? 'bg-teal-600/20 border-teal-500' : 'bg-zinc-900 border-white/10'}`}>
                <Sparkles className="w-5 h-5 mb-2" />
                <div className="text-sm font-semibold">Clone a real voice</div>
                <div className="text-[11px] text-zinc-400">Upload 30s+ of audio. ElevenLabs. Premium.</div>
              </button>
            </div>

            {voiceMode === 'preset' && (
              <div className="rounded-lg border border-white/10 bg-zinc-900 p-4 text-sm text-zinc-400">
                Voice preset selection wires to HeyGen's library on Step 4 (test render). Skip ahead to pick from their catalog when previewing.
              </div>
            )}

            {voiceMode === 'clone' && (
              <div className="space-y-2">
                <div className="text-xs text-zinc-400">Paste public URLs to 30-60s audio samples (MP3 or WAV).</div>
                <Textarea
                  label="Sample URLs (one per line)"
                  value={voiceSampleUrls.join('\n')}
                  onChange={v => setVoiceSampleUrls(v.split(/\s*\n\s*/).filter(Boolean))}
                  placeholder="https://example.com/sample1.mp3&#10;https://example.com/sample2.mp3"
                />
                <button
                  onClick={cloneVoice}
                  disabled={voiceBusy || voiceSampleUrls.length === 0}
                  className="w-full py-2.5 rounded-lg bg-teal-500/20 border border-teal-500 hover:bg-teal-500/30 text-teal-200 font-semibold flex items-center justify-center gap-2"
                >{voiceBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Mic className="w-4 h-4" /> Clone voice with ElevenLabs</>}</button>
                {voiceClonedId && <div className="text-[11px] text-teal-300">✓ Voice cloned. ID: {voiceClonedId.slice(0, 14)}…</div>}
                <div className="text-[11px] text-zinc-500">ElevenLabs requires ELEVENLABS_API_KEY in env. If not set, this falls back to preset.</div>
              </div>
            )}

            <div className="flex gap-2 pt-4">
              <button onClick={() => setStep('face')} className="flex-1 py-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm">Back</button>
              <button onClick={() => setStep('test')} className="flex-1 py-2.5 rounded-lg bg-teal-500 hover:bg-teal-600 font-semibold text-sm flex items-center justify-center gap-1">Next: Test render <ArrowRight className="w-4 h-4" /></button>
            </div>
          </div>
        )}

        {/* STEP 4 — TEST */}
        {step === 'test' && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold flex items-center gap-2"><Play className="w-5 h-5" /> Test render</h2>
            <p className="text-sm text-zinc-400">Five seconds of your avatar speaking. The moment you see this, it's real.</p>

            {!renderUrl && !renderBusy && (
              <button
                onClick={startTestRender}
                disabled={!avatarId}
                className="w-full py-3 rounded-xl bg-teal-500 hover:bg-teal-600 font-semibold flex items-center justify-center gap-2"
              ><Play className="w-4 h-4" /> Generate test clip</button>
            )}

            {renderBusy && (
              <div className="rounded-xl border border-white/10 bg-zinc-900 p-8 text-center space-y-3">
                <Loader2 className="w-8 h-8 mx-auto animate-spin text-teal-400" />
                <div className="text-sm font-medium">Rendering with HeyGen…</div>
                <div className="text-[11px] text-zinc-500">~30-90 seconds. Don't refresh.</div>
              </div>
            )}

            {renderUrl && (
              <div className="space-y-3">
                <video src={renderUrl} controls autoPlay className="w-full max-w-xs mx-auto rounded-xl border border-white/10" />
                <div className="text-center text-sm text-emerald-300 flex items-center justify-center gap-1"><Check className="w-4 h-4" /> Avatar is live.</div>
              </div>
            )}

            <div className="flex gap-2 pt-4">
              <button onClick={() => setStep('voice')} className="flex-1 py-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm">Back</button>
              <button
                onClick={() => router.push(`/avatars/${avatarId}`)}
                disabled={!renderUrl}
                className="flex-1 py-2.5 rounded-lg bg-teal-500 hover:bg-teal-600 disabled:bg-zinc-700 font-semibold text-sm"
              >Finish — see avatar</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">{label}</label>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-white/10 text-sm focus:border-teal-500 outline-none"
      />
    </div>
  );
}

function Textarea({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">{label}</label>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-white/10 text-sm focus:border-teal-500 outline-none resize-none"
      />
    </div>
  );
}
