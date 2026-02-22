/**
 * GET /api/flashflow/trending?date=YYYY-MM-DD
 *
 * Returns the last 20 trending items from ff_trending_items.
 * If no date param, returns the most recent run.
 */
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get('date');

    let runDate = dateParam;

    // If no date specified, find the most recent run
    if (!runDate) {
      const { data: latest } = await supabaseAdmin
        .from('ff_trending_items')
        .select('run_date')
        .eq('source', 'daily_virals')
        .order('run_date', { ascending: false })
        .limit(1);

      runDate = latest?.[0]?.run_date;
      if (!runDate) {
        return NextResponse.json({ date: null, items: [] });
      }
    }

    const { data, error } = await supabaseAdmin
      .from('ff_trending_items')
      .select(`
        id, source, run_date, rank,
        product_name, product_id, category,
        gmv_velocity, views, hook_text,
        visual_tags, source_url, screenshot_urls,
        mc_doc_id, creator_style_id,
        raw, created_at
      `)
      .eq('source', 'daily_virals')
      .eq('run_date', runDate)
      .order('rank', { ascending: true })
      .limit(20);

    if (error) {
      console.error('[api/flashflow/trending] Query error:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      date: runDate,
      items: data ?? [],
    });
  } catch (err) {
    console.error('[api/flashflow/trending] Fatal:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
