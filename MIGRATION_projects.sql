-- Projects: track what a project costs (e.g. "Building a house") as a list
-- of line items, each with its own currency. Paste into the Supabase SQL
-- editor and run. Adds two tables plus a `show_projects` visibility flag
-- and a `projects_currency` per-page override on user_settings.
--
-- Both tables use the same FOR ALL auth.uid()=user_id RLS as every other
-- app table. Run SECURITY_VERIFY.sql afterwards — it now expects 12 tables.

CREATE TABLE IF NOT EXISTS projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  position integer NOT NULL DEFAULT 0,
  finished boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS projects_user_position_idx
  ON projects (user_id, position);

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY projects_owner ON projects FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Line items. `project_id` cascades so deleting a project removes its
-- costs; `user_id` is carried for the RLS policy (same pattern as every
-- other table — RLS is keyed on user_id, not on the parent row).
CREATE TABLE IF NOT EXISTS project_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  label text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 80),
  amount numeric NOT NULL DEFAULT 0 CHECK (amount BETWEEN -1e12 AND 1e12),
  currency text CHECK (currency IS NULL OR char_length(currency) <= 8),
  cost_date text CHECK (cost_date IS NULL OR char_length(cost_date) <= 10),
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS project_costs_user_project_idx
  ON project_costs (user_id, project_id, position);

ALTER TABLE project_costs ENABLE ROW LEVEL SECURITY;

CREATE POLICY project_costs_owner ON project_costs FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- New optional tab — off by default, like Goals/Debts (users opt in via
-- Settings). A new column inherits user_settings' existing RLS.
ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS show_projects boolean NOT NULL DEFAULT false;

-- Per-page currency override for the Projects tab (null = follow global).
ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS projects_currency text;
