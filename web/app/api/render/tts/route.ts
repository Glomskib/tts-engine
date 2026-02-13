import { NextResponse } from "next/server";
import { validateApiAccess } from "@/lib/auth/validateApiAccess";
import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";
import { textToSpeech } from "@/lib/elevenlabs";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 60;

const TTSSchema = z.object({
  text: z.string().min(1).max(5000),
  voiceId: z.string().optional(),
});

export async function POST(request: Request) {
  const correlationId =
    request.headers.get("x-correlation-id") || generateCorrelationId();

  const auth = await validateApiAccess(request);
  if (!auth) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse("BAD_REQUEST", "Invalid JSON body", 400, correlationId);
  }

  const parsed = TTSSchema.safeParse(body);
  if (!parsed.success) {
    return createApiErrorResponse("VALIDATION_ERROR", "Invalid input", 400, correlationId, {
      issues: parsed.error.issues,
    });
  }

  const { text, voiceId } = parsed.data;

  try {
    // Generate audio via ElevenLabs
    const audioBuffer = await textToSpeech(text, voiceId);

    // Upload to Supabase storage so Shotstack can fetch it
    const filename = `tts/${Date.now()}_${correlationId}.mp3`;
    const blob = new Blob([audioBuffer], { type: "audio/mpeg" });

    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from("renders")
      .upload(filename, blob, {
        contentType: "audio/mpeg",
        upsert: false,
      });

    if (uploadError) {
      // Bucket may not exist — try creating it and retry once
      if (uploadError.message?.includes("not found") || uploadError.message?.includes("Bucket")) {
        await supabaseAdmin.storage.createBucket("renders", { public: true });
        const { error: retryError } = await supabaseAdmin.storage
          .from("renders")
          .upload(filename, blob, { contentType: "audio/mpeg", upsert: false });
        if (retryError) throw new Error(`Storage upload failed: ${retryError.message}`);
      } else {
        throw new Error(`Storage upload failed: ${uploadError.message}`);
      }
    }

    // Get public URL
    const { data: urlData } = supabaseAdmin.storage
      .from("renders")
      .getPublicUrl(uploadData?.path || filename);

    // Estimate duration from audio size (~16kB/s for ElevenLabs MP3)
    const estimatedDuration = Math.round(audioBuffer.byteLength / 16000 * 10) / 10;

    return NextResponse.json({
      ok: true,
      audioUrl: urlData.publicUrl,
      size: audioBuffer.byteLength,
      estimatedDuration,
      correlation_id: correlationId,
    });
  } catch (err) {
    console.error(`[${correlationId}] TTS error:`, err);
    return createApiErrorResponse(
      "INTERNAL",
      err instanceof Error ? err.message : "TTS generation failed",
      500,
      correlationId
    );
  }
}
