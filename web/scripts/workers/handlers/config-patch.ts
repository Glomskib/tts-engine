import type { TaskHandler, TaskHandlerResult } from './index';

/**
 * config_patch handler — stub.
 * TODO: implement config patching logic (update env vars, feature flags, etc.)
 */
export const handleConfigPatch: TaskHandler = async (payload, ctx): Promise<TaskHandlerResult> => {
  console.error(`[handler:config_patch] task=${ctx.taskId} — not yet implemented, payload keys: ${Object.keys(payload).join(', ')}`);

  await ctx.touchProgress();

  return {
    summary: `config_patch handler stub — no action taken for task ${ctx.taskId}`,
    no_proof_override: 'handler not yet implemented',
  };
};
