-- Money log. Every +/- on an account and every cost payment writes a row.
-- Rows can later be edited or deleted from the monthly statement — the
-- `transactions_owner` FOR ALL policy already covers UPDATE/DELETE, so no
-- follow-up migration was needed for that.

CREATE TABLE IF NOT EXISTS transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
  amount numeric NOT NULL CHECK (amount > 0 AND amount <= 1e12),
  direction text NOT NULL CHECK (direction IN ('in', 'out')),
  kind text NOT NULL DEFAULT 'manual' CHECK (kind IN ('manual', 'cost', 'refund')),
  reference_id uuid,
  note text CHECK (note IS NULL OR char_length(note) <= 200),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- One index covers the only access pattern we use: latest-N for current user.
CREATE INDEX IF NOT EXISTS transactions_user_created_idx
  ON transactions (user_id, created_at DESC);

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY transactions_owner ON transactions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
