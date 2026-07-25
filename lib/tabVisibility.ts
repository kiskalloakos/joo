import { load, peek, save } from './storage';

export type OptionalTab = 'wealth' | 'debts' | 'revenue' | 'projects' | 'recurrings';
export type TabVisibility = Record<OptionalTab, boolean>;

const NS = 'tab-visibility';
const DEFAULT: TabVisibility = { wealth: true, debts: true, revenue: true, projects: true, recurrings: true };
const listeners = new Set<(value: TabVisibility) => void>();

export function peekTabVisibility(): TabVisibility { return { ...DEFAULT, ...peek<Partial<TabVisibility>>(NS, DEFAULT) }; }
export async function getTabVisibility(): Promise<TabVisibility> { return { ...DEFAULT, ...(await load<Partial<TabVisibility>>(NS, DEFAULT)) }; }
export async function saveTabVisibility(value: TabVisibility): Promise<void> {
  await save(NS, value);
  listeners.forEach((listener) => listener(value));
}
export function subscribeTabVisibility(listener: (value: TabVisibility) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
