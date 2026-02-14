/**
 * POST /api/task-queue/dispatch
 * 
 * Dispatch a task to the task_queue for Claude Code workers.
 * Called by Telegram relay or Brandon directly.
 * 
 * Body:
 * {
 *   "task_name": "T1 - Production Fixes",
 *   "prompt_text": "You are working on FlashFlow...",
 *   "priority": 10,  // 1-10
 *   "depends_on": null  // optional task ID to wait for
 * }
 * 
 * Returns:
 * {
 *   "ok": true,
 *   "data": {
 *     "id": "uuid",
 *     "task_name": "...",
 *     "status": "pending",
 *     "created_at": "2026-02-14T..."
 *   }
 * }
 */

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    // Validate dispatch API key from header
    const dispatchKey = req.headers.get('x-dispatch-key');
    if (!dispatchKey || dispatchKey !== process.env.DISPATCH_API_KEY) {
      return NextResponse.json(
        { ok: false, error: 'Invalid or missing x-dispatch-key header' },
        { status: 401 }
      );
    }

    // Parse request body
    const body = await req.json();
    const { task_name, prompt_text, priority = 5, depends_on = null } = body;

    // Validate required fields
    if (!task_name || !prompt_text) {
      return NextResponse.json(
        { ok: false, error: 'Missing required fields: task_name, prompt_text' },
        { status: 400 }
      );
    }

    if (priority < 1 || priority > 10) {
      return NextResponse.json(
        { ok: false, error: 'Priority must be between 1 and 10' },
        { status: 400 }
      );
    }

    // Create Supabase client (service role for API key auth)
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Insert task into queue
    const { data: task, error } = await supabase
      .from('task_queue')
      .insert({
        task_name,
        prompt_text,
        priority: Math.max(1, Math.min(10, priority)),
        depends_on: depends_on || null,
        status: 'pending',
        created_by: null,  // API key dispatch, not user-authenticated
      })
      .select()
      .single();

    if (error) {
      console.error('[task-queue] Insert error:', error);
      return NextResponse.json(
        { ok: false, error: `Failed to create task: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        data: {
          id: task.id,
          task_name: task.task_name,
          status: task.status,
          priority: task.priority,
          created_at: task.created_at,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('[task-queue/dispatch] Error:', error);
    return NextResponse.json(
      { ok: false, error: `Internal server error: ${String(error)}` },
      { status: 500 }
    );
  }
}

// GET endpoint to check task status
export async function GET(req: NextRequest) {
  try {
    const taskId = req.nextUrl.searchParams.get('id');

    if (!taskId) {
      return NextResponse.json(
        { ok: false, error: 'Missing task_id query parameter' },
        { status: 400 }
      );
    }

    // Create Supabase client (service role for API)
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: task, error } = await supabase
      .from('task_queue')
      .select('*')
      .eq('id', taskId)
      .single();

    if (error) {
      return NextResponse.json(
        { ok: false, error: `Task not found: ${error.message}` },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      data: {
        id: task.id,
        task_name: task.task_name,
        status: task.status,
        priority: task.priority,
        assigned_terminal: task.assigned_terminal,
        claimed_at: task.claimed_at,
        started_at: task.started_at,
        completed_at: task.completed_at,
        result: task.result,
      },
    });
  } catch (error) {
    console.error('[task-queue/dispatch GET] Error:', error);
    return NextResponse.json(
      { ok: false, error: `Internal server error: ${String(error)}` },
      { status: 500 }
    );
  }
}
