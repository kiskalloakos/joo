import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { getDashboard } from './dashboard';
import { getCurrencySettings } from './currency';
import { getDebts } from './debts';
import { getInvestments } from './investments';
import { getProjects } from './projects';
import { getRevenue } from './revenue';
import { getSavings } from './savings';
import { getSetup } from './setup';
import { getTransactions } from './transactions';
import { getTabVisibility } from './tabVisibility';
import { getWealthVisibility } from './wealth';
import { getAssets } from './assets';

/** Creates a portable JSON snapshot and opens the system share sheet. */
export async function exportBackup(): Promise<boolean> {
  if (!(await Sharing.isAvailableAsync())) return false;
  const [dashboard, currency, debts, investments, projects, revenue, savings, setup, tabVisibility, transactions, wealth, assets] = await Promise.all([
    getDashboard(), getCurrencySettings(), getDebts(), getInvestments(), getProjects(), getRevenue(),
    getSavings(), getSetup(), getTabVisibility(), getTransactions(), getWealthVisibility(), getAssets(),
  ]);
  const snapshot = {
    format: 'joo-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    data: { dashboard, currency, debts, investments, projects, revenue, savings, setup, tabVisibility, transactions, wealth, assets },
  };
  const uri = `${FileSystem.cacheDirectory}joo-backup-${Date.now()}.json`;
  await FileSystem.writeAsStringAsync(uri, JSON.stringify(snapshot, null, 2), {
    encoding: FileSystem.EncodingType.UTF8,
  });
  await Sharing.shareAsync(uri, {
    mimeType: 'application/json',
    dialogTitle: 'Export joo backup',
    UTI: 'public.json',
  });
  return true;
}
