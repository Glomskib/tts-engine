/**
 * Set CORS on the R2 bucket so flashflowai.com (and preview/local origins)
 * can PUT uploads directly from the browser.
 *
 * Without this, the create-page upload XHR fails with "Network error during
 * upload — check your connection." because R2 rejects the preflight.
 *
 * Run:  pnpm tsx web/scripts/configure-r2-cors.ts
 *
 * Reads R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_ENDPOINT / R2_BUCKET
 * from env. Uses pure-Node SigV4 + raw fetch — no AWS SDK dependency.
 */
import { createHash, createHmac } from 'crypto';

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

async function main(): Promise<void> {
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const endpoint = (process.env.R2_ENDPOINT || '').replace(/\/$/, '');
  const bucket = process.env.R2_BUCKET;

  if (!accessKeyId || !secretAccessKey || !endpoint || !bucket) {
    console.error('Missing R2_* env vars — need R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT, R2_BUCKET');
    process.exit(1);
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
  // S3 PutBucketCors REQUIRES the Content-MD5 header to be set + signed.
  const contentMd5 = createHash('md5').update(CORS_XML).digest('base64');

  const signedHeaders = 'content-md5;host;x-amz-content-sha256;x-amz-date';
  const canonicalHeaders =
    `content-md5:${contentMd5}\n` +
    `host:${host}\n` +
    `x-amz-content-sha256:${bodyHash}\n` +
    `x-amz-date:${amzDate}\n`;

  const canonicalUri = url.pathname;
  // Query string `cors` becomes `cors=` in canonical form (per AWS spec)
  const canonicalQueryString = 'cors=';

  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQueryString,
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

  console.log(`Setting CORS on ${endpoint}/${bucket}...`);
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

  const respText = await resp.text();
  if (!resp.ok) {
    console.error(`FAILED ${resp.status}:`, respText.slice(0, 500));
    process.exit(2);
  }
  console.log(`✓ CORS set successfully on bucket "${bucket}"`);
  if (respText.trim()) console.log('Response:', respText.slice(0, 200));
}

main().catch((e) => { console.error(e); process.exit(1); });
