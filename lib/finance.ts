// Pure money math. No React Native / Supabase imports on purpose: this stays
// trivially unit-testable and is the single source of truth for the growth
// projection used by both the Investments and Savings screens.

// Parse a user-typed money string into a number. The `decimal-pad` keyboard
// shows the device locale's decimal separator, so a comma-locale user types
// "150,66" — a bare parseFloat reads that as 150 and silently drops the
// cents. Normalise comma → dot first. Empty / garbage → 0, never NaN.
export function parseAmount(s: string): number {
  const n = parseFloat(String(s).replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

// Months elapsed from a start (year, month) up to and including the current
// calendar month. Always >= 1 so a brand-new plan still divides cleanly.
export function monthsSinceStart(year: number, month: number): number {
  const now = new Date();
  const diff = (now.getFullYear() - year) * 12 + (now.getMonth() + 1 - month) + 1;
  return Math.max(1, diff);
}

// Future value of a present sum `pv` plus a fixed monthly contribution `pmt`,
// compounded monthly at `annualRate` percent, after `months` months.
// Standard annuity formula; the r === 0 branch avoids a divide-by-zero and
// returns the plain (no-growth) sum.
export function fv(pv: number, pmt: number, annualRate: number, months: number): number {
  const r = annualRate / 100 / 12;
  if (r === 0) return pv + pmt * months;
  return pv * Math.pow(1 + r, months) + pmt * ((Math.pow(1 + r, months) - 1) / r);
}

// Net-worth roll-up. The boolean defaults are deliberate and load-bearing:
// investments/debts default ON when the flag is undefined (`!== false`),
// savings defaults OFF (`=== true`). A null setup (not yet loaded) therefore
// counts cash + investments − debts. Returns the full breakdown so the screen
// has a single source of truth for both the number and row visibility.
export interface NetWorthSetup {
  showInvestments?: boolean;
  showSavings?: boolean;
  showDebts?: boolean;
  includeDebtsInNetWorth?: boolean;
}
export interface NetWorthBreakdown {
  investmentsEnabled: boolean;
  savingsEnabled: boolean;
  debtsEnabled: boolean;
  debtsCountInTotal: boolean;
  investedTotal: number;
  netWorth: number;
}
// `assets` (manually-tracked house/car/valuables) always counts toward net
// worth — no gating. Defaulted/last so existing call sites stay valid.
export function computeNetWorth(
  cash: number,
  invested: number,
  saved: number,
  debts: number,
  setup: NetWorthSetup | null,
  assets = 0,
): NetWorthBreakdown {
  const investmentsEnabled = setup?.showInvestments !== false;
  const savingsEnabled = setup?.showSavings === true;
  const debtsEnabled = setup?.showDebts !== false;
  const debtsCountInTotal = debtsEnabled && setup?.includeDebtsInNetWorth !== false;
  const investedTotal = (investmentsEnabled ? invested : 0) + (savingsEnabled ? saved : 0);
  const netWorth = cash + investedTotal + assets - (debtsCountInTotal ? debts : 0);
  return { investmentsEnabled, savingsEnabled, debtsEnabled, debtsCountInTotal, investedTotal, netWorth };
}

// How much to set aside per month to hit a goal's target by its deadline.
// Never negative; if already at/over target → 0. monthsLeft is clamped to
// >= 1 so a same-month deadline doesn't divide by zero.
export function goalMonthlyPace(
  target: number,
  current: number,
  monthsLeft: number,
): number {
  const remaining = Math.max(0, target - current);
  return remaining / Math.max(1, monthsLeft);
}

// Whole months from one "YYYY-MM" key to another (signed; year-aware).
// monthDiff('2025-12', '2026-01') === 1.
export function monthDiff(from: string, to: string): number {
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

// Periodic-cost auto-reset. A cost stays paid for its full interval, then is
// un-paid (the past payment stays deducted — no refund). Monthly costs
// (intervalMonths 1 / undefined) clear the very next month — identical to the
// old behavior, so legacy rows are unaffected. Quarterly (3) stays paid 3
// months, yearly (12) for 12, custom "every N" for N. Pure: returns the
// rebuilt list plus the subset that changed, so the caller owns the side
// effects (persist + toast). Generic so the caller keeps its full Cost type;
// only the fields this reads/clears are constrained.
export interface ResettableCost {
  paid: boolean;
  paidFromAccountId?: string | null;
  paidMonth?: string | null;
  paidAmount?: number | null;
  intervalMonths?: number;
}
export function resetStaleCosts<T extends ResettableCost>(
  costs: T[],
  currentMonth: string,
): { next: T[]; reset: T[] } {
  const reset: T[] = [];
  const next = costs.map((c) => {
    if (c.paid && c.paidMonth) {
      const period = Math.max(1, c.intervalMonths ?? 1);
      if (monthDiff(c.paidMonth, currentMonth) >= period) {
        const cleared = { ...c, paid: false, paidFromAccountId: null, paidMonth: null, paidAmount: null };
        reset.push(cleared);
        return cleared;
      }
    }
    return c;
  });
  return { next, reset };
}

// The next calendar month a periodic expense lands on, at or after `now`'s
// month. `anchorMonth` is 1–12 (the due month the user set); occurrences are
// anchor, anchor±interval, … so a quarterly bill anchored to March recurs
// Mar/Jun/Sep/Dec. Monthly (interval 1) always returns the current month.
export function nextOccurrence(
  anchorMonth: number,
  intervalMonths: number,
  now: Date = new Date(),
): { year: number; month: number } {
  const k = Math.max(1, intervalMonths);
  const curIdx = now.getFullYear() * 12 + now.getMonth(); // 0-based month index
  let idx = now.getFullYear() * 12 + (anchorMonth - 1);
  while (idx > curIdx) idx -= k;
  while (idx < curIdx) idx += k;
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
}

// What a set of non-monthly costs adds up to per year, for the Recurrings
// "Periodic" headline. Monthly costs (interval 1 / undefined) are excluded —
// they belong to the monthly figure, deliberately kept separate.
export function annualizedPeriodicTotal(
  costs: { amount: string; intervalMonths?: number }[],
): number {
  return costs.reduce((sum, c) => {
    const k = Math.max(1, c.intervalMonths ?? 1);
    if (k === 1) return sum;
    return sum + parseAmount(c.amount) * (12 / k);
  }, 0);
}
