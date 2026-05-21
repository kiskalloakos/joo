// Exchange rates — global (not user-scoped). Fetched from frankfurter.dev
// (free, no key, ECB-backed; covers RON/USD/EUR/GBP/HUF/CHF and ~30 more).
// NOTE: the older api.frankfurter.app domain now 301-redirects to .dev, but
// browsers refuse to follow the cross-origin redirect (CORS headers are
// missing on the 301 response), so fetch fails silently and rates fall back
// to identity. Always use the .dev/v1 URL directly.
//
// Stale-while-revalidate: the dashboard renders immediately from the
// in-memory `cached` (which is primed from AsyncStorage at app start), and
// `refreshRatesInBackground()` quietly refetches when rates older than
// TTL_MS. If the network is unreachable AND no cache exists, callers see
// IDENTITY rates (1.0 across the board) so the UI still renders — the
// converted total will equal the sum of raw amounts, which is wrong but
// non-crashing. A toast surfaces this state once per session.
//
// Conversion math: rates are always relative to a single BASE currency
// ('EUR'). convert(amount, from, to) = amount * rates[to] / rates[from].
// With rates[BASE] = 1 injected at fetch time, this works for any pair.

import AsyncStorage from '@react-native-async-storage/async-storage';

import { showToast } from './toast';

const BASE = 'EUR';
const TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const STORAGE_KEY = '@famescale/_global/exchange_rates_v1';
const ENDPOINT = `https://api.frankfurter.dev/v1/latest?from=${BASE}`;

export interface Rates {
  base: string;                       // 'EUR'
  rates: Record<string, number>;       // { EUR: 1, USD: 1.08, RON: 4.97, ... }
  asOf: string;                        // ISO date from the API
  fetchedAt: number;                   // Date.now() when we cached it
}

// Last-resort fallback: no conversion happens. Only used when the cache is
// empty AND the network is unreachable — in that case any cross-currency
// sum is wrong by definition, but the dashboard still renders.
const IDENTITY: Rates = {
  base: BASE,
  rates: { EUR: 1, USD: 1, RON: 1, GBP: 1, HUF: 1, CHF: 1 },
  asOf: '1970-01-01',
  fetchedAt: 0,
};

let cached: Rates | null = null;
let warnedThisSession = false;
const listeners = new Set<(r: Rates) => void>();

function publish(r: Rates): void {
  cached = r;
  listeners.forEach((fn) => fn(r));
}

export function subscribeRates(fn: (r: Rates) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

// Sync read for use as the lazy initializer in useState, mirroring the
// peekX() pattern used by every other data module. Falls back to IDENTITY
// only when nothing has been primed yet (cold start with no cache hit).
export function peekRates(): Rates {
  return cached ?? IDENTITY;
}

export async function getRates(): Promise<Rates> {
  if (cached) return cached;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Rates;
      // Validate shape minimally — a malformed blob shouldn't crash startup.
      if (parsed && parsed.rates && typeof parsed.rates === 'object') {
        cached = parsed;
        return parsed;
      }
    }
  } catch {
    // Storage read failed — fall through to IDENTITY.
  }
  return IDENTITY;
}

async function fetchAndSave(): Promise<Rates | null> {
  try {
    const res = await fetch(ENDPOINT);
    if (!res.ok) return null;
    const json = (await res.json()) as { date: string; rates: Record<string, number> };
    if (!json?.rates) return null;
    const fresh: Rates = {
      base: BASE,
      rates: { ...json.rates, [BASE]: 1 },
      asOf: json.date,
      fetchedAt: Date.now(),
    };
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
    publish(fresh);
    return fresh;
  } catch {
    return null;
  }
}

// Awaitable refresh. Returns the freshest rates available — fresh from
// network if reachable, otherwise the cached value, otherwise IDENTITY.
export async function refreshRates(): Promise<Rates> {
  const fresh = await fetchAndSave();
  if (fresh) return fresh;
  const fallback = await getRates();
  if (fallback === IDENTITY && !warnedThisSession) {
    warnedThisSession = true;
    showToast('FX rates unavailable — converted totals may be off.');
  }
  return fallback;
}

// Fire-and-forget refresh. Called from the root layout bootstrap; never
// blocks first paint. Only refetches if the current rates are stale (or
// the cache is empty), so it's safe to call on every cold start.
export function refreshRatesInBackground(): void {
  void (async () => {
    const current = await getRates();
    if (current === IDENTITY || isStale(current)) {
      await fetchAndSave();
    }
  })();
}

export function isStale(r: Rates): boolean {
  return Date.now() - r.fetchedAt > TTL_MS;
}

// Pure math: convert an amount between two currencies using rates relative
// to a common base. Identity-fallback on unknown currencies so a bad cache
// or unexpected code never throws.
export function convert(
  amount: number,
  from: string,
  to: string,
  rates: Rates['rates'],
): number {
  if (from === to) return amount;
  const fromRate = rates[from];
  const toRate = rates[to];
  if (!fromRate || !toRate) return amount;
  return amount * (toRate / fromRate);
}
