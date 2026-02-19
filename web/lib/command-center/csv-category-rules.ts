/**
 * Default category suggestion rules for CSV import.
 *
 * Each rule: if the description (lowercased) contains the keyword,
 * suggest the given category + direction.
 */

interface CategoryRule {
  keywords: string[];
  category: string;
  direction: 'in' | 'out';
}

const RULES: CategoryRule[] = [
  // Revenue / income
  { keywords: ['shopify payout', 'shopify payment'], category: 'shopify_payout', direction: 'in' },
  { keywords: ['tiktok payout', 'tiktok payment'], category: 'tiktok_payout', direction: 'in' },
  { keywords: ['stripe payout', 'stripe transfer'], category: 'revenue', direction: 'in' },
  { keywords: ['deposit', 'direct dep', 'payroll dep'], category: 'revenue', direction: 'in' },
  { keywords: ['refund received', 'credit memo'], category: 'revenue', direction: 'in' },

  // Advertising / marketing
  { keywords: ['facebook', 'meta ads', 'fb ads', 'instagram'], category: 'ads', direction: 'out' },
  { keywords: ['google ads', 'adwords'], category: 'ads', direction: 'out' },
  { keywords: ['tiktok ads', 'tiktok for business'], category: 'ads', direction: 'out' },

  // Software / SaaS
  { keywords: ['openai', 'anthropic', 'claude'], category: 'software', direction: 'out' },
  { keywords: ['vercel', 'supabase', 'netlify', 'heroku', 'aws', 'azure', 'gcp', 'digitalocean'], category: 'software', direction: 'out' },
  { keywords: ['github', 'gitlab', 'bitbucket'], category: 'software', direction: 'out' },
  { keywords: ['slack', 'notion', 'figma', 'canva', 'adobe'], category: 'software', direction: 'out' },
  { keywords: ['zapier', 'make.com', 'airtable'], category: 'software', direction: 'out' },
  { keywords: ['saas', 'subscription', 'monthly fee'], category: 'saas', direction: 'out' },

  // Shipping / logistics
  { keywords: ['usps', 'ups', 'fedex', 'dhl', 'shipstation', 'pirate ship', 'shipping'], category: 'shipping', direction: 'out' },

  // COGS
  { keywords: ['inventory', 'wholesale', 'supplier', 'manufacturing'], category: 'cogs', direction: 'out' },

  // Contractors / payroll
  { keywords: ['contractor', 'freelance', 'upwork', 'fiverr'], category: 'contractor', direction: 'out' },
  { keywords: ['payroll', 'gusto', 'adp', 'salary', 'wages'], category: 'payroll', direction: 'out' },

  // Events
  { keywords: ['event', 'venue', 'catering', 'booth'], category: 'event_supplies', direction: 'out' },
];

export interface CategorySuggestion {
  category: string;
  direction: 'in' | 'out';
}

/**
 * Suggest a category and direction for a transaction description.
 * Returns null if no rule matches.
 */
export function suggestCategory(description: string): CategorySuggestion | null {
  const lower = description.toLowerCase();
  for (const rule of RULES) {
    if (rule.keywords.some((kw) => lower.includes(kw))) {
      return { category: rule.category, direction: rule.direction };
    }
  }
  return null;
}

/**
 * Detect direction from amount sign or debit/credit columns.
 * Negative amount or debit column → 'out', positive or credit → 'in'.
 */
export function detectDirection(amount: number, debit?: string | null, credit?: string | null): 'in' | 'out' {
  if (debit != null && credit != null) {
    const d = parseFloat(debit) || 0;
    const c = parseFloat(credit) || 0;
    if (d > 0 && c === 0) return 'out';
    if (c > 0 && d === 0) return 'in';
  }
  return amount < 0 ? 'out' : 'in';
}
