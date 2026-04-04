import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";
import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { z } from "zod";
import { aiRouteGuard } from '@/lib/ai-route-guard';

export const runtime = "nodejs";

const AiAssistSchema = z.object({
  mode: z.enum(["fill_blanks", "generate_from_description", "generate_from_product"]),
  description: z.string().max(2000).optional(),
  partial_data: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(request: Request) {
  const guard = await aiRouteGuard(request, { creditCost: 2, userLimit: 5 });
  if (guard.error) return guard.error;

  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse("BAD_REQUEST", "Invalid JSON", 400, correlationId);
  }

  const parseResult = AiAssistSchema.safeParse(body);
  if (!parseResult.success) {
    const errors = parseResult.error.issues.map(e => `${e.path.join(".")}: ${e.message}`);
    return createApiErrorResponse("VALIDATION_ERROR", errors.join(", "), 400, correlationId);
  }

  const { mode, description, partial_data } = parseResult.data;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return createApiErrorResponse("CONFIG_ERROR", "AI service not configured", 500, correlationId);
  }

  // Shared JSON schema for persona output (used by multiple modes)
  const PERSONA_JSON_SCHEMA = `{
  "name": "A descriptive archetype name like 'Busy Millennial Mom' or 'Skeptical Tech Bro' (NOT a person's name)",
  "description": "2-3 sentence vivid description of this person",
  "age_range": "one of: 18-24, 25-34, 35-44, 45-54, 55-64, 65+",
  "gender": "one of: female, male, non-binary, prefer-not-to-say",
  "marital_status": "one of: single, in-a-relationship, engaged, married, divorced, widowed, separated, its-complicated",
  "sexual_orientation": "one of: straight, gay, lesbian, bisexual, pansexual, prefer-not-to-say",
  "kids_count": "one of: none, 1, 2, 3, 4+, expecting",
  "job_title": "specific job title like 'ER Nurse' or 'Marketing Manager'",
  "employment_status": "one of: employed-full-time, employed-part-time, self-employed, freelancer, stay-at-home-parent, student, retired, unemployed, between-jobs",
  "education": "one of: high-school, some-college, associates, bachelors, masters, doctorate, trade-school, self-taught",
  "income_level": "one of: budget-conscious, value-seeker, middle-income, upper-middle, affluent, luxury",
  "location_type": "one of: urban, suburban, rural, coastal, midwest",
  "life_stage": "one of: student, young-professional, single, new-relationship, engaged, newlywed, expecting, new-parent, established-parent, teen-parent, empty-nester, sandwich-generation, pre-retirement, retired, divorced, caregiver",
  "lifestyle": "brief lifestyle description",
  "daily_routine": "brief description of a typical day",
  "goals": ["3-5 specific life/personal goals"],
  "struggles": ["3-5 specific daily struggles or frustrations"],
  "values": ["pick 3-5 from: health, family, convenience, value, quality, sustainability, status, authenticity, adventure, security, independence, community, simplicity, innovation"],
  "interests": ["pick 3-5 from: fitness, cooking, technology, travel, parenting, career, fashion, gaming, wellness, finance, home-improvement, beauty, pets, entertainment, outdoors, reading"],
  "personality_traits": ["pick 2-4 from: skeptical, impulsive, research-driven, trend-follower, early-adopter, cautious, deal-seeker, loyal, perfectionist, spontaneous, practical, aspirational, nostalgic, minimalist"],
  "tone_preference": "one of: casual, conversational, professional, empathetic, enthusiastic, skeptical, educational, urgent, calm, edgy, friendly, authoritative, playful, inspirational, relatable, sarcastic, vulnerable, confident, frustrated, hopeful, desperate",
  "humor_style": "one of: none, self-deprecating, sarcastic, wholesome, absurdist, observational, dark, pun-based, physical, relatable, exaggerated, deadpan, witty, situational, meme-style, awkward, dry",
  "attention_span": "one of: quick-hooks, moderate, long-form, deep-diver, skimmer, multi-tasker",
  "trust_builders": ["pick 2-4 from: testimonials, data-stats, expert-endorsements, relatable-stories, before-after, money-back, free-trial, social-proof, transparency, certifications, longevity, user-generated"],
  "phrases_they_use": ["3-5 phrases this person would actually say"],
  "phrases_to_avoid": ["2-3 phrases that would turn this person off"],
  "primary_pain_points": ["3-5 specific pain points RELATED TO THE PRODUCT/SOLUTION"],
  "emotional_triggers": ["pick 2-4 from: fomo, simplicity, belonging, fear-judgment, control, aspiration, nostalgia, guilt, relief, pride, curiosity, validation, security, excitement"],
  "buying_objections": ["2-4 reasons they might not buy THIS product"],
  "purchase_motivators": ["pick 2-4 from: discounts, urgency, social-proof, quality, convenience, exclusivity, free-shipping, bundle, referral, comparison, newness, results"],
  "shopping_habits": "brief description of how they shop",
  "content_types_preferred": ["pick 2-4 from: relatable-fails, before-after, day-in-life, pov, storytime, tutorial, review, unboxing, trend, educational, testimonials, challenge, comparison, behind-scenes, duet-stitch"],
  "platforms": ["pick 2-3 from: tiktok, instagram, youtube, youtube-shorts, facebook, twitter, linkedin, pinterest, snapchat"],
  "best_posting_times": "when they're most active online",
  "full_description": "A rich 3-5 sentence narrative about this person's life, motivations, and daily experience"
}`;

  // Shared field reference for fill_blanks mode
  const FIELD_REFERENCE = `Available fields and their valid values:
- name: descriptive archetype name (string)
- description: 2-3 sentence description (string)
- age_range: 18-24, 25-34, 35-44, 45-54, 55-64, 65+
- gender: female, male, non-binary, prefer-not-to-say
- marital_status: single, in-a-relationship, engaged, married, divorced, widowed, separated, its-complicated
- sexual_orientation: straight, gay, lesbian, bisexual, pansexual, prefer-not-to-say
- kids_count: none, 1, 2, 3, 4+, expecting
- job_title: specific job title (string)
- employment_status: employed-full-time, employed-part-time, self-employed, freelancer, stay-at-home-parent, student, retired, unemployed, between-jobs
- education: high-school, some-college, associates, bachelors, masters, doctorate, trade-school, self-taught
- income_level: budget-conscious, value-seeker, middle-income, upper-middle, affluent, luxury
- location_type: urban, suburban, rural, coastal, midwest
- life_stage: student, young-professional, single, new-relationship, engaged, newlywed, expecting, new-parent, established-parent, teen-parent, empty-nester, sandwich-generation, pre-retirement, retired, divorced, caregiver
- lifestyle: brief description (string)
- daily_routine: brief description (string)
- goals: array of 3-5 strings
- struggles: array of 3-5 strings
- values: array from [health, family, convenience, value, quality, sustainability, status, authenticity, adventure, security, independence, community, simplicity, innovation]
- interests: array from [fitness, cooking, technology, travel, parenting, career, fashion, gaming, wellness, finance, home-improvement, beauty, pets, entertainment, outdoors, reading]
- personality_traits: array from [skeptical, impulsive, research-driven, trend-follower, early-adopter, cautious, deal-seeker, loyal, perfectionist, spontaneous, practical, aspirational, nostalgic, minimalist]
- tone_preference: casual, conversational, professional, empathetic, enthusiastic, skeptical, educational, urgent, calm, edgy, friendly, authoritative, playful, inspirational, relatable, sarcastic, vulnerable, confident, frustrated, hopeful, desperate
- humor_style: none, self-deprecating, sarcastic, wholesome, absurdist, observational, dark, pun-based, physical, relatable, exaggerated, deadpan, witty, situational, meme-style, awkward, dry
- attention_span: quick-hooks, moderate, long-form, deep-diver, skimmer, multi-tasker
- trust_builders: array from [testimonials, data-stats, expert-endorsements, relatable-stories, before-after, money-back, free-trial, social-proof, transparency, certifications, longevity, user-generated]
- phrases_they_use: array of 3-5 phrases
- phrases_to_avoid: array of 2-3 phrases
- primary_pain_points: array of 3-5 pain points
- emotional_triggers: array from [fomo, simplicity, belonging, fear-judgment, control, aspiration, nostalgia, guilt, relief, pride, curiosity, validation, security, excitement]
- buying_objections: array of 2-4 strings
- purchase_motivators: array from [discounts, urgency, social-proof, quality, convenience, exclusivity, free-shipping, bundle, referral, comparison, newness, results]
- shopping_habits: brief description (string)
- content_types_preferred: array from [relatable-fails, before-after, day-in-life, pov, storytime, tutorial, review, unboxing, trend, educational, testimonials, challenge, comparison, behind-scenes, duet-stitch]
- platforms: array from [tiktok, instagram, youtube, youtube-shorts, facebook, twitter, linkedin, pinterest, snapchat]
- best_posting_times: string
- full_description: rich 3-5 sentence narrative`;

  try {
    let prompt: string;

    if (mode === "generate_from_product") {
      if (!description?.trim()) {
        return createApiErrorResponse("VALIDATION_ERROR", "Product description is required", 400, correlationId);
      }

      prompt = `You are an expert audience research strategist and customer profiler. A user is selling a product or solution and needs to know WHO their ideal customer is.

Based on the following product/solution description, generate the IDEAL BUYER PERSONA — the #1 person most likely to buy this product.

PRODUCT/SOLUTION: "${description}"

Think deeply about:
- Who has the problem this product solves?
- What does their daily life look like?
- What triggers them to search for a solution like this?
- What language do they use to describe their problem?
- Where do they hang out online?
- What objections would they have before buying?
- What would finally convince them to buy?

Generate a hyper-specific, realistic customer profile. This should feel like a REAL person you could point to in a crowd, not a generic marketing segment. The pain points, objections, and phrases should all be specifically relevant to THIS product.

Return ONLY valid JSON with this structure (no markdown, no explanation):
${PERSONA_JSON_SCHEMA}`;
    } else if (mode === "generate_from_description") {
      if (!description?.trim()) {
        return createApiErrorResponse("VALIDATION_ERROR", "Description is required for generate mode", 400, correlationId);
      }

      prompt = `You are an expert audience research strategist. Based on the following brief description of a customer, generate a detailed persona profile.

CUSTOMER DESCRIPTION: "${description}"

Generate a complete persona with ALL of the following fields. Be specific and realistic — this should feel like a real person, not a generic archetype. Use the exact field names and value formats specified.

Return ONLY valid JSON with this structure (no markdown, no explanation):
${PERSONA_JSON_SCHEMA}`;
    } else {
      // fill_blanks mode
      const filledFields = partial_data ? Object.entries(partial_data)
        .filter(([, v]) => v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0))
        .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
        .join("\n") : "No fields filled yet";

      prompt = `You are an expert audience research strategist. A user is building a customer persona and has filled in some fields. Based on what they've provided, suggest values for the REMAINING empty fields.

FIELDS ALREADY FILLED:
${filledFields}

Based on the filled fields, infer logical values for the empty/missing fields. Be specific, consistent, and realistic — all suggestions should make sense together as one coherent person.

Return ONLY valid JSON with suggested values for fields that are empty or missing. Use the same field names and value formats as below. Only include fields that need to be filled (skip ones already provided).

Available fields and their valid values:
- name: descriptive archetype name (string)
- description: 2-3 sentence description (string)
- age_range: 18-24, 25-34, 35-44, 45-54, 55-64, 65+
- gender: female, male, non-binary, prefer-not-to-say
- marital_status: single, in-a-relationship, engaged, married, divorced, widowed, separated, its-complicated
- sexual_orientation: straight, gay, lesbian, bisexual, pansexual, prefer-not-to-say
- kids_count: none, 1, 2, 3, 4+, expecting
- job_title: specific job title (string)
- employment_status: employed-full-time, employed-part-time, self-employed, freelancer, stay-at-home-parent, student, retired, unemployed, between-jobs
- education: high-school, some-college, associates, bachelors, masters, doctorate, trade-school, self-taught
- income_level: budget-conscious, value-seeker, middle-income, upper-middle, affluent, luxury
- location_type: urban, suburban, rural, coastal, midwest
- life_stage: student, young-professional, single, new-relationship, engaged, newlywed, expecting, new-parent, established-parent, teen-parent, empty-nester, sandwich-generation, pre-retirement, retired, divorced, caregiver
- lifestyle: brief description (string)
- daily_routine: brief description (string)
- goals: array of 3-5 strings
- struggles: array of 3-5 strings
- values: array from [health, family, convenience, value, quality, sustainability, status, authenticity, adventure, security, independence, community, simplicity, innovation]
- interests: array from [fitness, cooking, technology, travel, parenting, career, fashion, gaming, wellness, finance, home-improvement, beauty, pets, entertainment, outdoors, reading]
- personality_traits: array from [skeptical, impulsive, research-driven, trend-follower, early-adopter, cautious, deal-seeker, loyal, perfectionist, spontaneous, practical, aspirational, nostalgic, minimalist]
- tone_preference: casual, conversational, professional, empathetic, enthusiastic, skeptical, educational, urgent, calm, edgy, friendly, authoritative, playful, inspirational, relatable, sarcastic, vulnerable, confident, frustrated, hopeful, desperate
- humor_style: none, self-deprecating, sarcastic, wholesome, absurdist, observational, dark, pun-based, physical, relatable, exaggerated, deadpan, witty, situational, meme-style, awkward, dry
- attention_span: quick-hooks, moderate, long-form, deep-diver, skimmer, multi-tasker
- trust_builders: array from [testimonials, data-stats, expert-endorsements, relatable-stories, before-after, money-back, free-trial, social-proof, transparency, certifications, longevity, user-generated]
- phrases_they_use: array of 3-5 phrases
- phrases_to_avoid: array of 2-3 phrases
- primary_pain_points: array of 3-5 pain points
- emotional_triggers: array from [fomo, simplicity, belonging, fear-judgment, control, aspiration, nostalgia, guilt, relief, pride, curiosity, validation, security, excitement]
- buying_objections: array of 2-4 strings
- purchase_motivators: array from [discounts, urgency, social-proof, quality, convenience, exclusivity, free-shipping, bundle, referral, comparison, newness, results]
- shopping_habits: brief description (string)
- content_types_preferred: array from [relatable-fails, before-after, day-in-life, pov, storytime, tutorial, review, unboxing, trend, educational, testimonials, challenge, comparison, behind-scenes, duet-stitch]
- platforms: array from [tiktok, instagram, youtube, youtube-shorts, facebook, twitter, linkedin, pinterest, snapchat]
- best_posting_times: string
- full_description: rich 3-5 sentence narrative

Return ONLY the JSON object with suggested field values.`;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    let response: Response;
    try {
      response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 2000,
          messages: [{ role: "user", content: prompt }],
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[${correlationId}] AI assist API error: ${response.status} - ${errorText}`);
      return createApiErrorResponse("AI_ERROR", "Failed to generate persona suggestions", 500, correlationId);
    }

    const data = await response.json();
    const content = data.content?.[0]?.text;

    if (!content) {
      return createApiErrorResponse("AI_ERROR", "No response from AI", 500, correlationId);
    }

    // Parse the JSON response
    let suggestions: Record<string, unknown>;
    try {
      let jsonStr = content;
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1];
      }
      suggestions = JSON.parse(jsonStr.trim());
    } catch {
      console.error(`[${correlationId}] Failed to parse AI assist response:`, content.slice(0, 500));
      return createApiErrorResponse("AI_ERROR", "Failed to parse AI suggestions", 500, correlationId);
    }

    return NextResponse.json({
      ok: true,
      data: { suggestions },
      correlation_id: correlationId,
    });
  } catch (error) {
    const err = error as Error;
    console.error(`[${correlationId}] AI assist error:`, err.message);
    return createApiErrorResponse("INTERNAL", "AI assist failed", 500, correlationId);
  }
}
