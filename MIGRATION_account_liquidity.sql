-- Controls whether each business account contributes to Home > Current
-- Liquidity. Existing accounts default to included, so the dashboard shows
-- all money unless the user explicitly keeps a business account separate.
-- RLS already applies to accounts; no policy change is required.

ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS include_in_liquidity boolean NOT NULL DEFAULT true;

UPDATE public.accounts
SET include_in_liquidity = true
WHERE include_in_liquidity IS NULL;

COMMENT ON COLUMN public.accounts.include_in_liquidity IS
  'Whether a business account is included in Home current liquidity. Personal accounts always contribute.';
