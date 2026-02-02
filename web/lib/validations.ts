/**
 * Zod validation schemas for forms across the application
 */

import { z } from 'zod';

// Common validation patterns
const urlPattern = /^https?:\/\/.+/i;
const googleDrivePattern = /drive\.google\.com/i;

// ============================================
// User & Auth Schemas
// ============================================

export const emailSchema = z
  .string()
  .min(1, 'Email is required')
  .email('Please enter a valid email address');

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number');

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
});

export const signupSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

// ============================================
// Script Generation Schemas
// ============================================

export const productInfoSchema = z.object({
  productName: z.string().min(1, 'Product name is required').max(100),
  productDescription: z.string().max(2000).optional(),
  productUrl: z.string().url('Please enter a valid URL').optional().or(z.literal('')),
  targetAudience: z.string().max(500).optional(),
  brandVoice: z.string().max(500).optional(),
});

export const scriptSettingsSchema = z.object({
  duration: z.enum(['15', '30', '60', '90']),
  style: z.string().min(1, 'Please select a style'),
  tone: z.string().optional(),
  platform: z.enum(['tiktok', 'instagram', 'youtube_shorts', 'all']).optional(),
});

export const generateScriptSchema = productInfoSchema.merge(scriptSettingsSchema);

// ============================================
// Video Request Schemas
// ============================================

export const googleDriveLinkSchema = z
  .string()
  .min(1, 'Google Drive link is required')
  .regex(urlPattern, 'Please enter a valid URL')
  .regex(googleDrivePattern, 'Please enter a valid Google Drive link');

export const videoRequestSchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  description: z.string().max(1000).optional(),
  source_drive_link: googleDriveLinkSchema,
  script_id: z.string().uuid().optional(),
  content_type: z.enum(['scripted', 'ugc', 'b-roll', 'other']),
  priority: z.number().min(0).max(3),
});

// ============================================
// Skit/Script Library Schemas
// ============================================

export const skitFilterSchema = z.object({
  search: z.string().optional(),
  status: z.enum(['all', 'pending', 'approved', 'rejected']).optional(),
  category: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

// ============================================
// Onboarding Schemas
// ============================================

export const businessInfoSchema = z.object({
  businessName: z.string().min(1, 'Business name is required').max(100),
  industry: z.string().min(1, 'Please select an industry'),
  website: z.string().url('Please enter a valid URL').optional().or(z.literal('')),
  size: z.enum(['solo', 'small', 'medium', 'large', 'enterprise']).optional(),
});

export const creatorProfileSchema = z.object({
  displayName: z.string().min(1, 'Display name is required').max(50),
  handle: z
    .string()
    .min(3, 'Handle must be at least 3 characters')
    .max(20)
    .regex(/^[a-zA-Z0-9_]+$/, 'Handle can only contain letters, numbers, and underscores'),
  bio: z.string().max(300).optional(),
  platforms: z.array(z.string()).min(1, 'Select at least one platform'),
});

// ============================================
// Type exports
// ============================================

export type LoginInput = z.infer<typeof loginSchema>;
export type SignupInput = z.infer<typeof signupSchema>;
export type ProductInfoInput = z.infer<typeof productInfoSchema>;
export type ScriptSettingsInput = z.infer<typeof scriptSettingsSchema>;
export type GenerateScriptInput = z.infer<typeof generateScriptSchema>;
export type VideoRequestInput = z.infer<typeof videoRequestSchema>;
export type SkitFilterInput = z.infer<typeof skitFilterSchema>;
export type BusinessInfoInput = z.infer<typeof businessInfoSchema>;
export type CreatorProfileInput = z.infer<typeof creatorProfileSchema>;

// ============================================
// Validation helpers
// ============================================

/**
 * Safely parse data with a Zod schema
 * Returns { success: true, data } or { success: false, errors }
 */
export function safeValidate<T>(schema: z.ZodSchema<T>, data: unknown):
  | { success: true; data: T; errors: null }
  | { success: false; data: null; errors: Record<string, string> } {
  const result = schema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data, errors: null };
  }

  const errors: Record<string, string> = {};
  result.error.issues.forEach((err) => {
    const path = err.path.join('.');
    if (!errors[path]) {
      errors[path] = err.message;
    }
  });

  return { success: false, data: null, errors };
}

/**
 * Get first error message from Zod validation result
 */
export function getFirstError(result: { success: boolean; error?: { issues: Array<{ message: string }> } }): string | null {
  if (result.success) return null;
  return result.error?.issues[0]?.message || 'Validation failed';
}
