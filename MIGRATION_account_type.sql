-- Account classification for the Home > Money view.
-- Existing accounts are intentionally treated as personal.
ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS account_type text NOT NULL DEFAULT 'personal'
  CHECK (account_type IN ('personal', 'business'));

UPDATE public.accounts
SET account_type = 'personal'
WHERE account_type IS NULL;

ALTER TABLE public.costs
  ADD COLUMN IF NOT EXISTS account_type text NOT NULL DEFAULT 'personal'
  CHECK (account_type IN ('personal', 'business'));
