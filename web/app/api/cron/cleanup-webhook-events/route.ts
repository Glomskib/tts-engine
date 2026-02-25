/**
 * Cron: Cleanup old webhook events
 *
 * Deletes stripe_webhook_events rows older than 30 days to keep the
 * idempotency table lean. Runs weekly via Vercel Cron.
 */

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabaseAdmin
    .from("stripe_webhook_events")
    .delete()
    .lt("processed_at", cutoff)
    .select("event_id");

  if (error) {
    console.error("[cron/cleanup-webhook-events] Delete failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const deleted = data?.length ?? 0;
  console.info(`[cron/cleanup-webhook-events] Deleted ${deleted} events older than 30 days`);

  return NextResponse.json({ deleted });
}
