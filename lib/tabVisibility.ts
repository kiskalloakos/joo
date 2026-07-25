import { load, peek, save } from './storage';

export type OptionalTab = 'wealth' | 'debts' | 'business' | 'projects' | 'recurrings';
export type TabVisibility = Record<OptionalTab, boolean>;

const NS = 'tab-visibility';
const DEFAULT: TabVisibility = { wealth: true, debts: true, business: true, projects: true, recurrings: true };
const listeners = new Set<(value: TabVisibility) => void>();

function normalize(value: Partial<TabVisibility> & { revenue?: boolean }): TabVisibility {
  const { revenue, ...rest } = value;
  return { ...DEFAULT, ...rest, business: rest.business ?? revenue ?? DEFAULT.business };
}
export function peekTabVisibility(): TabVisibility { return normalize(peek<Partial<TabVisibility> & { revenue?: boolean }>(NS, DEFAULT)); }
export async function getTabVisibility(): Promise<TabVisibility> { return normalize(await load<Partial<TabVisibility> & { revenue?: boolean }>(NS, DEFAULT)); }
export async function saveTabVisibility(value: TabVisibility): Promise<void> {
  await save(NS, value);
  listeners.forEach((listener) => listener(value));
}
export function subscribeTabVisibility(listener: (value: TabVisibility) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
