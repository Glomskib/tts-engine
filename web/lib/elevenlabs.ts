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
    'link in bio',
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
  }
): Promise<ArrayBuffer> {
  const config = getElevenLabsConfig();
  const url = `${ELEVENLABS_BASE_URL}/text-to-speech/${voiceId}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'xi-api-key': config.apiKey,
      'Content-Type': 'application/json',
      'Accept': 'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      model_id: options?.modelId ?? 'eleven_multilingual_v2',
      voice_settings: {
        stability: options?.stability ?? 0.5,
        similarity_boost: options?.similarityBoost ?? 0.75,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`ElevenLabs ${response.status}: ${error}`);
  }

  return response.arrayBuffer();
}
