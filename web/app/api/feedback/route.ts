import { NextRequest, NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";
import { sendTelegramNotification } from "@/lib/telegram";

export const runtime = "nodejs";

const VALID_TYPES = ["bug", "feature", "improvement", "support", "other"] as const;
const MAX_SCREENSHOT_SIZE = 5 * 1024 * 1024; // 5MB

function detectDevice(ua: string): string {
  if (/mobile|android|iphone|ipad/i.test(ua)) return "Mobile";
  if (/tablet/i.test(ua)) return "Tablet";
  return "Desktop";
}

// ---------------------------------------------------------------------------
// GET — Fetch feedback (user's own, or all for admin)
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  const correlationId = generateCorrelationId();
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  const userId = authContext.user.id;
  const isAdmin = request.nextUrl.searchParams.get("admin") === "true";

  if (isAdmin) {
    // Check admin role
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .single();

    if (profile?.role !== "admin") {
      return createApiErrorResponse("FORBIDDEN", "Admin access required", 403, correlationId);
    }

    // Fetch all feedback for admin
    const statusFilter = request.nextUrl.searchParams.get("status");
    const typeFilter = request.nextUrl.searchParams.get("type");

    let query = supabaseAdmin
      .from("user_feedback")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);

    if (statusFilter && statusFilter !== "all") {
      query = query.eq("status", statusFilter);
    }
    if (typeFilter && typeFilter !== "all") {
      query = query.eq("type", typeFilter);
    }

    const { data, error } = await query;
    if (error) {
      return createApiErrorResponse("DB_ERROR", error.message, 500, correlationId);
    }

    // Stats
    const { data: allFeedback } = await supabaseAdmin
      .from("user_feedback")
      .select("status, type, page_url");

    const stats = {
      total: allFeedback?.length || 0,
      new: allFeedback?.filter((f) => f.status === "new").length || 0,
      bugs: allFeedback?.filter((f) => f.type === "bug").length || 0,
      features: allFeedback?.filter((f) => f.type === "feature").length || 0,
      improvements: allFeedback?.filter((f) => f.type === "improvement").length || 0,
      topPages: getTopPages(allFeedback || []),
    };

    return NextResponse.json({ ok: true, data: data || [], stats, correlation_id: correlationId });
  }

  // Regular user — fetch own feedback
  const { data, error } = await supabaseAdmin
    .from("user_feedback")
    .select("id, type, title, status, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    return createApiErrorResponse("DB_ERROR", error.message, 500, correlationId);
  }

  return NextResponse.json({ ok: true, data: data || [], correlation_id: correlationId });
}

// ---------------------------------------------------------------------------
// POST — Submit feedback or update status (admin)
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  const correlationId = generateCorrelationId();
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }

  const userId = authContext.user.id;

  try {
    const contentType = request.headers.get("content-type") || "";

    // Handle admin status update
    if (contentType.includes("application/json")) {
      const body = await request.json();

      // Admin update action
      if (body.action === "update") {
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("role")
          .eq("id", userId)
          .single();

        if (profile?.role !== "admin") {
          return createApiErrorResponse("FORBIDDEN", "Admin access required", 403, correlationId);
        }

        const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (body.status) updates.status = body.status;
        if (body.admin_notes !== undefined) updates.admin_notes = body.admin_notes;

        const { error } = await supabaseAdmin
          .from("user_feedback")
          .update(updates)
          .eq("id", body.id);

        if (error) {
          return createApiErrorResponse("DB_ERROR", error.message, 500, correlationId);
        }

        return NextResponse.json({ ok: true, correlation_id: correlationId });
      }
    }

    // Handle new feedback submission (multipart form data)
    const formData = await request.formData();
    const type = formData.get("type") as string;
    const title = formData.get("title") as string;
    const description = formData.get("description") as string;
    const pageUrl = formData.get("page_url") as string | null;
    const userAgent = formData.get("user_agent") as string | null;
    const planId = formData.get("plan_id") as string | null;
    const screenshot = formData.get("screenshot") as File | null;

    // Validate
    if (!type || !VALID_TYPES.includes(type as typeof VALID_TYPES[number])) {
      return createApiErrorResponse("VALIDATION_ERROR", "Invalid feedback type", 400, correlationId);
    }
    if (!title || title.length < 3 || title.length > 200) {
      return createApiErrorResponse("VALIDATION_ERROR", "Title must be 3-200 characters", 400, correlationId);
    }
    if (!description || description.length < 10 || description.length > 5000) {
      return createApiErrorResponse("VALIDATION_ERROR", "Description must be 10-5000 characters", 400, correlationId);
    }

    // Upload screenshot if provided
    let screenshotUrl: string | null = null;
    if (screenshot && screenshot.size > 0) {
      if (screenshot.size > MAX_SCREENSHOT_SIZE) {
        return createApiErrorResponse("VALIDATION_ERROR", "Screenshot must be under 5MB", 400, correlationId);
      }

      const ext = screenshot.name.split(".").pop() || "png";
      const path = `feedback/${userId}/${Date.now()}.${ext}`;
      const buffer = Buffer.from(await screenshot.arrayBuffer());

      const { error: uploadError } = await supabaseAdmin.storage
        .from("feedback-screenshots")
        .upload(path, buffer, {
          contentType: screenshot.type || "image/png",
          upsert: false,
        });

      if (!uploadError) {
        const { data: urlData } = supabaseAdmin.storage
          .from("feedback-screenshots")
          .getPublicUrl(path);
        screenshotUrl = urlData.publicUrl;
      }
    }

    // Insert feedback
    const record = {
      user_id: userId,
      email: authContext.user.email || null,
      type,
      title,
      description,
      page_url: pageUrl || null,
      screenshot_url: screenshotUrl,
      priority: "normal",
      status: "new",
      plan_id: planId || null,
      user_agent: userAgent || null,
    };

    const { data: saved, error: saveError } = await supabaseAdmin
      .from("user_feedback")
      .insert(record)
      .select("id")
      .single();

    if (saveError) {
      return createApiErrorResponse("DB_ERROR", saveError.message, 500, correlationId);
    }

    // Send Telegram notification immediately
    const typeEmoji = { bug: "\u{1F41B}", feature: "\u{1F4A1}", improvement: "\u2728", other: "\u{1F4AC}" }[type] || "\u{1F4AC}";
    const device = userAgent ? detectDevice(userAgent) : "Unknown";
    const descPreview = description.length > 200 ? description.slice(0, 200) + "..." : description;
    const page = pageUrl ? pageUrl.replace(/https?:\/\/[^/]+/, "") : "Unknown";

    sendTelegramNotification(
      `${typeEmoji} <b>New ${type}</b> from ${authContext.user.email || "anonymous"} (${planId || "free"})\n` +
      `<b>Title:</b> ${escapeHtml(title)}\n` +
      `<b>Page:</b> ${escapeHtml(page)}\n` +
      `<b>Description:</b> ${escapeHtml(descPreview)}\n` +
      `<b>Device:</b> ${device}` +
      (screenshotUrl ? `\n<b>Screenshot:</b> ${screenshotUrl}` : "")
    );

    return NextResponse.json({
      ok: true,
      id: saved.id,
      message: "Feedback submitted successfully",
      correlation_id: correlationId,
    });
  } catch (err) {
    console.error("[feedback] submission error:", err);
    return createApiErrorResponse(
      "INTERNAL",
      err instanceof Error ? err.message : "Unknown error",
      500,
      correlationId,
    );
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function getTopPages(feedback: { page_url: string | null }[]): { page: string; count: number }[] {
  const counts: Record<string, number> = {};
  for (const f of feedback) {
    if (f.page_url) {
      const page = f.page_url.replace(/https?:\/\/[^/]+/, "");
      counts[page] = (counts[page] || 0) + 1;
    }
  }
  return Object.entries(counts)
    .map(([page, count]) => ({ page, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
}
