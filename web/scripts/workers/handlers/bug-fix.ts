import type { TaskHandler, TaskHandlerResult } from './index';

/**
 * bug_fix handler — stub.
 * TODO: implement actual bug fix logic (grep for error, propose patch, etc.)
 */
export const handleBugFix: TaskHandler = async (payload, ctx): Promise<TaskHandlerResult> => {
  console.error(`[handler:bug_fix] task=${ctx.taskId} — not yet implemented, payload keys: ${Object.keys(payload).join(', ')}`);

  await ctx.touchProgress();

  return {
    summary: `bug_fix handler stub — no action taken for task ${ctx.taskId}`,
    no_proof_override: 'handler not yet implemented',
  };
};
