import { supabase, userId } from './supabase';
import { load, peek, save } from './storage';
import { reportable } from './sync';

const NS = 'currency';
const DEFAULT_CURRENCY = 'RON';

export type PageKey = 'dashboard' | 'investments' | 'savings' | 'revenue' | 'debts' | 'projects';

export interface CurrencySettings {
  global: string;
}

const EMPTY: CurrencySettings = { global: DEFAULT_CURRENCY };

async function fromRemote(): Promise<CurrencySettings | null> {
  const uid = await userId();
  if (!uid) return null;
  const { data, error } = await supabase
    .from('user_settings')
    .select('currency')
    .eq('user_id', uid)
    .maybeSingle();
  if (error || !data) return null;
  return { global: data.currency ?? DEFAULT_CURRENCY };
}

// ── Public API ──────────────────────────────────────────────────────────────
// For Settings (full structure)
export function peekCurrencySettings(): CurrencySettings {
  // Backward-compat: older cache stored a plain string.
  const cached = peek<CurrencySettings | string>(NS, EMPTY);
  if (typeof cached === 'string') return { global: cached };
  return { global: cached.global ?? DEFAULT_CURRENCY };
}

export function peekCurrencyForPage(_page: PageKey): string {
  const s = peekCurrencySettings();
  return s.global;
}

export async function getCurrencySettings(): Promise<CurrencySettings> {
  // Backward-compat: older cache stored a plain string.
  const cached = await load<CurrencySettings | string>(NS, EMPTY);
  if (typeof cached === 'string') return { global: cached };
  return { global: cached.global ?? DEFAULT_CURRENCY };
}

export async function refreshCurrencySettings(): Promise<CurrencySettings> {
  const remote = await fromRemote();
  if (remote) await save(NS, remote);
  return remote ?? (await getCurrencySettings());
}

// For tab screens (returns effective currency for that page)
export async function getCurrencyForPage(_page: PageKey): Promise<string> {
  const s = await getCurrencySettings();
  return s.global;
}

export async function refreshCurrencyForPage(_page: PageKey): Promise<string> {
  const s = await refreshCurrencySettings();
  return s.global;
}

// Update the global default/display currency. Existing items keep their own currency.
export async function saveGlobalCurrency(code: string): Promise<void> {
  const settings = await getCurrencySettings();
  const updated: CurrencySettings = { ...settings, global: code };
  await save(NS, updated);
  const uid = await userId();
  if (!uid) return;
  await reportable(
    supabase
      .from('user_settings')
      .upsert({ user_id: uid, currency: code }, { onConflict: 'user_id' }),
  );
}

// ── Backward-compat aliases ─────────────────────────────────────────────────
// Existing callers that only need the global default keep working.
export async function getCurrency(): Promise<string> {
  return (await getCurrencySettings()).global;
}
export async function refreshCurrency(): Promise<string> {
  return (await refreshCurrencySettings()).global;
}
export async function saveCurrency(code: string): Promise<void> {
  return saveGlobalCurrency(code);
}
