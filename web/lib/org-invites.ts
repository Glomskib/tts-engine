/**
 * Organization Invite Management
 *
 * Event-based invite system using video_events table with video_id = null.
 * Secure token generation and hashing for invite links.
 *
 * Event types:
 * - org_invite_created: { invite_id, org_id, email, role, token_hash, expires_at }
 * - org_invite_accepted: { invite_id, org_id, user_id }
 * - org_invite_revoked: { invite_id, org_id }
 * - org_invite_resent: { invite_id, org_id, new_token_hash, new_expires_at }
 */

import { SupabaseClient } from '@supabase/supabase-js'
import { randomBytes, createHash, timingSafeEqual } from 'crypto'
import { randomUUID } from 'crypto'

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

  const { error } = await supabase.from('video_events').insert({
    video_id: null,
    event_type: ORG_INVITE_EVENT_TYPES.INVITE_CREATED,
    actor: params.actor_user_id,
    details: {
      invite_id,
      org_id: params.org_id,
      email: params.email.toLowerCase().trim(),
      role: params.role,
      token_hash,
      expires_at,
    },
  })

  if (error) {
    throw new Error(`Failed to create invite: ${error.message}`)
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
  // Get all invite events
  const { data: events, error } = await supabase
    .from('video_events')
    .select('details, created_at, actor')
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
    const details = event.details as Record<string, unknown>
    if (details?.org_id !== orgId) continue

    const inviteId = details.invite_id as string
    if (!inviteId) continue

    if (event.details && 'invite_id' in (event.details as object)) {
      const eventType = (events.find(e => e === event) as { details: { invite_id: string } })

      // This is a bit awkward, let me refactor the logic
    }
  }

  // Reset and rebuild properly
  inviteMap.clear()

  for (const event of events) {
    const details = event.details as Record<string, unknown>
    if (details?.org_id !== orgId) continue

    const inviteId = details.invite_id as string
    if (!inviteId) continue

    // Determine event type by checking what fields are present
    if (details.token_hash && details.email) {
      // INVITE_CREATED or INVITE_RESENT
      if (details.new_token_hash) {
        // INVITE_RESENT - update existing invite
        const existing = inviteMap.get(inviteId)
        if (existing) {
          existing.token_hash = details.new_token_hash as string
          existing.expires_at = details.new_expires_at as string
          existing.status = 'pending'
        }
      } else {
        // INVITE_CREATED
        inviteMap.set(inviteId, {
          invite_id: inviteId,
          org_id: details.org_id as string,
          email: details.email as string,
          role: details.role as InviteRole,
          status: 'pending',
          token_hash: details.token_hash as string,
          expires_at: details.expires_at as string,
          created_at: event.created_at,
          created_by_user_id: event.actor || '',
        })
      }
    } else if (details.user_id && !details.token_hash) {
      // INVITE_ACCEPTED
      const existing = inviteMap.get(inviteId)
      if (existing) {
        existing.status = 'accepted'
      }
    } else if (!details.user_id && !details.token_hash && !details.email) {
      // INVITE_REVOKED
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

  // Get all invite created events
  const { data: events, error } = await supabase
    .from('video_events')
    .select('details, created_at, actor')
    .eq('event_type', ORG_INVITE_EVENT_TYPES.INVITE_CREATED)
    .order('created_at', { ascending: false })

  if (error || !events) {
    return null
  }

  // Find invite with matching token hash
  for (const event of events) {
    const details = event.details as Record<string, unknown>
    if (details?.token_hash === tokenHash) {
      const inviteId = details.invite_id as string
      const orgId = details.org_id as string

      // Check if invite is still valid (not accepted, not revoked)
      const allInvites = await listOrgInvites(supabase, orgId)
      const invite = allInvites.find((inv) => inv.invite_id === inviteId)

      if (invite && invite.status === 'pending') {
        // Check for resent tokens
        const { data: resentEvents } = await supabase
          .from('video_events')
          .select('details')
          .eq('event_type', ORG_INVITE_EVENT_TYPES.INVITE_RESENT)
          .order('created_at', { ascending: false })

        if (resentEvents) {
          for (const resent of resentEvents) {
            const resentDetails = resent.details as Record<string, unknown>
            if (resentDetails?.invite_id === inviteId) {
              // Invite was resent, check if provided token matches new hash
              if (resentDetails.new_token_hash === tokenHash) {
                invite.token_hash = tokenHash
                invite.expires_at = resentDetails.new_expires_at as string
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

  // Record acceptance
  const { error: acceptError } = await supabase.from('video_events').insert({
    video_id: null,
    event_type: ORG_INVITE_EVENT_TYPES.INVITE_ACCEPTED,
    actor: params.user_id,
    details: {
      invite_id: invite.invite_id,
      org_id: invite.org_id,
      user_id: params.user_id,
    },
  })

  if (acceptError) {
    return { success: false, error: `Failed to accept invite: ${acceptError.message}` }
  }

  // Add user to org as member (using existing member_set event)
  const { error: memberError } = await supabase.from('video_events').insert({
    video_id: null,
    event_type: 'client_org_member_set',
    actor: params.user_id,
    details: {
      org_id: invite.org_id,
      user_id: params.user_id,
      role: 'member',
      action: 'add',
      source: 'invite',
      invite_id: invite.invite_id,
    },
  })

  if (memberError) {
    return { success: false, error: `Failed to add member: ${memberError.message}` }
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
  const { error } = await supabase.from('video_events').insert({
    video_id: null,
    event_type: ORG_INVITE_EVENT_TYPES.INVITE_REVOKED,
    actor: params.actor_user_id,
    details: {
      invite_id: params.invite_id,
      org_id: params.org_id,
    },
  })

  if (error) {
    return { success: false, error: `Failed to revoke invite: ${error.message}` }
  }

  return { success: true }
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

  const { error } = await supabase.from('video_events').insert({
    video_id: null,
    event_type: ORG_INVITE_EVENT_TYPES.INVITE_RESENT,
    actor: params.actor_user_id,
    details: {
      invite_id: params.invite_id,
      org_id: params.org_id,
      new_token_hash: token_hash,
      new_expires_at: expires_at,
    },
  })

  if (error) {
    return { success: false, error: `Failed to resend invite: ${error.message}` }
  }

  return { success: true, token, expires_at }
}

/**
 * Get organization members with email addresses
 * Combines membership events with user data
 */
export async function getOrgMembersWithEmail(
  supabase: SupabaseClient,
  orgId: string
): Promise<OrgMemberWithEmail[]> {
  // Get all membership events for this org
  const { data: memberEvents, error } = await supabase
    .from('video_events')
    .select('details, created_at')
    .eq('event_type', 'client_org_member_set')
    .order('created_at', { ascending: true })

  if (error || !memberEvents) {
    return []
  }

  // Compute current membership state per user
  const membershipByUser = new Map<string, { role: 'owner' | 'member'; joined_at: string } | null>()

  for (const event of memberEvents) {
    const details = event.details as Record<string, unknown>
    if (details?.org_id !== orgId) continue

    const userId = details?.user_id as string
    const action = details?.action as string

    if (action === 'add') {
      membershipByUser.set(userId, {
        role: (details?.role as 'owner' | 'member') || 'member',
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
  const { error } = await supabase.from('video_events').insert({
    video_id: null,
    event_type: 'client_org_member_set',
    actor: params.actor_user_id,
    details: {
      org_id: params.org_id,
      user_id: params.user_id,
      action: 'remove',
    },
  })

  if (error) {
    return { success: false, error: `Failed to revoke membership: ${error.message}` }
  }

  return { success: true }
}
