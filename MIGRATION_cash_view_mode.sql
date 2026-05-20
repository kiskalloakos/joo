-- Cash Accounts dashboard view mode. Paste into the Supabase SQL editor and
-- run. `user_settings` already has RLS (auth.uid() = user_id); a new column
-- inherits it, so no policy change is needed.
--
-- 'single'    = sum all cash accounts into one number in the user's display
--               currency (today's behavior — preserved as default so existing
--               users see no change until they opt in).
-- 'breakdown' = render per-currency totals separately. Hero (AFTER MONTHLY
--               PAYMENTS) still renders in the display currency.

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS cash_view_mode TEXT NOT NULL DEFAULT 'single';
