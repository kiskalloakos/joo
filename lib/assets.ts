import { supabase, userId } from './supabase';
import { load, peek, save } from './storage';
import { reportable } from './sync';
import { parseAmount } from './finance';

// A manually-tracked asset (house, car, valuables…) that adds into net
// worth. Mirrors the Debt shape; `emoji` is an optional glyph for flavour.
export interface Asset {
  id: string;
  name: string;
  amount: string;
  emoji?: string | null;
  position: number;
}

const NS = 'assets';

export function peekAssets(): Asset[] {
  return peek<Asset[]>(NS, []);
}

export async function getAssets(): Promise<Asset[]> {
  return load<Asset[]>(NS, []);
}

export async function refreshAssets(): Promise<Asset[]> {
  const uid = await userId();
  if (!uid) return getAssets();
  const { data, error } = await supabase
    .from('assets')
    .select('id, name, amount, emoji, position')
    .eq('user_id', uid)
    .order('position', { ascending: true });
  if (error) return getAssets();
  const result: Asset[] = (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    amount: String(r.amount),
    emoji: r.emoji,
    position: r.position,
  }));
  await save(NS, result);
  return result;
}

export async function saveAsset(asset: Asset): Promise<void> {
  const cache = await getAssets();
  const next = cache.find((a) => a.id === asset.id)
    ? cache.map((a) => (a.id === asset.id ? asset : a))
    : [...cache, asset];
  await save(NS, next);

  const uid = await userId();
  if (!uid) return;
  await reportable(
    supabase.from('assets').upsert({
      id: asset.id,
      user_id: uid,
      name: asset.name,
      amount: parseAmount(asset.amount),
      emoji: asset.emoji ?? null,
      position: asset.position,
    }),
  );
}

export async function deleteAsset(id: string): Promise<void> {
  const cache = await getAssets();
  await save(NS, cache.filter((a) => a.id !== id));
  const uid = await userId();
  if (!uid) return;
  await reportable(supabase.from('assets').delete().eq('id', id).eq('user_id', uid));
}
