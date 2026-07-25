import { load, peek, save } from './storage';

export interface WealthVisibility {
  showInvestments: boolean;
  showSavings: boolean;
  showNetWorth: boolean;
}

const NS = 'wealth-visibility';
const DEFAULT: WealthVisibility = { showInvestments: true, showSavings: true, showNetWorth: true };

export function peekWealthVisibility(): WealthVisibility {
  return { ...DEFAULT, ...peek<Partial<WealthVisibility>>(NS, DEFAULT) };
}

export async function getWealthVisibility(): Promise<WealthVisibility> {
  return { ...DEFAULT, ...await load<Partial<WealthVisibility>>(NS, DEFAULT) };
}

export async function saveWealthVisibility(value: WealthVisibility): Promise<void> {
  await save(NS, value);
}
