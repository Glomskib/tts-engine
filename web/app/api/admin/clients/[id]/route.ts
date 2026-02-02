import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: client, error } = await supabase
      .from('agency_clients')
      .select('*')
      .eq('id', id)
      .eq('agency_id', user.id)
      .single();

    if (error || !client) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }

    // Get recent activity
    const { data: videos } = await supabase
      .from('video_requests')
      .select('id, title, status, created_at')
      .eq('agency_client_id', id)
      .order('created_at', { ascending: false })
      .limit(10);

    return NextResponse.json({
      client,
      videos: videos || [],
    });
  } catch (error) {
    console.error('Client fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch client' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    // Verify ownership
    const { data: existing } = await supabase
      .from('agency_clients')
      .select('id')
      .eq('id', id)
      .eq('agency_id', user.id)
      .single();

    if (!existing) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    const allowedFields = [
      'company_name', 'contact_name', 'email', 'phone', 'website',
      'status', 'plan_name', 'videos_quota', 'notes'
    ];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

    const { data, error } = await supabase
      .from('agency_clients')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ client: data });
  } catch (error) {
    console.error('Client update error:', error);
    return NextResponse.json({ error: 'Failed to update client' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify ownership before delete
    const { data: existing } = await supabase
      .from('agency_clients')
      .select('id')
      .eq('id', id)
      .eq('agency_id', user.id)
      .single();

    if (!existing) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }

    const { error } = await supabase
      .from('agency_clients')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Client delete error:', error);
    return NextResponse.json({ error: 'Failed to delete client' }, { status: 500 });
  }
}
