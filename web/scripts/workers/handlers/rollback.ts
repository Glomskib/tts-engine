import type { TaskHandler, TaskHandlerResult } from './index';

/**
 * rollback handler — stub.
 * TODO: implement actual rollback logic (revert deploy, restore config, etc.)
 */
export const handleRollback: TaskHandler = async (payload, ctx): Promise<TaskHandlerResult> => {
  console.error(`[handler:rollback] task=${ctx.taskId} — not yet implemented, payload keys: ${Object.keys(payload).join(', ')}`);

  await ctx.touchProgress();

  return {
    summary: `rollback handler stub — no action taken for task ${ctx.taskId}`,
    no_proof_override: 'handler not yet implemented',
  };
};
