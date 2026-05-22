import { supabase, userId } from './supabase';
import { load, peek, save } from './storage';
import { reportable } from './sync';
import { parseAmount } from './finance';

// A manually-tracked savings/payoff target. `currentAmount` is updated by
// hand as you make progress. `deadline` is an optional 'YYYY-MM-DD' string.
export interface Goal {
  id: string;
  name: string;
  targetAmount: string;
  currentAmount: string;
  deadline?: string | null;
  emoji?: string | null;
  position: number;
}

const NS = 'goals';

export function peekGoals(): Goal[] {
  return peek<Goal[]>(NS, []);
}

export async function getGoals(): Promise<Goal[]> {
  return load<Goal[]>(NS, []);
}

export async function refreshGoals(): Promise<Goal[]> {
  const uid = await userId();
  if (!uid) return getGoals();
  const { data, error } = await supabase
    .from('goals')
    .select('id, name, target_amount, current_amount, deadline, emoji, position')
    .eq('user_id', uid)
    .order('position', { ascending: true });
  if (error) return getGoals();
  const result: Goal[] = (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    targetAmount: String(r.target_amount),
    currentAmount: String(r.current_amount),
    deadline: r.deadline,
    emoji: r.emoji,
    position: r.position,
  }));
  await save(NS, result);
  return result;
}

export async function saveGoal(goal: Goal): Promise<void> {
  const cache = await getGoals();
  const next = cache.find((g) => g.id === goal.id)
    ? cache.map((g) => (g.id === goal.id ? goal : g))
    : [...cache, goal];
  await save(NS, next);

  const uid = await userId();
  if (!uid) return;
  await reportable(
    supabase.from('goals').upsert({
      id: goal.id,
      user_id: uid,
      name: goal.name,
      target_amount: parseAmount(goal.targetAmount),
      current_amount: parseAmount(goal.currentAmount),
      deadline: goal.deadline ?? null,
      emoji: goal.emoji ?? null,
      position: goal.position,
    }),
  );
}

export async function deleteGoal(id: string): Promise<void> {
  const cache = await getGoals();
  await save(NS, cache.filter((g) => g.id !== id));
  const uid = await userId();
  if (!uid) return;
  await reportable(supabase.from('goals').delete().eq('id', id).eq('user_id', uid));
}
