/**
 * Discord role sync utilities.
 *
 * Uses the Discord bot token (not user OAuth tokens) to manage guild roles.
 * No user access tokens are stored — the bot manages roles on behalf of the app.
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';

const DISCORD_BOT_TOKEN = () => process.env.DISCORD_BOT_TOKEN!;
const DISCORD_GUILD_ID = () => process.env.DISCORD_GUILD_ID!;
const DISCORD_PAID_ROLE_ID = () => process.env.DISCORD_PAID_ROLE_ID!;
const DISCORD_AGENCY_BRAND_ROLE_ID = () => process.env.DISCORD_AGENCY_BRAND_ROLE_ID!;

const DISCORD_API = 'https://discord.com/api/v10';

// Plans that qualify for Paid role
const PAID_PLANS = new Set([
  'creator_lite',
  'creator_pro',
  'business',
  'brand',
  'agency',
]);

// Plans that qualify for Agency/Brand role
const AGENCY_BRAND_PLANS = new Set(['brand', 'agency']);

async function discordApiFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${DISCORD_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bot ${DISCORD_BOT_TOKEN()}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  return res;
}

async function addRole(discordUserId: string, roleId: string) {
  const res = await discordApiFetch(
    `/guilds/${DISCORD_GUILD_ID()}/members/${discordUserId}/roles/${roleId}`,
    { method: 'PUT' }
  );
  if (!res.ok && res.status !== 204) {
    const body = await res.text();
    console.error(`[discord] Failed to add role ${roleId} to ${discordUserId}: ${res.status} ${body}`);
  }
}

async function removeRole(discordUserId: string, roleId: string) {
  const res = await discordApiFetch(
    `/guilds/${DISCORD_GUILD_ID()}/members/${discordUserId}/roles/${roleId}`,
    { method: 'DELETE' }
  );
  if (!res.ok && res.status !== 204 && res.status !== 404) {
    const body = await res.text();
    console.error(`[discord] Failed to remove role ${roleId} from ${discordUserId}: ${res.status} ${body}`);
  }
}

/**
 * Sync Discord roles for a user based on their plan and active status.
 */
export async function syncDiscordRolesForUser(
  discordUserId: string,
  plan: string,
  isActive: boolean
): Promise<void> {
  const shouldHavePaid = isActive && PAID_PLANS.has(plan);
  const shouldHaveAgencyBrand = isActive && AGENCY_BRAND_PLANS.has(plan);

  if (shouldHavePaid) {
    await addRole(discordUserId, DISCORD_PAID_ROLE_ID());
  } else {
    await removeRole(discordUserId, DISCORD_PAID_ROLE_ID());
  }

  if (shouldHaveAgencyBrand) {
    await addRole(discordUserId, DISCORD_AGENCY_BRAND_ROLE_ID());
  } else {
    await removeRole(discordUserId, DISCORD_AGENCY_BRAND_ROLE_ID());
  }
}

/**
 * Get Discord user info from an OAuth access token.
 * Used during the OAuth callback to identify the Discord user.
 */
export async function getDiscordUserFromToken(
  accessToken: string
): Promise<{ id: string; username: string } | null> {
  const res = await fetch(`${DISCORD_API}/users/@me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    console.error(`[discord] Failed to get user from token: ${res.status}`);
    return null;
  }

  const data = await res.json();
  return { id: data.id, username: data.username };
}

/**
 * Fire-and-forget helper for Stripe webhook integration.
 * Looks up Discord link, gets user's plan, and syncs roles.
 */
export async function syncDiscordRolesIfLinked(userId: string): Promise<void> {
  try {
    // Check if user has a Discord link
    const { data: link } = await supabaseAdmin
      .from('ff_discord_links')
      .select('discord_user_id')
      .eq('user_id', userId)
      .single();

    if (!link) return;

    // Get user's current plan
    const { data: sub } = await supabaseAdmin
      .from('user_subscriptions')
      .select('plan_id, status')
      .eq('user_id', userId)
      .single();

    const plan = sub?.plan_id || 'free';
    const isActive = sub?.status === 'active';

    await syncDiscordRolesForUser(link.discord_user_id, plan, isActive);

    // Update last_role_sync timestamp
    await supabaseAdmin
      .from('ff_discord_links')
      .update({ last_role_sync: new Date().toISOString() })
      .eq('user_id', userId);
  } catch (err) {
    console.error(`[discord] syncDiscordRolesIfLinked failed for user ${userId}:`, err);
  }
}
