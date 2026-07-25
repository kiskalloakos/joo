-- Account deletion (Apple App Store guideline 5.1.1(v)) — paste into the
-- Supabase SQL editor and run. Creates a SECURITY DEFINER RPC the app calls
-- from Settings → Delete Account.
--
-- Why an RPC: the client uses the anon key and can never touch auth.users
-- directly. Two retired legacy tables plus transactions
-- FK to auth.users with ON DELETE CASCADE — the rest (accounts, costs,
-- debts, investment_setup, revenue_entries, savings_setup, user_settings)
-- would orphan rows if we relied on a cascade. So the function explicitly
-- wipes all ten tables, then deletes the auth user inside one transaction.
--
-- Why SECURITY DEFINER: it needs to delete from auth.users, which the
-- caller's role can't. The function pins auth.uid() at entry, so a caller
-- can only ever delete their own account — they cannot pass a target id.
-- search_path is pinned to match SECURITY_FUNCTION_HARDENING.sql posture.

CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  -- Wipe every user-scoped table the app writes to. Order doesn't matter
  -- (no inter-table FKs in app schema); kept alphabetical for auditability.
  DELETE FROM public.accounts          WHERE user_id = uid;
  DELETE FROM public.assets            WHERE user_id = uid;
  DELETE FROM public.costs             WHERE user_id = uid;
  DELETE FROM public.debts             WHERE user_id = uid;
  DELETE FROM public.goals             WHERE user_id = uid;
  DELETE FROM public.investment_setup  WHERE user_id = uid;
  DELETE FROM public.revenue_entries   WHERE user_id = uid;
  DELETE FROM public.savings_setup     WHERE user_id = uid;
  DELETE FROM public.transactions      WHERE user_id = uid;
  DELETE FROM public.user_settings     WHERE user_id = uid;

  -- Finally remove the auth user. The session JWT becomes invalid; the
  -- client also calls supabase.auth.signOut() after the RPC returns.
  DELETE FROM auth.users WHERE id = uid;
END;
$$;

-- Lock down: only signed-in users can call it. The function itself enforces
-- "caller can only delete themselves" via auth.uid().
REVOKE ALL ON FUNCTION public.delete_my_account() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_my_account() FROM anon;
GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;

-- ----------------------------------------------------------------------------
-- Verify (run after applying):
--   SELECT proname, prosecdef, proconfig
--     FROM pg_proc
--    WHERE oid = 'public.delete_my_account()'::regprocedure;
--   -> prosecdef = true, proconfig contains search_path=public,auth
--
--   SELECT has_function_privilege('anon',          'public.delete_my_account()', 'EXECUTE') AS anon,
--          has_function_privilege('authenticated', 'public.delete_my_account()', 'EXECUTE') AS authd;
--   -> anon = false, authd = true
-- ----------------------------------------------------------------------------
