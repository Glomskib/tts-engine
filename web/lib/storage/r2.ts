/**
 * Cloudflare R2 storage helpers — S3-compatible API.
 *
 * Pure-Node AWS Signature V4 implementation so we don't have to ship the
 * 600KB @aws-sdk/* tree just to mint a few signed URLs. R2 is fully
 * S3-compatible for the basics (presigned PUT, presigned GET, HEAD).
 *
 * Env vars required:
 *   R2_ACCESS_KEY_ID
 *   R2_SECRET_ACCESS_KEY
 *   R2_ENDPOINT      e.g. https://<account-id>.r2.cloudflarestorage.com
 *   R2_BUCKET        e.g. flashflow-output
 */
import { createHash, createHmac } from 'crypto';

const REGION = 'auto'; // R2 doesn't care; 'auto' is the standard.
const SERVICE = 's3';

function r2Config() {
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const endpoint = process.env.R2_ENDPOINT;
  const bucket = process.env.R2_BUCKET;
  if (!accessKeyId || !secretAccessKey || !endpoint || !bucket) {
    throw new Error('R2 not configured — missing one of R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_ENDPOINT / R2_BUCKET');
  }
  return { accessKeyId, secretAccessKey, endpoint: endpoint.replace(/\/$/, ''), bucket };
}

export function isR2Configured(): boolean {
  return !!(
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_ENDPOINT &&
    process.env.R2_BUCKET
  );
}

// ─── AWS SigV4 plumbing ──────────────────────────────────────────────
function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data).digest();
}

function sha256Hex(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

function getSigningKey(secret: string, dateStamp: string): Buffer {
  const kDate = hmac('AWS4' + secret, dateStamp);
  const kRegion = hmac(kDate, REGION);
  const kService = hmac(kRegion, SERVICE);
  return hmac(kService, 'aws4_request');
}

/**
 * Build a presigned URL for the given HTTP verb + object key.
 * Default TTL is 1 hour for uploads, can be overridden up to 7 days.
 */
export function presignR2Url(opts: {
  method: 'PUT' | 'GET' | 'HEAD' | 'DELETE';
  key: string;
  expiresInSec?: number;
  contentType?: string;
}): string {
  const { accessKeyId, secretAccessKey, endpoint, bucket } = r2Config();
  const expires = Math.min(opts.expiresInSec ?? 3600, 7 * 24 * 3600);

  const url = new URL(`${endpoint}/${bucket}/${encodeURIComponent(opts.key).replace(/%2F/g, '/')}`);
  const host = url.host;

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const credentialScope = `${dateStamp}/${REGION}/${SERVICE}/aws4_request`;
  const credential = `${accessKeyId}/${credentialScope}`;

  // Signed headers always include host
  const signedHeaders = 'host';

  const queryParams = new URLSearchParams({
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': credential,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(expires),
    'X-Amz-SignedHeaders': signedHeaders,
  });
  // Sort by query string param to match AWS canonical form
  const sortedParams = new URLSearchParams([...queryParams.entries()].sort());

  const canonicalUri = url.pathname;
  const canonicalQueryString = sortedParams.toString();
  const canonicalHeaders = `host:${host}\n`;
  const payloadHash = 'UNSIGNED-PAYLOAD';
  const canonicalRequest = [
    opts.method,
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');

  const signingKey = getSigningKey(secretAccessKey, dateStamp);
  const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');

  sortedParams.append('X-Amz-Signature', signature);
  return `${url.origin}${canonicalUri}?${sortedParams.toString()}`;
}

/**
 * Compose a clean storage key for a user's uploaded video.
 * Pattern: <user_id>/<timestamp>-<safe-filename>
 */
export function buildR2Key(userId: string, filename: string): string {
  const safe = (filename || 'video.mp4').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
  return `${userId}/${Date.now()}-${safe}`;
}

/**
 * Send a DELETE for an R2 object. Returns true on success.
 */
export async function deleteR2Object(key: string): Promise<boolean> {
  try {
    const url = presignR2Url({ method: 'DELETE', key, expiresInSec: 60 });
    const resp = await fetch(url, { method: 'DELETE' });
    return resp.ok;
  } catch {
    return false;
  }
}
