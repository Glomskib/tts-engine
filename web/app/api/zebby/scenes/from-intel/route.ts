import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import {
  generateCorrelationId,
  createApiErrorResponse,
} from '@/lib/api-errors';
import { postMCDoc } from '@/lib/flashflow/mission-control';
import { buildZebbyScenes } from '@/lib/zebby/scene-builder';
import type { ZebbySceneOutput, BuildScenesResult } from '@/lib/zebby/scene-builder';
import { logUsageEventAsync } from '@/lib/finops/log-usage';
import { aiRouteGuard } from '@/lib/ai-route-guard';

export const runtime = 'nodejs';
export const maxDuration = 120;

const RequestSchema = z.object({
  intel_text: z.string().min(20, 'intel_text must be at least 20 characters'),
  include_storyboard: z.boolean().optional().default(false),
  character_focus: z
    .array(z.enum(['Zebby', 'Spoonie', 'Bracer']))
    .optional(),
  post_to_mc: z.boolean().optional().default(false),
});

function formatScenesAsMarkdown(output: ZebbySceneOutput): string {
  const lines: string[] = [];

  lines.push('## Scenes\n');
  for (const [i, scene] of output.scenes.entries()) {
    lines.push(`### Scene ${i + 1}: ${scene.title}`);
    lines.push(`**Characters:** ${scene.characters.join(', ')}`);
    lines.push(`**Mood:** ${scene.mood}`);
    lines.push(`**Setting:** ${scene.setting}`);
    lines.push(`\n${scene.description}\n`);
  }

  lines.push('## Image Prompts\n');
  for (const ip of output.image_prompts) {
    lines.push(`### Scene ${ip.scene_index + 1} Prompt`);
    lines.push('```');
    lines.push(ip.prompt);
    lines.push('```');
    lines.push(`**Negative:** ${ip.negative_prompt}`);
    lines.push(`**Style notes:** ${ip.style_notes}\n`);
  }

  if (output.storyboard) {
    lines.push('## Storyboard\n');
    lines.push(`**Duration:** ${output.storyboard.duration_seconds}s`);
    lines.push(`**Scene flow:** ${output.storyboard.scene_flow}\n`);
    lines.push('**VO Lines:**');
    for (const [i, line] of output.storyboard.vo_lines.entries()) {
      lines.push(`${i + 1}. ${line}`);
    }
    lines.push('');
  }

  lines.push(`## Sources\n\n${output.source_summary}\n`);
  lines.push(`---\n\n*${output.disclaimer}*`);

  return lines.join('\n');
}

export async function POST(request: Request) {
  const guard = await aiRouteGuard(request, { creditCost: 3, userLimit: 3 });
  if (guard.error) return guard.error;

  const correlationId = generateCorrelationId();

  // Auth
  const authContext = await getApiAuthContext(request);
  if (!authContext.user) {
    return createApiErrorResponse(
      'UNAUTHORIZED',
      'Authentication required',
      401,
      correlationId,
    );
  }

  // Parse body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return createApiErrorResponse(
      'BAD_REQUEST',
      'Invalid JSON body',
      400,
      correlationId,
    );
  }

  // Validate
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return createApiErrorResponse(
      'VALIDATION_ERROR',
      parsed.error.issues.map((i) => i.message).join('; '),
      422,
      correlationId,
      { issues: parsed.error.issues },
    );
  }

  const { intel_text, include_storyboard, character_focus, post_to_mc } =
    parsed.data;

  // Generate scenes
  let scenes: BuildScenesResult;
  try {
    scenes = await buildZebbyScenes(intel_text, {
      include_storyboard,
      character_focus,
    });
  } catch (err) {
    console.error(`[${correlationId}] Zebby scene build failed:`, err);
    return createApiErrorResponse(
      'AI_ERROR',
      'Failed to generate Zebby scenes',
      500,
      correlationId,
    );
  }

  // ── FinOps: log usage (fire-and-forget) ──
  if (scenes.usage) {
    logUsageEventAsync({
      source: 'flashflow',
      lane: "Zebby's World",
      provider: 'anthropic',
      model: scenes.model ?? 'claude-sonnet-4-6',
      input_tokens: scenes.usage.input_tokens,
      output_tokens: scenes.usage.output_tokens,
      user_id: authContext.user.id,
      endpoint: '/api/zebby/scenes/from-intel',
      template_key: 'zebby_scenes',
      agent_id: 'zebby-scene-builder',
      correlation_id: correlationId,
      latency_ms: scenes.latency_ms,
    });
  }

  // Post to Mission Control if requested
  let mcDocId: string | undefined;
  if (post_to_mc) {
    const today = new Date().toISOString().slice(0, 10);
    const markdown = formatScenesAsMarkdown(scenes);
    const mcResult = await postMCDoc({
      title: `Zebby Scenes — ${today}`,
      content: markdown,
      category: 'plans',
      lane: "Zebby's World",
      tags: ['zebby-scenes'],
    });

    if (mcResult.ok) {
      mcDocId = mcResult.id;
    } else {
      console.error(
        `[${correlationId}] MC post failed: ${mcResult.error}`,
      );
    }
  }

  const response = NextResponse.json(
    {
      ok: true,
      scenes: scenes.scenes,
      image_prompts: scenes.image_prompts,
      storyboard: scenes.storyboard,
      disclaimer: scenes.disclaimer,
      source_summary: scenes.source_summary,
      mc_doc_id: mcDocId,
      correlation_id: correlationId,
    },
    { status: 200 },
  );

  response.headers.set('x-correlation-id', correlationId);
  return response;
}
