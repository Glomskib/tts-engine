import { NextRequest, NextResponse } from 'next/server';
import { getApiAuthContext } from '@/lib/supabase/api-auth';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { generateCorrelationId, createApiErrorResponse } from '@/lib/api-errors';
import { z } from 'zod';

export const runtime = 'nodejs';

const createTemplateSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(5000).optional(),
  category: z.string().min(1).max(50),
  hook_template: z.string().max(5000).optional(),
  body_template: z.string().max(10000).optional(),
  cta_template: z.string().max(5000).optional(),
  variables: z.array(z.string()).optional(),
  structure: z.record(z.string(), z.unknown()).optional(),
  tags: z.array(z.string()).optional(),
});

/**
 * GET /api/templates — list user's custom templates
 */
export async function GET(request: NextRequest) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

  try {
    const authContext = await getApiAuthContext(request);
    if (!authContext.user) {
      return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
    }

    const { data: templates, error } = await supabaseAdmin
      .from('custom_templates')
      .select('*')
      .or(`user_id.eq.${authContext.user.id},is_public.eq.true`)
      .order('created_at', { ascending: false });

    if (error) {
      console.error(`[${correlationId}] Templates fetch error:`, error);
      return createApiErrorResponse('DB_ERROR', 'Failed to fetch templates', 500, correlationId);
    }

    return NextResponse.json({
      ok: true,
      data: templates || [],
      correlation_id: correlationId,
    });
  } catch (error) {
    console.error(`[${correlationId}] Templates GET error:`, error);
    return createApiErrorResponse('INTERNAL', 'Internal server error', 500, correlationId);
  }
}

/**
 * POST /api/templates — create a custom template
 */
export async function POST(request: NextRequest) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

  try {
    const authContext = await getApiAuthContext(request);
    if (!authContext.user) {
      return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
    }

    const body = await request.json();
    const parsed = createTemplateSchema.safeParse(body);
    if (!parsed.success) {
      return createApiErrorResponse('BAD_REQUEST', parsed.error.issues[0]?.message || 'Invalid input', 400, correlationId);
    }

    const { name, description, category, hook_template, body_template, cta_template, variables, structure, tags } = parsed.data;

    // Auto-detect variables from templates
    const detectedVars = new Set<string>(variables || []);
    const varRegex = /\{\{(\w+)\}\}/g;
    for (const text of [hook_template, body_template, cta_template]) {
      if (text) {
        let match;
        while ((match = varRegex.exec(text)) !== null) {
          detectedVars.add(match[1]);
        }
      }
    }

    const { data: template, error } = await supabaseAdmin
      .from('custom_templates')
      .insert({
        user_id: authContext.user.id,
        name,
        description: description || null,
        category,
        hook_template: hook_template || null,
        body_template: body_template || null,
        cta_template: cta_template || null,
        variables: Array.from(detectedVars),
        structure: structure || {},
        tags: tags || [],
      })
      .select()
      .single();

    if (error) {
      console.error(`[${correlationId}] Template create error:`, error);
      return createApiErrorResponse('DB_ERROR', 'Failed to create template', 500, correlationId);
    }

    return NextResponse.json({
      ok: true,
      data: template,
      correlation_id: correlationId,
    }, { status: 201 });
  } catch (error) {
    console.error(`[${correlationId}] Templates POST error:`, error);
    return createApiErrorResponse('INTERNAL', 'Internal server error', 500, correlationId);
  }
}

/**
 * PATCH /api/templates — update a template
 */
export async function PATCH(request: NextRequest) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

  try {
    const authContext = await getApiAuthContext(request);
    if (!authContext.user) {
      return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
    }

    const body = await request.json();
    const { id, ...updates } = body;
    if (!id) {
      return createApiErrorResponse('BAD_REQUEST', 'Template ID required', 400, correlationId);
    }

    const allowed: Record<string, unknown> = {};
    if ('name' in updates) allowed.name = updates.name;
    if ('description' in updates) allowed.description = updates.description;
    if ('category' in updates) allowed.category = updates.category;
    if ('hook_template' in updates) allowed.hook_template = updates.hook_template;
    if ('body_template' in updates) allowed.body_template = updates.body_template;
    if ('cta_template' in updates) allowed.cta_template = updates.cta_template;
    if ('variables' in updates) allowed.variables = updates.variables;
    if ('structure' in updates) allowed.structure = updates.structure;
    if ('tags' in updates) allowed.tags = updates.tags;
    allowed.updated_at = new Date().toISOString();

    const { data: template, error } = await supabaseAdmin
      .from('custom_templates')
      .update(allowed)
      .eq('id', id)
      .eq('user_id', authContext.user.id)
      .select()
      .single();

    if (error) {
      console.error(`[${correlationId}] Template update error:`, error);
      return createApiErrorResponse('DB_ERROR', 'Failed to update template', 500, correlationId);
    }

    return NextResponse.json({ ok: true, data: template, correlation_id: correlationId });
  } catch (error) {
    console.error(`[${correlationId}] Templates PATCH error:`, error);
    return createApiErrorResponse('INTERNAL', 'Internal server error', 500, correlationId);
  }
}

/**
 * DELETE /api/templates?id=<template_id>
 */
export async function DELETE(request: NextRequest) {
  const correlationId = request.headers.get('x-correlation-id') || generateCorrelationId();

  try {
    const authContext = await getApiAuthContext(request);
    if (!authContext.user) {
      return createApiErrorResponse('UNAUTHORIZED', 'Authentication required', 401, correlationId);
    }

    const templateId = request.nextUrl.searchParams.get('id');
    if (!templateId) {
      return createApiErrorResponse('BAD_REQUEST', 'Template ID required', 400, correlationId);
    }

    const { error } = await supabaseAdmin
      .from('custom_templates')
      .delete()
      .eq('id', templateId)
      .eq('user_id', authContext.user.id);

    if (error) {
      console.error(`[${correlationId}] Template delete error:`, error);
      return createApiErrorResponse('DB_ERROR', 'Failed to delete template', 500, correlationId);
    }

    return NextResponse.json({ ok: true, correlation_id: correlationId });
  } catch (error) {
    console.error(`[${correlationId}] Templates DELETE error:`, error);
    return createApiErrorResponse('INTERNAL', 'Internal server error', 500, correlationId);
  }
}
