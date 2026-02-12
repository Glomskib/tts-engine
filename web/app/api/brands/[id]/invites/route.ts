/**
 * Brand Invite Management
 * POST /api/brands/[id]/invites — Generate a new invite link
 * GET /api/brands/[id]/invites — List all invites with stats
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { createApiErrorResponse } from '@/lib/api-errors';
import { NextResponse } from 'next/server';
import crypto from 'crypto';

function generateInviteCode(): string {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: brandId } = await params;
  const correlationId = crypto.randomUUID();
  const authContext = await getApiAuthContext();

  if (!authContext?.user?.id) {
    return createApiErrorResponse('BAD_REQUEST', 'Authentication required', 401, correlationId);
  }

  const userId = authContext.user.id;

  // Verify user owns this brand
  const { data: brand } = await supabaseAdmin
    .from('brands')
    .select('id, name')
    .eq('id', brandId)
    .eq('user_id', userId)
    .single();

  if (!brand) {
    return createApiErrorResponse('NOT_FOUND', 'Brand not found', 404, correlationId);
  }

  const inviteCode = generateInviteCode();

  const { data: invite, error } = await supabaseAdmin
    .from('brand_invites')
    .insert({
      brand_id: brandId,
      invite_code: inviteCode,
      created_by: userId,
    })
    .select()
    .single();

  if (error) {
    console.error('[brand-invites] Create error:', error);
    return createApiErrorResponse('DB_ERROR', 'Failed to create invite', 500, correlationId);
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://flashflowai.com';

  return NextResponse.json({
    ok: true,
    data: {
      ...invite,
      invite_url: `${baseUrl}/join/${inviteCode}`,
    },
  });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: brandId } = await params;
  const correlationId = crypto.randomUUID();
  const authContext = await getApiAuthContext();

  if (!authContext?.user?.id) {
    return createApiErrorResponse('BAD_REQUEST', 'Authentication required', 401, correlationId);
  }

  const { data: invites, error } = await supabaseAdmin
    .from('brand_invites')
    .select('*')
    .eq('brand_id', brandId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[brand-invites] List error:', error);
    return createApiErrorResponse('DB_ERROR', 'Failed to list invites', 500, correlationId);
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://flashflowai.com';

  return NextResponse.json({
    ok: true,
    data: (invites || []).map((inv) => ({
      ...inv,
      invite_url: `${baseUrl}/join/${inv.invite_code}`,
    })),
  });
}
