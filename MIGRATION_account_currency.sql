-- Per-account currency for Cash Accounts. Paste into the Supabase SQL editor
-- and run. `accounts` already has RLS (auth.uid() = user_id); a new column
-- inherits it, so no policy change is needed.
--
-- Backward-compat: NULL means "legacy row — use the dashboard display
-- currency at read time" (see lib/dashboard.ts where this is normalized).
-- Existing accounts continue to behave exactly as they did before.

ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS currency TEXT;

COMMENT ON COLUMN public.accounts.currency IS
  'ISO 4217 code (RON/USD/EUR/GBP/HUF/CHF). NULL = legacy row; treated as the dashboard display currency at read time.';
