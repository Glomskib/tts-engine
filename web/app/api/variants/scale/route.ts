import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getVariantsScalingColumns, getIterationGroupsColumns, VALID_CHANGE_TYPES, ChangeType } from '@/lib/scaling-schema';
import { getVideosPerformanceColumns } from '@/lib/performance-schema';

export const runtime = "nodejs";

interface ScalingPlan {
  winner_summary: string;
  do_not_change: string[];
  test_matrix: Array<{
    change_type: ChangeType;
    variants: Array<{
      change_note: string;
      hook_text?: string;
      cta?: string;
      caption?: string;
      on_screen_text?: string;
      edit_style?: string;
    }>;
  }>;
  editor_brief: {
    b_roll: string[];
    on_screen_style: string;
    pacing: string;
    dos: string[];
    donts: string[];
  };
}

async function generateScalingPlan(
  winnerVariant: any,
  concept: any,
  script: any,
  hook: any,
  changeTypes: ChangeType[],
  countPerType: number
): Promise<ScalingPlan> {
  const prompt = `You are a TikTok content scaling expert. Generate a scaling plan for a winning video variant.

WINNER CONTEXT:
- Concept: ${concept?.concept_title || 'Unknown'}
- Hook: ${hook?.hook_text || 'Unknown'}
- Script Caption: ${script?.caption || 'Unknown'}
- Script Hashtags: ${script?.hashtags || 'Unknown'}
- Winner Status: ${winnerVariant.status}
- Winner Score: ${winnerVariant.score || 'Unknown'}

SCALING REQUIREMENTS:
- Change Types: ${changeTypes.join(', ')}
- Variants per type: ${countPerType}
- ONE VARIABLE CHANGES ONLY - keep everything else identical
- Focus on high-impact variations that maintain the winning elements

Generate EXACTLY this JSON structure (no markdown, no extra text):

{
  "winner_summary": "Brief description of what made this variant win",
  "do_not_change": ["list of elements that must stay identical"],
  "test_matrix": [
    {
      "change_type": "hook",
      "variants": [
        { "change_note": "Description of change", "hook_text": "New hook text" }
      ]
    },
    {
      "change_type": "cta", 
      "variants": [
        { "change_note": "Description of change", "cta": "New CTA text" }
      ]
    }
  ],
  "editor_brief": {
    "b_roll": ["footage type 1", "footage type 2"],
    "on_screen_style": "visual style description",
    "pacing": "editing pace description", 
    "dos": ["editing guideline 1", "editing guideline 2"],
    "donts": ["avoid this", "don't do that"]
  }
}`;

  try {
    // Try Anthropic first (if available), then OpenAI fallback
    let response;
    
    if (process.env.ANTHROPIC_API_KEY) {
      response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-3-sonnet-20240229',
          max_tokens: 2000,
          messages: [{ role: 'user', content: prompt }]
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        const content = data.content?.[0]?.text;
        if (content) {
          return JSON.parse(content);
        }
      }
    }

    // OpenAI fallback
    if (process.env.OPENAI_API_KEY) {
      response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: 'gpt-4',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 2000,
          temperature: 0.7
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        if (content) {
          return JSON.parse(content);
        }
      }
    }

    // Fallback plan if no API available
    console.warn('No LLM API available, using fallback plan');
    return generateFallbackPlan(changeTypes, countPerType);
    
  } catch (error) {
    console.error('LLM generation failed:', error);
    return generateFallbackPlan(changeTypes, countPerType);
  }
}

function generateFallbackPlan(changeTypes: ChangeType[], countPerType: number): ScalingPlan {
  const testMatrix = changeTypes.map(changeType => ({
    change_type: changeType,
    variants: Array.from({ length: countPerType }, (_, i) => ({
      change_note: `${changeType} variation ${i + 1}`,
      [changeType]: `Modified ${changeType} ${i + 1}`
    }))
  }));

  return {
    winner_summary: "Winner variant ready for scaling",
    do_not_change: ["core message", "winning elements"],
    test_matrix: testMatrix,
    editor_brief: {
      b_roll: ["product shots", "lifestyle footage"],
      on_screen_style: "clean and engaging",
      pacing: "dynamic with clear beats",
      dos: ["maintain energy", "clear messaging"],
      donts: ["over-complicate", "lose focus"]
    }
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      winner_variant_id,
      change_types,
      count_per_type,
      account_ids,
      google_drive_url
    } = body;

    // Validate required fields
    if (!winner_variant_id || typeof winner_variant_id !== 'string') {
      return NextResponse.json(
        { ok: false, error: 'winner_variant_id is required and must be a string' },
        { status: 400 }
      );
    }

    if (!Array.isArray(change_types) || change_types.length === 0) {
      return NextResponse.json(
        { ok: false, error: 'change_types is required and must be a non-empty array' },
        { status: 400 }
      );
    }

    // Validate change types
    for (const changeType of change_types) {
      if (!VALID_CHANGE_TYPES.includes(changeType)) {
        return NextResponse.json(
          { ok: false, error: `Invalid change_type: ${changeType}. Valid types: ${VALID_CHANGE_TYPES.join(', ')}` },
          { status: 400 }
        );
      }
    }

    if (!count_per_type || typeof count_per_type !== 'number' || count_per_type < 1 || count_per_type > 20) {
      return NextResponse.json(
        { ok: false, error: 'count_per_type must be a number between 1 and 20' },
        { status: 400 }
      );
    }

    // Validate account_ids if provided
    if (account_ids && (!Array.isArray(account_ids) || account_ids.some(id => typeof id !== 'string'))) {
      return NextResponse.json(
        { ok: false, error: 'account_ids must be an array of strings' },
        { status: 400 }
      );
    }

    // If account_ids provided, google_drive_url is required
    if (account_ids && account_ids.length > 0 && (!google_drive_url || typeof google_drive_url !== 'string')) {
      return NextResponse.json(
        { ok: false, error: 'google_drive_url is required when account_ids are provided' },
        { status: 400 }
      );
    }

    // Fetch winner variant with related data
    const { data: winnerVariant, error: winnerError } = await supabaseAdmin
      .from('variants')
      .select(`
        *,
        concepts(*),
        scripts(*),
        hooks(*)
      `)
      .eq('id', winner_variant_id.trim())
      .single();

    if (winnerError || !winnerVariant) {
      console.error('Failed to fetch winner variant:', winnerError);
      return NextResponse.json(
        { ok: false, error: 'Winner variant not found' },
        { status: 404 }
      );
    }

    // Check schema availability
    const variantsColumns = await getVariantsScalingColumns();
    const iterationGroupsColumns = await getIterationGroupsColumns();

    if (iterationGroupsColumns.size === 0) {
      return NextResponse.json(
        { ok: false, error: 'iteration_groups table not found - run Phase 7 migration first' },
        { status: 500 }
      );
    }

    // Generate scaling plan
    const scalingPlan = await generateScalingPlan(
      winnerVariant,
      winnerVariant.concepts,
      winnerVariant.scripts,
      winnerVariant.hooks,
      change_types,
      count_per_type
    );

    // Create iteration group
    const { data: iterationGroup, error: groupError } = await supabaseAdmin
      .from('iteration_groups')
      .insert({
        winner_variant_id: winner_variant_id.trim(),
        concept_id: winnerVariant.concept_id,
        plan_json: scalingPlan
      })
      .select()
      .single();

    if (groupError || !iterationGroup) {
      console.error('Failed to create iteration group:', groupError);
      return NextResponse.json(
        { ok: false, error: 'Failed to create iteration group' },
        { status: 500 }
      );
    }

    // Create child variants
    const childVariants = [];
    const createdVideos = [];

    for (const testGroup of scalingPlan.test_matrix) {
      for (const variant of testGroup.variants) {
        // Build child variant payload
        const childPayload: Record<string, unknown> = {
          concept_id: winnerVariant.concept_id,
          status: 'draft'
        };

        // Add scaling-specific columns if they exist
        if (variantsColumns.has('parent_variant_id')) {
          childPayload.parent_variant_id = winner_variant_id.trim();
        }
        if (variantsColumns.has('iteration_group_id')) {
          childPayload.iteration_group_id = iterationGroup.id;
        }
        if (variantsColumns.has('change_type')) {
          childPayload.change_type = testGroup.change_type;
        }
        if (variantsColumns.has('change_note')) {
          childPayload.change_note = variant.change_note;
        }

        // Link to existing hook/script or create new ones based on change type
        if (testGroup.change_type === 'hook') {
          // For hook changes, we need new hooks and scripts
          if (variant.hook_text) {
            // Create new hook
            const { data: newHook, error: hookError } = await supabaseAdmin
              .from('hooks')
              .insert({
                concept_id: winnerVariant.concept_id,
                hook_text: variant.hook_text
              })
              .select()
              .single();

            if (!hookError && newHook) {
              childPayload.hook_id = newHook.id;

              // Generate script for new hook
              try {
                const scriptResponse = await fetch(`${request.nextUrl.origin}/api/scripts/generate`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    concept_id: winnerVariant.concept_id,
                    hook_text: variant.hook_text
                  })
                });

                if (scriptResponse.ok) {
                  const scriptResult = await scriptResponse.json();
                  if (scriptResult.ok && scriptResult.data) {
                    childPayload.script_id = scriptResult.data.id;
                  }
                }
              } catch (error) {
                console.error('Failed to generate script for new hook:', error);
              }
            }
          }
        } else {
          // For other change types, keep same hook/script
          if (winnerVariant.hook_id) childPayload.hook_id = winnerVariant.hook_id;
          if (winnerVariant.script_id) childPayload.script_id = winnerVariant.script_id;
        }

        // Create child variant
        const { data: childVariant, error: childError } = await supabaseAdmin
          .from('variants')
          .insert(childPayload)
          .select()
          .single();

        if (childError) {
          console.error('Failed to create child variant:', childError);
          continue;
        }

        childVariants.push(childVariant);

        // Create videos for each account if requested
        if (account_ids && account_ids.length > 0 && childVariant) {
          const videosColumns = await getVideosPerformanceColumns();
          
          for (const accountId of account_ids) {
            const videoPayload: Record<string, unknown> = {
              account_id: accountId.trim(),
              variant_id: childVariant.id,
              status: 'needs_edit'
            };

            // Add google_drive_url if column exists
            if (videosColumns.has('google_drive_url')) {
              videoPayload.google_drive_url = google_drive_url.trim();
            }

            // Add caption/hashtags from script if available
            if (winnerVariant.scripts) {
              if (videosColumns.has('caption_used') && winnerVariant.scripts.caption) {
                videoPayload.caption_used = winnerVariant.scripts.caption;
              }
              if (videosColumns.has('hashtags_used') && winnerVariant.scripts.hashtags) {
                videoPayload.hashtags_used = winnerVariant.scripts.hashtags;
              }
            }

            const { data: newVideo, error: videoError } = await supabaseAdmin
              .from('videos')
              .insert(videoPayload)
              .select()
              .single();

            if (!videoError && newVideo) {
              createdVideos.push(newVideo);
            } else {
              console.error('Failed to create video:', videoError);
            }
          }
        }
      }
    }

    return NextResponse.json({
      ok: true,
      data: {
        iteration_group: iterationGroup,
        child_variants: childVariants,
        created_videos: createdVideos,
        scaling_plan: scalingPlan
      },
      editor_brief: scalingPlan.editor_brief,
      summary: {
        variants_created: childVariants.length,
        videos_created: createdVideos.length,
        accounts_queued: account_ids?.length || 0
      }
    });

  } catch (error) {
    console.error('POST /api/variants/scale error:', error);
    return NextResponse.json(
      { ok: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
