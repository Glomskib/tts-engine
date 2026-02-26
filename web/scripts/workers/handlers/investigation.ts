import type { TaskHandler, TaskHandlerResult } from './index';

/**
 * investigation handler — stub.
 * TODO: implement investigation logic (gather logs, query DB, summarize findings, etc.)
 */
export const handleInvestigation: TaskHandler = async (payload, ctx): Promise<TaskHandlerResult> => {
  console.error(`[handler:investigation] task=${ctx.taskId} — not yet implemented, payload keys: ${Object.keys(payload).join(', ')}`);

  await ctx.touchProgress();

  return {
    summary: `investigation handler stub — no action taken for task ${ctx.taskId}`,
    no_proof_override: 'handler not yet implemented',
  };
};
