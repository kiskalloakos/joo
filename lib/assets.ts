import { supabase, userId } from './supabase';
import { load, peek, save } from './storage';
import { reportable } from './sync';
import { parseAmount } from './finance';

export interface Asset {
  id: string;
  name: string;
  amount: string;
  emoji?: string | null;
  currency?: string;
  position: number;
}

const NS = 'assets';

export function peekAssets(): Asset[] { return peek<Asset[]>(NS, []); }
export async function getAssets(): Promise<Asset[]> { return load<Asset[]>(NS, []); }

export async function refreshAssets(): Promise<Asset[]> {
  const uid = await userId();
  if (!uid) return getAssets();
  const { data, error } = await supabase
    .from('assets')
    .select('id, name, amount, emoji, currency, position')
    .eq('user_id', uid)
    .order('position', { ascending: true });
  if (error) return getAssets();
  const assets = (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    amount: String(row.amount),
    emoji: row.emoji ?? null,
    currency: row.currency ?? undefined,
    position: row.position,
  }));
  await save(NS, assets);
  return assets;
}

export async function saveAsset(asset: Asset): Promise<void> {
  const current = await getAssets();
  const assets = current.some((item) => item.id === asset.id)
    ? current.map((item) => item.id === asset.id ? asset : item)
    : [...current, asset];
  await save(NS, assets);
  const uid = await userId();
  if (!uid) return;
  await reportable(supabase.from('assets').upsert({
    id: asset.id,
    user_id: uid,
    name: asset.name,
    amount: parseAmount(asset.amount),
    emoji: asset.emoji ?? null,
    currency: asset.currency ?? null,
    position: asset.position,
  }));
}

export async function deleteAsset(id: string): Promise<void> {
  const current = await getAssets();
  await save(NS, current.filter((item) => item.id !== id));
  const uid = await userId();
  if (uid) await reportable(supabase.from('assets').delete().eq('id', id).eq('user_id', uid));
}
