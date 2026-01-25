/**
 * Organization Invite Management
 *
 * Event-based invite system using events_log table for org-level events.
 * Secure token generation and hashing for invite links.
 *
 * Event types (stored in events_log with entity_type='client_org'):
 * - org_invite_created: { invite_id, email, role, token_hash, expires_at, actor_user_id }
 * - org_invite_accepted: { invite_id, user_id, actor_user_id }
 * - org_invite_revoked: { invite_id, actor_user_id }
 * - org_invite_resent: { invite_id, new_token_hash, new_expires_at, actor_user_id }
 * - client_org_member_set: { user_id, role, action, source?, invite_id?, actor_user_id }
 */

import { SupabaseClient } from '@supabase/supabase-js'
import { randomBytes, createHash, timingSafeEqual } from 'crypto'
import { randomUUID } from 'crypto'
import { logEvent } from './events-log'

// Types
export type InviteRole = 'client' | 'recorder' | 'editor' | 'uploader' | 'admin'

export interface OrgInvite {
  invite_id: string
  org_id: string
  email: string
  role: InviteRole
  status: 'pending' | 'accepted' | 'revoked'
  token_hash: string
  expires_at: string
  created_at: string
  created_by_user_id: string
}

export interface OrgMemberWithEmail {
  user_id: string
  email: string | null
  role: 'owner' | 'member'
  joined_at: string
}

// Event type constants
export const ORG_INVITE_EVENT_TYPES = {
  INVITE_CREATED: 'org_invite_created',
  INVITE_ACCEPTED: 'org_invite_accepted',
  INVITE_REVOKED: 'org_invite_revoked',
  INVITE_RESENT: 'org_invite_resent',
} as const

// Token configuration
const TOKEN_LENGTH = 32 // 32 bytes = 64 hex characters
const INVITE_EXPIRY_DAYS = 7

/**
 * Generate a secure random invite token
 */
export function generateInviteToken(): string {
  return randomBytes(TOKEN_LENGTH).toString('hex')
}

/**
 * Hash an invite token for storage
 * Uses SHA-256 for one-way hashing
 */
export function hashInviteToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/**
 * Constant-time comparison of token hashes
 * Prevents timing attacks
 */
export function compareTokenHash(providedToken: string, storedHash: string): boolean {
  const providedHash = hashInviteToken(providedToken)
  try {
    return timingSafeEqual(
      Buffer.from(providedHash, 'hex'),
      Buffer.from(storedHash, 'hex')
    )
  } catch {
    return false
  }
}

/**
 * Get expiry date for a new invite
 */
export function getInviteExpiryDate(): string {
  const expiry = new Date()
  expiry.setDate(expiry.getDate() + INVITE_EXPIRY_DAYS)
  return expiry.toISOString()
}

/**
 * Check if an invite has expired
 */
export function isInviteExpired(expiresAt: string): boolean {
  return new Date(expiresAt) < new Date()
}

/**
 * Create an organization invite
 * Returns the plain token (only time it's available) and invite_id
 */
export async function createOrgInvite(
  supabase: SupabaseClient,
  params: {
    org_id: string
    email: string
    role: InviteRole
    actor_user_id: string
  }
): Promise<{ invite_id: string; token: string; expires_at: string }> {
  const invite_id = randomUUID()
  const token = generateInviteToken()
  const token_hash = hashInviteToken(token)
  const expires_at = getInviteExpiryDate()

  try {
    await logEvent(supabase, {
      entity_type: 'client_org',
      entity_id: params.org_id,
      event_type: ORG_INVITE_EVENT_TYPES.INVITE_CREATED,
      payload: {
        invite_id,
        email: params.email.toLowerCase().trim(),
        role: params.role,
        token_hash,
        expires_at,
        actor_user_id: params.actor_user_id,
      },
    })
  } catch (error) {
    throw new Error(`Failed to create invite: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }

  return { invite_id, token, expires_at }
}

/**
 * List pending invites for an organization
 */
export async function listOrgInvites(
  supabase: SupabaseClient,
  orgId: string
): Promise<OrgInvite[]> {
  // Get all invite events for this org from events_log
  const { data: events, error } = await supabase
    .from('events_log')
    .select('event_type, payload, created_at')
    .eq('entity_type', 'client_org')
    .eq('entity_id', orgId)
    .in('event_type', [
      ORG_INVITE_EVENT_TYPES.INVITE_CREATED,
      ORG_INVITE_EVENT_TYPES.INVITE_ACCEPTED,
      ORG_INVITE_EVENT_TYPES.INVITE_REVOKED,
      ORG_INVITE_EVENT_TYPES.INVITE_RESENT,
    ])
    .order('created_at', { ascending: true })

  if (error || !events) {
    return []
  }

  // Build current state of invites
  const inviteMap = new Map<string, OrgInvite>()

  for (const event of events) {
    const payload = event.payload as Record<string, unknown>
    const inviteId = payload?.invite_id as string
    if (!inviteId) continue

    if (event.event_type === ORG_INVITE_EVENT_TYPES.INVITE_CREATED) {
      inviteMap.set(inviteId, {
        invite_id: inviteId,
        org_id: orgId,
        email: payload.email as string,
        role: payload.role as InviteRole,
        status: 'pending',
        token_hash: payload.token_hash as string,
        expires_at: payload.expires_at as string,
        created_at: event.created_at,
        created_by_user_id: (payload.actor_user_id as string) || '',
      })
    } else if (event.event_type === ORG_INVITE_EVENT_TYPES.INVITE_RESENT) {
      const existing = inviteMap.get(inviteId)
      if (existing) {
        existing.token_hash = payload.new_token_hash as string
        existing.expires_at = payload.new_expires_at as string
        existing.status = 'pending'
      }
    } else if (event.event_type === ORG_INVITE_EVENT_TYPES.INVITE_ACCEPTED) {
      const existing = inviteMap.get(inviteId)
      if (existing) {
        existing.status = 'accepted'
      }
    } else if (event.event_type === ORG_INVITE_EVENT_TYPES.INVITE_REVOKED) {
      const existing = inviteMap.get(inviteId)
      if (existing) {
        existing.status = 'revoked'
      }
    }
  }

  // Return all invites (including accepted/revoked for audit)
  return Array.from(inviteMap.values())
}

/**
 * Get pending invites only (not accepted or revoked)
 */
export async function listPendingOrgInvites(
  supabase: SupabaseClient,
  orgId: string
): Promise<OrgInvite[]> {
  const allInvites = await listOrgInvites(supabase, orgId)
  return allInvites.filter(
    (inv) => inv.status === 'pending' && !isInviteExpired(inv.expires_at)
  )
}

/**
 * Get invite by token (for accepting)
 */
export async function getInviteByToken(
  supabase: SupabaseClient,
  token: string
): Promise<OrgInvite | null> {
  const tokenHash = hashInviteToken(token)

  // Get all invite created events from events_log
  const { data: events, error } = await supabase
    .from('events_log')
    .select('entity_id, payload, created_at')
    .eq('entity_type', 'client_org')
    .eq('event_type', ORG_INVITE_EVENT_TYPES.INVITE_CREATED)
    .order('created_at', { ascending: false })

  if (error || !events) {
    return null
  }

  // Find invite with matching token hash
  for (const event of events) {
    const payload = event.payload as Record<string, unknown>
    if (payload?.token_hash === tokenHash) {
      const inviteId = payload.invite_id as string
      const orgId = event.entity_id

      // Check if invite is still valid (not accepted, not revoked)
      const allInvites = await listOrgInvites(supabase, orgId)
      const invite = allInvites.find((inv) => inv.invite_id === inviteId)

      if (invite && invite.status === 'pending') {
        // Check for resent tokens
        const { data: resentEvents } = await supabase
          .from('events_log')
          .select('payload')
          .eq('entity_type', 'client_org')
          .eq('entity_id', orgId)
          .eq('event_type', ORG_INVITE_EVENT_TYPES.INVITE_RESENT)
          .order('created_at', { ascending: false })

        if (resentEvents) {
          for (const resent of resentEvents) {
            const resentPayload = resent.payload as Record<string, unknown>
            if (resentPayload?.invite_id === inviteId) {
              // Invite was resent, check if provided token matches new hash
              if (resentPayload.new_token_hash === tokenHash) {
                invite.token_hash = tokenHash
                invite.expires_at = resentPayload.new_expires_at as string
                return invite
              }
              // Token doesn't match the latest resent token
              return null
            }
          }
        }

        return invite
      }
    }
  }

  return null
}

/**
 * Accept an invite (mark as accepted and add user to org)
 */
export async function acceptOrgInvite(
  supabase: SupabaseClient,
  params: {
    token: string
    user_id: string
  }
): Promise<{ success: boolean; org_id?: string; error?: string }> {
  const invite = await getInviteByToken(supabase, params.token)

  if (!invite) {
    return { success: false, error: 'Invalid or expired invite' }
  }

  if (isInviteExpired(invite.expires_at)) {
    return { success: false, error: 'Invite has expired' }
  }

  // Record acceptance in events_log
  try {
    await logEvent(supabase, {
      entity_type: 'client_org',
      entity_id: invite.org_id,
      event_type: ORG_INVITE_EVENT_TYPES.INVITE_ACCEPTED,
      payload: {
        invite_id: invite.invite_id,
        user_id: params.user_id,
        actor_user_id: params.user_id,
      },
    })
  } catch (error) {
    return { success: false, error: `Failed to accept invite: ${error instanceof Error ? error.message : 'Unknown error'}` }
  }

  // Add user to org as member (using events_log)
  try {
    await logEvent(supabase, {
      entity_type: 'client_org',
      entity_id: invite.org_id,
      event_type: 'client_org_member_set',
      payload: {
        user_id: params.user_id,
        role: 'member',
        action: 'add',
        source: 'invite',
        invite_id: invite.invite_id,
        actor_user_id: params.user_id,
      },
    })
  } catch (error) {
    return { success: false, error: `Failed to add member: ${error instanceof Error ? error.message : 'Unknown error'}` }
  }

  return { success: true, org_id: invite.org_id }
}

/**
 * Revoke an invite
 */
export async function revokeOrgInvite(
  supabase: SupabaseClient,
  params: {
    invite_id: string
    org_id: string
    actor_user_id: string
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    await logEvent(supabase, {
      entity_type: 'client_org',
      entity_id: params.org_id,
      event_type: ORG_INVITE_EVENT_TYPES.INVITE_REVOKED,
      payload: {
        invite_id: params.invite_id,
        actor_user_id: params.actor_user_id,
      },
    })
    return { success: true }
  } catch (error) {
    return { success: false, error: `Failed to revoke invite: ${error instanceof Error ? error.message : 'Unknown error'}` }
  }
}

/**
 * Resend an invite (generate new token, update expiry)
 * Returns the new plain token
 */
export async function resendOrgInvite(
  supabase: SupabaseClient,
  params: {
    invite_id: string
    org_id: string
    actor_user_id: string
  }
): Promise<{ success: boolean; token?: string; expires_at?: string; error?: string }> {
  const token = generateInviteToken()
  const token_hash = hashInviteToken(token)
  const expires_at = getInviteExpiryDate()

  try {
    await logEvent(supabase, {
      entity_type: 'client_org',
      entity_id: params.org_id,
      event_type: ORG_INVITE_EVENT_TYPES.INVITE_RESENT,
      payload: {
        invite_id: params.invite_id,
        new_token_hash: token_hash,
        new_expires_at: expires_at,
        actor_user_id: params.actor_user_id,
      },
    })
    return { success: true, token, expires_at }
  } catch (error) {
    return { success: false, error: `Failed to resend invite: ${error instanceof Error ? error.message : 'Unknown error'}` }
  }
}

/**
 * Get organization members with email addresses
 * Combines membership events with user data
 */
export async function getOrgMembersWithEmail(
  supabase: SupabaseClient,
  orgId: string
): Promise<OrgMemberWithEmail[]> {
  // Get all membership events for this org from events_log
  const { data: memberEvents, error } = await supabase
    .from('events_log')
    .select('payload, created_at')
    .eq('entity_type', 'client_org')
    .eq('entity_id', orgId)
    .eq('event_type', 'client_org_member_set')
    .order('created_at', { ascending: true })

  if (error || !memberEvents) {
    return []
  }

  // Compute current membership state per user
  const membershipByUser = new Map<string, { role: 'owner' | 'member'; joined_at: string } | null>()

  for (const event of memberEvents) {
    const payload = event.payload as Record<string, unknown>
    const userId = payload?.user_id as string
    const action = payload?.action as string

    if (action === 'add') {
      membershipByUser.set(userId, {
        role: (payload?.role as 'owner' | 'member') || 'member',
        joined_at: event.created_at,
      })
    } else if (action === 'remove') {
      membershipByUser.set(userId, null)
    }
  }

  // Collect active member user IDs
  const activeUserIds: string[] = []
  for (const [userId, membership] of membershipByUser.entries()) {
    if (membership) {
      activeUserIds.push(userId)
    }
  }

  if (activeUserIds.length === 0) {
    return []
  }

  // Get user emails from auth.users via profiles or admin API
  // Since we can't directly query auth.users, we'll return user_id and let the caller resolve emails
  // Or use profiles table if available

  const members: OrgMemberWithEmail[] = []
  for (const userId of activeUserIds) {
    const membership = membershipByUser.get(userId)
    if (membership) {
      members.push({
        user_id: userId,
        email: null, // Will be resolved by API if needed
        role: membership.role,
        joined_at: membership.joined_at,
      })
    }
  }

  return members
}

/**
 * Revoke organization membership (soft remove)
 */
export async function revokeOrgMember(
  supabase: SupabaseClient,
  params: {
    user_id: string
    org_id: string
    actor_user_id: string
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    await logEvent(supabase, {
      entity_type: 'client_org',
      entity_id: params.org_id,
      event_type: 'client_org_member_set',
      payload: {
        user_id: params.user_id,
        action: 'remove',
        actor_user_id: params.actor_user_id,
      },
    })
    return { success: true }
  } catch (error) {
    return { success: false, error: `Failed to revoke membership: ${error instanceof Error ? error.message : 'Unknown error'}` }
  }
}
