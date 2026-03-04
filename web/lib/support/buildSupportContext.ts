/**
 * Builds a formatted prompt string from support thread data for the LLM.
 */

import { FLASHFLOW_KNOWLEDGE_BASE } from '@/lib/flashflow-knowledge';

export interface SupportContextInput {
  thread: {
    id: string;
    subject: string;
    status: string;
    priority: string;
    tags: string[] | null;
    user_email: string | null;
    created_at: string;
  };
  messages: {
    sender_type: string;
    sender_email: string | null;
    body: string;
    is_internal: boolean;
    created_at: string;
  }[];
  userPlan: string | null;
  userAccountAge: string | null;
}

const SENDER_LABELS: Record<string, string> = {
  user: 'User',
  admin: 'Admin',
  system: 'System',
};

export function buildSupportContext(input: SupportContextInput): string {
  const { thread, messages, userPlan, userAccountAge } = input;

  // Filter out internal notes and take last 15 messages
  const visibleMessages = messages
    .filter((m) => !m.is_internal)
    .slice(-15);

  const conversationLines = visibleMessages.map((m) => {
    const label = SENDER_LABELS[m.sender_type] || m.sender_type;
    const ts = new Date(m.created_at).toISOString().slice(0, 16).replace('T', ' ');
    return `[${label}] (${ts}): ${m.body}`;
  });

  // Find the last user message
  const lastUserMsg = [...visibleMessages]
    .reverse()
    .find((m) => m.sender_type === 'user');

  const parts: string[] = [];

  // Ticket summary
  parts.push('## Ticket Summary');
  parts.push(`- Subject: ${thread.subject}`);
  parts.push(`- Status: ${thread.status}`);
  parts.push(`- Priority: ${thread.priority}`);
  parts.push(`- Created: ${new Date(thread.created_at).toISOString().slice(0, 10)}`);
  if (thread.tags?.length) {
    parts.push(`- Tags: ${thread.tags.join(', ')}`);
  }

  // Customer context
  parts.push('');
  parts.push('## Customer Context');
  parts.push(`- Email: ${thread.user_email || 'anonymous'}`);
  if (userPlan) parts.push(`- Plan: ${userPlan}`);
  if (userAccountAge) parts.push(`- Account age: ${userAccountAge}`);

  // Conversation history
  parts.push('');
  parts.push('## Conversation History');
  if (conversationLines.length > 0) {
    parts.push(conversationLines.join('\n'));
  } else {
    parts.push('(No messages yet)');
  }

  // Highlight last user message
  if (lastUserMsg) {
    parts.push('');
    parts.push('## Last User Message (respond to this)');
    parts.push(lastUserMsg.body);
  }

  // Knowledge base
  parts.push('');
  parts.push('## FlashFlow Knowledge Base');
  parts.push(FLASHFLOW_KNOWLEDGE_BASE);

  return parts.join('\n');
}
