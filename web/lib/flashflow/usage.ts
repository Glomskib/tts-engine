/**
 * FlashFlow Usage Logging Facade
 *
 * Thin re-export from lib/finops for convenience.
 * Use this when importing from the flashflow namespace:
 *   import { logUsage, logToolUsage } from '@/lib/flashflow/usage';
 */

export {
  logUsageEventAsync as logUsage,
  logToolUsageEventAsync as logToolUsage,
  estimateTokens,
  costFromUsage,
} from '@/lib/finops';

export type {
  LogUsageEventInput,
  LogToolUsageEventInput,
} from '@/lib/finops';
