// Access gate: a user may use joo if they own the lifetime unlock (pro)
// OR they're still inside the 3-day trial. The trial clock is the
// account-tied `trial_started_at` on user_settings (see MIGRATION_trial),
// so reinstalling never resets it. All paywall enforcement is additionally
// gated on purchasesConfigured() upstream — if RevenueCat isn't set up
// yet, the app never locks.

import { supabase, userId } from './supabase';
import { reportable } from './sync';
import { peekSetup, getSetup, refreshSetup } from './setup';
import { configurePurchases, isProActive, purchasesConfigured } from './purchases';

export const TRIAL_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

function trialEndMs(trialStartedAt: string | null): number | null {
  if (!trialStartedAt) return null;
  const start = Date.parse(trialStartedAt);
  return isNaN(start) ? null : start + TRIAL_DAYS * DAY_MS;
}

// Not-yet-started (null) counts as active so a brand-new user is never
// locked in the gap before startTrial() writes the timestamp.
export function trialActive(trialStartedAt: string | null): boolean {
  const end = trialEndMs(trialStartedAt);
  if (end == null) return true;
  return Date.now() < end;
}

export function trialDaysLeft(trialStartedAt: string | null): number {
  const end = trialEndMs(trialStartedAt);
  if (end == null) return TRIAL_DAYS;
  return Math.max(0, Math.ceil((end - Date.now()) / DAY_MS));
}

// Start the trial clock once, on first authenticated launch. Partial
// upsert touches only trial_started_at, so it can't clobber other
// user_settings columns (and the normal settings save omits this column,
// so it can't clobber the trial either).
export async function startTrialIfNeeded(): Promise<void> {
  const setup = peekSetup() ?? (await getSetup());
  if (setup?.trialStartedAt) return;
  const uid = await userId();
  if (!uid) return;
  await reportable(
    supabase
      .from('user_settings')
      .upsert(
        { user_id: uid, trial_started_at: new Date().toISOString() },
        { onConflict: 'user_id' },
      ),
  );
  await refreshSetup(); // repopulate cache so peekSetup() sees the start
}

export interface AccessState {
  allowed: boolean;
  pro: boolean;
  daysLeft: number;
  // True only when the paywall is actually live (RevenueCat configured).
  // The trial-countdown banner keys off this so it never appears while
  // the app is free-for-everyone (empty keys → no paywall → no banner).
  gated: boolean;
}

// In-memory cache + subscribers, mirroring lib/setup's peek/subscribe so
// the dashboard banner can render the trial state without re-resolving.
let cachedAccess: AccessState | null = null;
type Listener = (a: AccessState) => void;
const listeners = new Set<Listener>();

function publish(state: AccessState): AccessState {
  cachedAccess = state;
  listeners.forEach((fn) => fn(state));
  return state;
}

export function peekAccess(): AccessState | null {
  return cachedAccess;
}

export function subscribeAccess(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Called after a successful purchase anywhere (paywall, onboarding,
// trial banner) so the rest of the UI flips to "pro" immediately.
export function notePurchase(): void {
  publish({ allowed: true, pro: true, daysLeft: 0, gated: true });
}

// The single source of truth used by the root layout. When the paywall
// isn't configured yet, always allowed (app behaves as pre-paywall).
export async function resolveAccess(supabaseUserId: string): Promise<AccessState> {
  const setup = peekSetup() ?? (await getSetup());
  const trialStartedAt = setup?.trialStartedAt ?? null;
  const daysLeft = trialDaysLeft(trialStartedAt);

  if (!purchasesConfigured()) {
    return publish({ allowed: true, pro: false, daysLeft, gated: false });
  }

  await configurePurchases(supabaseUserId);
  const pro = await isProActive();
  if (pro) return publish({ allowed: true, pro: true, daysLeft, gated: true });

  await startTrialIfNeeded();
  const fresh = peekSetup()?.trialStartedAt ?? trialStartedAt;
  return publish({
    allowed: trialActive(fresh),
    pro: false,
    daysLeft: trialDaysLeft(fresh),
    gated: true,
  });
}
