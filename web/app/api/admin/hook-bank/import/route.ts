import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { createApiErrorResponse, generateCorrelationId } from "@/lib/api-errors";

export const runtime = "nodejs";

const MC_BASE_URL = process.env.MISSION_CONTROL_BASE_URL || "http://127.0.0.1:3100";
const MC_AGENT_TOKEN = process.env.MISSION_CONTROL_AGENT_TOKEN || "mc-agent-token-2026";

// Categories to skip when parsing (metadata sections, not hook categories)
const SKIP_CATEGORIES = new Set(["QA Notes", "Hook Bank Statistics"]);

interface ParsedHook {
  category: string;
  hook_text: string;
  angle: string;
  status: string;
  source_doc_id: string;
  lane: string;
  tags: string[];
}

/**
 * Parse MC hook bank markdown into structured hooks.
 * Expected format:
 *   ## Category Name
 *   - hook text one
 *   - hook text two
 */
function parseHookBankMarkdown(content: string, docId: string): ParsedHook[] {
  const hooks: ParsedHook[] = [];
  let currentCategory: string | null = null;
  let pastDivider = false;
  let hitSecondDivider = false;

  const lines = content.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();

    // Track --- dividers: content is between first and second ---
    if (trimmed === "---") {
      if (!pastDivider) {
        pastDivider = true;
        continue;
      } else {
        // Second divider means we've hit metadata at the end
        hitSecondDivider = true;
        break;
      }
    }

    // Skip lines before the first divider (title/header area)
    if (!pastDivider) continue;

    // Stop if we hit the second divider
    if (hitSecondDivider) break;

    // Category header: ## Category Name
    const categoryMatch = trimmed.match(/^## (.+)$/);
    if (categoryMatch) {
      const cat = categoryMatch[1].trim();
      if (SKIP_CATEGORIES.has(cat)) {
        currentCategory = null;
      } else {
        currentCategory = cat;
      }
      continue;
    }

    // Hook line: - hook text
    if (currentCategory && trimmed.startsWith("- ")) {
      const hookText = trimmed.slice(2).trim();
      if (hookText) {
        hooks.push({
          category: currentCategory,
          hook_text: hookText,
          angle: currentCategory.toLowerCase().replace(/[/\s]+/g, "-"),
          status: "active",
          source_doc_id: docId,
          lane: "FlashFlow",
          tags: ["hooks", "hook-bank", "v1"],
        });
      }
    }
  }

  return hooks;
}

/**
 * POST /api/admin/hook-bank/import
 * Import hooks from a Mission Control document.
 * Body: { doc_id: string }
 */
export async function POST(request: Request) {
  const correlationId = request.headers.get("x-correlation-id") || generateCorrelationId();

  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse("UNAUTHORIZED", "Authentication required", 401, correlationId);
  }
  if (!authContext.isAdmin) {
    return createApiErrorResponse("FORBIDDEN", "Admin access required", 403, correlationId);
  }

  try {
    const body = await request.json();
    const docId = body.doc_id;

    if (!docId || typeof docId !== "string") {
      return createApiErrorResponse("BAD_REQUEST", "doc_id is required", 400, correlationId);
    }

    // Fetch document from Mission Control
    const mcUrl = `${MC_BASE_URL}/api/mission-control/documents/${docId}`;
    const mcRes = await fetch(mcUrl, {
      headers: { Authorization: `Bearer ${MC_AGENT_TOKEN}` },
    });

    if (!mcRes.ok) {
      return createApiErrorResponse(
        "NOT_FOUND",
        `Mission Control document not found (status ${mcRes.status})`,
        404,
        correlationId
      );
    }

    const mcDoc = await mcRes.json();
    const content = mcDoc.content || mcDoc.content_md || "";

    if (!content) {
      return createApiErrorResponse("BAD_REQUEST", "Document has no content", 400, correlationId);
    }

    // Parse hooks
    const hooks = parseHookBankMarkdown(content, docId);

    if (hooks.length !== 50) {
      return NextResponse.json(
        {
          ok: false,
          error: `Expected 50 hooks but parsed ${hooks.length}. Check the document format.`,
          data: {
            parsed_count: hooks.length,
            categories: [...new Set(hooks.map((h) => h.category))],
          },
          correlation_id: correlationId,
        },
        { status: 400 }
      );
    }

    // Clear existing hooks from this source doc, then insert fresh
    await supabaseAdmin
      .from("hook_bank_items")
      .delete()
      .eq("source_doc_id", docId);

    const { data, error } = await supabaseAdmin
      .from("hook_bank_items")
      .insert(hooks)
      .select();

    if (error) {
      console.error("POST /api/admin/hook-bank/import error:", error);
      return createApiErrorResponse("DB_ERROR", "Failed to insert hooks", 500, correlationId);
    }

    return NextResponse.json({
      ok: true,
      data: {
        imported: data?.length || 0,
        categories: [...new Set(hooks.map((h) => h.category))],
        source_doc_id: docId,
      },
      correlation_id: correlationId,
    });
  } catch (err) {
    console.error("POST /api/admin/hook-bank/import error:", err);
    return createApiErrorResponse("DB_ERROR", "Internal server error", 500, correlationId);
  }
}
