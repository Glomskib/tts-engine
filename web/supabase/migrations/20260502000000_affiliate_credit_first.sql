-- Affiliate credit-first payout flow
-- Commissions fill credit_balance (spendable in-app) up to credit_cap, then overflow to
-- `balance` (pending Stripe Connect payout).

ALTER TABLE public.affiliate_accounts
  ADD COLUMN IF NOT EXISTS credit_balance NUMERIC(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credit_cap NUMERIC(10, 2) NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS total_credit_earned NUMERIC(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_credit_redeemed NUMERIC(10, 2) NOT NULL DEFAULT 0;

-- Ledger for credit redemptions (discounts applied at Stripe checkout, etc)
CREATE TABLE IF NOT EXISTS public.affiliate_credit_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id UUID NOT NULL REFERENCES public.affiliate_accounts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('accrual', 'redemption', 'adjustment', 'expiration')),
  amount NUMERIC(10, 2) NOT NULL,
  balance_after NUMERIC(10, 2) NOT NULL,
  source TEXT,
  stripe_invoice_id TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credit_ledger_affiliate ON public.affiliate_credit_ledger(affiliate_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_credit_ledger_invoice ON public.affiliate_credit_ledger(stripe_invoice_id) WHERE stripe_invoice_id IS NOT NULL;

ALTER TABLE public.affiliate_credit_ledger ENABLE ROW LEVEL SECURITY;

-- Atomic credit-first accrual RPC. Returns the split for logging.
CREATE OR REPLACE FUNCTION public.affiliate_accrue_credit_first(
  p_affiliate_id UUID,
  p_amount NUMERIC
) RETURNS TABLE(credit_added NUMERIC, payable_added NUMERIC, new_credit NUMERIC, new_balance NUMERIC)
LANGUAGE plpgsql AS $$
DECLARE
  v_cap NUMERIC;
  v_current_credit NUMERIC;
  v_room NUMERIC;
  v_to_credit NUMERIC;
  v_to_balance NUMERIC;
BEGIN
  SELECT credit_cap, credit_balance INTO v_cap, v_current_credit
  FROM public.affiliate_accounts WHERE id = p_affiliate_id FOR UPDATE;

  v_room := GREATEST(v_cap - v_current_credit, 0);
  v_to_credit := LEAST(p_amount, v_room);
  v_to_balance := p_amount - v_to_credit;

  UPDATE public.affiliate_accounts
  SET credit_balance = credit_balance + v_to_credit,
      balance = balance + v_to_balance,
      total_earned = total_earned + p_amount,
      total_credit_earned = total_credit_earned + v_to_credit,
      updated_at = now()
  WHERE id = p_affiliate_id
  RETURNING credit_balance, balance INTO new_credit, new_balance;

  credit_added := v_to_credit;
  payable_added := v_to_balance;
  RETURN NEXT;
END;
$$;

-- Atomic redemption RPC (for checkout discounts)
CREATE OR REPLACE FUNCTION public.affiliate_redeem_credit(
  p_affiliate_id UUID,
  p_amount NUMERIC,
  p_source TEXT DEFAULT NULL,
  p_note TEXT DEFAULT NULL
) RETURNS NUMERIC
LANGUAGE plpgsql AS $$
DECLARE
  v_current NUMERIC;
  v_redeem NUMERIC;
  v_new NUMERIC;
BEGIN
  SELECT credit_balance INTO v_current
  FROM public.affiliate_accounts WHERE id = p_affiliate_id FOR UPDATE;

  v_redeem := LEAST(v_current, GREATEST(p_amount, 0));
  IF v_redeem <= 0 THEN RETURN 0; END IF;

  UPDATE public.affiliate_accounts
  SET credit_balance = credit_balance - v_redeem,
      total_credit_redeemed = total_credit_redeemed + v_redeem,
      updated_at = now()
  WHERE id = p_affiliate_id
  RETURNING credit_balance INTO v_new;

  INSERT INTO public.affiliate_credit_ledger(affiliate_id, entry_type, amount, balance_after, source, note)
  VALUES (p_affiliate_id, 'redemption', -v_redeem, v_new, p_source, p_note);

  RETURN v_redeem;
END;
$$;

GRANT EXECUTE ON FUNCTION public.affiliate_accrue_credit_first(UUID, NUMERIC) TO service_role;
GRANT EXECUTE ON FUNCTION public.affiliate_redeem_credit(UUID, NUMERIC, TEXT, TEXT) TO service_role;
