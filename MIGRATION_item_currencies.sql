-- Per-item currency for recurring costs and the two Wealth balances.
-- Run once in the Supabase SQL editor. Existing rows remain valid and fall
-- back to the user's global currency until they are next saved.

ALTER TABLE public.costs
  ADD COLUMN IF NOT EXISTS currency text;

ALTER TABLE public.investment_setup
  ADD COLUMN IF NOT EXISTS currency text;

ALTER TABLE public.savings_setup
  ADD COLUMN IF NOT EXISTS currency text;

COMMENT ON COLUMN public.costs.currency IS
  'ISO currency for this recurring bill; NULL is a legacy row using the global display currency.';
COMMENT ON COLUMN public.investment_setup.currency IS
  'ISO currency for the investment balance; NULL is a legacy row using the global display currency.';
COMMENT ON COLUMN public.savings_setup.currency IS
  'ISO currency for the savings balance; NULL is a legacy row using the global display currency.';
