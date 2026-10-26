import type { Account } from './dashboard';
import type { Transaction } from './transactions';

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]!);
}

export interface StatementOptions {
  monthYear: number;
  monthIndex: number;
  transactions: Transaction[];
  accounts: Account[];
  currency: string;
}

/** Shared list data for the PDF and web print preview. */
export function statementRows({ monthYear, monthIndex, transactions, accounts, currency }: StatementOptions) {
  const title = new Date(monthYear, monthIndex, 1).toLocaleDateString('en-GB', {
    month: 'long', year: 'numeric',
  });
  const monthTx = transactions.filter((tx) => {
    const date = new Date(tx.createdAt);
    return date.getFullYear() === monthYear && date.getMonth() === monthIndex;
  }).sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  const byId = new Map(accounts.map((account) => [account.id, account]));
  const rows = monthTx.map((tx) => {
    const account = tx.accountId ? byId.get(tx.accountId) : undefined;
    return {
      date: new Date(tx.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
      description: tx.note?.trim() || (tx.kind === 'cost' ? 'Bill payment' : tx.kind === 'refund' ? 'Refund' : 'Transfer'),
      account: account?.name ?? 'Account removed',
      amount: `${tx.direction === 'in' ? '+' : '-'}${tx.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${account?.currency ?? currency}`,
    };
  });
  return { title, rows };
}

/** Plain, printable list; amounts stay in each account's original currency. */
export function statementHtml(options: StatementOptions): string {
  const { title, rows: entries } = statementRows(options);
  const rows = entries.map((row) => `<tr><td class="date">${escapeHtml(row.date)}</td><td>${escapeHtml(row.description)}<div class="account">${escapeHtml(row.account)}</div></td><td class="amount">${escapeHtml(row.amount)}</td></tr>`).join('');
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Statement - ${title}</title>
<style>
@page { size: A4; margin: 18mm; }
* { box-sizing: border-box; }
body { margin: 0; padding: 12px; font: 12px/1.5 Arial, sans-serif; color: #111; background: #fff; }
h1 { font-size: 20px; margin: 0 0 4px; }
p { margin: 0 0 20px; color: #555; }
table { width: 100%; border-collapse: collapse; table-layout: fixed; }
thead { display: table-header-group; }
th { text-align: left; font-weight: 600; border-bottom: 1px solid #999; }
th, td { padding: 9px 6px; vertical-align: top; }
td { border-bottom: 1px solid #ddd; overflow-wrap: anywhere; }
tr { break-inside: avoid; page-break-inside: avoid; }
.date { width: 24%; }
.amount { width: 30%; text-align: right; font-variant-numeric: tabular-nums; }
.account { color: #555; font-size: 11px; }
</style></head><body><h1>Statement - ${title}</h1><p>${entries.length} ${entries.length === 1 ? 'transaction' : 'transactions'}</p>
${entries.length ? `<table><thead><tr><th class="date">Date</th><th>Description / account</th><th class="amount">Amount</th></tr></thead><tbody>${rows}</tbody></table>` : '<p>No activity this month.</p>'}
</body></html>`;
}
