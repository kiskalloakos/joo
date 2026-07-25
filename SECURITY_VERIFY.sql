-- ============================================================================
-- RLS posture verification — READ ONLY. Paste into the Supabase SQL editor
-- and run. Re-run any time a new table is added to the app.
--
-- The app has no backend: every read/write goes device -> Supabase with the
-- public anon key. RLS is the ONLY access-control layer. This script proves
-- whether every table the app writes to is actually protected in production
-- (a migration file in the repo does NOT prove it ran here).
--
-- PASS criteria — for ALL 11 active app tables:
--   Query 1: rls_enabled = true
--   Query 2: exactly one policy, cmd = ALL, and BOTH qual and with_check are
--            (auth.uid() = user_id)
--
-- FAIL interpretations:
--   * table absent from Query 1      -> migration never ran; app writes break
--   * rls_enabled = false            -> CRITICAL: whole table public to anyone
--                                       with the anon key
--   * table absent from Query 2      -> no policy: with RLS on, all access is
--                                       denied (app breaks); investigate now
--   * qual/with_check not auth.uid() -> policy is wrong; potential cross-user
--                                       read/write
-- ============================================================================

-- Query 1 — is RLS enabled on every table the app uses?
select
  e.tbl                              as table_name,
  (t.tablename is not null)          as table_exists,
  coalesce(t.rowsecurity, false)     as rls_enabled
from (values
  ('accounts'),('costs'),('debts'),('investment_setup'),
  ('savings_setup'),('user_settings'),('revenue_entries'),('transactions'),
  ('projects'),('project_costs')
) as e(tbl)
left join pg_tables t
  on t.schemaname = 'public' and t.tablename = e.tbl
order by e.tbl;

-- Query 2 — the actual policy on each table (expect one FOR ALL,
-- auth.uid() = user_id in both USING and WITH CHECK).
select
  tablename,
  policyname,
  cmd,
  qual        as using_expr,
  with_check  as check_expr
from pg_policies
where schemaname = 'public'
  and tablename in (
    'accounts','costs','debts','investment_setup',
    'savings_setup','user_settings','revenue_entries','transactions',
    'projects','project_costs'
  )
order by tablename, policyname;
