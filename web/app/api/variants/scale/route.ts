import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getVariantsScalingColumns, getIterationGroupsColumns, VALID_CHANGE_TYPES, ChangeType } from '@/lib/scaling-schema';
import { getVideosPerformanceColumns } from '@/lib/performance-schema';
import { safeColumnInsert, generateCorrelationId } from '@/lib/safe-schema';

export const runtime = "nodejs";

// Minimal types for scaling function parameters
interface WinnerVariantInput {
  status: string;
  score?: number | null;
}

interface WinnerVariantFull extends WinnerVariantInput {
  id: string;
  concept_id: string | null;
  hook_id: string | null;
  script_id: string | null;
}

interface ConceptInput {
  concept_title?: string | null;
}

interface ScriptInput {
  caption?: string | null;
  hashtags?: string | null;
}

interface HookInput {
  hook_text?: string | null;
}

interface ChildVariantRecord {
  id: string;
  [key: string]: unknown;
}

interface VideoRecord {
  id: string;
  [key: string]: unknown;
}

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
  winnerVariant: WinnerVariantInput,
  concept: ConceptInput | null,
  script: ScriptInput | null,
  hook: HookInput | null,
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

async function executeScalingBackground(
  correlationId: string,
  iterationGroupId: string,
  winnerVariant: WinnerVariantFull,
  scalingPlan: ScalingPlan,
  changeTypes: ChangeType[],
  countPerType: number,
  accountIds?: string[],
  googleDriveUrl?: string
): Promise<{ childVariants: ChildVariantRecord[], createdVideos: VideoRecord[] }> {
  try {
    console.log(`[${correlationId}] Starting background scaling execution`);
    
    const childVariants = [];
    const createdVideos = [];

    for (const testGroup of scalingPlan.test_matrix) {
      for (const variant of testGroup.variants) {
        // Build child variant payload with all required schema fields
        const childPayload = {
          concept_id: winnerVariant.concept_id,
          hook_id: winnerVariant.hook_id,
          script_id: winnerVariant.script_id,
          parent_variant_id: winnerVariant.id,
          iteration_group_id: iterationGroupId,
          change_type: testGroup.change_type,
          change_note: variant.change_note || null,
          variable_changed: testGroup.change_type,
          status: 'idea_approved',
          compliance_status: 'needs_review',
          compliance_score: 0,
          virality_score: 0,
          final_approved: false,
          locked: false,
          drive_folder_url: googleDriveUrl || null
        };
        
        console.log(`[${correlationId}] Creating child variant with payload:`, childPayload);
        
        const { data: childVariant, error: childError } = await supabaseAdmin
          .from('variants')
          .insert(childPayload)
          .select('*')
          .single();

        if (childError) {
          console.error(`[${correlationId}] Failed to create child variant:`, childError);
          continue;
        }

        console.log(`[${correlationId}] Created child variant:`, childVariant.id);
        childVariants.push(childVariant);

        // Create videos for each account if requested
        if (accountIds && accountIds.length > 0 && childVariant) {
          for (const accountId of accountIds) {
            // Check if video already exists for this variant/account
            const { data: existingVideo } = await supabaseAdmin
              .from('videos')
              .select('id')
              .eq('variant_id', childVariant.id)
              .eq('account_id', accountId.trim())
              .not('status', 'in', '(posted)')
              .single();

            if (existingVideo) {
              console.log(`[${correlationId}] Video already exists for variant ${childVariant.id}, account ${accountId}`);
              continue;
            }

            const videoPayload = {
              account_id: accountId.trim(),
              variant_id: childVariant.id,
              status: 'needs_edit',
              google_drive_url: googleDriveUrl?.trim() || null
            };

            console.log(`[${correlationId}] Creating video with payload:`, videoPayload);

            const { data: newVideo, error: videoError } = await supabaseAdmin
              .from('videos')
              .insert(videoPayload)
              .select('*')
              .single();

            if (!videoError && newVideo) {
              createdVideos.push(newVideo);
              console.log(`[${correlationId}] Created video:`, newVideo.id);
            } else {
              console.error(`[${correlationId}] Failed to create video:`, videoError);
            }
          }
        }
      }
    }

    // Update iteration group with success
    await supabaseAdmin
      .from('iteration_groups')
      .update({
        status: 'complete',
        updated_at: new Date().toISOString()
      })
      .eq('id', iterationGroupId);

    console.log(`[${correlationId}] Background scaling completed: ${childVariants.length} variants, ${createdVideos.length} videos`);

    return { childVariants, createdVideos };

  } catch (error) {
    console.error(`[${correlationId}] Background scaling failed:`, error);
    
    // Update iteration group with error
    await supabaseAdmin
      .from('iteration_groups')
      .update({
        status: 'failed',
        error_message: error instanceof Error ? error.message : 'Unknown error',
        updated_at: new Date().toISOString()
      })
      .eq('id', iterationGroupId);

    return { childVariants: [], createdVideos: [] };
  }
}

export async function POST(request: NextRequest) {
  const correlationId = generateCorrelationId();
  
  try {
    console.log(`[${correlationId}] Starting scaling request`);
    
    const body = await request.json();
    const {
      winner_variant_id,
      winnerVariantId, // fallback alias
      change_types,
      count_per_type,
      account_ids,
      google_drive_url,
      mode = 'async'
    } = body;

    // Use winner_variant_id as canonical, fallback to winnerVariantId
    const winnerVariantIdValue = winner_variant_id || winnerVariantId;

    console.log(`[${correlationId}] Received winner_variant_id: ${winnerVariantIdValue}`);

    // Validate required fields with detailed error messages
    if (!winnerVariantIdValue || typeof winnerVariantIdValue !== 'string' || winnerVariantIdValue.trim() === '') {
      console.log(`[${correlationId}] Validation failed: winner_variant_id is empty or invalid`);
      return NextResponse.json(
        { ok: false, error: 'winner_variant_id is required and must be a non-empty string', correlation_id: correlationId },
        { status: 400 }
      );
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(winnerVariantIdValue.trim())) {
      console.log(`[${correlationId}] Validation failed: winner_variant_id is not a valid UUID`);
      return NextResponse.json(
        { ok: false, error: 'winner_variant_id must be a valid UUID', correlation_id: correlationId },
        { status: 400 }
      );
    }

    if (!Array.isArray(change_types) || change_types.length === 0) {
      console.log(`[${correlationId}] Validation failed: change_types is empty or invalid`);
      return NextResponse.json(
        { ok: false, error: 'change_types is required and must be a non-empty array', correlation_id: correlationId },
        { status: 400 }
      );
    }

    // Validate change types
    for (const changeType of change_types) {
      if (!VALID_CHANGE_TYPES.includes(changeType)) {
        console.log(`[${correlationId}] Validation failed: invalid change_type ${changeType}`);
        return NextResponse.json(
          { ok: false, error: `Invalid change_type: ${changeType}. Valid types: ${VALID_CHANGE_TYPES.join(', ')}`, correlation_id: correlationId },
          { status: 400 }
        );
      }
    }

    if (!count_per_type || typeof count_per_type !== 'number' || count_per_type < 1 || count_per_type > 20) {
      console.log(`[${correlationId}] Validation failed: count_per_type is invalid`);
      return NextResponse.json(
        { ok: false, error: 'count_per_type must be a number between 1 and 20', correlation_id: correlationId },
        { status: 400 }
      );
    }

    // Validate account_ids if provided
    if (account_ids && (!Array.isArray(account_ids) || account_ids.some(id => typeof id !== 'string' || id.trim() === ''))) {
      console.log(`[${correlationId}] Validation failed: account_ids contains invalid values`);
      return NextResponse.json(
        { ok: false, error: 'account_ids must be an array of non-empty strings', correlation_id: correlationId },
        { status: 400 }
      );
    }

    // If account_ids provided, google_drive_url is required
    if (account_ids && account_ids.length > 0 && (!google_drive_url || typeof google_drive_url !== 'string' || google_drive_url.trim() === '')) {
      console.log(`[${correlationId}] Validation failed: google_drive_url required when account_ids provided`);
      return NextResponse.json(
        { ok: false, error: 'google_drive_url is required and must be non-empty when account_ids are provided', correlation_id: correlationId },
        { status: 400 }
      );
    }

    console.log(`[${correlationId}] Fetching winner variant: ${winnerVariantIdValue.trim()}`);

    // Fetch winner variant with required fields for child creation
    const { data: winnerVariant, error: winnerError } = await supabaseAdmin
      .from('variants')
      .select('id, concept_id, hook_id, script_id, status, score')
      .eq('id', winnerVariantIdValue.trim())
      .maybeSingle();

    if (winnerError) {
      console.error(`[${correlationId}] Failed to fetch winner variant:`, winnerError);
      return NextResponse.json(
        { 
          ok: false, 
          error: 'Failed to fetch winner variant', 
          correlation_id: correlationId,
          supabase: {
            code: winnerError.code,
            message: winnerError.message,
            details: winnerError.details,
            hint: winnerError.hint
          }
        },
        { status: 500 }
      );
    }

    if (!winnerVariant) {
      console.error(`[${correlationId}] Winner variant not found`);
      return NextResponse.json(
        { ok: false, error: 'Winner variant not found', correlation_id: correlationId },
        { status: 404 }
      );
    }

    // Validate required fields are present
    if (!winnerVariant.concept_id) {
      console.error(`[${correlationId}] Winner variant missing concept_id`);
      return NextResponse.json(
        { ok: false, error: 'Winner variant missing concept_id; cannot create iteration group', correlation_id: correlationId },
        { status: 400 }
      );
    }

    if (!winnerVariant.hook_id) {
      console.error(`[${correlationId}] Winner variant missing hook_id`);
      return NextResponse.json(
        { ok: false, error: 'Winner variant missing hook_id; cannot create child variants', correlation_id: correlationId },
        { status: 400 }
      );
    }

    if (!winnerVariant.script_id) {
      console.error(`[${correlationId}] Winner variant missing script_id`);
      return NextResponse.json(
        { ok: false, error: 'Winner variant missing script_id; cannot create child variants', correlation_id: correlationId },
        { status: 400 }
      );
    }

    console.log(`[${correlationId}] Fetched winnerVariant.concept_id: ${winnerVariant.concept_id}`);

    // Check schema availability
    const iterationGroupsColumns = await getIterationGroupsColumns();

    if (iterationGroupsColumns.size === 0) {
      console.error(`[${correlationId}] iteration_groups table not found`);
      return NextResponse.json(
        { ok: false, error: 'iteration_groups table not found - run Phase 7 migration first', correlation_id: correlationId },
        { status: 500 }
      );
    }

    // Create iteration group immediately - direct insert to avoid NULL values
    console.log(`[${correlationId}] Creating iteration group`);
    
    const { data: iterationGroup, error: groupError } = await supabaseAdmin
      .from('iteration_groups')
      .insert({
        winner_variant_id: winnerVariantIdValue.trim(),
        concept_id: winnerVariant.concept_id,
        status: 'processing'
      })
      .select('*')
      .single();

    if (groupError || !iterationGroup) {
      console.error(`[${correlationId}] Failed to create iteration group:`, groupError);
      return NextResponse.json(
        { 
          ok: false, 
          error: 'Failed to create iteration group', 
          correlation_id: correlationId,
          supabase: groupError ? {
            code: groupError.code,
            message: groupError.message,
            details: groupError.details,
            hint: groupError.hint
          } : null
        },
        { status: 500 }
      );
    }

    console.log(`[${correlationId}] Created iteration group: ${iterationGroup.id}`);

    if (mode === 'async') {
      // Return immediately and process in background
      console.log(`[${correlationId}] Starting async processing`);
      
      // Generate scaling plan and execute in background
      setImmediate(async () => {
        try {
          const scalingPlan = await generateScalingPlan(
            winnerVariant,
            null, // concepts
            null, // scripts  
            null, // hooks
            change_types,
            count_per_type
          );

          // Update iteration group with plan
          await supabaseAdmin
            .from('iteration_groups')
            .update({ plan_json: scalingPlan })
            .eq('id', iterationGroup.id);

          // Execute background scaling
          const results = await executeScalingBackground(
            correlationId,
            iterationGroup.id,
            winnerVariant,
            scalingPlan,
            change_types,
            count_per_type,
            account_ids,
            google_drive_url
          );

          console.log(`[${correlationId}] Async scaling completed: ${results.childVariants.length} variants, ${results.createdVideos.length} videos`);
        } catch (error) {
          console.error(`[${correlationId}] Async processing failed:`, error);
          await supabaseAdmin
            .from('iteration_groups')
            .update({
              status: 'failed',
              error_message: error instanceof Error ? error.message : 'Unknown error'
            })
            .eq('id', iterationGroup.id);
        }
      });

      return NextResponse.json({
        ok: true,
        mode: 'async',
        iteration_group_id: iterationGroup.id,
        status: 'processing',
        correlation_id: correlationId,
        message: 'Scaling started in background. Use /api/iteration-groups/[id] to check status.'
      });
    }

    // Sync mode - generate plan and execute immediately
    console.log(`[${correlationId}] Sync mode - generating scaling plan`);
    
    const scalingPlan = await generateScalingPlan(
      winnerVariant,
      null, // concepts
      null, // scripts
      null, // hooks
      change_types,
      count_per_type
    );

    // Update iteration group with plan
    await supabaseAdmin
      .from('iteration_groups')
      .update({ plan_json: scalingPlan })
      .eq('id', iterationGroup.id);

    // Execute scaling synchronously and get results
    const scalingResults = await executeScalingBackground(
      correlationId,
      iterationGroup.id,
      winnerVariant,
      scalingPlan,
      change_types,
      count_per_type,
      account_ids,
      google_drive_url
    );

    // Sync mode completed successfully

    return NextResponse.json({
      ok: true,
      mode: 'sync',
      iteration_group_id: iterationGroup.id,
      status: 'complete',
      created: {
        child_variants_count: scalingResults.childVariants.length,
        videos_created_count: scalingResults.createdVideos.length
      },
      warnings: google_drive_url ? [] : ['No google_drive_url provided - videos not created'],
      correlation_id: correlationId
    });

  } catch (error) {
    console.error(`[${correlationId}] Scaling request failed:`, error);
    return NextResponse.json(
      { ok: false, error: 'Internal server error', correlation_id: correlationId },
      { status: 500 }
    );
  }
}
