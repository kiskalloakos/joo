-- Business payments use the existing recurring-cost engine. This migration
-- removes the brief invoice experiment and makes the payment scope explicit.
-- It intentionally deletes every invoice row: invoices are no longer a Joo feature.

DROP TABLE IF EXISTS public.invoices;

ALTER TABLE public.costs
  ADD COLUMN IF NOT EXISTS account_type text NOT NULL DEFAULT 'personal';

UPDATE public.costs
SET account_type = 'personal'
WHERE account_type IS NULL;

ALTER TABLE public.costs
  DROP CONSTRAINT IF EXISTS costs_account_type_check;

ALTER TABLE public.costs
  ADD CONSTRAINT costs_account_type_check
  CHECK (account_type IN ('personal', 'business'));
