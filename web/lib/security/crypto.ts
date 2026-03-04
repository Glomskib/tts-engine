/**
 * AES-256-GCM encryption for sensitive tokens (OAuth refresh tokens).
 * Uses DRIVE_TOKEN_ENCRYPTION_KEY env var (32-byte base64 string).
 *
 * Never call from client-side code — server-only.
 */
import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // GCM standard
const TAG_LENGTH = 16;

function getKey(): Buffer {
  const raw = process.env.DRIVE_TOKEN_ENCRYPTION_KEY;
  if (!raw) throw new Error('DRIVE_TOKEN_ENCRYPTION_KEY is not set');
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error('DRIVE_TOKEN_ENCRYPTION_KEY must be 32 bytes (base64 encoded)');
  return key;
}

export interface EncryptedPayload {
  ciphertext: string; // base64
  iv: string;         // base64
  tag: string;        // base64
}

/**
 * Encrypt a plaintext string with AES-256-GCM.
 */
export function encrypt(plaintext: string): EncryptedPayload {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  const tag = cipher.getAuthTag();

  return {
    ciphertext: encrypted,
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
  };
}

/**
 * Decrypt an AES-256-GCM encrypted payload back to plaintext.
 */
export function decrypt(payload: EncryptedPayload): string {
  const key = getKey();
  const iv = Buffer.from(payload.iv, 'base64');
  const tag = Buffer.from(payload.tag, 'base64');
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(payload.ciphertext, 'base64', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

/**
 * Generate a new 32-byte encryption key (for setup).
 * Run: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 */
export function generateKey(): string {
  return randomBytes(32).toString('base64');
}
