import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const auth = await getApiAuthContext(request);
    if (!auth.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { brief_text, brand_id, brief_type, title, source_url } = body;

    if (!brief_text || brief_text.length < 50) {
      return NextResponse.json({ error: 'Brief text must be at least 50 characters' }, { status: 400 });
    }

    // Create brief record with status 'analyzing'
    const { data: brief, error: createErr } = await supabaseAdmin
      .from('brand_briefs')
      .insert({
        user_id: auth.user.id,
        brand_id: brand_id || null,
        title: title || 'Untitled Brief',
        raw_text: brief_text,
        brief_type: brief_type || 'contest',
        source_url: source_url || null,
        status: 'analyzing',
      })
      .select('id')
      .single();

    if (createErr || !brief) {
      console.error('[brief-analyze] Create error:', createErr);
      return NextResponse.json({ error: 'Failed to create brief' }, { status: 500 });
    }

    // Fetch creator context in parallel
    const [brandsRes, productsRes, winnersRes] = await Promise.all([
      supabaseAdmin.from('brands').select('id, name, retainer_type, retainer_bonus_tiers, monthly_video_quota').eq('user_id', auth.user.id),
      supabaseAdmin.from('products').select('id, name, brand, category').eq('user_id', auth.user.id).limit(50),
      supabaseAdmin.from('winners_bank').select('hook, hook_type, content_format, view_count, engagement_rate').eq('user_id', auth.user.id).eq('is_active', true).order('performance_score', { ascending: false }).limit(10),
    ]);

    const creatorContext = {
      brands: (brandsRes.data || []).map((b: { name: string }) => b.name).join(', '),
      products: (productsRes.data || []).map((p: { name: string; brand: string }) => `${p.name} (${p.brand})`).join(', '),
      topHookTypes: [...new Set((winnersRes.data || []).map((w: { hook_type: string | null }) => w.hook_type).filter(Boolean))].join(', '),
      avgEngagement: ((winnersRes.data || []).reduce((s: number, w: { engagement_rate: number | null }) => s + (w.engagement_rate || 0), 0) / Math.max(1, (winnersRes.data || []).length)).toFixed(1),
    };

    // Call Claude Sonnet for analysis
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicKey) {
      await supabaseAdmin.from('brand_briefs').update({ status: 'failed' }).eq('id', brief.id);
      return NextResponse.json({ error: 'AI service not configured' }, { status: 500 });
    }

    const prompt = `You are an expert TikTok Shop affiliate/creator business analyst. Analyze this brand brief and extract EVERY specific detail. Return ONLY valid JSON — no markdown, no explanation.

CREATOR CONTEXT:
- Active brands: ${creatorContext.brands || 'None yet'}
- Products: ${creatorContext.products || 'None yet'}
- Top hook types: ${creatorContext.topHookTypes || 'Unknown'}
- Avg engagement: ${creatorContext.avgEngagement}%

BRAND BRIEF:
${brief_text.slice(0, 8000)}

Return this EXACT JSON structure:
{
  "summary": "One paragraph summary of the brief",
  "brief_type": "retainer|contest|campaign|launch|general",
  "campaign_name": "Name of the campaign/challenge",
  "campaign_start": "YYYY-MM-DD or null",
  "campaign_end": "YYYY-MM-DD or null",
  "brand_name": "Brand name",
  "focus_products": [{"name": "Product name", "url": "link or null", "sku": "if mentioned"}],
  "commission_rate": null,
  "registration_url": "URL if any registration required, else null",
  "claim_deadline": "YYYY-MM-DD if any early claim deadline, else null",

  "posting_bonuses": [
    {"tier_label": "Tier 1", "min_videos": 5, "payout": 30, "max_videos": null, "stackable": false}
  ],
  "gmv_bonuses": [
    {"tier_label": "Tier 1", "min_gmv": 500, "payout": 250, "stackable": true}
  ],
  "live_bonuses": [
    {"type": "per_session", "payout": 50, "requirements": "min 30 min"}
  ],
  "product_specific_bonuses": [
    {"product": "Product X", "bonus_type": "gmv_multiplier", "value": 1.5, "details": "1.5x commission"}
  ],

  "requirements": {
    "min_videos": 5,
    "required_hashtags": ["#brand", "#tiktokshop"],
    "required_elements": ["Show product in first 3 seconds"],
    "prohibited": ["No competitor mentions"],
    "must_register": true,
    "content_guidelines_url": "link or null",
    "unique_content_required": true,
    "platforms": ["TikTok"]
  },

  "income_projections": {
    "conservative": {
      "videos": 5, "estimated_gmv": 500, "posting_bonus": 30,
      "gmv_bonus": 0, "commission": 100, "total": 130,
      "description": "Minimum effort — hit base posting tier"
    },
    "target": {
      "videos": 15, "estimated_gmv": 3000, "posting_bonus": 100,
      "gmv_bonus": 250, "commission": 600, "total": 950,
      "description": "Solid effort — mid-tier bonuses"
    },
    "stretch": {
      "videos": 30, "estimated_gmv": 10000, "posting_bonus": 500,
      "gmv_bonus": 4000, "commission": 2000, "total": 6500,
      "description": "All-in push — top tier everything"
    }
  },

  "posting_schedule": [
    {
      "week": 1, "day": "Monday", "date": "YYYY-MM-DD",
      "product": "Product name", "content_type": "UGC testimonial",
      "hook_idea": "A hook line idea", "is_live": false
    }
  ],

  "script_starters": [
    {
      "product": "Product name",
      "content_type": "UGC testimonial",
      "hook": "Opening hook line",
      "body_outline": "2-3 sentence outline",
      "cta": "Call to action",
      "on_screen_text": "Suggested text overlay",
      "estimated_duration": "30s"
    }
  ],

  "strategic_notes": [
    "Focus on X product first — highest commission",
    "Post early in the campaign for algorithm boost"
  ]
}

CRITICAL RULES:
- Extract EXACT dollar amounts. $30 posting bonus means 30, not 30.00.
- Note if bonuses are stackable or non-stackable (this is CRUCIAL for income projections).
- For income projections, calculate real math: if posting bonus is $30 for 5 videos (non-stackable), then 5 videos = $30, not $150.
- If GMV bonus is stackable, each tier stacks on top. If non-stackable, creator gets highest tier hit only.
- Generate 4+ weeks of posting schedule if campaign is a month long.
- Generate 5+ script starters with different content types and hooks.
- Be specific with hook ideas — make them actual usable hooks, not generic placeholders.`;

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
        temperature: 0.2,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(55000),
    });

    if (!claudeRes.ok) {
      console.error('[brief-analyze] Claude error:', claudeRes.status);
      await supabaseAdmin.from('brand_briefs').update({ status: 'failed' }).eq('id', brief.id);
      return NextResponse.json({ error: 'AI analysis failed' }, { status: 502 });
    }

    const claudeData = await claudeRes.json();
    const rawText = claudeData.content?.[0]?.text || '';
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      await supabaseAdmin.from('brand_briefs').update({ status: 'failed' }).eq('id', brief.id);
      return NextResponse.json({ error: 'AI returned invalid response' }, { status: 502 });
    }

    let analysis;
    try {
      analysis = JSON.parse(jsonMatch[0]);
    } catch {
      await supabaseAdmin.from('brand_briefs').update({ status: 'failed' }).eq('id', brief.id);
      return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 502 });
    }

    // Update brief with extracted data
    const { error: updateErr } = await supabaseAdmin
      .from('brand_briefs')
      .update({
        ai_analysis: analysis,
        campaign_start: analysis.campaign_start || null,
        campaign_end: analysis.campaign_end || null,
        focus_product: analysis.focus_products?.[0]?.name || null,
        focus_product_url: analysis.focus_products?.[0]?.url || null,
        min_videos: analysis.requirements?.min_videos || null,
        registration_url: analysis.registration_url || null,
        required_hashtags: analysis.requirements?.required_hashtags || [],
        posting_bonuses: analysis.posting_bonuses || [],
        gmv_bonuses: analysis.gmv_bonuses || [],
        live_bonuses: analysis.live_bonuses || [],
        base_commission_pct: analysis.commission_rate || null,
        posting_schedule: analysis.posting_schedule || [],
        script_starters: analysis.script_starters || [],
        income_projections: analysis.income_projections || {},
        strategic_notes: analysis.strategic_notes || [],
        status: 'ready',
        analyzed_at: new Date().toISOString(),
      })
      .eq('id', brief.id);

    if (updateErr) {
      console.error('[brief-analyze] Update error:', updateErr);
    }

    return NextResponse.json({ ok: true, brief_id: brief.id, analysis });
  } catch (err) {
    console.error('[brief-analyze] Error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
