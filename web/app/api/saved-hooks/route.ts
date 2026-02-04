import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200);
  const sort = searchParams.get('sort') || 'created_at';

  const validSorts = ['created_at', 'performance_score', 'hook_text'];
  const sortColumn = validSorts.includes(sort) ? sort : 'created_at';

  const { data, error } = await supabase
    .from('saved_hooks')
    .select('*')
    .eq('user_id', user.id)
    .order(sortColumn, { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[Saved Hooks GET] Error:', error);
    return NextResponse.json({ hooks: [] });
  }

  return NextResponse.json({ hooks: data || [] });
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const hookText = typeof body.hook_text === 'string' ? body.hook_text.trim() : '';
  if (!hookText) {
    return NextResponse.json({ error: 'hook_text is required' }, { status: 400 });
  }

  const payload: Record<string, unknown> = {
    user_id: user.id,
    hook_text: hookText,
    source: typeof body.source === 'string' ? body.source : 'generated',
  };

  if (typeof body.content_type === 'string') payload.content_type = body.content_type;
  if (typeof body.content_format === 'string') payload.content_format = body.content_format;
  if (typeof body.product_id === 'string') payload.product_id = body.product_id;
  if (typeof body.product_name === 'string') payload.product_name = body.product_name;
  if (typeof body.brand_name === 'string') payload.brand_name = body.brand_name;
  if (typeof body.notes === 'string') payload.notes = body.notes;

  const { data, error } = await supabase
    .from('saved_hooks')
    .insert(payload)
    .select()
    .single();

  if (error) {
    console.error('[Saved Hooks POST] Error:', error);
    return NextResponse.json({ error: 'Failed to save hook' }, { status: 500 });
  }

  return NextResponse.json({ hook: data });
}
