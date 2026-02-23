/**
 * Feedback Inbox – Zod validators for API inputs.
 */
import { z } from 'zod';

export const UpdateFeedbackItemSchema = z.object({
  status: z.enum(['new', 'triaged', 'in_progress', 'shipped', 'rejected']).optional(),
  priority: z.number().int().min(1).max(5).optional(),
  assignee: z.string().max(200).nullable().optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
});

export type UpdateFeedbackItemInput = z.infer<typeof UpdateFeedbackItemSchema>;
