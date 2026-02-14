export interface CreditAddon {
  id: string;
  name: string;
  price: number; // cents
  credits: number;
  stripePriceId: string | undefined;
  popular?: boolean;
}

export const CREDIT_ADDONS: CreditAddon[] = [
  {
    id: 'credits_25',
    name: '25 Credits',
    price: 499,
    credits: 25,
    stripePriceId: process.env.STRIPE_PRICE_CREDITS_25,
  },
  {
    id: 'credits_100',
    name: '100 Credits',
    price: 1499,
    credits: 100,
    stripePriceId: process.env.STRIPE_PRICE_CREDITS_100,
    popular: true,
  },
  {
    id: 'credits_500',
    name: '500 Credits',
    price: 4999,
    credits: 500,
    stripePriceId: process.env.STRIPE_PRICE_CREDITS_500,
  },
];

/** Client-safe addon data (no env vars leaked) */
export const CREDIT_ADDONS_CLIENT = CREDIT_ADDONS.map(({ stripePriceId: _, ...rest }) => rest);
