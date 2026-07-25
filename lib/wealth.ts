import { load, peek, save } from './storage';

export interface WealthVisibility {
  showInvestments: boolean;
  showSavings: boolean;
}

const NS = 'wealth-visibility';
const DEFAULT: WealthVisibility = { showInvestments: true, showSavings: true };

export function peekWealthVisibility(): WealthVisibility {
  return peek<WealthVisibility>(NS, DEFAULT);
}

export async function getWealthVisibility(): Promise<WealthVisibility> {
  return load<WealthVisibility>(NS, DEFAULT);
}

export async function saveWealthVisibility(value: WealthVisibility): Promise<void> {
  await save(NS, value);
}
