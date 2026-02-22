/**
 * Support Intent Router
 *
 * After the AI classifies a user message, this module handles side effects:
 *   - bug_report → creates MC task doc with support/bug tags
 *   - feature_request → inserts row into user_feedback
 *   - how_to / general → no side effects (response text handles it)
 *
 * Also updates support_threads.tags and .intent with the detected intent.
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { postMCDoc } from "@/lib/flashflow/mission-control";

export type SupportIntent = "how_to" | "bug_report" | "feature_request" | "general";

export interface IntentResult {
  intent: SupportIntent;
  response: string;
  doc_links?: string[];
  bug_summary?: string;
  feature_summary?: string;
}

/**
 * Route the classified intent — fire-and-forget side effects.
 * Errors are logged but never thrown.
 */
export async function classifyAndRoute(
  threadId: string,
  result: IntentResult,
  userEmail: string | null,
): Promise<void> {
  const { intent, bug_summary, feature_summary } = result;

  // Update thread with intent + tags
  const existingThread = await supabaseAdmin
    .from("support_threads")
    .select("tags")
    .eq("id", threadId)
    .single();

  const currentTags: string[] = existingThread.data?.tags ?? [];
  const newTags = Array.from(new Set([...currentTags, intent]));

  await supabaseAdmin
    .from("support_threads")
    .update({ intent, tags: newTags })
    .eq("id", threadId);

  // Intent-specific side effects
  if (intent === "bug_report" && bug_summary) {
    postMCDoc({
      title: `[Bug] ${bug_summary}`,
      content: `# Bug Report from Support Chat\n\n- **Thread ID:** ${threadId}\n- **Reporter:** ${userEmail || "anonymous"}\n- **Summary:** ${bug_summary}\n- **Source:** live_chat (auto-classified)\n- **Created:** ${new Date().toISOString()}`,
      category: "reference",
      lane: "FlashFlow",
      tags: ["support", "bug"],
    }).catch((err) => {
      console.error("[support-intent-router] MC bug post failed:", err);
    });
  }

  if (intent === "feature_request" && feature_summary) {
    // Insert into user_feedback (generation_id FK on ff_events prevents using it)
    const { error } = await supabaseAdmin.from("user_feedback").insert({
      email: userEmail,
      type: "feature",
      title: feature_summary,
      description: `Auto-classified from support chat thread ${threadId}`,
      status: "new",
      priority: "normal",
    });

    if (error) {
      console.error("[support-intent-router] user_feedback insert failed:", error.message);
    }
  }
}
