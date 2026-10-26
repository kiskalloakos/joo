import { describe, it, expect } from '@jest/globals';
import { statementHtml } from './statementPdf';
import type { Transaction } from './transactions';

const tx = (overrides: Partial<Transaction> = {}): Transaction => ({
  id: 't', accountId: 'cash', amount: 12.34, direction: 'out', kind: 'cost',
  referenceId: null, note: 'Phone', createdAt: new Date(2026, 9, 15, 12).toISOString(), ...overrides,
});
const render = (transactions: Transaction[]) => statementHtml({
  monthYear: 2026, monthIndex: 9, currency: 'RON', transactions,
  accounts: [{ id: 'cash', name: 'Euro account', currency: 'EUR', amount: '100', position: 0 }],
});

describe('statement PDF list', () => {
  it('exports only the selected month, in date order without changing input', () => {
    const transactions = [tx({ note: 'Later' }), tx({ note: 'Earlier', createdAt: new Date(2026, 9, 1, 12).toISOString() }), tx({ note: 'Excluded', createdAt: new Date(2026, 8, 30, 12).toISOString() })];
    const html = render(transactions);
    expect(html).toContain('2 transactions');
    expect(html).not.toContain('Excluded');
    expect(html.indexOf('Earlier')).toBeLessThan(html.indexOf('Later'));
    expect(transactions[0].note).toBe('Later');
  });
  it('keeps exact cents, signs and account currencies', () => {
    const html = render([tx(), tx({ direction: 'in', amount: 1000.05, accountId: null })]);
    expect(html).toContain('-12.34 EUR');
    expect(html).toContain('+1,000.05 RON');
    expect(html).toContain('Account removed');
  });
  it('escapes notes and displays Unicode text safely', () => {
    const html = render([tx({ note: '<script>alert("x")</script> & Ákos' })]);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&amp; Ákos');
  });
  it('handles empty months and missing notes', () => {
    expect(render([])).toContain('No activity this month.');
    expect(render([tx({ note: null })])).toContain('Bill payment');
  });
});
