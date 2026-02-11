import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { NextResponse } from "next/server";
import { getApiAuthContext } from "@/lib/supabase/api-auth";
import { generateCorrelationId, createApiErrorResponse } from "@/lib/api-errors";

export const runtime = "nodejs";

interface ProposedVideo {
  id: string;
  title: string;
  product_name: string | null;
  product_id: string | null;
  account: string;
  account_id: string;
}

interface ProposedDay {
  date: string;
  videos: ProposedVideo[];
}

const MAX_VIDEOS_PER_ACCOUNT_PER_DAY = 3;

/**
 * POST /api/calendar/auto-fill
 *
 * Auto-fill the content calendar with available APPROVED/READY_TO_POST videos.
 *
 * Body:
 *   - days?: number (default 7, max 30) — how many days to fill
 *   - confirm?: boolean (default false) — if true, actually update the videos
 *
 * When confirm is false (default), returns a proposed schedule without saving.
 * When confirm is true, updates videos with scheduled_date and posting_account_id.
 */
export async function POST(request: Request) {
  const correlationId =
    request.headers.get("x-correlation-id") || generateCorrelationId();

  try {
    const authContext = await getApiAuthContext(request);
    if (!authContext.user) {
      return createApiErrorResponse(
        "UNAUTHORIZED",
        "Authentication required",
        401,
        correlationId
      );
    }

    // Parse body
    let body: { days?: number; confirm?: boolean } = {};
    try {
      body = await request.json();
    } catch {
      // defaults are fine
    }

    const days = Math.max(1, Math.min(body.days || 7, 30));
    const confirm = body.confirm === true;

    // ---------------------------------------------------------------
    // 1. Build list of next N days as YYYY-MM-DD strings
    // ---------------------------------------------------------------
    const today = new Date();
    const dateStrings: string[] = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      dateStrings.push(d.toISOString().split("T")[0]);
    }

    // ---------------------------------------------------------------
    // 2. Fetch existing scheduled videos for the date range
    // ---------------------------------------------------------------
    const { data: existingScheduled, error: existingError } = await supabaseAdmin
      .from("videos")
      .select("id, scheduled_date, posting_account_id, product_id")
      .in("scheduled_date", dateStrings)
      .not("scheduled_date", "is", null);

    if (existingError) {
      console.error(
        `[${correlationId}] Error fetching existing schedule:`,
        existingError
      );
      return createApiErrorResponse(
        "DB_ERROR",
        "Failed to fetch existing schedule",
        500,
        correlationId
      );
    }

    // Build a map: date -> array of { account_id, product_id }
    const existingByDate: Record<
      string,
      Array<{ account_id: string | null; product_id: string | null }>
    > = {};
    for (const v of existingScheduled || []) {
      const date = v.scheduled_date as string;
      if (!existingByDate[date]) existingByDate[date] = [];
      existingByDate[date].push({
        account_id: v.posting_account_id,
        product_id: v.product_id,
      });
    }

    // ---------------------------------------------------------------
    // 3. Fetch available videos (APPROVED or READY_TO_POST, unscheduled)
    // ---------------------------------------------------------------
    const { data: availableVideos, error: availableError } = await supabaseAdmin
      .from("videos")
      .select(
        "id, title, product_id, product:product_id(id,name,brand), posting_account_id, created_at"
      )
      .in("recording_status", ["APPROVED", "READY_TO_POST"])
      .is("scheduled_date", null)
      .order("created_at", { ascending: true });

    if (availableError) {
      console.error(
        `[${correlationId}] Error fetching available videos:`,
        availableError
      );
      return createApiErrorResponse(
        "DB_ERROR",
        "Failed to fetch available videos",
        500,
        correlationId
      );
    }

    if (!availableVideos || availableVideos.length === 0) {
      const response = NextResponse.json({
        ok: true,
        data: {
          proposed: [],
          summary: { days_filled: 0, videos_scheduled: 0, accounts_used: 0 },
          confirmed: false,
          message: "No available videos to schedule",
        },
        correlation_id: correlationId,
      });
      response.headers.set("x-correlation-id", correlationId);
      return response;
    }

    // ---------------------------------------------------------------
    // 4. Fetch active posting accounts
    // ---------------------------------------------------------------
    const { data: accounts, error: accountsError } = await supabaseAdmin
      .from("posting_accounts")
      .select("id, display_name, account_code, is_active")
      .eq("is_active", true);

    if (accountsError) {
      console.error(
        `[${correlationId}] Error fetching posting accounts:`,
        accountsError
      );
      return createApiErrorResponse(
        "DB_ERROR",
        "Failed to fetch posting accounts",
        500,
        correlationId
      );
    }

    if (!accounts || accounts.length === 0) {
      return createApiErrorResponse(
        "BAD_REQUEST",
        "No active posting accounts found",
        400,
        correlationId
      );
    }

    // ---------------------------------------------------------------
    // 5. Auto-fill algorithm
    //    Rules:
    //    - Max 3 videos per account per day
    //    - No duplicate product_id on the same day
    //    - Remove assigned videos from pool as they are used
    //    - Round-robin across accounts for even distribution
    // ---------------------------------------------------------------

    // Mutable pool of available videos
    const pool = [...availableVideos];

    // Track assignments: date -> account_id -> count
    const accountDayCounts: Record<string, Record<string, number>> = {};
    // Track products used on each day: date -> Set of product_ids
    const productsOnDay: Record<string, Set<string>> = {};

    // Initialize from existing scheduled data
    for (const date of dateStrings) {
      accountDayCounts[date] = {};
      productsOnDay[date] = new Set();
      for (const existing of existingByDate[date] || []) {
        if (existing.account_id) {
          accountDayCounts[date][existing.account_id] =
            (accountDayCounts[date][existing.account_id] || 0) + 1;
        }
        if (existing.product_id) {
          productsOnDay[date].add(existing.product_id);
        }
      }
    }

    const proposed: ProposedDay[] = [];
    const accountsUsed = new Set<string>();
    let totalScheduled = 0;
    let daysFilled = 0;

    // Updates to apply if confirm=true
    const updates: Array<{
      video_id: string;
      scheduled_date: string;
      posting_account_id: string;
    }> = [];

    for (const date of dateStrings) {
      const dayVideos: ProposedVideo[] = [];
      let accountIndex = 0;
      let consecutiveSkips = 0;

      // Keep trying to fill this day until we run out of pool or all account
      // slots are full
      while (pool.length > 0 && consecutiveSkips <= accounts.length) {
        const account = accounts[accountIndex % accounts.length];
        const accountCount =
          accountDayCounts[date][account.id] || 0;

        // Check account daily limit
        if (accountCount >= MAX_VIDEOS_PER_ACCOUNT_PER_DAY) {
          accountIndex++;
          consecutiveSkips++;
          // If we've tried all accounts and all are full, break
          if (consecutiveSkips > accounts.length) break;
          continue;
        }

        // Find next suitable video from pool for this account/day
        let assignedIdx = -1;
        for (let i = 0; i < pool.length; i++) {
          const video = pool[i];
          const productId = video.product_id;

          // Avoid same product on same day
          if (productId && productsOnDay[date].has(productId)) {
            continue;
          }

          // This video is suitable
          assignedIdx = i;
          break;
        }

        if (assignedIdx === -1) {
          // No suitable video found for this slot, try next account
          accountIndex++;
          consecutiveSkips++;
          if (consecutiveSkips > accounts.length) break;
          continue;
        }

        // Assign the video
        const video = pool.splice(assignedIdx, 1)[0];
        const productData = video.product as any;

        const proposedVideo: ProposedVideo = {
          id: video.id,
          title: video.title || "Untitled",
          product_name: productData?.name || null,
          product_id: video.product_id || null,
          account: account.display_name,
          account_id: account.id,
        };

        dayVideos.push(proposedVideo);
        accountsUsed.add(account.id);
        totalScheduled++;

        // Update tracking
        accountDayCounts[date][account.id] = accountCount + 1;
        if (video.product_id) {
          productsOnDay[date].add(video.product_id);
        }

        updates.push({
          video_id: video.id,
          scheduled_date: date,
          posting_account_id: account.id,
        });

        // Reset skip counter since we successfully assigned
        consecutiveSkips = 0;
        accountIndex++;
      }

      if (dayVideos.length > 0) {
        daysFilled++;
      }

      proposed.push({ date, videos: dayVideos });
    }

    // ---------------------------------------------------------------
    // 6. If confirm=true, update the videos table
    // ---------------------------------------------------------------
    let confirmed = false;
    if (confirm && updates.length > 0) {
      // Batch update each video individually since Supabase doesn't support
      // bulk update with different values per row in a single call
      const updatePromises = updates.map((u) =>
        supabaseAdmin
          .from("videos")
          .update({
            scheduled_date: u.scheduled_date,
            posting_account_id: u.posting_account_id,
          })
          .eq("id", u.video_id)
      );

      const results = await Promise.all(updatePromises);
      const errors = results.filter((r) => r.error);

      if (errors.length > 0) {
        console.error(
          `[${correlationId}] Some updates failed:`,
          errors.map((e) => e.error)
        );
        // Partial success is still reported
      }

      confirmed = true;
    }

    // ---------------------------------------------------------------
    // 7. Build response
    // ---------------------------------------------------------------
    const response = NextResponse.json({
      ok: true,
      data: {
        proposed,
        summary: {
          days_filled: daysFilled,
          videos_scheduled: totalScheduled,
          accounts_used: accountsUsed.size,
        },
        confirmed,
      },
      correlation_id: correlationId,
    });
    response.headers.set("x-correlation-id", correlationId);
    return response;
  } catch (error) {
    console.error(`[${correlationId}] Calendar auto-fill error:`, error);
    return createApiErrorResponse(
      "INTERNAL",
      error instanceof Error ? error.message : "Internal server error",
      500,
      correlationId
    );
  }
}
