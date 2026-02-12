import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const correlationId = generateCorrelationId();

  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return createApiErrorResponse('UNAUTHORIZED', 'Unauthorized', 401, correlationId);
    }

    const { data: client, error } = await supabase
      .from('agency_clients')
      .select('*')
      .eq('id', id)
      .eq('agency_id', user.id)
      .single();

    if (error || !client) {
      return createApiErrorResponse('NOT_FOUND', 'Client not found', 404, correlationId);
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
    return createApiErrorResponse('INTERNAL', 'Failed to fetch client', 500, correlationId);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const correlationId = generateCorrelationId();

  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return createApiErrorResponse('UNAUTHORIZED', 'Unauthorized', 401, correlationId);
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
      return createApiErrorResponse('NOT_FOUND', 'Client not found', 404, correlationId);
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
    return createApiErrorResponse('INTERNAL', 'Failed to update client', 500, correlationId);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const correlationId = generateCorrelationId();

  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return createApiErrorResponse('UNAUTHORIZED', 'Unauthorized', 401, correlationId);
    }

    // Verify ownership before delete
    const { data: existing } = await supabase
      .from('agency_clients')
      .select('id')
      .eq('id', id)
      .eq('agency_id', user.id)
      .single();

    if (!existing) {
      return createApiErrorResponse('NOT_FOUND', 'Client not found', 404, correlationId);
    }

    const { error } = await supabase
      .from('agency_clients')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Client delete error:', error);
    return createApiErrorResponse('INTERNAL', 'Failed to delete client', 500, correlationId);
  }
}
