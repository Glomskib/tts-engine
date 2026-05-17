'use client';

/**
 * /avatars/new — 4-step wizard.
 * Step 2 (face) is now image-first: upload a reference photo, then optionally
 * tweak with a prompt. Avoids forcing the user to describe a person in words.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, User, Camera, Mic, Play, Loader2, Check, AlertCircle, Upload, Sparkles, RefreshCw } from 'lucide-react';

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

  // step 1 — identity (no appearance/visual_recipe here anymore)
  const [name, setName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [niche, setNiche] = useState('');
  const [personality, setPersonality] = useState('');
  const [audience, setAudience] = useState('');
  const [tone, setTone] = useState('');
  const [prohibited, setProhibited] = useState('');
  const [platforms, setPlatforms] = useState<string[]>(PLATFORMS.filter(p => p.default).map(p => p.key));

  // step 2 — face: reference image is primary
  const [referenceImageUrl, setReferenceImageUrl] = useState<string | null>(null);
  const [extraPrompt, setExtraPrompt] = useState('');
  const [faceBusy, setFaceBusy] = useState(false);
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);

  // step 3 — voice
  const [voiceClonedId, setVoiceClonedId] = useState<string | null>(null);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [voiceSampleUrls, setVoiceSampleUrls] = useState<string[]>([]);
  const [voiceMode, setVoiceMode] = useState<'clone' | 'preset'>('preset');

  // step 4 — test
  const [renderBusy, setRenderBusy] = useState(false);
  const [renderUrl, setRenderUrl] = useState<string | null>(null);

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
          niche,
          personality,
          target_audience: audience,
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

  async function uploadReference(file: File) {
    if (!avatarId) return;
    setFaceBusy(true); setErr(null);
    try {
      const up = await fetch(`/api/avatars/${avatarId}/visual/upload`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ filename: file.name, mime: file.type, size: file.size }),
      });
      const upJ = await up.json() as { signed_url?: string; public_url?: string; error?: string };
      if (!upJ.signed_url || !upJ.public_url) throw new Error(upJ.error || 'upload-url failed');
      const put = await fetch(upJ.signed_url, { method: 'PUT', headers: { 'content-type': file.type }, body: file });
      if (!put.ok) throw new Error(`PUT ${put.status}`);

      await fetch(`/api/avatars/${avatarId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ avatar_visual_reference_url: upJ.public_url, setup_status: 'face' }),
      });
      setReferenceImageUrl(upJ.public_url);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'upload failed');
    } finally {
      setFaceBusy(false);
    }
  }

  async function generateFromReference() {
    if (!avatarId || !referenceImageUrl) return;
    setFaceBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/avatars/${avatarId}/visual/generate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          reference_image_url: referenceImageUrl,
          recipe: extraPrompt || undefined,
        }),
      });
      const j = await r.json() as { ok: boolean; image_urls?: string[]; error?: string };
      if (!j.ok || !j.image_urls?.[0]) throw new Error(j.error || 'generation failed');
      setGeneratedImages(prev => [...j.image_urls!, ...prev]);
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
        <Link href="/avatars" className="inline-flex items-center gap-1.5 text-sm text-zinc-300 hover:text-white mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to avatars
        </Link>

        <div className="flex items-center gap-2 mb-6 text-xs">
          {(['identity','face','voice','test'] as Step[]).map((s, i) => {
            const active = step === s;
            const done = (['identity','face','voice','test'] as Step[]).indexOf(step) > i;
            return (
              <div key={s} className="flex items-center gap-2">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center font-semibold text-[10px] ${
                  done ? 'bg-teal-500 text-white'
                  : active ? 'bg-teal-500/30 border border-teal-400 text-teal-200'
                  : 'bg-zinc-800 text-zinc-400'
                }`}>{done ? <Check className="w-3 h-3" /> : i+1}</div>
                <div className={active ? 'text-white' : done ? 'text-teal-200' : 'text-zinc-400'}>{s}</div>
                {i < 3 && <div className="w-6 h-px bg-zinc-700 mx-1" />}
              </div>
            );
          })}
        </div>

        {err && (
          <div className="mb-4 p-3 rounded-lg bg-red-900/40 border border-red-500/50 text-sm text-red-200 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />{err}
          </div>
        )}

        {/* STEP 1 — IDENTITY */}
        {step === 'identity' && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold flex items-center gap-2"><User className="w-5 h-5" /> Identity</h2>
            <p className="text-sm text-zinc-300">Personality, voice rules, target audience. You'll handle the face with a reference image in the next step.</p>
            <Field label="Avatar name (internal)" value={name} onChange={setName} placeholder="e.g. mia-wellness-v1" />
            <Field label="Display name" value={displayName} onChange={setDisplayName} placeholder="e.g. Mia" />
            <Field label="Niche" value={niche} onChange={setNiche} placeholder="e.g. wellness mom, supplement reviewer" />
            <Textarea label="Personality" value={personality} onChange={setPersonality} placeholder="Friendly, conversational, never pushy. Warm but informed." />
            <Field label="Target audience" value={audience} onChange={setAudience} placeholder="e.g. moms 28-42 buying clean-ingredient supplements" />
            <Textarea label="Tone descriptor" value={tone} onChange={setTone} placeholder="Plain talk, friend-to-friend. Casual hooks like 'wait til you hear this'." />
            <Textarea label="Prohibited phrases / claims" value={prohibited} onChange={setProhibited} placeholder="cures, treats, prevents, guaranteed (anything regulated)" />
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-300 mb-2">Where do you publish?</label>
              <div className="flex flex-wrap gap-2">
                {PLATFORMS.map(p => {
                  const on = platforms.includes(p.key);
                  return (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => togglePlatform(p.key)}
                      className={`px-3 py-1.5 rounded-full text-xs border ${
                        on ? 'bg-teal-600/40 border-teal-400 text-teal-100'
                          : 'bg-zinc-900 border-zinc-700 text-zinc-300'
                      }`}
                    >{p.label}</button>
                  );
                })}
              </div>
            </div>
            <button
              onClick={createAvatar}
              disabled={!name.trim() || submitting}
              className="w-full mt-4 py-3 rounded-xl bg-teal-500 hover:bg-teal-400 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-semibold flex items-center justify-center gap-2"
            >{submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Next: Face <ArrowRight className="w-4 h-4" /></>}</button>
          </div>
        )}

        {/* STEP 2 — FACE (image-first) */}
        {step === 'face' && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold flex items-center gap-2"><Camera className="w-5 h-5" /> Face</h2>
            <p className="text-sm text-zinc-300">Upload a reference photo of the person this avatar should look like. Optional: add a quick prompt to tweak the look (different outfit, setting, expression).</p>

            {/* Reference image picker */}
            <div className="space-y-3">
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-300">Reference photo</label>
              {referenceImageUrl ? (
                <div className="flex items-start gap-3">
                  <img src={referenceImageUrl} alt="" className="w-32 aspect-[3/4] object-cover rounded-lg border border-zinc-600" />
                  <div className="flex-1 space-y-2">
                    <div className="text-sm text-emerald-300 flex items-center gap-1.5"><Check className="w-4 h-4" /> Reference loaded</div>
                    <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-100 cursor-pointer border border-zinc-600">
                      <input type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && uploadReference(e.target.files[0])} />
                      <RefreshCw className="w-3 h-3" /> Replace reference
                    </label>
                  </div>
                </div>
              ) : (
                <label className="block p-8 rounded-xl border-2 border-dashed border-zinc-600 hover:border-teal-400 cursor-pointer text-center transition-colors">
                  <input type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && uploadReference(e.target.files[0])} />
                  <Upload className="w-10 h-10 mx-auto text-zinc-400 mb-2" />
                  <div className="text-sm font-medium text-zinc-100">{faceBusy ? 'Uploading…' : 'Drop or click to upload a reference photo'}</div>
                  <div className="text-[11px] text-zinc-400 mt-1">PNG / JPG. Clear face, head-and-shoulders. This becomes the seed for all generated looks.</div>
                </label>
              )}
            </div>

            {/* Optional tweak prompt */}
            {referenceImageUrl && (
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-300 mb-1.5">Optional tweak (leave blank to use reference as-is)</label>
                <textarea
                  value={extraPrompt}
                  onChange={e => setExtraPrompt(e.target.value)}
                  placeholder="e.g. same person but with longer hair, sitting in a kitchen, warmer lighting"
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-600 text-sm text-zinc-100 placeholder-zinc-500 focus:border-teal-400 outline-none resize-none"
                />
                <button
                  onClick={generateFromReference}
                  disabled={faceBusy}
                  className="w-full mt-2 py-2.5 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-semibold flex items-center justify-center gap-2"
                >
                  {faceBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Sparkles className="w-4 h-4" /> Generate from reference</>}
                </button>
                <div className="text-[11px] text-zinc-400 mt-1.5">Uses Nano Banana with the reference image as a visual anchor. Same person, new variation.</div>
              </div>
            )}

            {/* Gallery of generated images */}
            {generatedImages.length > 0 && (
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-300 mb-2">Generated</label>
                <div className="grid grid-cols-3 gap-2">
                  {generatedImages.slice(0, 9).map((url, i) => (
                    <img key={i} src={url} alt="" className="aspect-[3/4] object-cover rounded-lg border border-zinc-600" />
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-4">
              <button onClick={() => setStep('identity')} className="flex-1 py-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-sm">Back</button>
              <button onClick={() => setStep('voice')} disabled={!referenceImageUrl} className="flex-1 py-2.5 rounded-lg bg-teal-500 hover:bg-teal-400 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-semibold text-sm flex items-center justify-center gap-1">Next: Voice <ArrowRight className="w-4 h-4" /></button>
            </div>
          </div>
        )}

        {/* STEP 3 — VOICE */}
        {step === 'voice' && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold flex items-center gap-2"><Mic className="w-5 h-5" /> Voice</h2>
            <p className="text-sm text-zinc-300">Same voice on every video. Brands recognize voice as fast as face.</p>

            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setVoiceMode('preset')} className={`p-4 rounded-lg border text-left ${voiceMode === 'preset' ? 'bg-teal-600/40 border-teal-400' : 'bg-zinc-900 border-zinc-600'}`}>
                <Mic className="w-5 h-5 mb-2" />
                <div className="text-sm font-semibold">Preset voice</div>
                <div className="text-[11px] text-zinc-300">Fastest. HeyGen's voice library.</div>
              </button>
              <button onClick={() => setVoiceMode('clone')} className={`p-4 rounded-lg border text-left ${voiceMode === 'clone' ? 'bg-teal-600/40 border-teal-400' : 'bg-zinc-900 border-zinc-600'}`}>
                <Sparkles className="w-5 h-5 mb-2" />
                <div className="text-sm font-semibold">Clone a voice</div>
                <div className="text-[11px] text-zinc-300">Upload 30s+ audio. ElevenLabs.</div>
              </button>
            </div>

            {voiceMode === 'preset' && (
              <div className="rounded-lg border border-zinc-600 bg-zinc-900 p-4 text-sm text-zinc-300">
                Voice preset selection wires to HeyGen's library at test-render time.
              </div>
            )}

            {voiceMode === 'clone' && (
              <div className="space-y-2">
                <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-300">Sample URLs (one per line)</label>
                <textarea
                  value={voiceSampleUrls.join('\n')}
                  onChange={e => setVoiceSampleUrls(e.target.value.split(/\s*\n\s*/).filter(Boolean))}
                  placeholder="https://example.com/sample1.mp3"
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-600 text-sm text-zinc-100 placeholder-zinc-500 focus:border-teal-400 outline-none resize-none"
                />
                <button
                  onClick={cloneVoice}
                  disabled={voiceBusy || voiceSampleUrls.length === 0}
                  className="w-full py-2.5 rounded-lg bg-teal-500 hover:bg-teal-400 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-semibold flex items-center justify-center gap-2"
                >{voiceBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Mic className="w-4 h-4" /> Clone voice</>}</button>
                {voiceClonedId && <div className="text-[11px] text-teal-300">✓ Voice cloned. ID: {voiceClonedId.slice(0, 14)}…</div>}
              </div>
            )}

            <div className="flex gap-2 pt-4">
              <button onClick={() => setStep('face')} className="flex-1 py-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-sm">Back</button>
              <button onClick={() => setStep('test')} className="flex-1 py-2.5 rounded-lg bg-teal-500 hover:bg-teal-400 text-white font-semibold text-sm flex items-center justify-center gap-1">Next: Test <ArrowRight className="w-4 h-4" /></button>
            </div>
          </div>
        )}

        {/* STEP 4 — TEST */}
        {step === 'test' && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold flex items-center gap-2"><Play className="w-5 h-5" /> Test render</h2>
            <p className="text-sm text-zinc-300">Five seconds of your avatar speaking. The moment you see this, it's real.</p>

            {!renderUrl && !renderBusy && (
              <button onClick={startTestRender} disabled={!avatarId} className="w-full py-3 rounded-xl bg-teal-500 hover:bg-teal-400 text-white font-semibold flex items-center justify-center gap-2">
                <Play className="w-4 h-4" /> Generate test clip
              </button>
            )}

            {renderBusy && (
              <div className="rounded-xl border border-zinc-600 bg-zinc-900 p-8 text-center space-y-3">
                <Loader2 className="w-8 h-8 mx-auto animate-spin text-teal-400" />
                <div className="text-sm font-medium text-zinc-100">Rendering with HeyGen…</div>
                <div className="text-[11px] text-zinc-400">~30-90 seconds. Don't refresh.</div>
              </div>
            )}

            {renderUrl && (
              <div className="space-y-3">
                <video src={renderUrl} controls autoPlay className="w-full max-w-xs mx-auto rounded-xl border border-zinc-600" />
                <div className="text-center text-sm text-emerald-300 flex items-center justify-center gap-1"><Check className="w-4 h-4" /> Avatar is live.</div>
              </div>
            )}

            <div className="flex gap-2 pt-4">
              <button onClick={() => setStep('voice')} className="flex-1 py-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-sm">Back</button>
              <button onClick={() => router.push(`/avatars/${avatarId}`)} disabled={!renderUrl} className="flex-1 py-2.5 rounded-lg bg-teal-500 hover:bg-teal-400 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-semibold text-sm">Finish — see avatar</button>
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
      <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-300 mb-1.5">{label}</label>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-600 text-sm text-zinc-100 placeholder-zinc-500 focus:border-teal-400 outline-none"
      />
    </div>
  );
}

function Textarea({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-300 mb-1.5">{label}</label>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-600 text-sm text-zinc-100 placeholder-zinc-500 focus:border-teal-400 outline-none resize-none"
      />
    </div>
  );
}
