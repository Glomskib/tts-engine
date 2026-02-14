/**
 * Cron: Script of the Day — 7 AM PST daily
 *
 * For each user with an active paid subscription (creator_lite+):
 *   1. Pick their most-used product (most scripts generated)
 *   2. Pick a random audience persona
 *   3. Generate one script via unified generator
 *   4. Save to script_of_the_day table + saved_skits
 *   5. Send optional email + Telegram notification
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { generateUnifiedScript } from "@/lib/unified-script-generator";
import { sendTelegramNotification } from "@/lib/telegram";
import { sendEmail } from "@/lib/email/resend";
import { isWithinLimit, migrateOldPlanId } from "@/lib/plans";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const results: { userId: string; productName: string; status: string }[] = [];

  try {
    // Fetch all users with active paid subscriptions
    const { data: subs } = await supabaseAdmin
      .from("user_subscriptions")
      .select("user_id, plan_id")
      .not("plan_id", "eq", "free");

    if (!subs || subs.length === 0) {
      return NextResponse.json({ ok: true, generated: 0, message: "No paid subscribers", timestamp: new Date().toISOString() });
    }

    for (const sub of subs) {
      const planId = migrateOldPlanId(sub.plan_id || "free");

      // Check plan allows SOTD
      if (!isWithinLimit(planId, "scriptOfTheDay", 0)) {
        continue;
      }

      // Skip if already generated today
      const { data: existing } = await supabaseAdmin
        .from("script_of_the_day")
        .select("id")
        .eq("user_id", sub.user_id)
        .eq("script_date", today)
        .limit(1)
        .maybeSingle();

      if (existing) {
        results.push({ userId: sub.user_id, productName: "-", status: "already_generated" });
        continue;
      }

      try {
        await generateForUser(sub.user_id, today);
        results.push({ userId: sub.user_id, productName: "-", status: "generated" });
      } catch (err) {
        console.error(`[sotd] Failed for user ${sub.user_id}:`, err);
        results.push({ userId: sub.user_id, productName: "-", status: `error: ${String(err).slice(0, 100)}` });
      }
    }

    const generated = results.filter((r) => r.status === "generated").length;
    await sendTelegramNotification(
      `📝 <b>Script of the Day</b>\nGenerated for <b>${generated}</b> user${generated !== 1 ? "s" : ""} (${results.length} total checked)`
    );

    return NextResponse.json({ ok: true, generated, results, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error("[cron/script-of-the-day] Fatal error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

async function generateForUser(userId: string, today: string) {
  // 1. Pick the most-used product (most scripts generated for it)
  const { data: products } = await supabaseAdmin
    .from("products")
    .select("id, name, brand, category")
    .eq("user_id", userId)
    .limit(50);

  if (!products || products.length === 0) return;

  // Count scripts per product via saved_skits
  const productIds = products.map((p) => p.id);
  const { data: skitCounts } = await supabaseAdmin
    .from("saved_skits")
    .select("product_id")
    .eq("user_id", userId)
    .in("product_id", productIds);

  const countMap: Record<string, number> = {};
  for (const s of skitCounts || []) {
    if (s.product_id) countMap[s.product_id] = (countMap[s.product_id] || 0) + 1;
  }

  // Sort by script count descending; if tied, pick randomly
  const sorted = [...products].sort((a, b) => (countMap[b.id] || 0) - (countMap[a.id] || 0));
  const topCount = countMap[sorted[0].id] || 0;
  const tied = sorted.filter((p) => (countMap[p.id] || 0) === topCount);
  const chosenProduct = tied[Math.floor(Math.random() * tied.length)];

  // 2. Pick a random audience persona
  const { data: personas } = await supabaseAdmin
    .from("audience_personas")
    .select("id, name")
    .eq("user_id", userId)
    .limit(50);

  const chosenPersona = personas && personas.length > 0
    ? personas[Math.floor(Math.random() * personas.length)]
    : null;

  // 3. Generate via unified script generator
  const result = await generateUnifiedScript({
    productId: chosenProduct.id,
    productName: chosenProduct.name,
    productBrand: chosenProduct.brand,
    productCategory: chosenProduct.category,
    userId,
    audiencePersonaId: chosenPersona?.id,
    callerContext: "other",
  });

  // 4a. Save to script_of_the_day table
  const fullScript = {
    hook: result.hook,
    setup: result.setup,
    body: result.body,
    cta: result.cta,
    on_screen_text: result.onScreenText,
    filming_notes: result.filmingNotes,
    persona: result.persona,
    sales_approach: result.salesApproach,
    estimated_length: result.estimatedLength,
  };

  await supabaseAdmin.from("script_of_the_day").insert({
    user_id: userId,
    script_date: today,
    product_id: chosenProduct.id,
    product_name: chosenProduct.name,
    product_brand: chosenProduct.brand || null,
    product_category: chosenProduct.category || null,
    hook: result.hook,
    full_script: fullScript,
    filming_tips: JSON.stringify({
      props: [chosenProduct.name],
      lighting: "Natural light preferred",
      duration_estimate: result.estimatedLength,
      key_delivery_notes: result.editorNotes,
    }),
    selection_reasons: JSON.stringify([
      `Most-used product (${countMap[chosenProduct.id] || 0} scripts)`,
      chosenPersona ? `Persona: ${chosenPersona.name}` : "Default persona",
    ]),
    compound_score: 0,
    status: "generated",
  });

  // 4b. Save to saved_skits for Content Studio access
  await supabaseAdmin.from("saved_skits").insert({
    user_id: userId,
    title: `Script of the Day — ${chosenProduct.name}`,
    skit_data: {
      hook_line: result.hook,
      beats: [
        { label: "setup", dialogue: result.setup },
        { label: "body", dialogue: result.body },
      ],
      cta_line: result.cta,
      cta_overlay: result.onScreenText.join(" | "),
      spoken_script: result.spokenScript,
      caption: result.caption,
      hashtags: result.hashtags,
    },
    generation_config: { source: "script_of_the_day", date: today, persona: result.persona },
    product_id: chosenProduct.id,
    product_name: chosenProduct.name,
    product_brand: chosenProduct.brand || null,
    status: "draft",
  });

  // 5. Send email if user has it enabled
  await sendSOTDEmail(userId, chosenProduct.name, result.persona, result.hook);
}

async function sendSOTDEmail(userId: string, productName: string, persona: string, hook: string) {
  try {
    // Check if user has SOTD email enabled
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("settings, email")
      .eq("id", userId)
      .single();

    if (!profile?.email) return;

    const settings = profile.settings as Record<string, unknown> | null;
    const notifications = settings?.notifications as Record<string, unknown> | undefined;
    if (notifications?.script_of_the_day_email === false) return;

    await sendEmail({
      to: profile.email,
      subject: `Your daily script is ready! Today's angle: ${persona} for ${productName}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
          <h2 style="color: #f5f5f5; font-size: 18px; margin: 0 0 8px;">📝 Script of the Day</h2>
          <p style="color: #a1a1aa; font-size: 14px; margin: 0 0 16px;">
            Today&rsquo;s angle: <strong style="color: #a78bfa;">${persona}</strong> for <strong style="color: #fff;">${productName}</strong>
          </p>
          <div style="background: #18181b; border: 1px solid #3f3f46; border-radius: 12px; padding: 16px; margin-bottom: 16px;">
            <p style="color: #fbbf24; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 8px;">Hook</p>
            <p style="color: #fff; font-size: 15px; font-weight: 600; margin: 0; line-height: 1.4;">&ldquo;${hook}&rdquo;</p>
          </div>
          <a href="${process.env.NEXT_PUBLIC_APP_URL || "https://flashflowai.com"}/admin/dashboard"
             style="display: inline-block; background: #14b8a6; color: #fff; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-size: 14px; font-weight: 600;">
            View Full Script
          </a>
          <p style="color: #71717a; font-size: 11px; margin-top: 24px;">
            You can disable this email in Settings &gt; Notifications.
          </p>
        </div>
      `,
      tags: [{ name: "type", value: "script_of_the_day" }],
    });
  } catch (err) {
    console.warn(`[sotd] Email failed for ${userId}:`, err);
  }
}
