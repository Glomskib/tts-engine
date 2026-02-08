import { createHash, randomBytes } from 'crypto';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

const API_KEY_PREFIX = 'ff_ak_';

export interface ApiKeyResult {
  userId: string;
  scopes: string[];
}

/**
 * Generate a new API key with its hash.
 * Returns the plaintext key (shown once to user) and the SHA-256 hash (stored in DB).
 */
export function generateApiKey(): { plaintext: string; hash: string } {
  const raw = randomBytes(20).toString('hex'); // 40 hex chars
  const plaintext = `${API_KEY_PREFIX}${raw}`;
  const hash = hashApiKey(plaintext);
  return { plaintext, hash };
}

/**
 * Hash an API key using SHA-256.
 * Keys are already high-entropy, so bcrypt is unnecessary.
 */
export function hashApiKey(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex');
}

/**
 * Extract and verify an API key from a request's Authorization header.
 * Returns the user ID and scopes if valid, null otherwise.
 */
export async function verifyApiKeyFromRequest(
  request: Request
): Promise<ApiKeyResult | null> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader) return null;

  const match = authHeader.match(/^Bearer\s+(ff_ak_.+)$/);
  if (!match) return null;

  const plaintext = match[1];
  const hash = hashApiKey(plaintext);

  const { data, error } = await supabaseAdmin
    .from('api_keys')
    .select('id, user_id, scopes, revoked_at, expires_at')
    .eq('key_hash', hash)
    .single();

  if (error || !data) return null;

  // Check if revoked
  if (data.revoked_at) return null;

  // Check if expired
  if (data.expires_at && new Date(data.expires_at) < new Date()) return null;

  // Update last_used_at (fire and forget)
  supabaseAdmin
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', data.id)
    .then(() => {});

  return {
    userId: data.user_id,
    scopes: data.scopes || ['read'],
  };
}
