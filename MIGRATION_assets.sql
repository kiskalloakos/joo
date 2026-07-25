-- Manually tracked assets for Wealth > Net Worth (home, car, valuables, etc.).
-- Run this in the Supabase SQL editor, then run SECURITY_VERIFY.sql.

CREATE TABLE IF NOT EXISTS public.assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  amount numeric NOT NULL DEFAULT 0 CHECK (amount BETWEEN -1e12 AND 1e12),
  emoji text CHECK (emoji IS NULL OR char_length(emoji) <= 16),
  currency text,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS currency text;
CREATE INDEX IF NOT EXISTS assets_user_position_idx ON public.assets (user_id, position);
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS assets_owner ON public.assets;
CREATE POLICY assets_owner ON public.assets FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
