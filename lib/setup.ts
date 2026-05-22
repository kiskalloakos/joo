import { supabase, userId } from './supabase';
import { load, peek, save } from './storage';
import { reportable } from './sync';

// The reorderable (optional) tabs, in their default order. Dashboard and
// Recurrings are always pinned first; Settings always last — those are
// structural and not part of tabOrder. _layout self-heals if a name here
// is missing from a persisted tabOrder (appended in this order).
export const ORDERABLE_TABS = [
  'investments',
  'savings',
  'revenue',
  'debts',
  'net-worth',
  'goals',
  'projects',
] as const;

export type CashViewMode = 'single' | 'breakdown';

export interface SetupData {
  completed: boolean;
  showInvestments: boolean;
  showSavings: boolean;
  showRevenue: boolean;
  showDebts: boolean;
  showNetWorth: boolean;
  showRecurrings: boolean;
  showGoals: boolean;
  showProjects: boolean;
  includeDebtsInNetWorth: boolean;
  // Order of the optional tabs (route names from ORDERABLE_TABS).
  tabOrder: string[];
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

// Normalize any persisted order: keep known names in their saved order,
// drop unknowns, append any ORDERABLE_TABS missing from it. Always returns
// a complete, valid permutation so callers never special-case nulls.
export function normalizeTabOrder(saved: string[] | null | undefined): string[] {
  const known = new Set<string>(ORDERABLE_TABS);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const n of saved ?? []) {
    if (known.has(n) && !seen.has(n)) {
      out.push(n);
      seen.add(n);
    }
  }
  for (const n of ORDERABLE_TABS) if (!seen.has(n)) out.push(n);
  return out;
}

const NS = 'setup';

async function fromRemote(): Promise<SetupData | null> {
  const uid = await userId();
  if (!uid) return null;
  const { data, error } = await supabase
    .from('user_settings')
    .select('investment_tab_name, show_investments, show_savings, show_revenue, show_debts, show_net_worth, show_recurrings, show_goals, show_projects, net_worth_include_debts, setup_completed, tab_order, trial_started_at, cash_view_mode')
    .eq('user_id', uid)
    .maybeSingle();
  if (error || !data) return null;

  // Backward-compat: if new columns aren't populated yet, derive from the
  // legacy `investment_tab_name` field (single tab named one or the other).
  const legacyName = data.investment_tab_name as 'Investments' | 'Savings' | null;
  const showInvestments = data.show_investments ?? (legacyName !== 'Savings');
  const showSavings = data.show_savings ?? (legacyName === 'Savings');

  return {
    completed: data.setup_completed,
    showInvestments,
    showSavings,
    showRevenue: data.show_revenue,
    showDebts: data.show_debts ?? false,
    showNetWorth: data.show_net_worth ?? false,
    // Recurrings shows by default; users opt out via Settings. The column
    // is NOT NULL post-migration, but if the remote read predates it, fall
    // back to shown so the tab never silently disappears.
    showRecurrings: data.show_recurrings ?? true,
    showGoals: data.show_goals ?? false,
    showProjects: data.show_projects ?? false,
    includeDebtsInNetWorth: data.net_worth_include_debts ?? true,
    tabOrder: normalizeTabOrder(data.tab_order as string[] | null),
    // Same shape as showRecurrings: NOT NULL post-migration, but pre-migration
    // reads return undefined — coerce to 'single' so today's behavior holds.
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
          show_investments: d.showInvestments,
          show_savings: d.showSavings,
          show_revenue: d.showRevenue,
          show_debts: d.showDebts,
          show_net_worth: d.showNetWorth,
          show_recurrings: d.showRecurrings,
          show_goals: d.showGoals,
          show_projects: d.showProjects,
          net_worth_include_debts: d.includeDebtsInNetWorth,
          setup_completed: d.completed,
          tab_order: normalizeTabOrder(d.tabOrder),
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

// Lightweight subscriber so components (e.g. the tab bar) re-render the moment
// Settings toggles `showRevenue`, without a manual reload.
type Listener = (data: SetupData) => void;
const listeners = new Set<Listener>();

export function subscribeSetup(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
