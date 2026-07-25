import * as Crypto from 'expo-crypto';
import { supabase, userId } from './supabase';
import { load, peek, save } from './storage';
import { reportable } from './sync';
import { parseAmount, resetStaleCosts } from './finance';

export interface Account {
  id: string;
  name: string;
  amount: string;
  position: number;
  // ISO 4217 code (RON/USD/EUR/GBP/HUF/CHF). Undefined on legacy rows —
  // the dashboard treats undefined as "use the user's display currency."
  currency?: string;
  /** Personal is the safe default for every existing account. */
  accountType?: 'personal' | 'business';
}

export interface Cost {
  id: string;
  name: string;
  amount: string;
  paid: boolean;
  position: number;
  dueDay: number;                        // 1–31, day of month bill is due
  intervalMonths: number;                // 1 monthly (default), 3 quarterly, 12 yearly, N custom
  dueMonth?: number | null;              // 1–12 anchor month; only meaningful when intervalMonths !== 1
  paidFromAccountId?: string | null;     // which account funded the payment
  paidMonth?: string | null;             // "YYYY-MM" — period start; auto-reset after intervalMonths
  paidAmount?: number | null;            // amount deducted from the funding account, in THAT account's currency; null when unpaid / paid without deducting / legacy row
  /** ISO currency for this bill. Legacy rows fall back to the global currency. */
  currency?: string;
  accountType?: 'personal' | 'business';
}

// "YYYY-MM" key for the current calendar month.
export function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export interface DashboardData {
  accounts: Account[];
  costs: Cost[];
}

const NS = 'dashboard';
const EMPTY: DashboardData = { accounts: [], costs: [] };

// CSPRNG-backed UUID v4 via expo-crypto (SecRandomCopyBytes on iOS,
// SecureRandom on Android, window.crypto on web).
export function newId(): string {
  return Crypto.randomUUID();
}

// ── Local cache ────────────────────────────────────────────
export function peekDashboard(): DashboardData {
  return peek<DashboardData>(NS, EMPTY);
}

export async function getDashboard(): Promise<DashboardData> {
  return load<DashboardData>(NS, EMPTY);
}

async function persistCache(data: DashboardData): Promise<void> {
  await save(NS, data);
}

// ── Refresh from Supabase ──────────────────────────────────
export async function refreshDashboard(): Promise<DashboardData> {
  const uid = await userId();
  if (!uid) return getDashboard();

  const [accountsRes, costsRes] = await Promise.all([
    supabase
      .from('accounts')
      .select('id, name, amount, position, currency, account_type')
      .eq('user_id', uid)
      .order('position', { ascending: true }),
    supabase
      .from('costs')
      .select('id, name, amount, paid, position, due_day, interval_months, due_month, paid_from_account_id, paid_month, paid_amount, currency, account_type')
      .eq('user_id', uid)
      .order('position', { ascending: true }),
  ]);

  if (accountsRes.error || costsRes.error) return getDashboard();

  const data: DashboardData = {
    accounts: (accountsRes.data ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      amount: String(r.amount),
      position: r.position,
      currency: r.currency ?? undefined,
      accountType: r.account_type === 'business' ? 'business' : 'personal',
    })),
    costs: (costsRes.data ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      amount: String(r.amount),
      paid: r.paid,
      position: r.position,
      dueDay: r.due_day ?? 1,
      intervalMonths: r.interval_months ?? 1,
      dueMonth: r.due_month ?? null,
      paidFromAccountId: r.paid_from_account_id,
      paidMonth: r.paid_month,
      paidAmount: r.paid_amount ?? null,
      currency: r.currency ?? undefined,
      accountType: r.account_type === 'business' ? 'business' : 'personal',
    })),
  };

  // Monthly auto-reset lives here (not in a screen) so it happens on any
  // data load — Dashboard's "after payments" stays correct even if the
  // user never opens the costs/recurrings UI. Past payments stay deducted
  // (no refund); the cost is just un-paid for the new month.
  const month = currentMonthKey();
  const { next, reset } = resetStaleCosts(data.costs, month);
  if (reset.length > 0) {
    for (const c of reset) {
      await reportable(
        supabase.from('costs').upsert({
          id: c.id,
          user_id: uid,
          name: c.name,
          amount: parseAmount(c.amount),
          paid: c.paid,
          position: c.position,
          due_day: c.dueDay,
          interval_months: c.intervalMonths ?? 1,
          due_month: c.dueMonth ?? null,
          paid_from_account_id: c.paidFromAccountId ?? null,
          paid_month: c.paidMonth ?? null,
          paid_amount: c.paidAmount ?? null,
          currency: c.currency ?? null,
          account_type: c.accountType ?? 'personal',
        }),
      );
    }
  }
  const cleaned: DashboardData = { accounts: data.accounts, costs: next };
  await persistCache(cleaned);
  if (reset.length > 0) {
    resetListeners.forEach((fn) => fn({ count: reset.length, month }));
  }
  return cleaned;
}

// Fired once when refreshDashboard auto-un-pays last month's costs, so a
// screen can surface a toast without the data layer knowing about UI.
export interface MonthlyResetInfo {
  count: number;
  month: string;
}
const resetListeners = new Set<(i: MonthlyResetInfo) => void>();
export function subscribeMonthlyReset(
  fn: (i: MonthlyResetInfo) => void,
): () => void {
  resetListeners.add(fn);
  return () => {
    resetListeners.delete(fn);
  };
}

// ── Account ops ─────────────────────────────────────────────
export async function saveAccount(account: Account): Promise<void> {
  const cache = await getDashboard();
  const accounts = cache.accounts.find((a) => a.id === account.id)
    ? cache.accounts.map((a) => (a.id === account.id ? account : a))
    : [...cache.accounts, account];
  await persistCache({ ...cache, accounts });

  const uid = await userId();
  if (!uid) return;
  await reportable(
    supabase.from('accounts').upsert({
      id: account.id,
      user_id: uid,
      name: account.name,
      amount: parseAmount(account.amount),
      position: account.position,
      currency: account.currency ?? null,
      account_type: account.accountType ?? 'personal',
    }),
  );
}

export async function deleteAccount(id: string): Promise<void> {
  const cache = await getDashboard();
  await persistCache({ ...cache, accounts: cache.accounts.filter((a) => a.id !== id) });

  const uid = await userId();
  if (!uid) return;
  await reportable(supabase.from('accounts').delete().eq('id', id).eq('user_id', uid));
}

// ── Cost ops ────────────────────────────────────────────────
export async function saveCost(cost: Cost): Promise<void> {
  const cache = await getDashboard();
  const costs = cache.costs.find((c) => c.id === cost.id)
    ? cache.costs.map((c) => (c.id === cost.id ? cost : c))
    : [...cache.costs, cost];
  await persistCache({ ...cache, costs });

  const uid = await userId();
  if (!uid) return;
  await reportable(
    supabase.from('costs').upsert({
      id: cost.id,
      user_id: uid,
      name: cost.name,
      amount: parseAmount(cost.amount),
      paid: cost.paid,
      position: cost.position,
      due_day: cost.dueDay,
      interval_months: cost.intervalMonths ?? 1,
      due_month: cost.dueMonth ?? null,
      paid_from_account_id: cost.paidFromAccountId ?? null,
      paid_month: cost.paidMonth ?? null,
      paid_amount: cost.paidAmount ?? null,
      currency: cost.currency ?? null,
      account_type: cost.accountType ?? 'personal',
    }),
  );
}

export async function deleteCost(id: string): Promise<void> {
  const cache = await getDashboard();
  await persistCache({ ...cache, costs: cache.costs.filter((c) => c.id !== id) });

  const uid = await userId();
  if (!uid) return;
  await reportable(supabase.from('costs').delete().eq('id', id).eq('user_id', uid));
}
