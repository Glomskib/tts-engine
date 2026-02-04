/**
 * Centralized Constants for FlashFlow AI
 *
 * Single source of truth for magic numbers, string constants, and
 * configuration values used across the application.
 */

/** Application metadata */
export const APP = {
  NAME: 'FlashFlow AI',
  TAGLINE: 'Ideas move faster here',
  SUPPORT_EMAIL: 'support@flashflow.ai',
} as const;

/** Video pipeline status values */
export const VIDEO_STATUS = {
  DRAFT: 'draft',
  NEEDS_EDIT: 'needs_edit',
  READY_TO_POST: 'ready_to_post',
  POSTED: 'posted',
  FAILED: 'failed',
  ARCHIVED: 'archived',
} as const;

/** Skit workflow status values */
export const SKIT_STATUS = {
  DRAFT: 'draft',
  APPROVED: 'approved',
  PRODUCED: 'produced',
  POSTED: 'posted',
  ARCHIVED: 'archived',
} as const;

/** User roles in order of privilege */
export const ROLES = {
  ADMIN: 'admin',
  EDITOR: 'editor',
  RECORDER: 'recorder',
  UPLOADER: 'uploader',
  CLIENT: 'client',
} as const;

/** Credit costs for various operations */
export const CREDIT_COSTS = {
  SCRIPT_GENERATION: 1,
  SCRIPT_REWRITE: 1,
  SCRIPT_REFINEMENT: 1,
  AI_CHAT: 1,
  HOOK_GENERATION: 1,
  IMAGE_GENERATION: 1,
} as const;

/** Default credit allocation for free users */
export const FREE_CREDITS = 5;

/** Risk tiers for compliance */
export const RISK_TIERS = {
  SAFE: 'SAFE',
  BALANCED: 'BALANCED',
  SPICY: 'SPICY',
} as const;

/** Display limits */
export const LIMITS = {
  MAX_HOOKS_DISPLAY: 50,
  MAX_WINNERS_DISPLAY: 100,
  MAX_PRODUCTS_FREE: 3,
  MAX_PRODUCTS_STARTER: 10,
  MAX_BEAT_COUNT: 12,
  MAX_HOOK_LENGTH: 150,
  MAX_CTA_OVERLAY_LENGTH: 40,
  MAX_ON_SCREEN_TEXT_LENGTH: 50,
} as const;

/** Pagination defaults */
export const PAGINATION = {
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
} as const;

/** Content funnel stages */
export const FUNNEL_STAGES = {
  AWARENESS: 'awareness',
  CONSIDERATION: 'consideration',
  CONVERSION: 'conversion',
} as const;

/** Subscription plan IDs */
export const PLANS = {
  FREE: 'free',
  STARTER: 'starter',
  CREATOR: 'creator',
  BUSINESS: 'business',
  VIDEO_STARTER: 'video_starter',
  VIDEO_GROWTH: 'video_growth',
  VIDEO_SCALE: 'video_scale',
  VIDEO_AGENCY: 'video_agency',
} as const;

/** Invitation settings */
export const INVITATION = {
  EXPIRY_DAYS: 7,
  TOKEN_LENGTH: 32,
} as const;

/** HTTP status codes used in API responses */
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  PAYMENT_REQUIRED: 402,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INTERNAL_ERROR: 500,
} as const;
