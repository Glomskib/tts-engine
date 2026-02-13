const ELEVENLABS_BASE_URL = 'https://api.elevenlabs.io/v1';
const DEFAULT_VOICE_ID = 'TX3LPaxmHKxFdv7VOQHJ'; // Liam - Energetic, Social Media Creator

export function getElevenLabsConfig() {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error('Missing ELEVENLABS_API_KEY environment variable');
  return { apiKey };
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
