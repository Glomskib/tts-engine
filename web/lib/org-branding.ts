/**
 * Organization Branding Resolver
 *
 * Event-based per-org branding with Tailwind accent color mapping.
 * Uses video_events table with video_id null for org-level events.
 *
 * Event type: "client_org_branding_set"
 * details: { org_id, updated_by_user_id, branding: { ... } }
 */

import { SupabaseClient } from '@supabase/supabase-js'
import { brandName, accentColorClass, accentTextClass, logoText } from './brand'

// Allowed accent color values
export type AccentColor = 'indigo' | 'emerald' | 'cyan' | 'amber' | 'rose' | 'violet' | 'blue' | 'teal' | 'slate'

// Branding configuration shape
export interface OrgBranding {
  org_display_name?: string
  logo_url?: string
  accent_color?: AccentColor
  welcome_message?: string
}

// Full branding with defaults applied
export interface EffectiveOrgBranding {
  org_display_name: string
  logo_url: string | null
  accent_color: AccentColor
  welcome_message: string | null
  // Computed Tailwind classes
  accent_bg_class: string
  accent_text_class: string
  accent_ring_class: string
  accent_border_class: string
}

// Event type constant
export const ORG_BRANDING_EVENT_TYPE = 'client_org_branding_set'

// Tailwind color class mappings
const ACCENT_COLOR_CLASSES: Record<AccentColor, {
  bg: string
  text: string
  ring: string
  border: string
}> = {
  indigo: {
    bg: 'bg-indigo-600',
    text: 'text-indigo-600',
    ring: 'ring-indigo-500',
    border: 'border-indigo-500',
  },
  emerald: {
    bg: 'bg-emerald-600',
    text: 'text-emerald-600',
    ring: 'ring-emerald-500',
    border: 'border-emerald-500',
  },
  cyan: {
    bg: 'bg-cyan-600',
    text: 'text-cyan-600',
    ring: 'ring-cyan-500',
    border: 'border-cyan-500',
  },
  amber: {
    bg: 'bg-amber-600',
    text: 'text-amber-600',
    ring: 'ring-amber-500',
    border: 'border-amber-500',
  },
  rose: {
    bg: 'bg-rose-600',
    text: 'text-rose-600',
    ring: 'ring-rose-500',
    border: 'border-rose-500',
  },
  violet: {
    bg: 'bg-violet-600',
    text: 'text-violet-600',
    ring: 'ring-violet-500',
    border: 'border-violet-500',
  },
  blue: {
    bg: 'bg-blue-600',
    text: 'text-blue-600',
    ring: 'ring-blue-500',
    border: 'border-blue-500',
  },
  teal: {
    bg: 'bg-teal-600',
    text: 'text-teal-600',
    ring: 'ring-teal-500',
    border: 'border-teal-500',
  },
  slate: {
    bg: 'bg-slate-800',
    text: 'text-slate-800',
    ring: 'ring-slate-600',
    border: 'border-slate-600',
  },
}

/**
 * Get Tailwind classes for an accent color
 */
export function getAccentColorClass(accentColor: AccentColor | undefined): {
  bg: string
  text: string
  ring: string
  border: string
} {
  const color = accentColor || 'slate'
  return ACCENT_COLOR_CLASSES[color] || ACCENT_COLOR_CLASSES.slate
}

/**
 * Get default org branding (uses global brand.ts)
 */
export function getDefaultOrgBranding(): EffectiveOrgBranding {
  const classes = getAccentColorClass('slate')
  return {
    org_display_name: brandName,
    logo_url: null,
    accent_color: 'slate',
    welcome_message: null,
    accent_bg_class: classes.bg,
    accent_text_class: classes.text,
    accent_ring_class: classes.ring,
    accent_border_class: classes.border,
  }
}

/**
 * Get organization branding (merges defaults with latest event)
 */
export async function getOrgBranding(
  supabase: SupabaseClient,
  orgId: string
): Promise<EffectiveOrgBranding> {
  const defaults = getDefaultOrgBranding()

  try {
    // Get most recent branding event for this org
    const { data: events, error } = await supabase
      .from('video_events')
      .select('details, created_at')
      .eq('event_type', ORG_BRANDING_EVENT_TYPE)
      .order('created_at', { ascending: false })
      .limit(100)

    if (error || !events) {
      console.error('Error fetching org branding:', error)
      return defaults
    }

    // Find the most recent event for this org
    const brandingEvent = events.find((e) => e.details?.org_id === orgId)
    if (!brandingEvent || !brandingEvent.details?.branding) {
      return defaults
    }

    const branding = brandingEvent.details.branding as OrgBranding

    // Merge with defaults
    const effectiveAccent = branding.accent_color || 'slate'
    const classes = getAccentColorClass(effectiveAccent)

    return {
      org_display_name: branding.org_display_name || defaults.org_display_name,
      logo_url: branding.logo_url || null,
      accent_color: effectiveAccent,
      welcome_message: branding.welcome_message || null,
      accent_bg_class: classes.bg,
      accent_text_class: classes.text,
      accent_ring_class: classes.ring,
      accent_border_class: classes.border,
    }
  } catch (err) {
    console.error('Error getting org branding:', err)
    return defaults
  }
}

/**
 * Get raw branding data for an organization (for admin editing)
 */
export async function getRawOrgBranding(
  supabase: SupabaseClient,
  orgId: string
): Promise<OrgBranding | null> {
  try {
    const { data: events, error } = await supabase
      .from('video_events')
      .select('details, created_at')
      .eq('event_type', ORG_BRANDING_EVENT_TYPE)
      .order('created_at', { ascending: false })
      .limit(100)

    if (error || !events) {
      return null
    }

    const brandingEvent = events.find((e) => e.details?.org_id === orgId)
    if (!brandingEvent || !brandingEvent.details?.branding) {
      return null
    }

    return brandingEvent.details.branding as OrgBranding
  } catch (err) {
    console.error('Error getting raw org branding:', err)
    return null
  }
}

/**
 * Sanitize logo URL (basic validation)
 */
export function sanitizeLogoUrl(url: string | undefined | null): string | null {
  if (!url || typeof url !== 'string') {
    return null
  }

  const trimmed = url.trim()
  if (trimmed.length === 0) {
    return null
  }

  // Basic URL validation - must start with http:// or https://
  if (!trimmed.match(/^https?:\/\/.+/i)) {
    return null
  }

  // Limit length to prevent abuse
  if (trimmed.length > 500) {
    return null
  }

  return trimmed
}

/**
 * Validate accent color value
 */
export function isValidAccentColor(color: string | undefined | null): color is AccentColor {
  if (!color) return false
  return Object.keys(ACCENT_COLOR_CLASSES).includes(color)
}

/**
 * Get all available accent color options (for admin UI)
 */
export function getAccentColorOptions(): { value: AccentColor; label: string }[] {
  return [
    { value: 'slate', label: 'Slate (Default)' },
    { value: 'blue', label: 'Blue' },
    { value: 'indigo', label: 'Indigo' },
    { value: 'violet', label: 'Violet' },
    { value: 'rose', label: 'Rose' },
    { value: 'amber', label: 'Amber' },
    { value: 'emerald', label: 'Emerald' },
    { value: 'cyan', label: 'Cyan' },
    { value: 'teal', label: 'Teal' },
  ]
}
