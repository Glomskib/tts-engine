/**
 * Ambient SFX library — TikTok Shop safe (no commercial music).
 * Generates sound effects via ElevenLabs Sound Generation API,
 * caches them in Supabase storage, and provides a default SFX plan.
 */
import { getElevenLabsConfig } from "@/lib/elevenlabs";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export interface SfxClipConfig {
  category: SfxCategory;
  url: string;
  start: number;
  length: number;
  volume: number;
}

export type SfxCategory =
  | "soft_room_tone"
  | "keyboard_typing"
  | "product_open"
  | "notification_ding"
  | "subtle_whoosh";

const SFX_PROMPTS: Record<SfxCategory, { prompt: string; duration: number }> = {
  soft_room_tone: { prompt: "soft ambient room tone hum", duration: 5 },
  keyboard_typing: { prompt: "gentle laptop keyboard typing", duration: 3 },
  product_open: { prompt: "cardboard box opening, unboxing", duration: 2 },
  notification_ding: { prompt: "soft phone notification chime", duration: 1 },
  subtle_whoosh: { prompt: "subtle whoosh transition", duration: 1 },
};

/**
 * Generate a sound effect via ElevenLabs Sound Generation API.
 */
async function generateSfx(category: SfxCategory): Promise<ArrayBuffer> {
  const config = getElevenLabsConfig();
  const sfx = SFX_PROMPTS[category];

  const response = await fetch("https://api.elevenlabs.io/v1/sound-generation", {
    method: "POST",
    headers: {
      "xi-api-key": config.apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: sfx.prompt,
      duration_seconds: sfx.duration,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`ElevenLabs SFX ${response.status}: ${error}`);
  }

  return response.arrayBuffer();
}

/**
 * Get a public URL for an SFX clip. Checks Supabase cache first;
 * if missing, generates via ElevenLabs and uploads. Generate once, reuse forever.
 */
export async function getSfxUrl(category: SfxCategory): Promise<string> {
  const storagePath = `sfx/${category}.mp3`;

  // Check cache — if the file exists, return its public URL
  const { data: existing } = await supabaseAdmin.storage
    .from("renders")
    .list("sfx", { search: `${category}.mp3` });

  if (existing && existing.length > 0) {
    const { data } = supabaseAdmin.storage.from("renders").getPublicUrl(storagePath);
    return data.publicUrl;
  }

  // Generate + upload
  const audioBuffer = await generateSfx(category);
  const blob = new Blob([audioBuffer], { type: "audio/mpeg" });

  const { error } = await supabaseAdmin.storage
    .from("renders")
    .upload(storagePath, blob, { contentType: "audio/mpeg", upsert: true });

  if (error) throw new Error(`SFX upload failed: ${error.message}`);

  const { data } = supabaseAdmin.storage.from("renders").getPublicUrl(storagePath);
  return data.publicUrl;
}

/**
 * Build a default SFX plan for a video of given duration.
 * Returns clips at low volume (0.05–0.08) so they're subtle background texture.
 */
export async function buildDefaultSfxPlan(duration: number): Promise<SfxClipConfig[]> {
  const [roomToneUrl, whooshUrl, dingUrl] = await Promise.all([
    getSfxUrl("soft_room_tone"),
    getSfxUrl("subtle_whoosh"),
    getSfxUrl("notification_ding"),
  ]);

  const clips: SfxClipConfig[] = [];

  // Room tone at 0s — fills initial silence
  clips.push({
    category: "soft_room_tone",
    url: roomToneUrl,
    start: 0,
    length: Math.min(5, duration),
    volume: 0.05,
  });

  // Whoosh at midpoint — transition feel
  const midpoint = Math.max(0, duration / 2 - 0.5);
  clips.push({
    category: "subtle_whoosh",
    url: whooshUrl,
    start: midpoint,
    length: 1,
    volume: 0.08,
  });

  // Ding near CTA start — attention
  const ctaStart = Math.max(0, duration - 4);
  clips.push({
    category: "notification_ding",
    url: dingUrl,
    start: ctaStart,
    length: 1,
    volume: 0.07,
  });

  return clips;
}
