-- Migration: Add task_queue table for distributed terminal task dispatch
-- Date: 2026-02-14
-- Purpose: Enable async task distribution to 8 Claude Code terminals via Supabase

CREATE TABLE IF NOT EXISTS public.task_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_name TEXT NOT NULL,
  assigned_terminal TEXT,  -- "T1", "T2", ..., "T8" (NULL = unassigned)
  status TEXT NOT NULL DEFAULT 'pending',  -- pending, claimed, in_progress, completed, failed
  priority INT NOT NULL DEFAULT 5,  -- 1-10 (10 = urgent)
  
  -- Payload: Claude Code prompt dispatcher
  prompt_text TEXT NOT NULL,  -- Full markdown prompt to pipe to `claude --print`
  depends_on UUID,  -- Task ID this task depends on (optional, for sequencing)
  
  -- Execution tracking
  result JSONB,  -- { commit: "abc123", output: "...", errors: [...], success: true/false }
  claimed_at TIMESTAMP,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  
  -- Metadata
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  -- Constraints
  UNIQUE(task_name, status),  -- Only one active version of a task
  CONSTRAINT valid_status CHECK (status IN ('pending', 'claimed', 'in_progress', 'completed', 'failed')),
  CONSTRAINT valid_priority CHECK (priority >= 1 AND priority <= 10),
  CONSTRAINT valid_terminal CHECK (assigned_terminal IS NULL OR assigned_terminal ~ '^T[1-8]$')
);

-- Indexes for efficient polling
CREATE INDEX IF NOT EXISTS idx_task_queue_status ON public.task_queue(status);
CREATE INDEX IF NOT EXISTS idx_task_queue_status_priority ON public.task_queue(status, priority DESC);
CREATE INDEX IF NOT EXISTS idx_task_queue_assigned ON public.task_queue(assigned_terminal);
CREATE INDEX IF NOT EXISTS idx_task_queue_depends_on ON public.task_queue(depends_on);
CREATE INDEX IF NOT EXISTS idx_task_queue_created_at ON public.task_queue(created_at DESC);

-- RLS Policies
ALTER TABLE public.task_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read task_queue"
  ON public.task_queue FOR SELECT
  USING (true);

CREATE POLICY "Only authenticated users can create tasks"
  ON public.task_queue FOR INSERT
  WITH CHECK (auth.role() = 'authenticated' AND created_by = auth.uid());

CREATE POLICY "Only terminal workers can update their own tasks"
  ON public.task_queue FOR UPDATE
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON public.task_queue TO authenticated;
GRANT ALL ON public.task_queue TO service_role;
