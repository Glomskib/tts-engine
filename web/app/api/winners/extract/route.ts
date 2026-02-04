import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { generateCorrelationId } from "@/lib/api-errors";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

interface ExtractRequest {
  reference_video_id: string;
  transcript_text: string;
}

interface ExtractedData {
  spoken_hook: string;
  on_screen_hook: string | null;
  visual_hook: string | null;
  cta: string;
  hook_family: string;
  structure_tags: string[];
  quality_score: number;
}

/**
 * POST /api/winners/extract
 *
 * Extract hook package, CTA, and structure from a transcript using AI.
 * Updates reference_extracts and sets reference_video status to ready.
 */
export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON", correlation_id: correlationId },
      { status: 400 }
    );
  }

  const { reference_video_id, transcript_text } = body as ExtractRequest;

  if (!reference_video_id) {
    return NextResponse.json(
      { ok: false, error: "reference_video_id is required", correlation_id: correlationId },
      { status: 400 }
    );
  }

  if (!transcript_text || transcript_text.trim() === "") {
    return NextResponse.json(
      { ok: false, error: "transcript_text is required", correlation_id: correlationId },
      { status: 400 }
    );
  }

  try {
    // Verify reference video exists
    const { data: refVideo, error: fetchError } = await supabaseAdmin
      .from("reference_videos")
      .select("id, url, category")
      .eq("id", reference_video_id)
      .single();

    if (fetchError || !refVideo) {
      return NextResponse.json(
        { ok: false, error: "Reference video not found", correlation_id: correlationId },
        { status: 404 }
      );
    }

    // Update status to processing
    await supabaseAdmin
      .from("reference_videos")
      .update({ status: "processing", error_message: null })
      .eq("id", reference_video_id);

    // Call AI to extract data
    const extracted = await extractWithAI(transcript_text.trim(), refVideo.category, correlationId);

    if (!extracted) {
      await supabaseAdmin
        .from("reference_videos")
        .update({ status: "failed", error_message: "AI extraction failed" })
        .eq("id", reference_video_id);

      return NextResponse.json(
        { ok: false, error: "AI extraction failed", correlation_id: correlationId },
        { status: 500 }
      );
    }

    // Upsert reference_extracts
    const { error: extractError } = await supabaseAdmin
      .from("reference_extracts")
      .upsert({
        reference_video_id,
        spoken_hook: extracted.spoken_hook,
        on_screen_hook: extracted.on_screen_hook,
        visual_hook: extracted.visual_hook,
        cta: extracted.cta,
        hook_family: extracted.hook_family,
        structure_tags: extracted.structure_tags,
        quality_score: extracted.quality_score,
      });

    if (extractError) {
      console.error(`[${correlationId}] Failed to save extract:`, extractError);
      await supabaseAdmin
        .from("reference_videos")
        .update({ status: "failed", error_message: "Failed to save extraction" })
        .eq("id", reference_video_id);

      return NextResponse.json(
        { ok: false, error: "Failed to save extraction", correlation_id: correlationId },
        { status: 500 }
      );
    }

    // Update status to ready
    await supabaseAdmin
      .from("reference_videos")
      .update({ status: "ready" })
      .eq("id", reference_video_id);

    return NextResponse.json({
      ok: true,
      data: extracted,
      correlation_id: correlationId,
    });

  } catch (error) {
    console.error(`[${correlationId}] Extract error:`, error);

    // Update status to failed
    await supabaseAdmin
      .from("reference_videos")
      .update({
        status: "failed",
        error_message: error instanceof Error ? error.message : "Unknown error"
      })
      .eq("id", reference_video_id);

    return NextResponse.json(
      { ok: false, error: "Extraction failed", correlation_id: correlationId },
      { status: 500 }
    );
  }
}

/**
 * Use AI to extract hook package from transcript
 */
async function extractWithAI(
  transcript: string,
  category: string | null,
  correlationId: string
): Promise<ExtractedData | null> {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!anthropicKey && !openaiKey) {
    console.error(`[${correlationId}] No AI API key available`);
    return null;
  }

  const systemPrompt = `You are an expert at analyzing viral TikTok video scripts.
Given a transcript, extract the key components that make it effective.

Return a JSON object with these exact fields:
{
  "spoken_hook": "The opening spoken hook (first 1-3 sentences that grab attention)",
  "on_screen_hook": "Any on-screen text that appears in the hook (null if unknown)",
  "visual_hook": "Describe the likely opening visual/action (null if can't infer)",
  "cta": "The call-to-action (what they ask viewers to do)",
  "hook_family": "One of: pattern_interrupt, relatable_pain, proof_teaser, contrarian, mini_story, curiosity_gap, direct_benefit",
  "structure_tags": ["Array of structure descriptors like: testimonial, demo, listicle, before_after, day_in_life, storytime, tutorial, comparison"],
  "quality_score": 0-100 score based on hook strength, clarity, and viral potential
}

Be concise. Extract only what's clearly present in the transcript.`;

  const userPrompt = `Analyze this TikTok transcript${category ? ` (category: ${category})` : ""}:

"""
${transcript.slice(0, 3000)}
"""

Return only valid JSON, no markdown or explanation.`;

  try {
    let responseText: string = "";

    if (anthropicKey) {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-3-haiku-20240307",
          max_tokens: 1000,
          temperature: 0.3,
          system: systemPrompt,
          messages: [{ role: "user", content: userPrompt }],
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Anthropic API error: ${res.status} - ${errorText}`);
      }

      const result = await res.json();
      responseText = result.content?.[0]?.text || "";

    } else if (openaiKey) {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-3.5-turbo",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          max_tokens: 1000,
          temperature: 0.3,
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`OpenAI API error: ${res.status} - ${errorText}`);
      }

      const result = await res.json();
      responseText = result.choices?.[0]?.message?.content || "";
    }

    // Parse JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error(`[${correlationId}] No JSON found in AI response`);
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Validate required fields
    if (!parsed.spoken_hook || !parsed.cta || !parsed.hook_family) {
      console.error(`[${correlationId}] Missing required fields in AI response`);
      return null;
    }

    return {
      spoken_hook: parsed.spoken_hook,
      on_screen_hook: parsed.on_screen_hook || null,
      visual_hook: parsed.visual_hook || null,
      cta: parsed.cta,
      hook_family: parsed.hook_family,
      structure_tags: Array.isArray(parsed.structure_tags) ? parsed.structure_tags : [],
      quality_score: Math.min(100, Math.max(0, parseInt(parsed.quality_score) || 50)),
    };

  } catch (error) {
    console.error(`[${correlationId}] AI extraction error:`, error);
    return null;
  }
}
