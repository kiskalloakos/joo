import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getCurrency, peekCurrencySettings, refreshCurrency } from '../../lib/currency';
import { surface } from '../../lib/surface';
import { CURRENCIES } from '../../lib/currencies';
import { getDashboard, peekDashboard, refreshDashboard, newId } from '../../lib/dashboard';
import { getInvestments, peekInvestments, refreshInvestments } from '../../lib/investments';
import { getSavings, peekSavings, refreshSavings } from '../../lib/savings';
import { getDebts, peekDebts, refreshDebts } from '../../lib/debts';
import {
  Asset,
  getAssets,
  peekAssets,
  refreshAssets,
  saveAsset,
  deleteAsset,
} from '../../lib/assets';
import { SetupData, getSetup, peekSetup, refreshSetup, saveSetup, subscribeSetup } from '../../lib/setup';
import { showToast } from '../../lib/toast';
import { glowGreen, glowAmber } from '../../lib/glows';
import { feedback } from '../../lib/feedback';
import { computeNetWorth } from '../../lib/finance';
import {
  peekRates,
  subscribeRates,
  convert,
  type Rates,
} from '../../lib/exchangeRates';
import EmojiPicker, { ASSET_EMOJIS } from '../../components/EmojiPicker';

function fmt(value: number, symbol: string): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  return `${sign}${symbol}${abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function parseAmt(s: string): number {
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

// Cash accounts can now hold per-row currencies. To roll them into a single
// net-worth number, bucket by each row's currency, then convert each bucket
// into the display currency before summing. Legacy NULL-currency rows are
// treated as already in the display currency. Investments / Savings / Debts
// / Assets remain single-currency (scope kept to Cash for now).
function convertCash(
  accounts: { amount: string; currency?: string }[],
  displayCcy: string,
  rates: Rates['rates'],
): number {
  return accounts.reduce((sum, a) => {
    const from = a.currency ?? displayCcy;
    return sum + convert(parseAmt(a.amount), from, displayCcy, rates);
  }, 0);
}

export default function NetWorth() {
  const insets = useSafeAreaInsets();
  // We need the account-level currencies to do FX conversion, so hold onto
  // the full list (not the pre-summed scalar the screen used before).
  const [cashAccounts, setCashAccounts] = useState<
    { amount: string; currency?: string }[]
  >(() => peekDashboard().accounts);
  const [rates, setRates] = useState<Rates>(() => peekRates());
  const [invested, setInvested] = useState(() => parseAmt(peekInvestments().totalInvested));
  const [saved, setSaved] = useState(() => parseAmt(peekSavings().totalInvested));
  const [debts, setDebts] = useState(() =>
    peekDebts().reduce(
      (s, d) => s + Math.max(0, parseAmt(d.amount) - parseAmt(d.paidAmount)),
      0,
    ),
  );
  const [assets, setAssets] = useState<Asset[]>(peekAssets);
  const [currency, setCurrency] = useState(() => peekCurrencySettings().global);
  const [setup, setSetup] = useState<SetupData | null>(peekSetup);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      const applyDashboard = (d: { accounts: { amount: string; currency?: string }[] }) => {
        if (cancelled) return;
        setCashAccounts(d.accounts);
      };
      const applyInvestments = (i: { totalInvested: string }) => {
        if (cancelled) return;
        setInvested(parseAmt(i.totalInvested));
      };
      const applySavings = (i: { totalInvested: string }) => {
        if (cancelled) return;
        setSaved(parseAmt(i.totalInvested));
      };
      const applyDebts = (list: { amount: string; paidAmount?: string }[]) => {
        if (cancelled) return;
        setDebts(
          list.reduce(
            (s, d) => s + Math.max(0, parseAmt(d.amount) - parseAmt(d.paidAmount ?? '0')),
            0,
          ),
        );
      };

      getDashboard().then(applyDashboard);
      refreshDashboard().then(applyDashboard);
      getInvestments().then(applyInvestments);
      refreshInvestments().then(applyInvestments);
      getSavings().then(applySavings);
      refreshSavings().then(applySavings);
      getDebts().then(applyDebts);
      refreshDebts().then(applyDebts);
      getAssets().then((a) => !cancelled && setAssets(a));
      refreshAssets().then((a) => !cancelled && setAssets(a));
      getCurrency().then((c) => !cancelled && setCurrency(c));
      refreshCurrency().then((c) => !cancelled && setCurrency(c));
      getSetup().then((s) => !cancelled && s && setSetup(s));
      refreshSetup().then((s) => !cancelled && s && setSetup(s));
      const unsub = subscribeSetup((s) => !cancelled && setSetup(s));
      const unsubRates = subscribeRates((r) => !cancelled && setRates(r));
      return () => {
        cancelled = true;
        unsub();
        unsubRates();
      };
    }, []),
  );

  const symbol = CURRENCIES.find((c) => c.code === currency)?.symbol ?? currency + ' ';
  // Cash bucket: convert each cash account from its own currency into the
  // display currency (the global one for net worth) before summing.
  const cash = convertCash(cashAccounts, currency, rates.rates);
  const assetsTotal = assets.reduce((sum, a) => sum + parseAmt(a.amount), 0);
  const {
    investmentsEnabled,
    savingsEnabled,
    debtsEnabled,
    debtsCountInTotal,
    investedTotal,
    netWorth,
  } = computeNetWorth(cash, invested, saved, debts, setup, assetsTotal);

  // ── Assets: add / edit / delete ───────────────────────────────────────────
  const [assetModal, setAssetModal] = useState<{ visible: boolean; editing: Asset | null }>({
    visible: false,
    editing: null,
  });
  const [formName, setFormName] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formEmoji, setFormEmoji] = useState('');

  const openAddAsset = () => {
    setFormName('');
    setFormAmount('');
    setFormEmoji('');
    feedback.tap();
    setAssetModal({ visible: true, editing: null });
  };

  const openEditAsset = (asset: Asset) => {
    setFormName(asset.name);
    setFormAmount(asset.amount);
    setFormEmoji(asset.emoji ?? '');
    feedback.tap();
    setAssetModal({ visible: true, editing: asset });
  };

  const saveAssetForm = async () => {
    if (!formName.trim()) return;
    const editing = assetModal.editing;
    const emoji = formEmoji.trim() || null;
    const asset: Asset = editing
      ? { ...editing, name: formName.trim(), amount: formAmount, emoji }
      : {
          id: newId(),
          name: formName.trim(),
          amount: formAmount,
          emoji,
          position: assets.length,
        };
    setAssets(
      editing ? assets.map((a) => (a.id === editing.id ? asset : a)) : [...assets, asset],
    );
    setAssetModal({ visible: false, editing: null });
    feedback.success();
    await saveAsset(asset);
  };

  const removeAssetForm = async (asset: Asset) => {
    setAssetModal({ visible: false, editing: null });
    setAssets((prev) => prev.filter((a) => a.id !== asset.id));
    feedback.destroy();
    await deleteAsset(asset.id);
    showToast(`Deleted ${asset.name}`, {
      label: 'Undo',
      onPress: async () => {
        setAssets((prev) => [...prev, asset]);
        await saveAsset(asset);
      },
    });
  };

  const toggleDebtsInNetWorth = async () => {
    if (!setup) return;
    const next: SetupData = { ...setup, includeDebtsInNetWorth: !setup.includeDebtsInNetWorth };
    feedback.select();
    setSetup(next);
    await saveSetup(next);
  };

  return (
    <View style={[s.container, { paddingBottom: insets.bottom }]}>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <View style={s.heroCard}>
          <Text style={s.heroLabel}>NET WORTH</Text>
          <Text style={netWorth < 0 ? s.heroAmountNegative : s.heroAmount}>
            {fmt(netWorth, symbol)}
          </Text>
          <Text style={s.heroSub}>In your global currency · {currency}</Text>
        </View>

        <View style={s.breakdownCard}>
          <Text style={s.breakdownTitle}>Breakdown</Text>

          <View style={s.line}>
            <View style={s.lineLeft}>
              <Ionicons name="wallet-outline" size={16} color="#00C896" style={glowGreen} />
              <Text style={s.lineLabel}>Cash on hand</Text>
            </View>
            <Text style={s.linePos}>{fmt(cash, symbol)}</Text>
          </View>

          {investmentsEnabled && (
            <View style={[s.line, s.lineBordered]}>
              <View style={s.lineLeft}>
                <Ionicons name="trending-up-outline" size={16} color="#00C896" style={glowGreen} />
                <Text style={s.lineLabel}>Investments</Text>
              </View>
              <Text style={s.linePos}>{fmt(invested, symbol)}</Text>
            </View>
          )}

          {savingsEnabled && (
            <View style={[s.line, s.lineBordered]}>
              <View style={s.lineLeft}>
                <Ionicons name="wallet-outline" size={16} color="#00C896" style={glowGreen} />
                <Text style={s.lineLabel}>Savings</Text>
              </View>
              <Text style={s.linePos}>{fmt(saved, symbol)}</Text>
            </View>
          )}

          {assets.length > 0 && (
            <View style={[s.line, s.lineBordered]}>
              <View style={s.lineLeft}>
                <Ionicons name="home-outline" size={16} color="#00C896" style={glowGreen} />
                <Text style={s.lineLabel}>Assets</Text>
              </View>
              <Text style={s.linePos}>{fmt(assetsTotal, symbol)}</Text>
            </View>
          )}

          {debtsEnabled && (
            <View style={[s.line, s.lineBordered]}>
              <View style={s.lineLeft}>
                <Ionicons
                  name="document-text-outline"
                  size={16}
                  color={debtsCountInTotal ? '#FFA94D' : '#3A3A3A'}
                  style={debtsCountInTotal ? glowAmber : undefined}
                />
                <Text style={[s.lineLabel, !debtsCountInTotal && s.lineLabelMuted]}>Debts</Text>
                <TouchableOpacity
                  onPress={toggleDebtsInNetWorth}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={s.eyeBtn}
                >
                  <Ionicons
                    name={debtsCountInTotal ? 'eye-outline' : 'eye-off-outline'}
                    size={14}
                    color={debtsCountInTotal ? '#555' : '#444'}
                  />
                </TouchableOpacity>
              </View>
              <Text style={[s.lineNeg, !debtsCountInTotal && s.lineMuted]}>
                {debtsCountInTotal ? '− ' : ''}
                {fmt(debts, symbol)}
              </Text>
            </View>
          )}

        </View>

        {/* Assets — the one thing you manage here (house, car, valuables) */}
        <View style={s.assetCard}>
          <View style={s.assetHeader}>
            <Text style={s.breakdownTitle2}>Assets</Text>
            <TouchableOpacity style={s.assetAddBtn} onPress={openAddAsset}>
              <Ionicons name="add" size={20} color="#00C896" style={glowGreen} />
            </TouchableOpacity>
          </View>
          {assets.length === 0 ? (
            <TouchableOpacity style={s.assetEmpty} onPress={openAddAsset}>
              <Ionicons name="home-outline" size={24} color="#333" />
              <Text style={s.assetEmptyText}>Add a house, car, or anything you own</Text>
            </TouchableOpacity>
          ) : (
            assets.map((a, i) => (
              <Pressable
                key={a.id}
                onPress={() => openEditAsset(a)}
                style={[s.assetRow, i > 0 && s.lineBordered]}
              >
                <View style={s.assetRowLeft}>
                  <Text style={s.assetEmoji}>{a.emoji || '📦'}</Text>
                  <Text style={s.assetName}>{a.name}</Text>
                </View>
                <Text style={s.assetAmount}>{fmt(parseAmt(a.amount), symbol)}</Text>
              </Pressable>
            ))
          )}
        </View>

        <Text style={s.footnote}>
          Aggregated from the data you already track. Numbers refresh whenever you open this tab.
        </Text>

        <View style={{ height: 40 }} />
      </ScrollView>

      <Modal visible={assetModal.visible} transparent animationType="slide">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <View style={s.overlay}>
            <View style={s.sheet}>
              <Text style={s.sheetTitle}>
                {assetModal.editing ? 'Edit Asset' : 'Add Asset'}
              </Text>
              <EmojiPicker
                value={formEmoji}
                onChange={setFormEmoji}
                options={ASSET_EMOJIS}
              />
              <Text style={s.inputLabel}>Name</Text>
              <TextInput
                style={s.input}
                value={formName}
                onChangeText={setFormName}
                placeholder="e.g. House"
                placeholderTextColor="#444"
                autoFocus
              />
              <Text style={s.inputLabel}>Value ({currency})</Text>
              <TextInput
                style={s.input}
                value={formAmount}
                onChangeText={setFormAmount}
                placeholder="0.00"
                placeholderTextColor="#444"
                keyboardType="decimal-pad"
              />
              <View style={s.sheetActions}>
                <TouchableOpacity
                  style={s.btnCancel}
                  onPress={() => setAssetModal({ visible: false, editing: null })}
                >
                  <Text style={s.btnCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.btnSave} onPress={saveAssetForm}>
                  <Text style={s.btnSaveText}>Save</Text>
                </TouchableOpacity>
              </View>
              {assetModal.editing && (
                <TouchableOpacity
                  style={s.deleteLink}
                  onPress={() => removeAssetForm(assetModal.editing!)}
                >
                  <Ionicons name="trash-outline" size={14} color="#FF6B6B" />
                  <Text style={s.deleteLinkText}>Delete asset</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D0D0D' },
  header: { paddingHorizontal: 20, paddingVertical: 14 },
  headerTitle: { fontSize: 15, fontWeight: '700', color: '#FFF', letterSpacing: 3 },
  scroll: { paddingHorizontal: 16 },

  heroCard: { ...surface, borderRadius: 20, padding: 24, marginBottom: 16 },
  heroLabel: { fontSize: 10, fontWeight: '600', color: '#555', letterSpacing: 1.5, marginBottom: 10 },
  heroAmount: {
    fontSize: 40,
    fontWeight: '800',
    color: '#00C896',
    letterSpacing: -1.2,
    fontVariant: ['tabular-nums'],
    textShadowColor: 'rgba(0, 200, 150, 0.25)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 14,
  },
  heroAmountNegative: {
    fontSize: 40,
    fontWeight: '800',
    color: '#FFA94D',
    letterSpacing: -1.2,
    fontVariant: ['tabular-nums'],
    textShadowColor: 'rgba(255, 169, 77, 0.25)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 14,
  },
  heroSub: { fontSize: 11, color: '#444', marginTop: 10, fontWeight: '500' },

  breakdownCard: {
    backgroundColor: '#151515',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#222',
    marginBottom: 16,
    overflow: 'hidden',
  },
  breakdownTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#BBB',
    letterSpacing: 0.5,
    padding: 18,
    paddingBottom: 12,
  },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 13,
  },
  lineBordered: { borderTopWidth: 1, borderTopColor: '#1C1C1C' },
  lineLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  lineLabel: { fontSize: 14, color: '#CCC', fontWeight: '500' },
  linePos: { fontSize: 14, color: '#EEE', fontWeight: '500', fontVariant: ['tabular-nums'] },
  lineNeg: {
    fontSize: 14,
    color: '#FFA94D',
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
    textShadowColor: 'rgba(255, 169, 77, 0.4)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
  lineLabelMuted: { color: '#555', textDecorationLine: 'line-through' },
  lineMuted: { color: '#3A3A3A', textDecorationLine: 'line-through' },
  eyeBtn: { padding: 4, marginLeft: 4 },

  footnote: { fontSize: 12, color: '#444', textAlign: 'center', marginTop: 4, lineHeight: 18, fontWeight: '500' },

  // Assets card
  assetCard: {
    backgroundColor: '#151515',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#222',
    marginBottom: 16,
    overflow: 'hidden',
  },
  assetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 18,
    paddingBottom: 12,
  },
  breakdownTitle2: { fontSize: 13, fontWeight: '600', color: '#BBB', letterSpacing: 0.5 },
  assetAddBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#161616',
    borderWidth: 1,
    borderColor: '#1F3A30',
  },
  assetEmpty: { alignItems: 'center', paddingVertical: 32, gap: 8, paddingHorizontal: 24 },
  assetEmptyText: { fontSize: 13, color: '#555', textAlign: 'center', fontWeight: '500' },
  assetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  assetRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  assetEmoji: { fontSize: 20 },
  assetName: { fontSize: 15, fontWeight: '500', color: '#EEE' },
  assetAmount: { fontSize: 15, fontWeight: '700', color: '#FFF', fontVariant: ['tabular-nums'] },

  // Add / edit asset sheet
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#1A1A1A',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 44,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: '#2C2C2C',
    maxHeight: '85%',
  },
  sheetTitle: { fontSize: 20, fontWeight: '700', color: '#FFF', letterSpacing: -0.3, marginBottom: 16 },
  inputLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#666',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#222',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#FFF',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#2C2C2C',
    fontWeight: '500',
  },
  sheetActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  btnCancel: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#222',
    alignItems: 'center',
    marginTop: 8,
  },
  btnCancelText: { fontSize: 15, color: '#666', fontWeight: '500' },
  btnSave: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#00C896',
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#00C896',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
  },
  btnSaveText: { fontSize: 15, color: '#000', fontWeight: '700' },
  deleteLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    marginTop: 8,
  },
  deleteLinkText: { fontSize: 13, color: '#FF6B6B', fontWeight: '500' },
});
