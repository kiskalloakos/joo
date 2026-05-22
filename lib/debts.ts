import { supabase, userId } from './supabase';
import { load, peek, save } from './storage';
import { reportable } from './sync';
import { parseAmount } from './finance';

export interface Debt {
  id: string;
  name: string;
  amount: string;
  /** Manually-tracked amount paid off so far, of `amount`. */
  paidAmount: string;
  notes?: string | null;
  position: number;
}

const NS = 'debts';

export function peekDebts(): Debt[] {
  return peek<Debt[]>(NS, []);
}

export async function getDebts(): Promise<Debt[]> {
  return load<Debt[]>(NS, []);
}

export async function refreshDebts(): Promise<Debt[]> {
  const uid = await userId();
  if (!uid) return getDebts();
  const { data, error } = await supabase
    .from('debts')
    .select('id, name, amount, paid_amount, notes, position')
    .eq('user_id', uid)
    .order('position', { ascending: true });
  if (error) return getDebts();
  const result: Debt[] = (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    amount: String(r.amount),
    paidAmount: String(r.paid_amount ?? 0),
    notes: r.notes,
    position: r.position,
  }));
  await save(NS, result);
  return result;
}

export async function saveDebt(debt: Debt): Promise<void> {
  const cache = await getDebts();
  const next = cache.find((d) => d.id === debt.id)
    ? cache.map((d) => (d.id === debt.id ? debt : d))
    : [...cache, debt];
  await save(NS, next);

  const uid = await userId();
  if (!uid) return;
  await reportable(
    supabase.from('debts').upsert({
      id: debt.id,
      user_id: uid,
      name: debt.name,
      amount: parseAmount(debt.amount),
      paid_amount: parseAmount(debt.paidAmount),
      notes: debt.notes ?? null,
      position: debt.position,
    }),
  );
}

export async function deleteDebt(id: string): Promise<void> {
  const cache = await getDebts();
  await save(NS, cache.filter((d) => d.id !== id));
  const uid = await userId();
  if (!uid) return;
  await reportable(supabase.from('debts').delete().eq('id', id).eq('user_id', uid));
}
