import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from '@/lib/supabase/server';

export const runtime = "nodejs";

/**
 * API endpoint to generate a safer/compliant rewrite of a script
 * Uses AI to remove risky language and make scripts more TikTok-compliant
 */
export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON" },
      { status: 400 }
    );
  }

  const { video_id, script_text, script_id } = body as Record<string, unknown>;

  if (!script_text || typeof script_text !== "string") {
    return NextResponse.json(
      { ok: false, error: "script_text is required" },
      { status: 400 }
    );
  }

  // Determine AI provider
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!anthropicKey && !openaiKey) {
    return NextResponse.json(
      { ok: false, error: "No AI API key configured" },
      { status: 500 }
    );
  }

  try {
    const prompt = `Rewrite the following TikTok Shop script to be safer and more compliant.

REQUIREMENTS:
- Remove or soften any medical/health claims
- Avoid words like: cure, treat, diagnose, guaranteed, proven, clinical, FDA
- Keep the engaging tone but focus on lifestyle benefits
- Maintain the same structure and approximate length
- For supplements: emphasize "support", "help maintain", "may promote"
- Keep the hook compelling but compliant
- Return ONLY the rewritten script text, no explanations

ORIGINAL SCRIPT:
${script_text}

SAFER REWRITE:`;

    let rewrittenScript = "";

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
          max_tokens: 2000,
          messages: [
            {
              role: "user",
              content: prompt,
            },
          ],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Anthropic API error:", response.status, errorText);
        throw new Error(`Anthropic API error: ${response.status}`);
      }

      const result = await response.json();
      rewrittenScript = result.content?.[0]?.text?.trim() || "";
    } else if (openaiKey) {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-3.5-turbo",
          messages: [
            {
              role: "user",
              content: prompt,
            },
          ],
          max_tokens: 2000,
          temperature: 0.5,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("OpenAI API error:", response.status, errorText);
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const result = await response.json();
      rewrittenScript = result.choices?.[0]?.message?.content?.trim() || "";
    }

    if (!rewrittenScript) {
      return NextResponse.json(
        { ok: false, error: "AI returned empty response" },
        { status: 500 }
      );
    }

    // If video_id provided, update the video's script_locked_text
    if (video_id && typeof video_id === "string") {
      const { error: updateError } = await supabaseAdmin
        .from("videos")
        .update({
          script_locked_text: rewrittenScript,
          updated_at: new Date().toISOString(),
        })
        .eq("id", video_id);

      if (updateError) {
        console.error("Failed to update video script:", updateError);
        // Don't fail - still return the rewritten script
      }
    }

    // If script_id provided, create a new version
    if (script_id && typeof script_id === "string") {
      // Get current script to increment version
      const { data: currentScript } = await supabaseAdmin
        .from("scripts")
        .select("version, concept_id")
        .eq("id", script_id)
        .single();

      if (currentScript) {
        const { error: insertError } = await supabaseAdmin
          .from("scripts")
          .insert({
            concept_id: currentScript.concept_id,
            spoken_script: rewrittenScript,
            version: (currentScript.version || 1) + 1,
            status: "DRAFT",
          });

        if (insertError) {
          console.error("Failed to insert new script version:", insertError);
        }
      }
    }

    return NextResponse.json({
      ok: true,
      data: {
        original: script_text,
        rewritten: rewrittenScript,
        video_id: video_id || null,
      },
      meta: {
        ai_provider: anthropicKey ? "anthropic" : "openai",
      },
    });

  } catch (error) {
    console.error("Safer rewrite error:", error);
    return NextResponse.json(
      { ok: false, error: `Safer rewrite failed: ${String(error)}` },
      { status: 500 }
    );
  }
}
