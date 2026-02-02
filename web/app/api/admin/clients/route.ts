import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const status = request.nextUrl.searchParams.get('status');

    // Build query
    let query = supabase
      .from('agency_clients')
      .select('*')
      .eq('agency_id', user.id)
      .order('created_at', { ascending: false });

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    const { data: clients, error } = await query;

    if (error) throw error;

    // Get video and script counts for each client
    const clientsWithStats = await Promise.all(
      (clients || []).map(async (client) => {
        const [videosResult, scriptsResult] = await Promise.all([
          supabase
            .from('video_requests')
            .select('id', { count: 'exact', head: true })
            .eq('agency_client_id', client.id)
            .gte('created_at', new Date(new Date().setDate(1)).toISOString()),
          supabase
            .from('saved_skits')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', user.id),
        ]);

        return {
          ...client,
          videos_this_month: videosResult.count || 0,
          scripts_generated: scriptsResult.count || 0,
        };
      })
    );

    return NextResponse.json({ clients: clientsWithStats });
  } catch (error) {
    console.error('Clients fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch clients' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    // Validate required fields
    if (!body.company_name || !body.contact_name || !body.email) {
      return NextResponse.json(
        { error: 'Company name, contact name, and email are required' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('agency_clients')
      .insert({
        agency_id: user.id,
        company_name: body.company_name,
        contact_name: body.contact_name,
        email: body.email,
        phone: body.phone || null,
        website: body.website || null,
        plan_name: body.plan_name || 'starter',
        videos_quota: body.videos_quota || 30,
        notes: body.notes || null,
        status: 'active',
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ client: data });
  } catch (error) {
    console.error('Client create error:', error);
    return NextResponse.json({ error: 'Failed to create client' }, { status: 500 });
  }
}
