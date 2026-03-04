/**
 * FlashFlow Marketing Engine — Public API
 *
 * Re-exports the main modules for convenient imports:
 *   import { createPost, classifyClaimRisk, pushToLate } from '@/lib/marketing';
 */

export { createPost, isConfigured, getAccountsHealth, getAnalytics, pushDrafts } from './late-service';
export { pushToLate } from './late-client';
export { classifyClaimRisk } from './claim-risk';
export { enqueue, enqueueBatch, generateRunId } from './queue';
export { resolveTargets, getBrandAccounts, invalidateBrandCache } from './brand-accounts';
export * from './types';
