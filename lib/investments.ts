import { supabase, userId } from './supabase';
import { load, peek, save } from './storage';
import { reportable } from './sync';
import { parseAmount } from './finance';

export interface InvestmentData {
  totalInvested: string;
  startMonth: string;
  startYear: string;
  annualReturn: string;
  showProjections: boolean;
  /** When false, projections compound the current amount with no future
   *  monthly contributions (lump-sum case). Default true. */
  contributeMonthly: boolean;
}

const NS = 'investments';

const DEFAULT: InvestmentData = {
  totalInvested: '',
  startMonth: String(new Date().getMonth() + 1),
  startYear: String(new Date().getFullYear()),
  annualReturn: '7',
  showProjections: false,
  contributeMonthly: true,
};

export function peekInvestments(): InvestmentData {
  return peek<InvestmentData>(NS, DEFAULT);
}

export async function getInvestments(): Promise<InvestmentData> {
  return load<InvestmentData>(NS, DEFAULT);
}

export async function refreshInvestments(): Promise<InvestmentData> {
  const uid = await userId();
  if (!uid) return getInvestments();
  const { data, error } = await supabase
    .from('investment_setup')
    .select(
      'total_invested, start_month, start_year, annual_return, show_projections, contribute_monthly',
    )
    .eq('user_id', uid)
    .maybeSingle();
  if (error || !data) return getInvestments();
  const result: InvestmentData = {
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

export async function saveInvestments(d: InvestmentData): Promise<void> {
  await save(NS, d);
  const uid = await userId();
  if (!uid) return;
  await reportable(
    supabase
      .from('investment_setup')
      .upsert(
        {
          user_id: uid,
          total_invested: parseAmount(d.totalInvested),
          start_month: parseInt(d.startMonth) || 1,
          start_year: parseInt(d.startYear) || new Date().getFullYear(),
          annual_return: parseAmount(d.annualReturn) || 7,
          show_projections: d.showProjections,
          contribute_monthly: d.contributeMonthly,
        },
        { onConflict: 'user_id' },
      ),
  );
}
