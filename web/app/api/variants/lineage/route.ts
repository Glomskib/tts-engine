import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export const runtime = "nodejs";

// Generic record type for Supabase query results
type DatabaseRecord = Record<string, unknown>;

// Video record with required fields for grouping
interface VideoRecord extends DatabaseRecord {
  variant_id: string;
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const variant_id = searchParams.get('variant_id');

    if (!variant_id || typeof variant_id !== 'string') {
      return NextResponse.json(
        { ok: false, error: 'variant_id query parameter is required' },
        { status: 400 }
      );
    }

    if (!isUuid(variant_id)) {
      return NextResponse.json(
        { ok: false, error: 'variant_id must be a valid UUID' },
        { status: 400 }
      );
    }

    // Probe for schema availability using actual selects instead of information_schema
    let hasParentVariantId = false;
    let hasIterationGroupId = false;
    let iterationGroupsAvailable = false;

    const probeParent = await supabaseAdmin.from('variants').select('parent_variant_id').limit(1);
    if (!probeParent.error) {
      hasParentVariantId = true;
    }

    const probeIterGroup = await supabaseAdmin.from('variants').select('iteration_group_id').limit(1);
    if (!probeIterGroup.error) {
      hasIterationGroupId = true;
    }

    const probeIterTable = await supabaseAdmin.from('iteration_groups').select('id').limit(1);
    if (!probeIterTable.error) {
      iterationGroupsAvailable = true;
    }

    // Fetch the target variant with explicit select list
    const { data: targetVariant, error: targetError } = await supabaseAdmin
      .from('variants')
      .select('id,concept_id,hook_id,script_id,parent_variant_id,iteration_group_id,change_type,change_note,variable_changed,status,created_at,updated_at')
      .eq('id', variant_id.trim())
      .single();

    if (targetError || !targetVariant) {
      console.error('Failed to fetch target variant:', targetError);
      return NextResponse.json(
        { ok: false, error: 'Variant not found' },
        { status: 404 }
      );
    }

    let rootVariant = targetVariant;
    let parentVariant = null;
    let childVariants: DatabaseRecord[] = [];
    let iterationGroups: DatabaseRecord[] = [];
    let associatedVideos: VideoRecord[] = [];

    // Find parent variant if this is a child - remove schema check and use explicit select
    if (targetVariant.parent_variant_id) {
      const { data: parent, error: parentError } = await supabaseAdmin
        .from('variants')
        .select('id,concept_id,hook_id,script_id,parent_variant_id,iteration_group_id,change_type,change_note,variable_changed,status,created_at,updated_at')
        .eq('id', targetVariant.parent_variant_id)
        .single();

      if (!parentError && parent) {
        parentVariant = parent;
      } else if (parentError) {
        console.error('Failed to fetch parent variant:', parentError);
      }
    }

    // Walk up the chain to find the root variant - remove schema check
    let currentVariant = targetVariant;
    while (currentVariant.parent_variant_id) {
      const { data: parent, error: parentError } = await supabaseAdmin
        .from('variants')
        .select('id,concept_id,hook_id,script_id,parent_variant_id,iteration_group_id,change_type,change_note,variable_changed,status,created_at,updated_at')
        .eq('id', currentVariant.parent_variant_id)
        .single();

      if (parentError || !parent) break;
      currentVariant = parent;
    }
    rootVariant = currentVariant;

    // Find all child variants of the target variant - remove schema check
    const { data: children, error: childrenError } = await supabaseAdmin
      .from('variants')
      .select('id,concept_id,hook_id,script_id,parent_variant_id,iteration_group_id,change_type,change_note,variable_changed,status,created_at,updated_at')
      .eq('parent_variant_id', targetVariant.id)
      .order('created_at', { ascending: true });

    if (!childrenError && children) {
      childVariants = children;
    } else if (childrenError) {
      console.error('Failed to fetch child variants:', childrenError);
    }

    // Find iteration groups - remove schema checks and use explicit selects
    // First, get groups where root is the winner
    const { data: winnerGroups, error: winnerGroupsError } = await supabaseAdmin
      .from('iteration_groups')
      .select('id,winner_variant_id,concept_id,plan_json,status,error_message,created_at,updated_at')
      .eq('winner_variant_id', rootVariant.id)
      .order('created_at', { ascending: false });

    if (!winnerGroupsError && winnerGroups) {
      iterationGroups = winnerGroups;
    }

    // Also check if target variant has iteration_group_id
    if (targetVariant.iteration_group_id) {
      const { data: targetGroup, error: targetGroupError } = await supabaseAdmin
        .from('iteration_groups')
        .select('id,winner_variant_id,concept_id,plan_json,status,error_message,created_at,updated_at')
        .eq('id', targetVariant.iteration_group_id)
        .single();

      if (!targetGroupError && targetGroup) {
        // Add to groups if not already present
        const exists = iterationGroups.some(g => g.id === targetGroup.id);
        if (!exists) {
          iterationGroups.push(targetGroup);
        }
      }
    }

    // Find associated videos for all variants in the lineage
    const variantIds = [
      targetVariant.id,
      ...(parentVariant ? [parentVariant.id] : []),
      ...(rootVariant.id !== targetVariant.id ? [rootVariant.id] : []),
      ...childVariants.map(v => v.id)
    ];

    if (variantIds.length > 0) {
      const { data: videos, error: videosError } = await supabaseAdmin
        .from('videos')
        .select(`
          id,variant_id,account_id,status,google_drive_url,created_at,updated_at,
          accounts(name, platform)
        `)
        .in('variant_id', variantIds)
        .order('created_at', { ascending: false });

      if (!videosError && videos) {
        associatedVideos = videos;
      }
    }

    // Group videos by variant for easier consumption
    const videosByVariant = associatedVideos.reduce((acc, video) => {
      if (!acc[video.variant_id]) {
        acc[video.variant_id] = [];
      }
      acc[video.variant_id].push(video);
      return acc;
    }, {} as Record<string, VideoRecord[]>);

    // Build lineage structure
    const lineage = {
      target_variant: targetVariant,
      root_variant: rootVariant,
      parent_variant: parentVariant,
      child_variants: childVariants,
      iteration_groups: iterationGroups,
      videos_by_variant: videosByVariant,
      all_videos: associatedVideos,
      lineage_stats: {
        total_variants: 1 + childVariants.length + (parentVariant ? 1 : 0),
        total_videos: associatedVideos.length,
        iteration_groups_count: iterationGroups.length,
        is_winner: false, // Remove reference to non-existent is_winner column
        is_child: !!targetVariant.parent_variant_id,
        children_count: childVariants.length
      }
    };

    return NextResponse.json({
      ok: true,
      data: lineage,
      schema_info: {
        variants_scaling_columns: (hasParentVariantId ? 1 : 0) + (hasIterationGroupId ? 1 : 0),
        iteration_groups_available: iterationGroupsAvailable
      }
    });

  } catch (error) {
    console.error('GET /api/variants/lineage error:', error);
    return NextResponse.json(
      { ok: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
