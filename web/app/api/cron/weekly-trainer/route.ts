/**
 * Cron: Weekly Trainer — Every Monday 9 AM PST (5 PM UTC)
 *
 * Pulls the last 7 days of ff_generations + ff_outcomes, computes
 * winners, losers, regen/reject rates, template performance, and
 * posts a recommendations doc to Mission Control.
 *
 * Schedule: 0 17 * * 1 (vercel.json)
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { postMCDoc } from "@/lib/flashflow/mission-control";

export const runtime = "nodejs";
export const maxDuration = 120;

interface GenRow {
  id: string;
  template_id: string | null;
  prompt_version: string | null;
  status: string;
  output_text: string | null;
  created_at: string;
}

interface OutcomeRow {
  generation_id: string;
  rating: number | null;
  is_winner: boolean;
  is_rejected: boolean;
  is_regenerated: boolean;
  views: number;
  orders: number;
  revenue_cents: number;
  winner_score: number | null;
  feedback_text: string | null;
  tags: string[];
}

export async function GET(request: Request) {
  // Cron auth
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();
    const end = now.toISOString().slice(0, 10);
    const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    const startDate = `${start}T00:00:00Z`;
    const endDate = `${end}T23:59:59Z`;

    // ── Fetch generations ─────────────────────────────────────

    const { data: generations, error: genErr } = await supabaseAdmin
      .from("ff_generations")
      .select("id, template_id, prompt_version, status, output_text, created_at")
      .gte("created_at", startDate)
      .lte("created_at", endDate)
      .order("created_at", { ascending: false });

    if (genErr) {
      console.error("[cron/weekly-trainer] Generations query error:", genErr);
      return NextResponse.json({ error: genErr.message }, { status: 500 });
    }

    const gens = (generations ?? []) as GenRow[];
    const genIds = gens.map((g) => g.id);

    // ── Fetch outcomes ────────────────────────────────────────

    let outcomes: OutcomeRow[] = [];
    if (genIds.length > 0) {
      const { data: oc, error: ocErr } = await supabaseAdmin
        .from("ff_outcomes")
        .select(
          "generation_id, rating, is_winner, is_rejected, is_regenerated, views, orders, revenue_cents, winner_score, feedback_text, tags"
        )
        .in("generation_id", genIds);

      if (ocErr) {
        console.error("[cron/weekly-trainer] Outcomes query error:", ocErr);
        return NextResponse.json({ error: ocErr.message }, { status: 500 });
      }
      outcomes = (oc ?? []) as OutcomeRow[];
    }

    // ── Compute aggregates ────────────────────────────────────

    const totalGen = gens.length;
    const rejectedCount = outcomes.filter((o) => o.is_rejected).length;
    const regenCount = outcomes.filter((o) => o.is_regenerated).length;
    const winnersCount = outcomes.filter((o) => o.is_winner).length;

    const ratings = outcomes
      .map((o) => o.rating)
      .filter((r): r is number => r !== null);
    const avgRating =
      ratings.length > 0
        ? ratings.reduce((a, b) => a + b, 0) / ratings.length
        : null;

    const regenRate = totalGen > 0 ? regenCount / totalGen : 0;
    const rejectRate = totalGen > 0 ? rejectedCount / totalGen : 0;

    function score(o: OutcomeRow): number {
      return o.winner_score ?? ((o.rating ?? 0) + o.views / 1000);
    }

    const top10 = [...outcomes]
      .filter((o) => o.is_winner || (o.rating !== null && o.rating >= 4))
      .sort((a, b) => score(b) - score(a))
      .slice(0, 10);

    const bottom10 = [...outcomes]
      .filter((o) => o.is_rejected || (o.rating !== null && o.rating <= 2))
      .sort((a, b) => score(a) - score(b))
      .slice(0, 10);

    // Template breakdown
    const templateMap = new Map<
      string,
      {
        total: number;
        winners: number;
        rejected: number;
        prompt_versions: Set<string>;
      }
    >();

    for (const gen of gens) {
      const tid = gen.template_id ?? "unknown";
      let entry = templateMap.get(tid);
      if (!entry) {
        entry = {
          total: 0,
          winners: 0,
          rejected: 0,
          prompt_versions: new Set(),
        };
        templateMap.set(tid, entry);
      }
      entry.total++;
      if (gen.prompt_version) entry.prompt_versions.add(gen.prompt_version);
      const oc = outcomes.find((o) => o.generation_id === gen.id);
      if (oc?.is_winner) entry.winners++;
      if (oc?.is_rejected) entry.rejected++;
    }

    // Best / worst template
    let bestTemplate = "";
    let bestWinRate = -1;
    let worstTemplate = "";
    let highestRejectRate = -1;

    for (const [tid, stats] of templateMap) {
      if (stats.total < 2) continue;
      const winRate = stats.winners / stats.total;
      const rejRate = stats.rejected / stats.total;
      if (winRate > bestWinRate) {
        bestWinRate = winRate;
        bestTemplate = tid;
      }
      if (rejRate > highestRejectRate) {
        highestRejectRate = rejRate;
        worstTemplate = tid;
      }
    }

    // ── Build report ──────────────────────────────────────────

    function genLink(o: OutcomeRow): string {
      const gen = gens.find((g) => g.id === o.generation_id);
      const tmpl = gen?.template_id ?? "?";
      const pv = gen?.prompt_version ?? "?";
      return `\`${o.generation_id.slice(0, 8)}\` (${tmpl} v${pv})`;
    }

    const winnersSection =
      top10.length > 0
        ? top10
            .map(
              (o, i) =>
                `${i + 1}. ${genLink(o)} — score ${score(o).toFixed(1)}, rating ${o.rating ?? "-"}, ${o.views} views, ${o.orders} orders`
            )
            .join("\n")
        : "_No winners this period._";

    const losersSection =
      bottom10.length > 0
        ? bottom10
            .map(
              (o, i) =>
                `${i + 1}. ${genLink(o)} — score ${score(o).toFixed(1)}, rating ${o.rating ?? "-"}, feedback: ${o.feedback_text ?? "none"}`
            )
            .join("\n")
        : "_No losers flagged this period._";

    const templateBreakdown = Array.from(templateMap.entries())
      .sort((a, b) => b[1].total - a[1].total)
      .map(
        ([tid, s]) =>
          `- **${tid}** (versions: ${[...s.prompt_versions].join(", ") || "-"}): ${s.total} gens, ${s.winners} winners, ${s.rejected} rejected`
      )
      .join("\n");

    const recommendations: string[] = [];
    if (regenRate > 0.3) {
      recommendations.push(
        `- High regen rate (${(regenRate * 100).toFixed(1)}%). Review prompts for the most regenerated templates.`
      );
    }
    if (rejectRate > 0.2) {
      recommendations.push(
        `- High reject rate (${(rejectRate * 100).toFixed(1)}%). Investigate common rejection feedback tags.`
      );
    }
    if (bestTemplate) {
      const bs = templateMap.get(bestTemplate)!;
      recommendations.push(
        `- Best performing template: **${bestTemplate}** (${((bs.winners / bs.total) * 100).toFixed(0)}% win rate). Consider using its prompt patterns in other templates.`
      );
    }
    if (worstTemplate && worstTemplate !== bestTemplate) {
      const ws = templateMap.get(worstTemplate)!;
      recommendations.push(
        `- Worst performing template: **${worstTemplate}** (${((ws.rejected / ws.total) * 100).toFixed(0)}% reject rate). Prompt revision recommended.`
      );
    }
    if (avgRating !== null && avgRating < 3.0) {
      recommendations.push(
        `- Average rating ${avgRating.toFixed(2)} is below 3.0. General prompt quality improvement needed.`
      );
    }
    if (recommendations.length === 0) {
      recommendations.push("- No urgent action items. Continue monitoring.");
    }

    const content = `# FlashFlow Weekly Trainer — ${end}

## Period
${start} to ${end}

## Summary
| Metric | Value |
|--------|-------|
| Total generations | ${totalGen} |
| Winners | ${winnersCount} |
| Rejected | ${rejectedCount} |
| Regenerated | ${regenCount} |
| Regen rate | ${(regenRate * 100).toFixed(1)}% |
| Reject rate | ${(rejectRate * 100).toFixed(1)}% |
| Avg rating | ${avgRating !== null ? avgRating.toFixed(2) : "N/A"} |

## Top 10 Winners
${winnersSection}

## Bottom 10 Losers
${losersSection}

## Template Breakdown
${templateBreakdown || "_No templates tracked yet._"}

## Recommended Actions
${recommendations.join("\n")}

---
_Auto-generated by FlashFlow Weekly Trainer cron on ${now.toISOString()}_
`;

    // ── Post to Mission Control ───────────────────────────────

    const mcResult = await postMCDoc({
      title: `FlashFlow Weekly Trainer — ${end}`,
      content,
      category: "plans",
      lane: "FlashFlow",
      tags: ["weekly-trainer", "prompt-optimization"],
    });

    console.log(
      `[cron/weekly-trainer] Done. ${totalGen} gens, ${winnersCount} winners, MC posted: ${mcResult.ok}`
    );

    return NextResponse.json({
      ok: true,
      total_generations: totalGen,
      winners_count: winnersCount,
      rejected_count: rejectedCount,
      mc_posted: mcResult.ok,
      mc_doc_id: mcResult.id ?? null,
      timestamp: now.toISOString(),
    });
  } catch (err) {
    console.error("[cron/weekly-trainer] Fatal error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
