import { supabase, userId } from './supabase';
import { reportable } from './sync';
import { load, peek, save } from './storage';

export type TxDirection = 'in' | 'out';
export type TxKind = 'manual' | 'cost' | 'refund';

export interface Transaction {
  id: string;
  accountId: string | null;
  amount: number;
  direction: TxDirection;
  kind: TxKind;
  referenceId: string | null;
  note: string | null;
  createdAt: string; // ISO
}

const NS = 'transactions';

export function peekTransactions(): Transaction[] {
  return peek<Transaction[]>(NS, []);
}

export async function logTransaction(args: {
  accountId: string;
  amount: number;
  direction: TxDirection;
  kind?: TxKind;
  referenceId?: string | null;
  note?: string | null;
}): Promise<void> {
  if (args.amount <= 0) return;
  const uid = await userId();
  if (!uid) return;
  await reportable(
    supabase.from('transactions').insert({
      user_id: uid,
      account_id: args.accountId,
      amount: args.amount,
      direction: args.direction,
      kind: args.kind ?? 'manual',
      reference_id: args.referenceId ?? null,
      note: args.note ?? null,
    }),
  );
}

// Undo the most recent payment for a cost (un-ticking it). Rather than
// inserting an offsetting `refund` row — which made repeated tick/untick
// pile up mirror-image in/out entries in the statement — we delete the
// original `cost` payment row, so toggling nets to zero ledger activity.
// Only the latest matching row is removed, so earlier months' payments
// (kept paid through the monthly auto-reset) stay in the history.
export async function deleteLastCostTransaction(referenceId: string): Promise<void> {
  const uid = await userId();
  if (!uid) return;
  const { data, error } = await supabase
    .from('transactions')
    .select('id')
    .eq('user_id', uid)
    .eq('reference_id', referenceId)
    .eq('kind', 'cost')
    .order('created_at', { ascending: false })
    .limit(1);
  if (error || !data || data.length === 0) return;
  await reportable(
    supabase.from('transactions').delete().eq('id', data[0].id).eq('user_id', uid),
  );
}

// Edit an existing transaction's mutable fields (amount, direction, note).
// account_id, kind, reference_id and created_at are intentionally fixed — a
// wrong account or a mis-dated row is fixed by delete + re-add. The CALLER is
// responsible for the matching account-balance adjustment; this only touches
// the ledger row. `amount > 0` is a table CHECK, so callers must validate.
export async function updateTransaction(tx: Transaction): Promise<void> {
  if (tx.amount <= 0) return;
  const uid = await userId();
  if (!uid) return;
  await reportable(
    supabase
      .from('transactions')
      .update({ amount: tx.amount, direction: tx.direction, note: tx.note ?? null })
      .eq('id', tx.id)
      .eq('user_id', uid),
  );
}

// Delete one transaction by id. The caller reverses its effect on the account
// balance (and, for a cost payment, un-pays the linked recurring).
export async function deleteTransaction(id: string): Promise<void> {
  const uid = await userId();
  if (!uid) return;
  await reportable(
    supabase.from('transactions').delete().eq('id', id).eq('user_id', uid),
  );
}

// Re-insert a previously deleted transaction verbatim — same id and
// created_at — so an Undo restores it to its exact place in the log.
export async function restoreTransaction(tx: Transaction): Promise<void> {
  const uid = await userId();
  if (!uid) return;
  await reportable(
    supabase.from('transactions').insert({
      id: tx.id,
      user_id: uid,
      account_id: tx.accountId,
      amount: tx.amount,
      direction: tx.direction,
      kind: tx.kind,
      reference_id: tx.referenceId ?? null,
      note: tx.note ?? null,
      created_at: tx.createdAt,
    }),
  );
}

export async function getTransactions(limit = 500): Promise<Transaction[]> {
  const cached = await load<Transaction[]>(NS, []);
  return cached.slice(0, limit);
}

export async function refreshTransactions(limit = 500): Promise<Transaction[]> {
  const uid = await userId();
  if (!uid) return getTransactions(limit);
  const { data, error } = await supabase
    .from('transactions')
    .select('id, account_id, amount, direction, kind, reference_id, note, created_at')
    .eq('user_id', uid)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error || !data) return getTransactions(limit);
  const transactions = data.map((r) => ({
    id: r.id,
    accountId: r.account_id,
    amount: Number(r.amount),
    direction: r.direction as TxDirection,
    kind: r.kind as TxKind,
    referenceId: r.reference_id,
    note: r.note,
    createdAt: r.created_at,
  }));
  await save(NS, transactions);
  return transactions;
}
