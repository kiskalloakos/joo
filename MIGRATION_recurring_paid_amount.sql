-- Records what a paid cost actually deducted from its funding account, in
-- THAT ACCOUNT'S currency. Costs are denominated in the dashboard display
-- currency, but a cash account may hold a different one — paying converts the
-- cost via FX rates. Storing the converted figure means un-ticking refunds
-- exactly what left the account: no FX drift between pay and un-pay, and it
-- stays correct even if the cost's amount is edited while paid.
--
-- Backward-compat: NULL on every existing row. Rows paid before this change
-- were deducted pre-conversion as the raw cost amount, so the app falls back
-- to cost.amount when paid_amount is NULL (see lib/dashboard.ts Cost and
-- app/(tabs)/recurrings.tsx tapTickbox).
--
-- Additive column on the existing `costs` table — it inherits the existing
-- RLS (FOR ALL USING/WITH CHECK auth.uid() = user_id), so no policy change
-- and no SECURITY_VERIFY.sql re-run is required.

ALTER TABLE costs
  ADD COLUMN IF NOT EXISTS paid_amount numeric;

COMMENT ON COLUMN public.costs.paid_amount IS
  'Amount actually deducted from the funding account, in that account''s currency. NULL = unpaid, paid without deducting, or a legacy row (falls back to amount).';
