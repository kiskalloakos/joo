-- Complimentary access — paste into the Supabase SQL editor and run.
-- A row in this table unlocks joo with no purchase (the developer,
-- friends & family, press). lib/access.ts checks it BEFORE RevenueCat,
-- so a comped account never needs a store record.
--
-- SECURITY — this table intentionally does NOT use the `FOR ALL
-- auth.uid() = user_id` pattern the other tables use. RLS is ON with
-- ONLY a SELECT-own policy: a signed-in user can read their own row (the
-- app must see its own comp status) but there is NO insert/update/delete
-- policy, so those are denied for anon and authenticated. Comps can be
-- granted ONLY from the Supabase dashboard / SQL editor (the service role
-- bypasses RLS). A user therefore cannot self-comp with the anon key.
-- Do NOT "fix" this to match SECURITY_VERIFY.sql — the difference is the
-- point.

CREATE TABLE IF NOT EXISTS comp_access (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  note       text,
  granted_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE comp_access ENABLE ROW LEVEL SECURITY;

-- Owner may READ their own row. No write policies on purpose.
CREATE POLICY comp_access_read_own ON comp_access FOR SELECT
  USING (auth.uid() = user_id);

-- ============================================================================
-- HOW TO GRANT / REVOKE A COMP
--
-- 1. Find the person's user id:
--    Supabase dashboard -> Authentication -> Users -> search their email
--    -> copy the "User UID".
--
-- 2. GRANT (free, unlocked) — run here, or just add a row in the Table editor:
--      insert into comp_access (user_id, note)
--      values ('PASTE-USER-UID-HERE', 'me');
--
-- 3. REVOKE (back to the paywall):
--      delete from comp_access where user_id = 'PASTE-USER-UID-HERE';
--
-- The change takes effect the next time that person's app cold-starts or
-- re-signs-in (when resolveAccess runs).
-- ============================================================================
