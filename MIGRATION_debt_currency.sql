alter table public.debts add column if not exists currency text;

-- Existing debts retain the page currency as their fallback until edited.
-- Run this in the Supabase SQL editor before shipping the client change.
