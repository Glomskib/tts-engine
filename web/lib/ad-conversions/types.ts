export interface ConversionContext {
  eventId: string;
  eventTimeMs: number;
  value: number;
  currency: string;
  email?: string | null;
  phone?: string | null;
  sourceUrl?: string;
  fbclid?: string;
  fbc?: string;
  fbp?: string;
  ttclid?: string;
  gclid?: string;
  clientIp?: string;
  clientUserAgent?: string;
  correlationId?: string;
}

export type ConversionStatus = 'sent' | 'failed' | 'skipped';

export interface ConversionResult {
  platform: 'meta' | 'tiktok' | 'google';
  status: ConversionStatus;
  httpStatus?: number;
  error?: string;
  reason?: string;
}
