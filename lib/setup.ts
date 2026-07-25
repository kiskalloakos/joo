import { supabase, userId } from './supabase';
import { load, peek, save } from './storage';
import { reportable } from './sync';

export type CashViewMode = 'single' | 'breakdown';

export interface SetupData {
  completed: boolean;
  // How the dashboard renders cash accounts when they span multiple
  // currencies. 'single' = one converted total in the display currency
  // (today's behavior, preserved as the default). 'breakdown' = totals
  // grouped by currency; the AFTER MONTHLY PAYMENTS hero stays in display
  // currency either way.
  cashViewMode: CashViewMode;
  // ISO timestamp the 3-day trial clock started, or null if not yet
  // started. Read-only here — written once by lib/access startTrial();
  // toRemote() deliberately omits it so a settings save never clobbers it.
  trialStartedAt: string | null;
}

const NS = 'setup';

async function fromRemote(): Promise<SetupData | null> {
  const uid = await userId();
  if (!uid) return null;
  const { data, error } = await supabase
    .from('user_settings')
    .select('setup_completed, trial_started_at, cash_view_mode')
    .eq('user_id', uid)
    .maybeSingle();
  if (error || !data) return null;

  return {
    completed: data.setup_completed,
    cashViewMode:
      (data.cash_view_mode as CashViewMode | null | undefined) === 'breakdown'
        ? 'breakdown'
        : 'single',
    trialStartedAt: (data.trial_started_at as string | null) ?? null,
  };
}

async function toRemote(d: SetupData): Promise<void> {
  const uid = await userId();
  if (!uid) return;
  await reportable(
    supabase
      .from('user_settings')
      .upsert(
        {
          user_id: uid,
          setup_completed: d.completed,
          cash_view_mode: d.cashViewMode,
        },
        { onConflict: 'user_id' },
      ),
  );
}

export function peekSetup(): SetupData | null {
  return peek<SetupData | null>(NS, null);
}

export async function getSetup(): Promise<SetupData | null> {
  return load<SetupData | null>(NS, null);
}

export async function refreshSetup(): Promise<SetupData | null> {
  const remote = await fromRemote();
  if (remote) await save(NS, remote);
  return remote ?? (await getSetup());
}

export async function saveSetup(data: SetupData): Promise<void> {
  await save(NS, data);
  await toRemote(data);
  listeners.forEach((fn) => fn(data));
}

// Lightweight subscriber for shared setup preferences.
type Listener = (data: SetupData) => void;
const listeners = new Set<Listener>();

export function subscribeSetup(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
