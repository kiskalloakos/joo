import { supabase, userId } from './supabase';
import { load, peek, save } from './storage';
import { reportable } from './sync';
import { parseAmount } from './finance';

export interface SavingsData {
  totalInvested: string;
  startMonth: string;
  startYear: string;
  annualReturn: string;
  showProjections: boolean;
  /** When false, projections compound the current amount with no future
   *  monthly contributions (lump-sum case). Default true. */
  contributeMonthly: boolean;
}

const NS = 'savings';

const DEFAULT: SavingsData = {
  totalInvested: '',
  startMonth: String(new Date().getMonth() + 1),
  startYear: String(new Date().getFullYear()),
  annualReturn: '5',
  showProjections: false,
  contributeMonthly: true,
};

export function peekSavings(): SavingsData {
  return peek<SavingsData>(NS, DEFAULT);
}

export async function getSavings(): Promise<SavingsData> {
  return load<SavingsData>(NS, DEFAULT);
}

export async function refreshSavings(): Promise<SavingsData> {
  const uid = await userId();
  if (!uid) return getSavings();
  const { data, error } = await supabase
    .from('savings_setup')
    .select(
      'total_invested, start_month, start_year, annual_return, show_projections, contribute_monthly',
    )
    .eq('user_id', uid)
    .maybeSingle();
  if (error || !data) return getSavings();
  const result: SavingsData = {
    totalInvested: data.total_invested ? String(data.total_invested) : '',
    startMonth: String(data.start_month),
    startYear: String(data.start_year),
    annualReturn: String(data.annual_return),
    showProjections: data.show_projections ?? false,
    contributeMonthly: data.contribute_monthly ?? true,
  };
  await save(NS, result);
  return result;
}

export async function saveSavings(d: SavingsData): Promise<void> {
  await save(NS, d);
  const uid = await userId();
  if (!uid) return;
  await reportable(
    supabase
      .from('savings_setup')
      .upsert(
        {
          user_id: uid,
          total_invested: parseAmount(d.totalInvested),
          start_month: parseInt(d.startMonth) || 1,
          start_year: parseInt(d.startYear) || new Date().getFullYear(),
          annual_return: parseAmount(d.annualReturn) || 5,
          show_projections: d.showProjections,
          contribute_monthly: d.contributeMonthly,
        },
        { onConflict: 'user_id' },
      ),
  );
}
