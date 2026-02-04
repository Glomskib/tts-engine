/**
 * Centralized Configuration for FlashFlow AI
 *
 * Runtime configuration derived from environment variables.
 * All env var access should go through this module.
 */

export const config = {
  app: {
    name: 'FlashFlow AI',
    url: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
    environment: process.env.NODE_ENV || 'development',
  },

  features: {
    adminUiEnabled: process.env.ADMIN_UI_ENABLED === 'true',
    debugAi: process.env.DEBUG_AI === '1',
  },

  limits: {
    freeCredits: 5,
    maxUploadSize: 10 * 1024 * 1024, // 10MB
  },

  ai: {
    defaultModel: 'claude-sonnet-4-20250514',
    maxTokens: 4096,
  },
} as const;
