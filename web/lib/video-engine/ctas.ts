/**
 * CTA registry. Mode-scoped. Templates pick a CTA by key (or use their own
 * default). Adding a new CTA is a single entry here.
 */

import type { CTA, Mode } from './types';

const CTAS: CTA[] = [
  // Affiliate
  { key: 'shop_now',       mode: 'affiliate', label: 'Shop Now',       overlayText: 'SHOP NOW',          subtitle: 'Link in bio', accentColor: '#FF005C' },
  { key: 'try_today',      mode: 'affiliate', label: 'Try It Today',   overlayText: 'TRY IT TODAY',      subtitle: 'Link in bio', accentColor: '#FF7A00' },
  { key: 'get_yours',      mode: 'affiliate', label: 'Get Yours',      overlayText: 'GET YOURS',         subtitle: 'Link in bio', accentColor: '#00C2FF' },
  { key: 'learn_more',     mode: 'affiliate', label: 'Learn More',     overlayText: 'LEARN MORE',        subtitle: 'Tap the link', accentColor: '#9B6BFF' },

  // Nonprofit
  { key: 'register_now',   mode: 'nonprofit', label: 'Register Now',   overlayText: 'REGISTER NOW',      subtitle: 'Link in bio', accentColor: '#0066FF' },
  { key: 'join_the_ride',  mode: 'nonprofit', label: 'Join the Ride',  overlayText: 'JOIN THE RIDE',     subtitle: 'See you there', accentColor: '#1AAE5B' },
  { key: 'donate_today',   mode: 'nonprofit', label: 'Donate Today',   overlayText: 'DONATE TODAY',      subtitle: 'Every dollar matters', accentColor: '#E53935' },
  { key: 'become_sponsor', mode: 'nonprofit', label: 'Become a Sponsor', overlayText: 'BECOME A SPONSOR', subtitle: 'Partner with us', accentColor: '#FFB400' },
];

export function listCTAs(mode: Mode): CTA[] {
  return CTAS.filter((c) => c.mode === mode);
}

export function getCTA(key: string): CTA | undefined {
  return CTAS.find((c) => c.key === key);
}

export function getCTAOrDefault(key: string | undefined | null, mode: Mode): CTA {
  if (key) {
    const found = getCTA(key);
    if (found && found.mode === mode) return found;
  }
  // fall back to first CTA for this mode
  const fallback = CTAS.find((c) => c.mode === mode);
  if (!fallback) throw new Error(`No CTAs registered for mode ${mode}`);
  return fallback;
}
