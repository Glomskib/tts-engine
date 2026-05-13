/**
 * POST /api/admin/configure-r2-cors
 *
 * One-shot admin endpoint that calls R2's PutBucketCors with the allow-list
 * needed for browser uploads from flashflowai.com (and preview/local). This
 * is the fix for "Network error during upload" — the XHR preflight to R2
 * fails without a CORS rule.
 *
 * Auth: requires header `X-Admin-Token: <CRON_SECRET>` (same secret used by
 * /api/cron — we don't add a new env var just for this).
 *
 * Run via curl:
 *   curl -X POST -H "X-Admin-Token: $CRON_SECRET" https://flashflowai.com/api/admin/configure-r2-cors
 *
 * Idempotent: re-running just overwrites the CORS rule.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createHash, createHmac } from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const REGION = 'auto';
const SERVICE = 's3';

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data).digest();
}
function sha256Hex(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}
function getSigningKey(secret: string, dateStamp: string): Buffer {
  const kDate = hmac('AWS4' + secret, dateStamp);
  const kRegion = hmac(kDate, REGION);
  const kService = hmac(kRegion, SERVICE);
  return hmac(kService, 'aws4_request');
}

const CORS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<CORSConfiguration>
  <CORSRule>
    <AllowedOrigin>https://flashflowai.com</AllowedOrigin>
    <AllowedOrigin>https://*.flashflowai.com</AllowedOrigin>
    <AllowedOrigin>https://*.vercel.app</AllowedOrigin>
    <AllowedOrigin>http://localhost:3000</AllowedOrigin>
    <AllowedOrigin>http://localhost:3001</AllowedOrigin>
    <AllowedMethod>GET</AllowedMethod>
    <AllowedMethod>PUT</AllowedMethod>
    <AllowedMethod>POST</AllowedMethod>
    <AllowedMethod>HEAD</AllowedMethod>
    <AllowedMethod>DELETE</AllowedMethod>
    <AllowedHeader>*</AllowedHeader>
    <ExposeHeader>ETag</ExposeHeader>
    <MaxAgeSeconds>3600</MaxAgeSeconds>
  </CORSRule>
</CORSConfiguration>`;

export async function POST(req: NextRequest) {
  const adminToken = req.headers.get('x-admin-token');
  const expected = process.env.CRON_SECRET;
  if (!expected || adminToken !== expected) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const endpoint = (process.env.R2_ENDPOINT || '').replace(/\/$/, '');
  const bucket = process.env.R2_BUCKET;

  if (!accessKeyId || !secretAccessKey || !endpoint || !bucket) {
    return NextResponse.json({
      ok: false,
      error: 'R2 env missing',
      present: { accessKeyId: !!accessKeyId, secretAccessKey: !!secretAccessKey, endpoint: !!endpoint, bucket: !!bucket },
    }, { status: 500 });
  }

  const url = new URL(`${endpoint}/${bucket}?cors`);
  const host = url.host;
  const method = 'PUT';
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const credentialScope = `${dateStamp}/${REGION}/${SERVICE}/aws4_request`;
  const credential = `${accessKeyId}/${credentialScope}`;

  const bodyHash = sha256Hex(CORS_XML);
  const contentMd5 = createHash('md5').update(CORS_XML).digest('base64');

  const signedHeaders = 'content-md5;host;x-amz-content-sha256;x-amz-date';
  const canonicalHeaders =
    `content-md5:${contentMd5}\n` +
    `host:${host}\n` +
    `x-amz-content-sha256:${bodyHash}\n` +
    `x-amz-date:${amzDate}\n`;

  const canonicalRequest = [
    method,
    url.pathname,
    'cors=',
    canonicalHeaders,
    signedHeaders,
    bodyHash,
  ].join('\n');

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');

  const signingKey = getSigningKey(secretAccessKey, dateStamp);
  const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');
  const authHeader = `AWS4-HMAC-SHA256 Credential=${credential}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  try {
    const resp = await fetch(url.toString(), {
      method,
      headers: {
        'Authorization': authHeader,
        'Content-MD5': contentMd5,
        'x-amz-content-sha256': bodyHash,
        'x-amz-date': amzDate,
        'Content-Type': 'application/xml',
      },
      body: CORS_XML,
    });
    const text = await resp.text();
    return NextResponse.json({
      ok: resp.ok,
      status: resp.status,
      response: text.slice(0, 500),
      bucket,
      message: resp.ok ? 'CORS rule applied — try uploading again.' : 'R2 rejected the CORS PUT',
    }, { status: resp.ok ? 200 : 500 });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      error: err instanceof Error ? err.message : 'fetch failed',
    }, { status: 500 });
  }
}
