import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createApiErrorResponse, generateCorrelationId } from '@/lib/api-errors';
import { withErrorCapture } from '@/lib/errors/withErrorCapture';
import { meetsMinPlan } from '@/lib/plans';
import { generateCreatorBrief } from '@/lib/briefs/generateCreatorBrief';
import { exportBriefHTML } from '@/lib/briefs/exportCreatorBrief';
import { createContentItemFolder, createOrUpdateBriefDoc } from '@/lib/intake/drive-content-items';
import type { CowTier } from '@/lib/content-items/types';

export const runtime = 'nodejs';

// ── GET /api/content-items/[id]/brief ────────────────────────────

export const GET = withErrorCapture(async (
  request: Request,
  context?: { params?: Promise<Record<string, string>> },
) => {
  const correlationId = generateCorrelationId();
  const { id } = await context!.params!;
  const { user } = await getApiAuthContext(request);
  if (!user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  // Verify ownership
  const { data: item } = await supabaseAdmin
    .from('content_items')
    .select('id')
    .eq('id', id)
    .eq('workspace_id', user.id)
    .single();

  if (!item) {
    return createApiErrorResponse('NOT_FOUND', 'Content item not found', 404, correlationId);
  }

  const url = new URL(request.url);
  const version = url.searchParams.get('version');

  let query = supabaseAdmin
    .from('creator_briefs')
    .select('*')
    .eq('content_item_id', id);

  if (version) {
    query = query.eq('version', parseInt(version));
  } else {
    query = query.order('created_at', { ascending: false }).limit(1);
  }

  const { data: brief, error } = await query.maybeSingle();

  if (error) {
    console.error(`[${correlationId}] brief fetch error:`, error);
    return createApiErrorResponse('DB_ERROR', 'Failed to fetch brief', 500, correlationId);
  }

  const response = NextResponse.json({
    ok: true,
    data: brief || null,
    correlation_id: correlationId,
  });
  response.headers.set('x-correlation-id', correlationId);
  return response;
}, { routeName: '/api/content-items/[id]/brief', feature: 'content-items' });

// ── POST /api/content-items/[id]/brief ───────────────────────────

export const POST = withErrorCapture(async (
  request: Request,
  context?: { params?: Promise<Record<string, string>> },
) => {
  const correlationId = generateCorrelationId();
  const { id } = await context!.params!;
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
  }

  // Plan gate
  if (!meetsMinPlan(authContext.role || 'free', 'creator_pro')) {
    return createApiErrorResponse('PLAN_LIMIT', 'Creator brief generation requires Creator Pro plan or higher', 403, correlationId);
  }

  // Fetch content item with brand/product info
  const { data: item, error: itemError } = await supabaseAdmin
    .from('content_items')
    .select('*')
    .eq('id', id)
    .eq('workspace_id', authContext.user.id)
    .single();

  if (itemError || !item) {
    return createApiErrorResponse('NOT_FOUND', 'Content item not found', 404, correlationId);
  }

  // Fetch brand and product names
  let brandName: string | undefined;
  let productName: string | undefined;
  let productCategory: string | undefined;
  let productNotes: string | undefined;

  if (item.brand_id) {
    const { data: brand } = await supabaseAdmin
      .from('brands')
      .select('name')
      .eq('id', item.brand_id)
      .single();
    brandName = brand?.name;
  }

  if (item.product_id) {
    const { data: product } = await supabaseAdmin
      .from('products')
      .select('name, category, notes')
      .eq('id', item.product_id)
      .single();
    productName = product?.name;
    productCategory = product?.category;
    productNotes = product?.notes;
  }

  // Generate brief
  const result = await generateCreatorBrief({
    workspaceId: authContext.user.id,
    title: item.title,
    brandName,
    productName,
    productCategory,
    productNotes,
    selectedCowTier: item.brief_selected_cow_tier as CowTier,
    correlationId,
  });

  // Get next version number
  const { count } = await supabaseAdmin
    .from('creator_briefs')
    .select('id', { count: 'exact', head: true })
    .eq('content_item_id', id);

  const version = (count ?? 0) + 1;

  // Store brief
  const { data: briefRow, error: briefError } = await supabaseAdmin
    .from('creator_briefs')
    .insert({
      content_item_id: id,
      version,
      created_by: authContext.user.id,
      data: result.brief as unknown as Record<string, unknown>,
      claim_risk_score: result.claimRiskScore,
    })
    .select('*')
    .single();

  if (briefError) {
    console.error(`[${correlationId}] brief insert error:`, briefError);
    return createApiErrorResponse('DB_ERROR', 'Failed to store brief', 500, correlationId);
  }

  // Update content item with derived metadata
  await supabaseAdmin
    .from('content_items')
    .update({
      ai_description: result.aiDescription,
      hashtags: result.hashtags,
      caption: result.caption,
    })
    .eq('id', id);

  // Drive integration (if connected)
  let driveInfo: { folderId?: string; folderUrl?: string; docId?: string; docUrl?: string } = {};
  try {
    const { data: tokenRow } = await supabaseAdmin
      .from('drive_oauth_tokens')
      .select('user_id')
      .eq('user_id', authContext.user.id)
      .maybeSingle();

    if (tokenRow) {
      // Create folder if needed
      if (!item.drive_folder_id) {
        const brand = brandName ? { name: brandName } : null;
        const product = productName ? { name: productName } : null;
        const folder = await createContentItemFolder(
          authContext.user.id,
          item,
          brand,
          product,
        );
        driveInfo.folderId = folder.folderId;
        driveInfo.folderUrl = folder.folderUrl;
      } else {
        driveInfo.folderId = item.drive_folder_id;
        driveInfo.folderUrl = item.drive_folder_url;
      }

      // Export brief as HTML doc
      if (driveInfo.folderId) {
        const html = exportBriefHTML(result.brief, item.brief_selected_cow_tier as CowTier);
        const doc = await createOrUpdateBriefDoc(
          authContext.user.id,
          driveInfo.folderId,
          html,
          item.title,
          id,
        );
        driveInfo.docId = doc.docId;
        driveInfo.docUrl = doc.docUrl;
      }
    }
  } catch (driveErr) {
    // Drive integration is non-blocking
    console.error(`[${correlationId}] Drive integration error (non-blocking):`, driveErr);
  }

  // Fetch updated content item
  const { data: updatedItem } = await supabaseAdmin
    .from('content_items')
    .select('*')
    .eq('id', id)
    .single();

  const response = NextResponse.json({
    ok: true,
    data: {
      brief: briefRow,
      content_item: updatedItem,
      claim_risk: {
        score: result.claimRiskScore,
        level: result.claimRiskLevel,
      },
      drive: driveInfo,
    },
    correlation_id: correlationId,
  }, { status: 201 });
  response.headers.set('x-correlation-id', correlationId);
  return response;
}, { routeName: '/api/content-items/[id]/brief', feature: 'content-items' });
