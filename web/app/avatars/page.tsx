'use client';

/**
 * /avatars — Avatar Studio home. Lists user's avatars; "+ New avatar" → wizard.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, User, Loader2, Sparkles, Mic, Camera as CameraIcon, Check, AlertCircle } from 'lucide-react';

interface Avatar {
  id: string;
  name: string;
  avatar_display_name?: string;
  niche?: string;
  personality?: string;
  target_audience?: string;
  avatar_visual_reference_url?: string;
  heygen_custom_avatar_id?: string;
  voice_clone_id?: string;
  setup_status?: string;
  test_render_url?: string;
  updated_at: string;
}

export default function AvatarsPage() {
  const [avatars, setAvatars] = useState<Avatar[]>([]);
  const [loading, setLoading] = useState(true);
  const [authErr, setAuthErr] = useState(false);

  useEffect(() => {
    fetch('/api/avatars', { cache: 'no-store' })
      .then(async r => {
        if (r.status === 401) { setAuthErr(true); return; }
        const j = await r.json() as { avatars?: Avatar[] };
        setAvatars(j.avatars || []);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-teal-400" /> Avatar Studio
            </h1>
            <p className="text-sm text-zinc-400 mt-1">
              Build a persistent AI spokesperson. Face. Voice. Personality. Knowledge. One identity that creates every video for your brand.
            </p>
          </div>
          <Link
            href="/avatars/new"
            className="px-4 py-2 rounded-lg bg-teal-500 hover:bg-teal-600 font-semibold text-sm flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" /> New avatar
          </Link>
        </div>

        {authErr && (
          <div className="rounded-xl border border-white/10 bg-zinc-900 p-6 text-center">
            <div className="text-sm text-zinc-400 mb-3">Sign in to see your avatars.</div>
            <Link href="/login" className="inline-block px-4 py-2 rounded-lg bg-teal-500 text-sm font-semibold">Sign in</Link>
          </div>
        )}

        {!authErr && loading && (
          <div className="text-center py-12"><Loader2 className="w-6 h-6 mx-auto animate-spin text-teal-400" /></div>
        )}

        {!authErr && !loading && avatars.length === 0 && (
          <div className="rounded-xl border border-dashed border-white/10 bg-zinc-900/40 p-10 text-center">
            <User className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
            <div className="text-base font-semibold mb-1">No avatars yet</div>
            <div className="text-sm text-zinc-400 mb-5 max-w-md mx-auto">
              Your first avatar is the brand's AI spokesperson. Same face, same voice, same personality across every video.
            </div>
            <Link href="/avatars/new" className="inline-block px-5 py-2.5 rounded-lg bg-teal-500 hover:bg-teal-600 font-semibold text-sm">
              Create your first avatar
            </Link>
          </div>
        )}

        {avatars.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {avatars.map(a => <AvatarCard key={a.id} a={a} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function AvatarCard({ a }: { a: Avatar }) {
  const setupComplete = a.heygen_custom_avatar_id && a.voice_clone_id && a.test_render_url;
  return (
    <Link
      href={`/avatars/${a.id}`}
      className="block rounded-xl border border-white/10 bg-zinc-900 hover:bg-zinc-800 transition-colors overflow-hidden"
    >
      <div className="aspect-[3/4] bg-zinc-800 relative">
        {a.avatar_visual_reference_url ? (
          <img src={a.avatar_visual_reference_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-zinc-700">
            <User className="w-16 h-16" />
          </div>
        )}
        {!setupComplete && (
          <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[10px] font-semibold flex items-center gap-1">
            <AlertCircle className="w-3 h-3" /> Setup incomplete
          </div>
        )}
      </div>
      <div className="p-3">
        <div className="text-sm font-semibold truncate">{a.avatar_display_name || a.name}</div>
        <div className="text-[11px] text-zinc-400 truncate mt-0.5">{a.niche || a.personality || 'No niche set'}</div>
        <div className="flex items-center gap-2 mt-2 text-[10px] text-zinc-500">
          <span className={`flex items-center gap-1 ${a.heygen_custom_avatar_id ? 'text-teal-300' : ''}`}>
            <CameraIcon className="w-3 h-3" /> {a.heygen_custom_avatar_id ? 'Face' : 'no face'}
          </span>
          <span className={`flex items-center gap-1 ${a.voice_clone_id ? 'text-teal-300' : ''}`}>
            <Mic className="w-3 h-3" /> {a.voice_clone_id ? 'Voice' : 'no voice'}
          </span>
          <span className={`flex items-center gap-1 ${a.test_render_url ? 'text-emerald-300' : ''}`}>
            <Check className="w-3 h-3" /> {a.test_render_url ? 'Tested' : 'untested'}
          </span>
        </div>
      </div>
    </Link>
  );
}
