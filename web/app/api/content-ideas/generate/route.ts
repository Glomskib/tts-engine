import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { validateApiAccess } from '@/lib/auth/validateApiAccess';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * POST /api/content-ideas/generate
 *
 * Generates 10 personalized AI content ideas by pulling from:
 * winners_bank, creator_dna, brands, products, tiktok_videos, brand_briefs
 */
export async function POST(request: Request) {
  try {
    const auth = await validateApiAccess(request);
    if (!auth) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    const userId = auth.userId;

    const body = await request.json().catch(() => ({}));
    const filterBrand: string | undefined = body.brand;
    const filterType: string | undefined = body.content_type;
    const starterPrompt: string | undefined = body.starter_prompt;

    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicKey) {
      return NextResponse.json({ error: 'AI service not configured' }, { status: 500 });
    }

    // Parallel data fetches — defensive queries for tables that may not exist
    const [
      brandsRes,
      productsRes,
      winnersRes,
      dnaRes,
      videosRes,
      briefsRes,
    ] = await Promise.all([
      supabaseAdmin
        .from('brands')
        .select('id, name, target_audience, tone_of_voice')
        .eq('user_id', userId)
        .eq('is_active', true),

      supabaseAdmin
        .from('products')
        .select('id, name, brand, brand_id, category, description, pain_points, rotation_score, last_content_at, content_count_7d')
        .eq('user_id', userId),

      supabaseAdmin
        .from('winners_bank')
        .select('hook, hook_type, content_format, performance_score, view_count, product_category')
        .eq('user_id', userId)
        .order('performance_score', { ascending: false })
        .limit(15),

      supabaseAdmin
          .from('creator_dna')
          .select('hook_patterns, format_patterns, winning_formula, strengths, weaknesses')
          .eq('user_id', userId)
          .maybeSingle()
          .then(r => r, () => ({ data: null as any, error: null })),

      supabaseAdmin
          .from('tiktok_videos')
          .select('title, view_count, like_count, create_time, content_grade, matched_brand, matched_product')
          .eq('user_id', userId)
          .order('create_time', { ascending: false })
          .limit(20)
          .then(r => r, () => ({ data: null as any, error: null })),

      supabaseAdmin
          .from('brand_briefs')
          .select('title, brand_id, brief_type, campaign_start, campaign_end, focus_product, required_hashtags, min_videos, status')
          .eq('user_id', userId)
          .in('status', ['ready', 'applied'])
          .then(r => r, () => ({ data: null as any, error: null })),
    ]);

    const brands = brandsRes.data || [];
    const products = productsRes.data || [];
    const winners = winnersRes.data || [];
    const dna = dnaRes.data;
    const recentVideos = videosRes.data || [];
    const briefs = briefsRes.data || [];

    // Build context for Claude
    const brandList = brands.map((b: any) => `${b.name}${b.target_audience ? ` (audience: ${b.target_audience})` : ''}`).join(', ') || 'None configured';

    const productList = products.map((p: any) => {
      const parts = [p.name];
      if (p.brand) parts.push(`brand: ${p.brand}`);
      if (p.category) parts.push(`cat: ${p.category}`);
      if (p.rotation_score != null && p.rotation_score < 30) parts.push('NEEDS CONTENT');
      if (p.content_count_7d === 0) parts.push('no content this week');
      return parts.join(' | ');
    }).join('\n  - ') || 'None';

    const topHookTypes = winners.length > 0
      ? [...new Set(winners.map((w: any) => w.hook_type).filter(Boolean))].slice(0, 5).join(', ')
      : 'Unknown — no winners saved yet';

    const topFormats = winners.length > 0
      ? [...new Set(winners.map((w: any) => w.content_format).filter(Boolean))].slice(0, 5).join(', ')
      : 'Unknown';

    const topHookExamples = winners
      .filter((w: any) => w.hook)
      .slice(0, 5)
      .map((w: any) => `"${w.hook}" (${w.hook_type || 'unknown'}, ${w.view_count ? `${(w.view_count / 1000).toFixed(1)}K views` : 'no view data'})`)
      .join('\n  - ') || 'None';

    const activeCampaigns = briefs.length > 0
      ? briefs.map((b: any) => {
          const parts = [b.title];
          if (b.campaign_end) parts.push(`deadline: ${b.campaign_end}`);
          if (b.focus_product) parts.push(`product: ${b.focus_product}`);
          if (b.min_videos) parts.push(`${b.min_videos} videos required`);
          if (b.required_hashtags?.length) parts.push(`hashtags: ${b.required_hashtags.join(', ')}`);
          return parts.join(' | ');
        }).join('\n  - ')
      : 'None';

    const videosPerWeek = recentVideos.length > 0
      ? (() => {
          const times = recentVideos.map((v: any) => v.create_time).filter(Boolean);
          if (times.length < 2) return 'Unknown';
          const newest = Math.max(...times);
          const oldest = Math.min(...times);
          const weeks = Math.max(1, (newest - oldest) / (7 * 24 * 3600));
          return `~${Math.round(times.length / weeks)}/week`;
        })()
      : 'Unknown';

    const dnaContext = dna
      ? `\nCREATOR DNA INSIGHTS:\n- Winning formula: ${dna.winning_formula || 'Not analyzed yet'}\n- Strengths: ${JSON.stringify(dna.strengths) || '[]'}\n- Weaknesses: ${JSON.stringify(dna.weaknesses) || '[]'}\n- Hook patterns: ${JSON.stringify(dna.hook_patterns) || '{}'}\n- Format patterns: ${JSON.stringify(dna.format_patterns) || '{}'}`
      : '';

    const filterContext = [
      filterBrand ? `Focus on brand: ${filterBrand}` : '',
      filterType ? `Focus on content type: ${filterType}` : '',
      starterPrompt ? `Creator's specific request: "${starterPrompt}"` : '',
    ].filter(Boolean).join('\n');

    const prompt = `Generate 10 content ideas for this TikTok creator. Each idea should be specific, actionable, and based on what's actually working for them.

CREATOR DATA:
- Brands: ${brandList}
- Products:
  - ${productList}
- Top performing hook types: ${topHookTypes}
- Best performing hooks:
  - ${topHookExamples}
- Best content formats: ${topFormats}
- Active campaigns/briefs:
  - ${activeCampaigns}
- Recent posting frequency: ${videosPerWeek}
${dnaContext}
${filterContext ? `\nFILTERS:\n${filterContext}` : ''}

For each idea return a JSON object. Return ONLY valid JSON, no markdown:
{
  "ideas": [
    {
      "title": "Specific video title/angle",
      "hook": "The exact opening line to say",
      "content_type": "UGC testimonial | educational | skit | storytime | before-after | GRWM | unboxing | reaction | comparison | day-in-my-life",
      "format_notes": "Brief filming instructions (e.g., 'Film in bathroom mirror, show before/after')",
      "target_product": "Product name from their list (or null)",
      "target_brand": "Brand name (or null)",
      "why_it_works": "1-2 sentence explanation referencing their data",
      "effort": "quick | medium | production",
      "priority": 1-10,
      "estimated_duration": "15s | 30s | 60s",
      "hashtags": ["#suggested", "#tags"],
      "on_screen_text": "Suggested text overlay"
    }
  ]
}

Prioritize:
1. Ideas for products with active retainers/campaigns (deadlines matter)
2. Products marked NEEDS CONTENT or with no content this week
3. Hook types that historically perform best for this creator
4. Content gaps (formats they haven't tried that work well in their niche)
5. Trending angles that fit their style

Return exactly 10 ideas sorted by priority (highest first).`;

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250514',
        max_tokens: 4000,
        temperature: 0.8,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(45000),
    });

    if (!claudeRes.ok) {
      const errText = await claudeRes.text().catch(() => 'Unknown error');
      console.error('[content-ideas/generate] Claude API error:', claudeRes.status, errText);
      return NextResponse.json({ error: 'AI generation failed' }, { status: 502 });
    }

    const claudeData = await claudeRes.json();
    const text = claudeData.content?.[0]?.text || '';

    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[content-ideas/generate] No JSON found in Claude response');
      return NextResponse.json({ error: 'AI returned invalid format' }, { status: 500 });
    }

    let parsed: { ideas: any[] };
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      console.error('[content-ideas/generate] JSON parse failed');
      return NextResponse.json({ error: 'AI returned invalid JSON' }, { status: 500 });
    }

    if (!Array.isArray(parsed.ideas)) {
      return NextResponse.json({ error: 'AI returned unexpected structure' }, { status: 500 });
    }

    // Normalize and validate each idea
    const ideas = parsed.ideas.slice(0, 10).map((idea: any, i: number) => ({
      id: `idea-${Date.now()}-${i}`,
      title: String(idea.title || `Idea ${i + 1}`),
      hook: String(idea.hook || ''),
      content_type: String(idea.content_type || 'general'),
      format_notes: String(idea.format_notes || ''),
      target_product: idea.target_product || null,
      target_brand: idea.target_brand || null,
      why_it_works: String(idea.why_it_works || ''),
      effort: ['quick', 'medium', 'production'].includes(idea.effort) ? idea.effort : 'medium',
      priority: Math.min(10, Math.max(1, Number(idea.priority) || 5)),
      estimated_duration: String(idea.estimated_duration || '30s'),
      hashtags: Array.isArray(idea.hashtags) ? idea.hashtags.map(String) : [],
      on_screen_text: String(idea.on_screen_text || ''),
    }));

    return NextResponse.json({
      ok: true,
      ideas,
      context: {
        brands_count: brands.length,
        products_count: products.length,
        winners_count: winners.length,
        has_dna: !!dna,
        active_campaigns: briefs.length,
      },
    });
  } catch (err: any) {
    console.error('[content-ideas/generate] Error:', err);
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 });
  }
}
