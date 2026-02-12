import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { getVariantsScalingColumns } from '@/lib/scaling-schema';
import { VARIANT_STATUSES } from '@/lib/schema-migration';

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const auth = await getApiAuthContext(request);
  if (!auth.user) {
    return NextResponse.json({ ok: false, error: 'Authentication required' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { variant_id, note } = body;

    // Validate required fields
    if (!variant_id || typeof variant_id !== 'string') {
      return NextResponse.json(
        { ok: false, error: 'variant_id is required and must be a string' },
        { status: 400 }
      );
    }

    // Validate variant exists
    const { data: existingVariant, error: fetchError } = await supabaseAdmin
      .from('variants')
      .select('id, status, is_winner, locked')
      .eq('id', variant_id.trim())
      .single();

    if (fetchError || !existingVariant) {
      console.error('Failed to fetch variant:', fetchError);
      return NextResponse.json(
        { ok: false, error: 'Variant not found' },
        { status: 404 }
      );
    }

    // Check if already promoted
    if (existingVariant.is_winner === true) {
      return NextResponse.json(
        { ok: false, error: 'Variant is already promoted as winner' },
        { status: 400 }
      );
    }

    // Get available columns
    const variantsColumns = await getVariantsScalingColumns();

    // Build update payload - only use columns that exist
    const updatePayload: Record<string, unknown> = {};

    // Set status to winner if status column exists and winner is valid status
    if (variantsColumns.has('status') && VARIANT_STATUSES.includes('winner')) {
      updatePayload.status = 'winner';
    }

    // Set is_winner flag if column exists
    if (variantsColumns.has('is_winner')) {
      updatePayload.is_winner = true;
    }

    // Lock the variant if column exists
    if (variantsColumns.has('locked')) {
      updatePayload.locked = true;
    }

    // Set promoted_at timestamp if column exists
    if (variantsColumns.has('promoted_at')) {
      updatePayload.promoted_at = new Date().toISOString();
    }

    // Store note in appropriate field
    if (note && typeof note === 'string') {
      if (variantsColumns.has('change_note')) {
        updatePayload.change_note = note.trim();
      } else if (variantsColumns.has('score_note')) {
        updatePayload.score_note = note.trim();
      }
    }

    // Update the variant
    const { data: updatedVariant, error: updateError } = await supabaseAdmin
      .from('variants')
      .update(updatePayload)
      .eq('id', variant_id.trim())
      .select()
      .single();

    if (updateError) {
      console.error('Failed to promote variant:', updateError);
      return NextResponse.json(
        { ok: false, error: 'Failed to promote variant' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      data: updatedVariant,
      columns_updated: Object.keys(updatePayload),
      message: 'Variant successfully promoted to winner'
    });

  } catch (error) {
    console.error('POST /api/variants/promote error:', error);
    return NextResponse.json(
      { ok: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
