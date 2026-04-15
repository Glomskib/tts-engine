/**
 * White-label branding config.
 *
 * All values come from env vars so each deployed instance can be customized
 * without touching code. Set these in Vercel env (or .env.local for dev):
 *
 *   NEXT_PUBLIC_BRAND_NAME              — product name shown everywhere (default: "Operator OS")
 *   NEXT_PUBLIC_BRAND_TAGLINE           — hero subtitle
 *   NEXT_PUBLIC_BRAND_HEADLINE          — hero headline
 *   NEXT_PUBLIC_BRAND_CONTACT_EMAIL     — contact + "done for you" mailto
 *   NEXT_PUBLIC_BRAND_ACCENT            — Tailwind color name: blue | emerald | violet | amber | rose | teal
 *   NEXT_PUBLIC_BRAND_SHOW_PRICING      — "true" to show /ops pricing + checkout (default: false for internal)
 *   NEXT_PUBLIC_BRAND_SHOW_OFFER        — "true" to show /offer "done for you" page (default: false)
 *   NEXT_PUBLIC_BRAND_LANES             — comma-separated lanes (default: FlashFlow,POD TikTok Shop,Zebby's World,Making Miles Matter,OpenClaw)
 *
 * To deploy a new white-label instance for a friend/client:
 *   1. Fork repo → new Vercel project
 *   2. Point at their own Supabase project (set NEXT_PUBLIC_SUPABASE_URL + keys)
 *   3. Set the NEXT_PUBLIC_BRAND_* env vars above
 *   4. Run migrations against their DB (`supabase db push`)
 *   5. Deploy
 */

const ACCENT_MAP: Record<string, { primary: string; bg: string; border: string; hover: string; text: string }> = {
  blue:    { primary: 'bg-blue-600',    bg: 'bg-blue-500/10',    border: 'border-blue-500/20',    hover: 'hover:bg-blue-500',    text: 'text-blue-400' },
  emerald: { primary: 'bg-emerald-600', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', hover: 'hover:bg-emerald-500', text: 'text-emerald-400' },
  violet:  { primary: 'bg-violet-600',  bg: 'bg-violet-500/10',  border: 'border-violet-500/20',  hover: 'hover:bg-violet-500',  text: 'text-violet-400' },
  amber:   { primary: 'bg-amber-600',   bg: 'bg-amber-500/10',   border: 'border-amber-500/20',   hover: 'hover:bg-amber-500',   text: 'text-amber-400' },
  rose:    { primary: 'bg-rose-600',    bg: 'bg-rose-500/10',    border: 'border-rose-500/20',    hover: 'hover:bg-rose-500',    text: 'text-rose-400' },
  teal:    { primary: 'bg-teal-600',    bg: 'bg-teal-500/10',    border: 'border-teal-500/20',    hover: 'hover:bg-teal-500',    text: 'text-teal-400' },
};

function envBool(key: string, fallback = false): boolean {
  const v = process.env[key];
  if (v === undefined) return fallback;
  return v === 'true' || v === '1';
}

export interface BrandConfig {
  name: string;
  headline: string;
  tagline: string;
  contactEmail: string;
  accent: string;
  accentClasses: { primary: string; bg: string; border: string; hover: string; text: string };
  showPricing: boolean;
  showOffer: boolean;
  lanes: string[];
}

export function getBranding(): BrandConfig {
  const accentKey = process.env.NEXT_PUBLIC_BRAND_ACCENT || 'blue';
  const accentClasses = ACCENT_MAP[accentKey] || ACCENT_MAP.blue;

  return {
    name: process.env.NEXT_PUBLIC_BRAND_NAME || 'Operator OS',
    headline: process.env.NEXT_PUBLIC_BRAND_HEADLINE || 'Know what your business actually did today.',
    tagline: process.env.NEXT_PUBLIC_BRAND_TAGLINE || 'AI agents, tasks, and revenue — finally visible and actionable.',
    contactEmail: process.env.NEXT_PUBLIC_BRAND_CONTACT_EMAIL || 'brandon@flashflowai.com',
    accent: accentKey,
    accentClasses,
    showPricing: envBool('NEXT_PUBLIC_BRAND_SHOW_PRICING', false),
    showOffer: envBool('NEXT_PUBLIC_BRAND_SHOW_OFFER', false),
    lanes: (process.env.NEXT_PUBLIC_BRAND_LANES || "FlashFlow,POD TikTok Shop,Zebby's World,Making Miles Matter,OpenClaw")
      .split(',')
      .map(s => s.trim())
      .filter(Boolean),
  };
}

export const BRAND = getBranding();
