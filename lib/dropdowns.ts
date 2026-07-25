import { load, peek, save } from './storage';

// Collapsible cards are a presentation preference. Keep it profile-scoped so
// a user's last choice survives app restarts without affecting their data.
const NS = 'dropdowns';
type Dropdowns = Record<string, boolean>;
const EMPTY: Dropdowns = {};

export function peekDropdowns(): Dropdowns {
  return peek<Dropdowns>(NS, EMPTY);
}

export function peekDropdown(key: string): boolean {
  return peekDropdowns()[key] ?? false;
}

export async function getDropdowns(): Promise<Dropdowns> {
  return load<Dropdowns>(NS, EMPTY);
}

export async function saveDropdown(key: string, expanded: boolean): Promise<void> {
  // save() updates storage's in-memory mirror synchronously, so rapid taps
  // (including switching from one project card to another) compose safely.
  await save(NS, { ...peekDropdowns(), [key]: expanded });
}
