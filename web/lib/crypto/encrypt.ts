/**
 * AES-256-GCM token encryption.
 *
 * Used to encrypt OAuth access/refresh tokens before storing in
 * `tiktok_accounts` (and any other token-bearing table).
 *
 * ## Required env var: TOKEN_ENCRYPTION_KEY
 * 32-byte hex string (64 hex chars). Generate one with:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *
 * Same value MUST be set on every environment that needs to decrypt — losing
 * the key bricks every encrypted token. Rotate by re-encrypting under a new
 * key and re-issuing the token if rotation isn't possible (OAuth refresh).
 *
 * ## Wire format (output of encrypt())
 *   v1.<base64-iv>.<base64-tag>.<base64-ciphertext>
 *
 * Versioned so we can change algorithm later without orphaning old rows.
 */
import crypto from 'crypto';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12; // GCM standard
const TAG_LEN = 16;
const VERSION = 'v1';

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const hex = process.env.TOKEN_ENCRYPTION_KEY;
  if (!hex) {
    throw new Error(
      'TOKEN_ENCRYPTION_KEY env var is not set. Generate one with: ' +
        'node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
    );
  }
  if (!/^[0-9a-fA-F]{64}$/.test(hex.trim())) {
    throw new Error('TOKEN_ENCRYPTION_KEY must be a 32-byte hex string (64 hex chars).');
  }
  cachedKey = Buffer.from(hex.trim(), 'hex');
  return cachedKey;
}

/**
 * Encrypt a plaintext string. Returns versioned wire-format ciphertext.
 * Empty / null input is rejected — caller should skip the field instead.
 */
export function encrypt(plaintext: string): string {
  if (typeof plaintext !== 'string' || plaintext.length === 0) {
    throw new Error('encrypt: plaintext must be a non-empty string');
  }
  const key = getKey();
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString('base64'),
    tag.toString('base64'),
    ciphertext.toString('base64'),
  ].join('.');
}

/**
 * Decrypt a wire-format ciphertext produced by encrypt(). Throws on tamper or
 * version mismatch.
 */
export function decrypt(ciphertextWire: string): string {
  if (typeof ciphertextWire !== 'string' || ciphertextWire.length === 0) {
    throw new Error('decrypt: ciphertext must be a non-empty string');
  }
  const parts = ciphertextWire.split('.');
  if (parts.length !== 4) {
    throw new Error('decrypt: malformed ciphertext (expected v.iv.tag.ct)');
  }
  const [version, ivB64, tagB64, ctB64] = parts;
  if (version !== VERSION) {
    throw new Error(`decrypt: unsupported version "${version}" (expected ${VERSION})`);
  }
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const ct = Buffer.from(ctB64, 'base64');
  if (iv.length !== IV_LEN) throw new Error('decrypt: iv length mismatch');
  if (tag.length !== TAG_LEN) throw new Error('decrypt: tag length mismatch');
  const key = getKey();
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ct), decipher.final()]);
  return plaintext.toString('utf8');
}

/**
 * Best-effort check: does this string look like a v1 ciphertext? Used to
 * branch on read paths that may still see legacy plaintext rows during
 * rollout. Never substitutes for actual decrypt() — always wrap reads in
 * `try { decrypt(x) } catch { ...legacy plaintext path... }`.
 */
export function looksEncrypted(value: string): boolean {
  return typeof value === 'string' && value.startsWith(`${VERSION}.`) && value.split('.').length === 4;
}
