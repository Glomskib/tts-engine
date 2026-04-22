import type { NextRequest } from 'next/server';

export const CLICK_ID_COOKIES = {
  fbclid: 'ff_fbclid',
  fbc: 'ff_fbc',
  fbp: 'ff_fbp',
  ttclid: 'ff_ttclid',
  gclid: 'ff_gclid',
} as const;

export const CLICK_ID_COOKIE_MAX_AGE = 90 * 24 * 60 * 60;

export interface ClickIds {
  fbclid?: string;
  fbc?: string;
  fbp?: string;
  ttclid?: string;
  gclid?: string;
}

function buildFbc(fbclid: string): string {
  return `fb.1.${Date.now()}.${fbclid}`;
}

function buildFbp(): string {
  const buf = new Uint8Array(4);
  crypto.getRandomValues(buf);
  const rand = (buf[0] << 24) | (buf[1] << 16) | (buf[2] << 8) | buf[3];
  return `fb.1.${Date.now()}.${rand >>> 0}`;
}

export function captureClickIdsFromUrl(
  searchParams: URLSearchParams,
  existing: ClickIds,
): { next: ClickIds; changed: boolean } {
  const next: ClickIds = { ...existing };
  let changed = false;

  const fbclid = searchParams.get('fbclid')?.trim();
  if (fbclid) {
    next.fbclid = fbclid;
    next.fbc = buildFbc(fbclid);
    changed = true;
  }

  const ttclid = searchParams.get('ttclid')?.trim();
  if (ttclid) {
    next.ttclid = ttclid;
    changed = true;
  }

  const gclid = searchParams.get('gclid')?.trim();
  if (gclid) {
    next.gclid = gclid;
    changed = true;
  }

  if (!next.fbp) {
    next.fbp = buildFbp();
    changed = true;
  }

  return { next, changed };
}

export function readClickIdsFromCookies(
  cookies: { get: (name: string) => { value: string } | undefined },
): ClickIds {
  const out: ClickIds = {};
  const fbclid = cookies.get(CLICK_ID_COOKIES.fbclid)?.value;
  const fbc = cookies.get(CLICK_ID_COOKIES.fbc)?.value;
  const fbp = cookies.get(CLICK_ID_COOKIES.fbp)?.value;
  const ttclid = cookies.get(CLICK_ID_COOKIES.ttclid)?.value;
  const gclid = cookies.get(CLICK_ID_COOKIES.gclid)?.value;
  if (fbclid) out.fbclid = fbclid;
  if (fbc) out.fbc = fbc;
  if (fbp) out.fbp = fbp;
  if (ttclid) out.ttclid = ttclid;
  if (gclid) out.gclid = gclid;
  return out;
}

export function readClickIdsFromNextRequest(request: NextRequest): ClickIds {
  return readClickIdsFromCookies(request.cookies);
}

export function clickIdsToMetadata(ids: ClickIds): Record<string, string> {
  const meta: Record<string, string> = {};
  if (ids.fbclid) meta.fbclid = ids.fbclid.slice(0, 500);
  if (ids.fbc) meta.fbc = ids.fbc.slice(0, 500);
  if (ids.fbp) meta.fbp = ids.fbp.slice(0, 500);
  if (ids.ttclid) meta.ttclid = ids.ttclid.slice(0, 500);
  if (ids.gclid) meta.gclid = ids.gclid.slice(0, 500);
  return meta;
}

export function extractClientContextHeaders(request: Request): {
  client_ip?: string;
  client_user_agent?: string;
} {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip')?.trim();
  const ua = request.headers.get('user-agent')?.trim();
  const out: { client_ip?: string; client_user_agent?: string } = {};
  if (ip) out.client_ip = ip.slice(0, 100);
  if (ua) out.client_user_agent = ua.slice(0, 500);
  return out;
}
