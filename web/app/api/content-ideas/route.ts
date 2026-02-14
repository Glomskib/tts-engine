import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import { validateApiAccess } from '@/lib/auth/validateApiAccess';

export const runtime = 'nodejs';

/**
 * GET /api/content-ideas
 *
 * Returns trending hooks, top personas, and smart suggestions
 * by querying winners_bank, saved_skits, products, and audience_personas.
 */
export async function GET(request: Request) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

  try {
    const auth = await validateApiAccess(request);
    if (!auth) {
      return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
    }
    const userId = auth.userId;

    const fiveDaysAgo = new Date();
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);

    // Parallel queries — all tables have user_id or created_by
    const [winnersRes, scriptsRes, productsRes, personaCountRes] = await Promise.all([
      supabaseAdmin
        .from('winners_bank')
        .select('id, hook, hook_type, performance_score, view_count, product_category')
        .eq('user_id', userId)
        .order('performance_score', { ascending: false })
        .limit(20),

      supabaseAdmin
        .from('saved_skits')
        .select('id, generation_config, script_quality_score, ai_score, product_id, product_name, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(200),

      supabaseAdmin
        .from('products')
        .select('id, name')
        .eq('user_id', userId),

      supabaseAdmin
        .from('audience_personas')
        .select('id', { count: 'exact', head: true })
        .eq('created_by', userId)
        .eq('is_system', false),
    ]);

    const winners = winnersRes.data || [];
    const scripts = scriptsRes.data || [];
    const products = productsRes.data || [];
    const customPersonaCount = personaCountRes.count || 0;

    // ── Trending Hooks ──────────────────────────────────────────────
    const trendingHooks = winners
      .filter(w => w.hook)
      .slice(0, 5)
      .map(w => ({
        hookText: w.hook as string,
        hookType: (w.hook_type as string) || categorizeHook(w.hook as string),
        performanceScore: w.performance_score as number | null,
        viewCount: w.view_count as number | null,
        category: w.product_category as string | null,
      }));

    // ── Top Personas (from script quality scores) ───────────────────
    const personaMap = new Map<string, { scores: number[]; count: number }>();

    for (const s of scripts) {
      const config = s.generation_config as Record<string, unknown> | null;
      const personaName = extractPersonaName(config);
      if (!personaName) continue;

      const entry = personaMap.get(personaName) || { scores: [], count: 0 };
      entry.count++;

      const score = extractScore(s.script_quality_score) || extractScore(s.ai_score);
      if (score > 0) entry.scores.push(score);

      personaMap.set(personaName, entry);
    }

    const topPersonas = Array.from(personaMap.entries())
      .filter(([, data]) => data.scores.length > 0)
      .map(([name, data]) => ({
        personaName: name,
        avgScore: Math.round((data.scores.reduce((a, b) => a + b, 0) / data.scores.length) * 10) / 10,
        scriptCount: data.count,
      }))
      .sort((a, b) => b.avgScore - a.avgScore)
      .slice(0, 3);

    // ── Suggestions ─────────────────────────────────────────────────
    const suggestions: Array<{
      type: string;
      title: string;
      message: string;
      action?: { label: string; href: string };
    }> = [];

    // 1. Stale products — no script in 5+ days
    const staleProducts: typeof suggestions = [];
    for (const product of products) {
      const lastScript = scripts.find(s => s.product_id === product.id);
      if (!lastScript || new Date(lastScript.created_at as string) < fiveDaysAgo) {
        const daysAgo = lastScript
          ? Math.floor((Date.now() - new Date(lastScript.created_at as string).getTime()) / 86_400_000)
          : null;

        staleProducts.push({
          type: 'stale_product',
          title: 'Content gap detected',
          message: daysAgo
            ? `You haven't created content for "${product.name}" in ${daysAgo} days`
            : `No scripts created yet for "${product.name}"`,
          action: { label: 'Create now', href: `/admin/content-studio?product=${product.id}` },
        });
      }
    }
    suggestions.push(...staleProducts.slice(0, 3));

    // 2. Hot persona — one persona scores 20%+ higher than average
    if (topPersonas.length >= 2 && topPersonas[0].avgScore > 0) {
      const best = topPersonas[0];
      const avg = topPersonas.reduce((sum, p) => sum + p.avgScore, 0) / topPersonas.length;
      const pctHigher = Math.round(((best.avgScore - avg) / avg) * 100);
      if (pctHigher >= 15) {
        suggestions.push({
          type: 'hot_persona',
          title: 'High-performing persona',
          message: `Your "${best.personaName}" scripts score ${pctHigher}% higher — make more`,
          action: { label: 'Generate', href: '/admin/content-studio' },
        });
      }
    }

    // 3. Need more personas
    if (customPersonaCount < 3) {
      suggestions.push({
        type: 'need_personas',
        title: 'Add more personas',
        message: `You have ${customPersonaCount} custom persona${customPersonaCount !== 1 ? 's' : ''}. Add more for content variety`,
        action: { label: 'Add personas', href: '/admin/audience' },
      });
    }

    // 4. Need more winners
    if (winners.length < 5) {
      suggestions.push({
        type: 'need_winners',
        title: 'Save more winners',
        message: `You have ${winners.length} winner${winners.length !== 1 ? 's' : ''} saved. Save more to improve AI quality`,
        action: { label: 'Winners Bank', href: '/admin/winners' },
      });
    }

    const response = NextResponse.json({
      ok: true,
      correlation_id: correlationId,
      data: {
        trendingHooks,
        topPersonas,
        suggestions,
        stats: {
          totalWinners: winners.length,
          totalPersonas: customPersonaCount,
          totalProducts: products.length,
          totalScripts: scripts.length,
        },
      },
    });
    response.headers.set('x-correlation-id', correlationId);
    return response;
  } catch (err) {
    return createApiErrorResponse('INTERNAL', `Unexpected error: ${(err as Error).message}`, 500, correlationId);
  }
}

/* ── Helpers ────────────────────────────────────────────────────────── */

function categorizeHook(hook: string): string {
  const lower = hook.toLowerCase().trim();
  if (/^(what|how|why|did|have|can|is|are|do|would|could)\b/.test(lower)) return 'question';
  if (/^(i |when i|so i|my )/.test(lower)) return 'story';
  if (/^(stop|tired|sick of|don't|never)/.test(lower)) return 'problem';
  if (/^(this|here'?s|get |try |use )/.test(lower)) return 'direct';
  if (/\d|%|\$|secret|nobody/.test(lower)) return 'shock';
  return 'statement';
}

function extractPersonaName(config: Record<string, unknown> | null): string | null {
  if (!config) return null;
  const name = config.persona_name || config.persona || config.audience_persona || config.personaName;
  return typeof name === 'string' && name.length > 0 ? name : null;
}

function extractScore(scoreData: unknown): number {
  if (!scoreData || typeof scoreData !== 'object') return 0;
  const obj = scoreData as Record<string, unknown>;

  // script_quality_score: { totalScore: number }
  if (typeof obj.totalScore === 'number') return obj.totalScore;
  // ai_score: { overall: number }
  if (typeof obj.overall === 'number') return obj.overall;

  // Average any numeric values as fallback
  const nums = Object.values(obj).filter((v): v is number => typeof v === 'number');
  return nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
}
