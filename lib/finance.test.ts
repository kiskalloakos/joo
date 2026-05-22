import { describe, it, expect } from '@jest/globals';
import {
  fv,
  monthsSinceStart,
  computeNetWorth,
  resetStaleCosts,
  goalMonthlyPace,
  monthDiff,
  nextOccurrence,
  annualizedPeriodicTotal,
  parseAmount,
} from './finance';

describe('fv — future value of lump sum + monthly contributions', () => {
  it('zero rate, no contributions: value is unchanged', () => {
    expect(fv(1000, 0, 0, 12)).toBe(1000);
  });

  it('zero rate, with contributions: plain sum, no growth', () => {
    expect(fv(1000, 100, 0, 12)).toBe(1000 + 100 * 12);
  });

  it('zero months: returns the present value untouched', () => {
    expect(fv(5000, 100, 7, 0)).toBe(5000);
  });

  it('positive rate, lump sum only: compounds monthly', () => {
    // 1000 * (1 + 0.12/12)^12 = 1000 * 1.01^12
    expect(fv(1000, 0, 12, 12)).toBeCloseTo(1126.825, 2);
  });

  it('positive rate, contributions only: standard annuity', () => {
    // 100 * ((1.01^12 - 1) / 0.01)
    expect(fv(0, 100, 12, 12)).toBeCloseTo(1268.25, 2);
  });

  it('positive rate, lump sum + contributions: sums both legs', () => {
    expect(fv(1000, 100, 12, 12)).toBeCloseTo(1126.825 + 1268.25, 2);
  });

  it('negative rate: erodes value (no NaN/throw)', () => {
    const v = fv(1000, 0, -12, 12);
    expect(v).toBeLessThan(1000);
    expect(Number.isFinite(v)).toBe(true);
  });

  it('is monotonically non-decreasing in months at a positive rate', () => {
    let prev = -Infinity;
    for (let m = 0; m <= 120; m += 12) {
      const v = fv(1000, 100, 7, m);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
});

describe('monthsSinceStart — elapsed months, clamped to >= 1', () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1; // 1-12

  it('current month counts as 1', () => {
    expect(monthsSinceStart(y, m)).toBe(1);
  });

  it('one full year ago is 13 (12 elapsed + inclusive current)', () => {
    expect(monthsSinceStart(y - 1, m)).toBe(13);
  });

  it('a future start is clamped to 1, never zero or negative', () => {
    expect(monthsSinceStart(y + 5, m)).toBe(1);
  });

  it('exactly one month ago is 2', () => {
    // step back one calendar month, handling the January wrap
    const d = new Date(y, now.getMonth() - 1, 1);
    expect(monthsSinceStart(d.getFullYear(), d.getMonth() + 1)).toBe(2);
  });
});

describe('computeNetWorth — roll-up with load-bearing boolean defaults', () => {
  it('null setup: cash + investments − debts, savings excluded by default', () => {
    const r = computeNetWorth(1000, 500, 999, 200, null);
    expect(r.investmentsEnabled).toBe(true);
    expect(r.savingsEnabled).toBe(false); // showSavings defaults OFF
    expect(r.debtsEnabled).toBe(true);
    expect(r.debtsCountInTotal).toBe(true);
    expect(r.investedTotal).toBe(500); // saved (999) NOT counted
    expect(r.netWorth).toBe(1000 + 500 - 200);
  });

  it('savings counted only when showSavings === true', () => {
    expect(computeNetWorth(0, 0, 300, 0, { showSavings: true }).investedTotal).toBe(300);
    expect(computeNetWorth(0, 0, 300, 0, { showSavings: false }).investedTotal).toBe(0);
    expect(computeNetWorth(0, 0, 300, 0, {}).investedTotal).toBe(0); // undefined => off
  });

  it('investments excluded only when showInvestments === false', () => {
    expect(computeNetWorth(0, 400, 0, 0, { showInvestments: false }).investedTotal).toBe(0);
    expect(computeNetWorth(0, 400, 0, 0, { showInvestments: undefined }).investedTotal).toBe(400);
  });

  it('debts dropped from total when the tab is off', () => {
    const r = computeNetWorth(1000, 0, 0, 250, { showDebts: false });
    expect(r.debtsEnabled).toBe(false);
    expect(r.debtsCountInTotal).toBe(false);
    expect(r.netWorth).toBe(1000); // debts not subtracted
  });

  it('debts shown but excluded from total via includeDebtsInNetWorth=false', () => {
    const r = computeNetWorth(1000, 0, 0, 250, { includeDebtsInNetWorth: false });
    expect(r.debtsEnabled).toBe(true); // still rendered
    expect(r.debtsCountInTotal).toBe(false); // but not subtracted
    expect(r.netWorth).toBe(1000);
  });

  it('everything on: cash + investments + savings − debts', () => {
    const r = computeNetWorth(1000, 500, 300, 200, {
      showInvestments: true,
      showSavings: true,
      showDebts: true,
      includeDebtsInNetWorth: true,
    });
    expect(r.netWorth).toBe(1000 + 500 + 300 - 200);
  });

  it('net worth can go negative', () => {
    expect(computeNetWorth(100, 0, 0, 900, null).netWorth).toBe(-800);
  });

  it('assets default to 0 — omitting the arg is unchanged', () => {
    expect(computeNetWorth(1000, 500, 0, 200, null).netWorth).toBe(1300);
  });

  it('assets always add to net worth (no gating)', () => {
    expect(computeNetWorth(1000, 0, 0, 0, null, 50000).netWorth).toBe(51000);
    // counted even when other tabs are off
    expect(
      computeNetWorth(0, 0, 0, 0, { showInvestments: false, showDebts: false }, 250000)
        .netWorth,
    ).toBe(250000);
  });

  it('assets combine with the rest: cash + invested + assets − debts', () => {
    expect(computeNetWorth(1000, 500, 0, 200, null, 30000).netWorth).toBe(
      1000 + 500 + 30000 - 200,
    );
  });
});

describe('resetStaleCosts — monthly un-pay of last month’s costs', () => {
  const mk = (over: Partial<{ id: string; paid: boolean; paidMonth: string | null; paidFromAccountId: string | null; name: string }>) => ({
    id: 'x', name: 'rent', amount: '100', paid: false, paidMonth: null as string | null,
    paidFromAccountId: null as string | null, ...over,
  });

  it('a cost paid in a previous month is cleared and reported', () => {
    const { next, reset } = resetStaleCosts([mk({ paid: true, paidMonth: '2026-04', paidFromAccountId: 'acc1' })], '2026-05');
    expect(reset).toHaveLength(1);
    expect(next[0].paid).toBe(false);
    expect(next[0].paidMonth).toBeNull();
    expect(next[0].paidFromAccountId).toBeNull();
  });

  it('a cost paid in the current month is left untouched', () => {
    const c = mk({ paid: true, paidMonth: '2026-05', paidFromAccountId: 'acc1' });
    const { next, reset } = resetStaleCosts([c], '2026-05');
    expect(reset).toHaveLength(0);
    expect(next[0]).toBe(c); // same reference, unchanged
  });

  it('an unpaid cost is never touched', () => {
    const c = mk({ paid: false, paidMonth: null });
    const { next, reset } = resetStaleCosts([c], '2026-05');
    expect(reset).toHaveLength(0);
    expect(next[0]).toBe(c);
  });

  it('a paid cost with no paidMonth (legacy) is left alone', () => {
    const c = mk({ paid: true, paidMonth: null });
    const { reset } = resetStaleCosts([c], '2026-05');
    expect(reset).toHaveLength(0);
  });

  it('preserves unrelated fields on reset rows', () => {
    const { next } = resetStaleCosts([mk({ id: 'rent7', name: 'Rent', paid: true, paidMonth: '2026-03' })], '2026-05');
    expect(next[0].id).toBe('rent7');
    expect(next[0].name).toBe('Rent');
    expect(next[0].amount).toBe('100');
  });

  it('mixed list: only stale rows reset, order preserved', () => {
    const a = mk({ id: 'a', paid: true, paidMonth: '2026-04' }); // stale
    const b = mk({ id: 'b', paid: true, paidMonth: '2026-05' }); // current
    const c = mk({ id: 'c', paid: false });                       // unpaid
    const { next, reset } = resetStaleCosts([a, b, c], '2026-05');
    expect(reset.map((r) => r.id)).toEqual(['a']);
    expect(next.map((r) => r.id)).toEqual(['a', 'b', 'c']);
    expect(next[1]).toBe(b);
    expect(next[2]).toBe(c);
  });

  it('empty list yields empty result', () => {
    expect(resetStaleCosts([], '2026-05')).toEqual({ next: [], reset: [] });
  });
});

describe('monthDiff — whole months between two YYYY-MM keys', () => {
  it('same month is 0', () => expect(monthDiff('2026-05', '2026-05')).toBe(0));
  it('adjacent months is 1', () => expect(monthDiff('2026-04', '2026-05')).toBe(1));
  it('crosses the year boundary', () => expect(monthDiff('2025-12', '2026-01')).toBe(1));
  it('a full year is 12', () => expect(monthDiff('2025-06', '2026-06')).toBe(12));
  it('is signed (negative when going backward)', () =>
    expect(monthDiff('2026-05', '2026-02')).toBe(-3));
});

describe('resetStaleCosts — periodic intervals stay paid for their full term', () => {
  const mk = (over: Partial<{ paid: boolean; paidMonth: string | null; intervalMonths: number }>) => ({
    id: 'x', name: 'bill', amount: '100', paid: true, paidMonth: '2026-03' as string | null,
    paidFromAccountId: null as string | null, ...over,
  });

  it('quarterly: untouched before 3 months elapse', () => {
    const { reset } = resetStaleCosts([mk({ intervalMonths: 3, paidMonth: '2026-03' })], '2026-05');
    expect(reset).toHaveLength(0); // only 2 months elapsed
  });

  it('quarterly: clears once 3 months elapse', () => {
    const { reset, next } = resetStaleCosts([mk({ intervalMonths: 3, paidMonth: '2026-03' })], '2026-06');
    expect(reset).toHaveLength(1);
    expect(next[0].paid).toBe(false);
  });

  it('yearly: holds for 11 months, clears at 12', () => {
    expect(resetStaleCosts([mk({ intervalMonths: 12, paidMonth: '2025-06' })], '2026-05').reset).toHaveLength(0);
    expect(resetStaleCosts([mk({ intervalMonths: 12, paidMonth: '2025-06' })], '2026-06').reset).toHaveLength(1);
  });

  it('custom every-N falls back through the same rule', () => {
    expect(resetStaleCosts([mk({ intervalMonths: 6, paidMonth: '2026-01' })], '2026-06').reset).toHaveLength(0);
    expect(resetStaleCosts([mk({ intervalMonths: 6, paidMonth: '2026-01' })], '2026-07').reset).toHaveLength(1);
  });

  it('missing intervalMonths behaves as monthly (legacy rows)', () => {
    const { reset } = resetStaleCosts([mk({ paidMonth: '2026-04' })], '2026-05');
    expect(reset).toHaveLength(1);
  });
});

describe('nextOccurrence — next calendar month a periodic bill lands on', () => {
  const at = (y: number, m: number) => new Date(y, m - 1, 15); // m is 1-based

  it('yearly anchored to March, asked in May → next March', () => {
    expect(nextOccurrence(3, 12, at(2026, 5))).toEqual({ year: 2027, month: 3 });
  });

  it('yearly anchored to March, asked in February → this March', () => {
    expect(nextOccurrence(3, 12, at(2026, 2))).toEqual({ year: 2026, month: 3 });
  });

  it('quarterly anchored to March recurs Mar/Jun/Sep/Dec', () => {
    expect(nextOccurrence(3, 3, at(2026, 4))).toEqual({ year: 2026, month: 6 });
    expect(nextOccurrence(3, 3, at(2026, 7))).toEqual({ year: 2026, month: 9 });
    expect(nextOccurrence(3, 3, at(2026, 11))).toEqual({ year: 2026, month: 12 });
  });

  it('returns the current month when the bill is due this month', () => {
    expect(nextOccurrence(6, 3, at(2026, 6))).toEqual({ year: 2026, month: 6 });
  });

  it('monthly (interval 1) is always the current month', () => {
    expect(nextOccurrence(1, 1, at(2026, 8))).toEqual({ year: 2026, month: 8 });
  });
});

describe('annualizedPeriodicTotal — yearly cost of non-monthly bills', () => {
  it('yearly bill counts once', () =>
    expect(annualizedPeriodicTotal([{ amount: '1200', intervalMonths: 12 }])).toBe(1200));
  it('quarterly bill is x4', () =>
    expect(annualizedPeriodicTotal([{ amount: '300', intervalMonths: 3 }])).toBe(1200));
  it('every-6-months is x2', () =>
    expect(annualizedPeriodicTotal([{ amount: '50', intervalMonths: 6 }])).toBe(100));
  it('monthly and undefined intervals are excluded', () =>
    expect(
      annualizedPeriodicTotal([
        { amount: '99', intervalMonths: 1 },
        { amount: '99' },
        { amount: '1200', intervalMonths: 12 },
      ]),
    ).toBe(1200));
  it('empty list is 0', () => expect(annualizedPeriodicTotal([])).toBe(0));
});

describe('goalMonthlyPace — set-aside per month to hit a target', () => {
  it('splits the remaining amount across the months left', () => {
    expect(goalMonthlyPace(1200, 0, 12)).toBe(100);
    expect(goalMonthlyPace(1000, 400, 6)).toBe(100);
  });

  it('returns 0 once the goal is met or exceeded', () => {
    expect(goalMonthlyPace(1000, 1000, 5)).toBe(0);
    expect(goalMonthlyPace(1000, 1500, 5)).toBe(0);
  });

  it('clamps months to >= 1 (no divide-by-zero on a same-month deadline)', () => {
    expect(goalMonthlyPace(800, 0, 0)).toBe(800);
    expect(goalMonthlyPace(800, 0, -3)).toBe(800);
  });
});

describe('parseAmount — locale-tolerant money string parsing', () => {
  it('parses a plain dot decimal', () => expect(parseAmount('150.66')).toBe(150.66));
  it('parses a comma decimal (comma-locale keyboards)', () =>
    expect(parseAmount('150,66')).toBe(150.66));
  it('parses a whole number', () => expect(parseAmount('150')).toBe(150));
  it('empty and garbage strings are 0, never NaN', () => {
    expect(parseAmount('')).toBe(0);
    expect(parseAmount('abc')).toBe(0);
  });
  it('a bare separator is 0, not NaN', () => {
    expect(parseAmount(',')).toBe(0);
    expect(parseAmount('.')).toBe(0);
  });
  it('leading-separator decimals work in both locales', () => {
    expect(parseAmount(',5')).toBe(0.5);
    expect(parseAmount('.5')).toBe(0.5);
  });
});
