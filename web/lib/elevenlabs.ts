import { trackUsage } from '@/lib/command-center/ingest';

const ELEVENLABS_BASE_URL = 'https://api.elevenlabs.io/v1';
const DEFAULT_VOICE_ID = 'TX3LPaxmHKxFdv7VOQHJ'; // Liam - Energetic, Social Media Creator

export function getElevenLabsConfig() {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error('Missing ELEVENLABS_API_KEY environment variable');
  return { apiKey };
}

/**
 * Pre-process script text for TTS delivery.
 * - Removes [stage directions] (visual cues, not spoken)
 * - Adds a pause after the hook (first sentence)
 * - Adds a pause before common CTA phrases
 * - Normalizes ellipses and cleans whitespace
 */
export function formatForTTS(text: string): string {
  // 1. Remove stage directions: [anything in brackets]
  let result = text.replace(/\[.*?\]/g, '');

  // 2. Clean whitespace from bracket removals
  result = result.replace(/  +/g, ' ').trim();

  // 3. Add hook → body pause: after the first sentence, insert ... if not already present
  const firstSentenceEnd = result.search(/[.?!]/);
  if (firstSentenceEnd !== -1) {
    const afterPunc = firstSentenceEnd + 1;
    // Check if there's already an ellipsis right after
    if (result.slice(afterPunc, afterPunc + 3) !== '...') {
      result = result.slice(0, afterPunc) + '...' + result.slice(afterPunc);
    }
  }

  // 4. Add pre-CTA pause before common CTA trigger phrases
  const ctaPhrases = [
    'tap the cart',
    'tap the link',
    'grab yours',
    'use code',
    'shop now',
    'check it out',
    'comment below',
    'save this',
  ];
  const ctaPattern = new RegExp(
    `(?<!\\.\\.\\.)\\s+(${ctaPhrases.join('|')})`,
    'gi'
  );
  result = result.replace(ctaPattern, '... $1');

  // 5. Normalize ellipses: 4+ dots → exactly ...
  result = result.replace(/\.{4,}/g, '...');

  // 6. Final whitespace cleanup
  result = result.replace(/  +/g, ' ').trim();

  return result;
}

/**
 * Generate speech audio from text via ElevenLabs TTS.
 * Returns raw MP3 audio as an ArrayBuffer.
 */
export async function textToSpeech(
  text: string,
  voiceId: string = DEFAULT_VOICE_ID,
  options?: {
    modelId?: string;
    stability?: number;
    similarityBoost?: number;
    correlationId?: string;
    agentId?: string;
  }
): Promise<ArrayBuffer> {
  const config = getElevenLabsConfig();
  const url = `${ELEVENLABS_BASE_URL}/text-to-speech/${voiceId}`;
  const modelId = options?.modelId ?? 'eleven_multilingual_v2';
  const start = Date.now();

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'xi-api-key': config.apiKey,
      'Content-Type': 'application/json',
      'Accept': 'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      model_id: modelId,
      voice_settings: {
        stability: options?.stability ?? 0.5,
        similarity_boost: options?.similarityBoost ?? 0.75,
      },
    }),
  });

  const latencyMs = Date.now() - start;

  if (!response.ok) {
    const error = await response.text();
    trackUsage({
      provider: 'elevenlabs',
      model: modelId,
      input_tokens: 0,
      output_tokens: 0,
      latency_ms: latencyMs,
      status: 'error',
      error_code: `HTTP_${response.status}`,
      request_type: 'tts',
      agent_id: options?.agentId,
      correlation_id: options?.correlationId,
      meta: { characters: text.length, voice_id: voiceId },
    }).catch(() => {});
    throw new Error(`ElevenLabs ${response.status}: ${error}`);
  }

  const audioBuffer = await response.arrayBuffer();

  // ElevenLabs charges by character count — store in meta for reconciliation
  trackUsage({
    provider: 'elevenlabs',
    model: modelId,
    input_tokens: text.length, // characters as proxy for "input units"
    output_tokens: 0,
    cost_usd: 0, // per-character pricing varies by plan; reconcile later
    latency_ms: latencyMs,
    request_type: 'tts',
    agent_id: options?.agentId,
    correlation_id: options?.correlationId,
    meta: {
      characters: text.length,
      voice_id: voiceId,
      audio_bytes: audioBuffer.byteLength,
      note: 'cost depends on ElevenLabs plan tier',
    },
  }).catch((e) => console.error('[elevenlabs] usage tracking failed:', e));

  return audioBuffer;
}
