/**
 * heygen-voices.ts
 *
 * Small wrapper around HeyGen's v2 "list voices" endpoint plus an in-memory
 * cache. We hit this every time a user opens the voice picker — caching for
 * an hour keeps HeyGen happy and the picker snappy on subsequent opens.
 *
 * 2026-06-01: added so /avatars can finally show a voice picker. Before this,
 * every avatar showed "voice unset" because we had no UI (or backing API
 * call) to pick a HeyGen stock voice. ElevenLabs cloning is a future Pro+
 * feature — this is the stock-voice path only.
 */

const HEYGEN_VOICES_URL = 'https://api.heygen.com/v2/voices';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export interface HeygenVoice {
  voice_id: string;
  name: string;
  language: string;
  gender: string;
  preview_audio: string;
  emotion_support: boolean;
  support_pause: boolean;
}

interface RawHeygenVoice {
  voice_id?: string;
  name?: string;
  language?: string;
  gender?: string;
  preview_audio?: string;
  emotion_support?: boolean;
  support_pause?: boolean;
}

let cache: { at: number; voices: HeygenVoice[] } | null = null;

function getHeygenKey(): string {
  const k = process.env.HEYGEN_API_KEY?.trim();
  if (!k) throw new Error('Missing HEYGEN_API_KEY environment variable');
  return k;
}

/**
 * List all stock voices available on the connected HeyGen account.
 * English voices first, then alphabetical by name.
 *
 * Cached in memory for 1 hour per server instance.
 */
export async function listHeygenVoices(): Promise<HeygenVoice[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.voices;
  }

  const apiKey = getHeygenKey();
  const resp = await fetch(HEYGEN_VOICES_URL, {
    method: 'GET',
    headers: { 'X-Api-Key': apiKey },
    // Server-to-server — don't let Next try to cache this with weird semantics.
    cache: 'no-store',
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`HeyGen list voices failed (${resp.status}): ${body.slice(0, 300)}`);
  }

  const json = await resp.json().catch(() => null) as
    | { data?: { voices?: RawHeygenVoice[] } }
    | null;

  const raw = json?.data?.voices ?? [];
  const voices: HeygenVoice[] = raw
    .filter(v => v && typeof v.voice_id === 'string' && typeof v.name === 'string')
    .map(v => ({
      voice_id: String(v.voice_id),
      name: String(v.name),
      language: String(v.language ?? ''),
      gender: String(v.gender ?? ''),
      preview_audio: String(v.preview_audio ?? ''),
      emotion_support: !!v.emotion_support,
      support_pause: !!v.support_pause,
    }));

  // English first, then alphabetical by name. Case-insensitive everywhere.
  voices.sort((a, b) => {
    const ae = a.language.toLowerCase() === 'english' ? 0 : 1;
    const be = b.language.toLowerCase() === 'english' ? 0 : 1;
    if (ae !== be) return ae - be;
    return a.name.localeCompare(b.name);
  });

  cache = { at: Date.now(), voices };
  return voices;
}
