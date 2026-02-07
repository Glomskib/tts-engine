/**
 * POST /api/jobs/generate-scripts
 *
 * Cron-triggered endpoint that processes videos with recording_status=GENERATING_SCRIPT.
 * For each video, generates an AI script and updates the video record.
 *
 * Protected by CRON_SECRET header to prevent unauthorized access.
 * Can also be called by admins via session auth.
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { generateCorrelationId } from "@/lib/api-errors";
import { notifyPipelineTransition } from "@/lib/pipeline-notifications";

export const runtime = "nodejs";
export const maxDuration = 120; // Allow up to 2 minutes for batch processing

// Safe JSON parser (same as scripts/generate)
function safeParseJSON(content: string): { success: boolean; data: Record<string, unknown> } {
  try {
    return { success: true, data: JSON.parse(content) };
  } catch {
    // Try repair
  }
  try {
    const firstBrace = content.indexOf("{");
    const lastBrace = content.lastIndexOf("}");
    if (firstBrace === -1 || lastBrace === -1 || firstBrace >= lastBrace) {
      return { success: false, data: {} };
    }
    let jsonSubstring = content.substring(firstBrace, lastBrace + 1);
    jsonSubstring = jsonSubstring.replace(/"([^"\\]*(\\.[^"\\]*)*)"/g, (_match, inner) => {
      inner = inner.replace(/\n/g, "\\n").replace(/\t/g, "\\t").replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
      return `"${inner}"`;
    });
    return { success: true, data: JSON.parse(jsonSubstring) };
  } catch {
    return { success: false, data: {} };
  }
}

async function generateScriptForVideo(
  video: Record<string, unknown>,
  concept: Record<string, unknown>,
  correlationId: string
): Promise<{ ok: boolean; script?: string; error?: string }> {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!anthropicKey && !openaiKey) {
    return { ok: false, error: "No AI API key configured" };
  }

  const hookText = (concept.spoken_hook as string) || (concept.hook as string) || "Hook TBD";
  const conceptTitle = (concept.concept_title as string) || (concept.title as string) || "Untitled";
  const coreAngle = (concept.core_angle as string) || "General";

  const prompt = `Generate a complete TikTok Shop script for this concept and hook:

Concept Title: ${conceptTitle}
Core Angle: ${coreAngle}
Hook: ${hookText}
Style: engaging

Requirements:
- Create engaging script for TikTok Shop video
- For supplements: NO medical claims, avoid "cure", "treat", "diagnose", "guaranteed"
- Use conservative, compliant language
- Focus on lifestyle benefits, not medical outcomes
- Include clear call-to-action for TikTok Shop

CRITICAL: Return ONLY valid minified JSON. No markdown. No code fences. Do not include literal newlines in JSON strings - use \\n instead. Make script_v1 a SINGLE LINE string with explicit \\n characters for line breaks.

{
  "script_v1": "Full voiceover script text here with \\n for line breaks...",
  "on_screen_text": ["Text overlay 1", "Text overlay 2", "Text overlay 3"],
  "caption": "Complete caption with emojis and description",
  "hashtags": ["#supplement", "#health", "#tiktokmademebuyit", "#fyp"],
  "cta": "Shop now on TikTok Shop!",
  "editor_notes": ["Note about pacing", "Note about visuals"]
}`;

  try {
    let content: string | null = null;

    if (anthropicKey) {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-3-haiku-20240307",
          max_tokens: 3000,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!response.ok) {
        return { ok: false, error: `Anthropic API error: ${response.status}` };
      }

      const result = await response.json();
      content = result.content?.[0]?.text || null;
    } else if (openaiKey) {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-3.5-turbo",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 3000,
          temperature: 0.7,
        }),
      });

      if (!response.ok) {
        return { ok: false, error: `OpenAI API error: ${response.status}` };
      }

      const result = await response.json();
      content = result.choices?.[0]?.message?.content || null;
    }

    if (!content) {
      return { ok: false, error: "No content returned from AI" };
    }

    const parseResult = safeParseJSON(content);
    if (!parseResult.success) {
      return { ok: false, error: "Failed to parse AI response" };
    }

    const scriptText = (parseResult.data.script_v1 as string) || content;
    return { ok: true, script: scriptText };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

export async function POST(request: NextRequest) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  // Auth: require either CRON_SECRET header or admin session
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");

  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    // Authorized via cron secret
  } else {
    const authContext = await getApiAuthContext();
    if (!authContext.isAdmin) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized", correlation_id: correlationId },
        { status: 401 }
      );
    }
  }

  // Fetch videos awaiting script generation (limit batch to 5)
  const { data: videos, error: fetchError } = await supabaseAdmin
    .from("videos")
    .select("id, concept_id, product_id, recording_status")
    .eq("recording_status", "GENERATING_SCRIPT")
    .order("created_at", { ascending: true })
    .limit(5);

  if (fetchError) {
    console.error(`[${correlationId}] Failed to fetch videos for script generation:`, fetchError);
    return NextResponse.json(
      { ok: false, error: "Failed to fetch pending videos", correlation_id: correlationId },
      { status: 500 }
    );
  }

  if (!videos || videos.length === 0) {
    return NextResponse.json({
      ok: true,
      processed: 0,
      message: "No videos pending script generation",
      correlation_id: correlationId,
    });
  }

  const results: Array<{ video_id: string; ok: boolean; error?: string }> = [];

  for (const video of videos) {
    const videoCorrelationId = `${correlationId}-${video.id.slice(0, 8)}`;

    // Fetch concept for this video
    const { data: concept } = await supabaseAdmin
      .from("concepts")
      .select("*")
      .eq("id", video.concept_id)
      .single();

    if (!concept) {
      console.error(`[${videoCorrelationId}] Concept not found for video ${video.id}`);
      // Mark as failed - move to NEEDS_SCRIPT so it doesn't get stuck
      await supabaseAdmin
        .from("videos")
        .update({ recording_status: "NEEDS_SCRIPT" })
        .eq("id", video.id);
      await supabaseAdmin.from("video_events").insert({
        video_id: video.id,
        event_type: "script_generation_failed",
        correlation_id: videoCorrelationId,
        actor: "system",
        from_status: "GENERATING_SCRIPT",
        to_status: "NEEDS_SCRIPT",
        details: { error: "Concept not found" },
      });
      results.push({ video_id: video.id, ok: false, error: "Concept not found" });
      continue;
    }

    // Generate script via AI
    const genResult = await generateScriptForVideo(video, concept, videoCorrelationId);

    if (!genResult.ok || !genResult.script) {
      console.error(`[${videoCorrelationId}] Script generation failed:`, genResult.error);
      await supabaseAdmin
        .from("videos")
        .update({ recording_status: "NEEDS_SCRIPT" })
        .eq("id", video.id);
      await supabaseAdmin.from("video_events").insert({
        video_id: video.id,
        event_type: "script_generation_failed",
        correlation_id: videoCorrelationId,
        actor: "system",
        from_status: "GENERATING_SCRIPT",
        to_status: "NEEDS_SCRIPT",
        details: { error: genResult.error },
      });
      results.push({ video_id: video.id, ok: false, error: genResult.error });
      continue;
    }

    // Update video with generated script and advance to NOT_RECORDED
    const { error: updateError } = await supabaseAdmin
      .from("videos")
      .update({
        script_locked_text: genResult.script,
        script_locked_version: 1,
        recording_status: "NOT_RECORDED",
      })
      .eq("id", video.id);

    if (updateError) {
      console.error(`[${videoCorrelationId}] Failed to update video with script:`, updateError);
      results.push({ video_id: video.id, ok: false, error: "DB update failed" });
      continue;
    }

    // Write audit event
    await supabaseAdmin.from("video_events").insert({
      video_id: video.id,
      event_type: "script_generation_completed",
      correlation_id: videoCorrelationId,
      actor: "system",
      from_status: "GENERATING_SCRIPT",
      to_status: "NOT_RECORDED",
      details: { script_length: genResult.script.length },
    });

    // Notify recorder that video is ready
    notifyPipelineTransition(supabaseAdmin, {
      video_id: video.id,
      from_status: "GENERATING_SCRIPT",
      to_status: "NOT_RECORDED",
      actor: "system",
      correlation_id: videoCorrelationId,
    }).catch((err) => {
      console.error(`[${videoCorrelationId}] Failed to notify recorder:`, err);
    });

    results.push({ video_id: video.id, ok: true });
  }

  const successCount = results.filter((r) => r.ok).length;
  const failCount = results.filter((r) => !r.ok).length;

  return NextResponse.json({
    ok: true,
    processed: results.length,
    success: successCount,
    failed: failCount,
    results,
    correlation_id: correlationId,
  });
}
