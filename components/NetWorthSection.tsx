import React, { useCallback, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AppText as Text } from './AppText';
import { CURRENCIES } from '../lib/currencies';
import { getDashboard, newId, peekDashboard, refreshDashboard } from '../lib/dashboard';
import { getInvestments, peekInvestments, refreshInvestments } from '../lib/investments';
import { getSavings, peekSavings, refreshSavings } from '../lib/savings';
import { getDebts, peekDebts, refreshDebts } from '../lib/debts';
import { Asset, deleteAsset, getAssets, peekAssets, refreshAssets, saveAsset } from '../lib/assets';
import { convert, peekRates, subscribeRates, type Rates } from '../lib/exchangeRates';
import { parseAmount } from '../lib/finance';
import { surface } from '../lib/surface';
import { feedback } from '../lib/feedback';

function fmt(value: number, symbol: string): string {
  const prefix = value < 0 ? '−' : '';
  return `${prefix}${symbol}${Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function NetWorthSection({ currency }: { currency: string }) {
  const [accounts, setAccounts] = useState(() => peekDashboard().accounts);
  const [investments, setInvestments] = useState(peekInvestments);
  const [savings, setSavings] = useState(peekSavings);
  const [debts, setDebts] = useState(peekDebts);
  const [assets, setAssets] = useState<Asset[]>(peekAssets);
  const [rates, setRates] = useState<Rates>(peekRates);
  const [modal, setModal] = useState<{ visible: boolean; editing: Asset | null }>({ visible: false, editing: null });
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [emoji, setEmoji] = useState('');
  const [assetCurrency, setAssetCurrency] = useState(currency);

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    getDashboard().then((value) => !cancelled && setAccounts(value.accounts));
    refreshDashboard().then((value) => !cancelled && setAccounts(value.accounts));
    getInvestments().then((value) => !cancelled && setInvestments(value));
    refreshInvestments().then((value) => !cancelled && setInvestments(value));
    getSavings().then((value) => !cancelled && setSavings(value));
    refreshSavings().then((value) => !cancelled && setSavings(value));
    getDebts().then((value) => !cancelled && setDebts(value));
    refreshDebts().then((value) => !cancelled && setDebts(value));
    getAssets().then((value) => !cancelled && setAssets(value));
    refreshAssets().then((value) => !cancelled && setAssets(value));
    const unsubscribe = subscribeRates((value) => !cancelled && setRates(value));
    return () => { cancelled = true; unsubscribe(); };
  }, []));

  const convertToDisplay = (value: number, source?: string) =>
    convert(value, source ?? currency, currency, rates.rates);
  const cash = accounts.reduce((sum, account) => sum + convertToDisplay(parseAmount(account.amount), account.currency), 0);
  const invested = convertToDisplay(parseAmount(investments.totalInvested), investments.currency);
  const saved = convertToDisplay(parseAmount(savings.totalInvested), savings.currency);
  const assetsTotal = assets.reduce((sum, asset) => sum + convertToDisplay(parseAmount(asset.amount), asset.currency), 0);
  const remainingDebts = debts.reduce((sum, debt) => sum + convertToDisplay(Math.max(0, parseAmount(debt.amount) - parseAmount(debt.paidAmount)), debt.currency), 0);
  const netWorth = cash + invested + saved + assetsTotal - remainingDebts;
  const symbol = CURRENCIES.find((item) => item.code === currency)?.symbol ?? `${currency} `;

  const openAsset = (editing: Asset | null = null) => {
    setName(editing?.name ?? '');
    setAmount(editing?.amount ?? '');
    setEmoji(editing?.emoji ?? '');
    setAssetCurrency(editing?.currency ?? currency);
    feedback.tap();
    setModal({ visible: true, editing });
  };
  const persistAsset = async () => {
    if (!name.trim()) return;
    const next: Asset = modal.editing
      ? { ...modal.editing, name: name.trim(), amount, emoji: emoji.trim() || null, currency: assetCurrency }
      : { id: newId(), name: name.trim(), amount, emoji: emoji.trim() || null, currency: assetCurrency, position: assets.length };
    setAssets((current) => modal.editing ? current.map((asset) => asset.id === next.id ? next : asset) : [...current, next]);
    setModal({ visible: false, editing: null });
    feedback.success();
    await saveAsset(next);
  };
  const removeAsset = async () => {
    const editing = modal.editing;
    if (!editing) return;
    setModal({ visible: false, editing: null });
    setAssets((current) => current.filter((asset) => asset.id !== editing.id));
    feedback.destroy();
    await deleteAsset(editing.id);
  };

  const rows = [
    { label: 'Cash', icon: 'wallet-outline' as const, value: cash },
    { label: 'Investments', icon: 'trending-up-outline' as const, value: invested },
    { label: 'Savings', icon: 'shield-checkmark-outline' as const, value: saved },
    { label: 'Assets', icon: 'home-outline' as const, value: assetsTotal },
    { label: 'Remaining debts', icon: 'document-text-outline' as const, value: -remainingDebts, negative: true },
  ];

  const chooseAssetCurrency = (code: string) => {
    feedback.select();
    setAssetCurrency(code);
  };

  return <>
    <View style={s.sectionLabel}><Text style={s.sectionLabelText}>NET WORTH</Text></View>
    <View style={s.hero}>
      <Text style={s.heroLabel}>TOTAL NET WORTH</Text>
      <Text style={[s.heroAmount, netWorth < 0 && s.negative]}>{fmt(netWorth, symbol)}</Text>
      <Text style={s.heroHint}>Everything you own, less what you owe</Text>
    </View>
    <View style={s.card}>
      <Text style={s.cardTitle}>Breakdown</Text>
      {rows.map((row, index) => <View key={row.label} style={[s.row, index > 0 && s.divider]}>
        <View style={s.rowLeft}><Ionicons name={row.icon} size={16} color={row.negative ? '#FFA94D' : '#00C896'} /><Text style={s.rowLabel}>{row.label}</Text></View>
        <Text style={[s.rowValue, row.negative && s.negative]}>{fmt(row.value, symbol)}</Text>
      </View>)}
    </View>
    <View style={s.card}>
      <View style={s.assetHeader}><Text style={s.cardTitle}>Assets</Text><TouchableOpacity onPress={() => openAsset()}><Ionicons name="add-circle-outline" size={21} color="#00C896" /></TouchableOpacity></View>
      {assets.length === 0 ? <TouchableOpacity style={s.empty} onPress={() => openAsset()}><Ionicons name="home-outline" size={23} color="#555" /><Text style={s.emptyText}>Add a house, car, or anything you own</Text></TouchableOpacity>
        : assets.map((asset, index) => <TouchableOpacity key={asset.id} style={[s.row, index > 0 && s.divider]} onPress={() => openAsset(asset)}><View style={s.rowLeft}><Text style={s.emoji}>{asset.emoji || '◈'}</Text><Text style={s.rowLabel}>{asset.name}</Text></View><Text style={s.rowValue}>{fmt(convertToDisplay(parseAmount(asset.amount), asset.currency), symbol)}</Text></TouchableOpacity>)}
    </View>
    <Modal visible={modal.visible} transparent animationType="slide"><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}><View style={s.overlay}><View style={s.sheet}><Text style={s.sheetTitle}>{modal.editing ? 'Edit asset' : 'Add asset'}</Text><Text style={s.inputLabel}>Name</Text><TextInput value={name} onChangeText={setName} style={s.input} placeholder="e.g. Home" placeholderTextColor="#555" autoFocus /><Text style={s.inputLabel}>Value ({assetCurrency})</Text><TextInput value={amount} onChangeText={setAmount} style={s.input} placeholder="0.00" placeholderTextColor="#555" keyboardType="decimal-pad" /><Text style={s.inputLabel}>Icon (optional)</Text><TextInput value={emoji} onChangeText={setEmoji} style={s.input} placeholder="🏠" placeholderTextColor="#555" maxLength={4} /><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.currencyPicker}>{CURRENCIES.map((item) => <TouchableOpacity key={item.code} style={[s.currencyPill, assetCurrency === item.code && s.currencyPillActive]} onPress={() => chooseAssetCurrency(item.code)}><Text style={[s.currencyText, assetCurrency === item.code && s.currencyTextActive]}>{item.code}</Text></TouchableOpacity>)}</ScrollView><View style={s.actions}><TouchableOpacity onPress={() => setModal({ visible: false, editing: null })}><Text style={s.cancel}>Cancel</Text></TouchableOpacity><TouchableOpacity style={s.save} onPress={persistAsset}><Text style={s.saveText}>Save</Text></TouchableOpacity></View>{modal.editing && <TouchableOpacity style={s.delete} onPress={removeAsset}><Text style={s.deleteText}>Delete asset</Text></TouchableOpacity>}</View></View></KeyboardAvoidingView></Modal>
  </>;
}

const s = StyleSheet.create({
  sectionLabel: { marginTop: 20, marginBottom: 10, paddingHorizontal: 4 }, sectionLabelText: { color: '#666', fontSize: 11, fontWeight: '700', letterSpacing: 1.5 },
  hero: { ...surface, borderRadius: 20, padding: 24, marginBottom: 12 }, heroLabel: { color: '#555', fontSize: 10, fontWeight: '700', letterSpacing: 1.4 }, heroAmount: { color: '#00C896', fontSize: 36, fontWeight: '800', letterSpacing: -1.2, marginTop: 8, fontVariant: ['tabular-nums'] }, heroHint: { color: '#666', fontSize: 12, marginTop: 8 },
  card: { ...surface, borderRadius: 16, overflow: 'hidden', marginBottom: 12 }, cardTitle: { color: '#DDD', fontSize: 14, fontWeight: '700', padding: 17, paddingBottom: 12 }, row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 17, paddingVertical: 13 }, divider: { borderTopWidth: 1, borderTopColor: '#1C1C1C' }, rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }, rowLabel: { color: '#CCC', fontSize: 14, fontWeight: '500' }, rowValue: { color: '#EEE', fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] }, negative: { color: '#FFA94D' },
  assetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingRight: 16 }, empty: { alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingVertical: 24 }, emptyText: { color: '#777', fontSize: 13, fontWeight: '500' }, emoji: { fontSize: 18, width: 18, textAlign: 'center' },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' }, sheet: { backgroundColor: '#161616', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, paddingBottom: 30 }, sheetTitle: { color: '#FFF', fontSize: 20, fontWeight: '700', marginBottom: 20 }, inputLabel: { color: '#777', fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 7, marginTop: 10 }, input: { backgroundColor: '#222', color: '#FFF', borderRadius: 10, paddingHorizontal: 13, paddingVertical: 12, fontSize: 16 }, currencyPicker: { gap: 7, paddingVertical: 14 }, currencyPill: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 9, backgroundColor: '#252525' }, currencyPillActive: { backgroundColor: '#00C896' }, currencyText: { color: '#AAA', fontSize: 12, fontWeight: '700' }, currencyTextActive: { color: '#07120F' }, actions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 18, marginTop: 8 }, cancel: { color: '#999', fontSize: 14, fontWeight: '600' }, save: { backgroundColor: '#00C896', borderRadius: 10, paddingHorizontal: 20, paddingVertical: 11 }, saveText: { color: '#07120F', fontWeight: '800' }, delete: { alignSelf: 'center', marginTop: 22 }, deleteText: { color: '#FF6B6B', fontSize: 13, fontWeight: '600' },
});
