import { supabase, userId } from './supabase';
import { load, peek, save } from './storage';
import { reportable } from './sync';

const NS = 'currency';
const DEFAULT_CURRENCY = 'RON';

export type PageKey = 'dashboard' | 'investments' | 'savings' | 'revenue' | 'debts' | 'projects';

export interface CurrencySettings {
  global: string;
  overrides: Partial<Record<PageKey, string>>;
}

const EMPTY: CurrencySettings = { global: DEFAULT_CURRENCY, overrides: {} };

function columnFor(page: PageKey): string {
  return `${page}_currency`;
}

async function fromRemote(): Promise<CurrencySettings | null> {
  const uid = await userId();
  if (!uid) return null;
  const { data, error } = await supabase
    .from('user_settings')
    .select('currency, dashboard_currency, investments_currency, savings_currency, revenue_currency, debts_currency, projects_currency')
    .eq('user_id', uid)
    .maybeSingle();
  if (error || !data) return null;
  const overrides: Partial<Record<PageKey, string>> = {};
  if (data.dashboard_currency) overrides.dashboard = data.dashboard_currency;
  if (data.investments_currency) overrides.investments = data.investments_currency;
  if (data.savings_currency) overrides.savings = data.savings_currency;
  if (data.revenue_currency) overrides.revenue = data.revenue_currency;
  if (data.debts_currency) overrides.debts = data.debts_currency;
  if (data.projects_currency) overrides.projects = data.projects_currency;
  return { global: data.currency ?? DEFAULT_CURRENCY, overrides };
}

// ── Public API ──────────────────────────────────────────────────────────────
// For Settings (full structure)
export function peekCurrencySettings(): CurrencySettings {
  // Backward-compat: older cache stored a plain string.
  const cached = peek<CurrencySettings | string>(NS, EMPTY);
  if (typeof cached === 'string') return { global: cached, overrides: {} };
  return cached;
}

export function peekCurrencyForPage(page: PageKey): string {
  const s = peekCurrencySettings();
  return s.overrides[page] ?? s.global;
}

export async function getCurrencySettings(): Promise<CurrencySettings> {
  // Backward-compat: older cache stored a plain string.
  const cached = await load<CurrencySettings | string>(NS, EMPTY);
  if (typeof cached === 'string') return { global: cached, overrides: {} };
  return cached;
}

export async function refreshCurrencySettings(): Promise<CurrencySettings> {
  const remote = await fromRemote();
  if (remote) await save(NS, remote);
  return remote ?? (await getCurrencySettings());
}

// For tab screens (returns effective currency for that page)
export async function getCurrencyForPage(page: PageKey): Promise<string> {
  const s = await getCurrencySettings();
  return s.overrides[page] ?? s.global;
}

export async function refreshCurrencyForPage(page: PageKey): Promise<string> {
  const s = await refreshCurrencySettings();
  return s.overrides[page] ?? s.global;
}

// Update the global currency. Pages without overrides will follow.
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

// Set or clear an override for one page (pass null to clear → page falls back to global).
export async function saveOverrideCurrency(
  page: PageKey,
  code: string | null,
): Promise<void> {
  const settings = await getCurrencySettings();
  const overrides = { ...settings.overrides };
  if (code === null) delete overrides[page];
  else overrides[page] = code;
  const updated: CurrencySettings = { ...settings, overrides };
  await save(NS, updated);
  const uid = await userId();
  if (!uid) return;
  await reportable(
    supabase
      .from('user_settings')
      .upsert({ user_id: uid, [columnFor(page)]: code }, { onConflict: 'user_id' }),
  );
}

// ── Backward-compat aliases ─────────────────────────────────────────────────
// Existing callers that don't care about per-page state keep working.
export async function getCurrency(): Promise<string> {
  return (await getCurrencySettings()).global;
}
export async function refreshCurrency(): Promise<string> {
  return (await refreshCurrencySettings()).global;
}
export async function saveCurrency(code: string): Promise<void> {
  return saveGlobalCurrency(code);
}
