import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getVariantsScalingColumns, getIterationGroupsColumns } from '@/lib/scaling-schema';

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const variant_id = searchParams.get('variant_id');

    if (!variant_id || typeof variant_id !== 'string') {
      return NextResponse.json(
        { ok: false, error: 'variant_id query parameter is required' },
        { status: 400 }
      );
    }

    // Check schema availability
    const variantsColumns = await getVariantsScalingColumns();
    const iterationGroupsColumns = await getIterationGroupsColumns();

    // Fetch the target variant
    const { data: targetVariant, error: targetError } = await supabaseAdmin
      .from('variants')
      .select('*')
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
    let childVariants: any[] = [];
    let iterationGroups: any[] = [];
    let associatedVideos: any[] = [];

    // Find root/parent variant if this is a child
    if (variantsColumns.has('parent_variant_id') && targetVariant.parent_variant_id) {
      const { data: parent, error: parentError } = await supabaseAdmin
        .from('variants')
        .select('*')
        .eq('id', targetVariant.parent_variant_id)
        .single();

      if (!parentError && parent) {
        parentVariant = parent;
        rootVariant = parent;
      }
    }

    // Find all child variants if this is a parent/winner
    if (variantsColumns.has('parent_variant_id')) {
      const { data: children, error: childrenError } = await supabaseAdmin
        .from('variants')
        .select('*')
        .eq('parent_variant_id', rootVariant.id)
        .order('created_at', { ascending: true });

      if (!childrenError && children) {
        childVariants = children;
      }
    }

    // Find iteration groups where this variant is the winner
    if (iterationGroupsColumns.size > 0) {
      const { data: groups, error: groupsError } = await supabaseAdmin
        .from('iteration_groups')
        .select('*')
        .eq('winner_variant_id', rootVariant.id)
        .order('created_at', { ascending: false });

      if (!groupsError && groups) {
        iterationGroups = groups;
      }
    }

    // Find associated videos for all variants in the lineage
    const variantIds = [
      rootVariant.id,
      ...(parentVariant ? [parentVariant.id] : []),
      ...childVariants.map(v => v.id)
    ];

    if (variantIds.length > 0) {
      const { data: videos, error: videosError } = await supabaseAdmin
        .from('videos')
        .select(`
          *,
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
    }, {} as Record<string, any[]>);

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
        is_winner: rootVariant.is_winner || false,
        is_child: !!targetVariant.parent_variant_id,
        children_count: childVariants.length
      }
    };

    return NextResponse.json({
      ok: true,
      data: lineage,
      schema_info: {
        variants_scaling_columns: variantsColumns.size,
        iteration_groups_available: iterationGroupsColumns.size > 0
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
