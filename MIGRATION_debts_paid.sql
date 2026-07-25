-- Debts: add manual payoff progress (paid_amount of amount). Paste into the
-- Supabase SQL editor and run.
--
-- This is an ADDITIVE COLUMN on the existing `debts` table — it inherits
-- debts' existing RLS (debts_owner: FOR ALL auth.uid()=user_id), so no new
-- policy and no SECURITY_VERIFY.sql re-run are required (that script gates
-- on new *tables*, not new columns). The CHECK matches the budget-bloat
-- guard pattern used by every other amount column (see SECURITY_TODO.sql).

ALTER TABLE debts
  ADD COLUMN IF NOT EXISTS paid_amount numeric NOT NULL DEFAULT 0
    CHECK (paid_amount BETWEEN -1e12 AND 1e12);
