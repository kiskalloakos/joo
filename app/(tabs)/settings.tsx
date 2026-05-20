import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  SetupData,
  getSetup,
  peekSetup,
  refreshSetup,
  saveSetup,
  normalizeTabOrder,
} from '../../lib/setup';
import {
  PageKey,
  getCurrencySettings,
  peekCurrencySettings,
  refreshCurrencySettings,
  saveGlobalCurrency,
  saveOverrideCurrency,
} from '../../lib/currency';
import { surface } from '../../lib/surface';
import { supabase } from '../../lib/supabase';
import { glowGreen } from '../../lib/glows';
import { CURRENCIES } from '../../lib/currencies';

// Display titles for the orderable (optional) tabs — keyed by route name.
const TAB_TITLES: Record<string, string> = {
  investments: 'Investments',
  savings: 'Savings',
  revenue: 'Revenue',
  debts: 'Debts',
  'net-worth': 'Net Worth',
  goals: 'Goals',
};

export default function Settings() {
  const insets = useSafeAreaInsets();
  const [currency, setCurrency] = useState(() => peekCurrencySettings().global);
  const [overrides, setOverrides] = useState<Partial<Record<PageKey, string>>>(
    () => peekCurrencySettings().overrides,
  );
  const [setup, setSetup] = useState<SetupData | null>(peekSetup);
  const [email, setEmail] = useState<string | null>(null);

  const [currencyModal, setCurrencyModal] = useState(false);
  const [orderModal, setOrderModal] = useState(false);
  const [perPage, setPerPage] = useState<{ visible: boolean; view: 'list' | 'picker'; page: PageKey | null }>({
    visible: false,
    view: 'list',
    page: null,
  });

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      getCurrencySettings().then((s) => {
        if (cancelled) return;
        setCurrency(s.global);
        setOverrides(s.overrides);
      });
      getSetup().then((v) => {
        if (!cancelled && v) setSetup(v);
      });
      supabase.auth.getUser().then(({ data }) => {
        if (!cancelled) setEmail(data.user?.email ?? null);
      });
      refreshCurrencySettings().then((s) => {
        if (cancelled) return;
        setCurrency(s.global);
        setOverrides(s.overrides);
      });
      refreshSetup().then((v) => {
        if (!cancelled && v) setSetup(v);
      });
      return () => {
        cancelled = true;
      };
    }, []),
  );

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      Alert.alert('Sign-out failed', error.message);
    }
    // On success, RootLayout's auth listener routes to AuthScreen.
  };

  const symbol = CURRENCIES.find((c) => c.code === currency)?.symbol ?? currency;

  const changeCurrency = async (code: string) => {
    setCurrency(code);
    await saveGlobalCurrency(code);
    setCurrencyModal(false);
  };

  const toggleTab = async (
    key:
      | 'showInvestments'
      | 'showSavings'
      | 'showRevenue'
      | 'showDebts'
      | 'showNetWorth'
      | 'showGoals'
      | 'showRecurrings',
  ) => {
    if (!setup) return;
    const next: SetupData = { ...setup, [key]: !setup[key] };
    setSetup(next);
    await saveSetup(next);
  };

  // Move an optional tab up/down within tabOrder. Arrow-based (not drag):
  // react-native-draggable-flatlist inside a RN Modal is gesture-fragile,
  // and reordering is a rare, deliberate action where nudging is reliable
  // on every platform. The tab bar reorders live (it subscribes to setup).
  const moveTab = async (index: number, dir: -1 | 1) => {
    if (!setup) return;
    const order = normalizeTabOrder(setup.tabOrder);
    const j = index + dir;
    if (j < 0 || j >= order.length) return;
    [order[index], order[j]] = [order[j], order[index]];
    const next: SetupData = { ...setup, tabOrder: order };
    setSetup(next);
    await saveSetup(next);
  };

  const changeOverride = async (page: PageKey, code: string | null) => {
    if (code === null) {
      const next = { ...overrides };
      delete next[page];
      setOverrides(next);
    } else {
      setOverrides({ ...overrides, [page]: code });
    }
    await saveOverrideCurrency(page, code);
    setPerPage({ visible: true, view: 'list', page: null });
  };

  const selectedCurrency = CURRENCIES.find((c) => c.code === currency);

  return (
    <View style={[s.container, { paddingBottom: insets.bottom }]}>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* Profile */}
        <View style={s.profileCard}>
          <View style={s.avatar}>
            <Ionicons name="person" size={32} color="#00C896" style={glowGreen} />
          </View>
          <Text style={s.profileName}>{email ?? 'Your Profile'}</Text>
          <Text style={s.profileSub}>joo · personal finance</Text>
          <TouchableOpacity style={s.signOutBtn} onPress={signOut}>
            <Ionicons name="log-out-outline" size={14} color="#FF6B6B" />
            <Text style={s.signOutText}>Sign Out</Text>
          </TouchableOpacity>
        </View>

        {/* Preferences */}
        <Text style={s.sectionLabel}>PREFERENCES</Text>
        <View style={s.card}>
          <TouchableOpacity style={s.row} onPress={() => setCurrencyModal(true)}>
            <View style={s.rowIcon}>
              <Ionicons name="cash-outline" size={16} color="#555" />
            </View>
            <Text style={s.rowLabel}>Currency</Text>
            <View style={s.rowRight}>
              <Text style={s.rowValue}>{selectedCurrency?.symbol?.trim()}  {selectedCurrency?.code}</Text>
              <Ionicons name="chevron-forward" size={14} color="#333" style={{ marginLeft: 6 }} />
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.row, s.subtleRow]}
            onPress={() => setPerPage({ visible: true, view: 'list', page: null })}
          >
            <View style={s.rowIcon} />
            <Text style={s.subtleLabel}>Customize per page</Text>
            {Object.keys(overrides).length > 0 && (
              <Text style={s.overrideBadge}>
                {Object.keys(overrides).length} override{Object.keys(overrides).length === 1 ? '' : 's'}
              </Text>
            )}
            <Ionicons name="chevron-forward" size={13} color="#2A2A2A" style={{ marginLeft: 6 }} />
          </TouchableOpacity>
          {/* "Breakdown by currency" — when ON, the Dashboard hero card
              grows to show per-currency liquidity rows below the AFTER
              MONTHLY PAYMENTS / Current liquidity lines. Single-currency
              users are unaffected: the breakdown auto-hides when only
              one currency is in play, regardless of this setting. */}
          {setup && (
            <TouchableOpacity
              style={s.row}
              onPress={async () => {
                const next: SetupData = {
                  ...setup,
                  cashViewMode: setup.cashViewMode === 'single' ? 'breakdown' : 'single',
                };
                setSetup(next);
                await saveSetup(next);
              }}
            >
              <View style={s.rowIcon}>
                <Ionicons name="wallet-outline" size={16} color="#555" />
              </View>
              <Text style={s.rowLabel}>Breakdown by currency</Text>
              <View style={s.rowRight}>
                <Text style={s.rowValue}>
                  {setup.cashViewMode === 'breakdown' ? 'On' : 'Off'}
                </Text>
              </View>
            </TouchableOpacity>
          )}
        </View>

        {/* Optional tabs */}
        {setup && (
          <>
            <Text style={s.sectionLabel}>TABS</Text>
            <View style={s.card}>
              {(() => {
                const items: {
                  key:
                    | 'showInvestments'
                    | 'showSavings'
                    | 'showRevenue'
                    | 'showDebts'
                    | 'showNetWorth'
                    | 'showGoals'
                    | 'showRecurrings';
                  icon: keyof typeof Ionicons.glyphMap;
                  title: string;
                  desc: string;
                }[] = [
                  {
                    key: 'showRecurrings',
                    icon: 'repeat-outline',
                    title: 'Recurrings',
                    desc: 'Track monthly costs and mark them paid.',
                  },
                  {
                    key: 'showInvestments',
                    icon: 'trending-up-outline',
                    title: 'Investments',
                    desc: 'Project portfolio growth with compound returns.',
                  },
                  {
                    key: 'showSavings',
                    icon: 'wallet-outline',
                    title: 'Savings',
                    desc: 'Track savings goals and interest accumulation.',
                  },
                  {
                    key: 'showRevenue',
                    icon: 'bar-chart-outline',
                    title: 'Revenue',
                    desc: 'Log yearly income, monthly breakdown, growth.',
                  },
                  {
                    key: 'showDebts',
                    icon: 'document-text-outline',
                    title: 'Debts',
                    desc: 'Track what you owe — loans, cards, IOUs.',
                  },
                  {
                    key: 'showNetWorth',
                    icon: 'pulse-outline',
                    title: 'Net Worth',
                    desc: 'Cash + investments − debts in one number.',
                  },
                  {
                    key: 'showGoals',
                    icon: 'flag-outline',
                    title: 'Goals',
                    desc: 'Savings & payoff targets with progress.',
                  },
                ];
                return items.map((item, i) => {
                  const enabled = setup[item.key];
                  return (
                    <TouchableOpacity
                      key={item.key}
                      style={[s.tabRow, i > 0 && { borderTopWidth: 1, borderTopColor: '#1C1C1C' }]}
                      onPress={() => toggleTab(item.key)}
                      activeOpacity={0.75}
                    >
                      <View style={s.rowIcon}>
                        <Ionicons
                          name={item.icon}
                          size={16}
                          color={enabled ? '#00C896' : '#444'}
                          style={enabled ? glowGreen : undefined}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.tabRowTitle, !enabled && s.tabRowTitleDim]}>
                          {item.title}
                        </Text>
                        <Text style={s.tabRowDesc}>{item.desc}</Text>
                      </View>
                      <Text style={enabled ? s.enabledTag : s.disabledTag}>
                        {enabled ? 'ON' : 'OFF'}
                      </Text>
                    </TouchableOpacity>
                  );
                });
              })()}
              <TouchableOpacity
                style={[s.tabRow, { borderTopWidth: 1, borderTopColor: '#1C1C1C' }]}
                onPress={() => setOrderModal(true)}
                activeOpacity={0.75}
              >
                <View style={s.rowIcon} />
                <Text style={[s.subtleLabel, { flex: 1 }]}>Customize order</Text>
                <Ionicons name="chevron-forward" size={14} color="#333" />
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* About */}
        <Text style={s.sectionLabel}>ABOUT</Text>
        <View style={s.card}>
          <View style={s.row}>
            <View style={s.rowIcon}>
              <Ionicons name="information-circle-outline" size={16} color="#555" />
            </View>
            <Text style={s.rowLabel}>Version</Text>
            <Text style={s.rowValue}>1.0.0</Text>
          </View>
          <View style={[s.row, { borderTopWidth: 1, borderTopColor: '#1C1C1C' }]}>
            <View style={s.rowIcon}>
              <Ionicons name="code-slash-outline" size={16} color="#555" />
            </View>
            <Text style={s.rowLabel}>Built with</Text>
            <Text style={s.rowValue}>Expo · React Native</Text>
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Currency modal */}
      <Modal visible={currencyModal} transparent animationType="slide">
        <View style={s.overlay}>
          <View style={s.sheet}>
            <Text style={s.sheetTitle}>Select Currency</Text>
            {CURRENCIES.map((c) => (
              <TouchableOpacity
                key={c.code}
                style={[s.currencyRow, currency === c.code && s.currencyRowActive]}
                onPress={() => changeCurrency(c.code)}
              >
                <Text style={s.currencySymbol}>{c.symbol}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.currencyCode}>{c.code}</Text>
                  <Text style={s.currencyName}>{c.name}</Text>
                </View>
                {currency === c.code && <Ionicons name="checkmark-circle" size={20} color="#00C896" style={glowGreen} />}
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={s.closeBtn} onPress={() => setCurrencyModal(false)}>
              <Text style={s.closeBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Per-page currency — single modal, two views (list → picker) */}
      <Modal visible={perPage.visible} transparent animationType="slide">
        <View style={s.overlay}>
          <View style={s.sheet}>
            {perPage.view === 'list' ? (
              <>
                <Text style={s.sheetTitle}>Currency per page</Text>
                <Text style={s.sheetSub}>
                  Pick a different currency for any page. Default is the global currency.
                </Text>
                {(() => {
                  const pages: { key: PageKey; label: string }[] = [
                    { key: 'dashboard', label: 'Dashboard' },
                  ];
                  if (setup?.showInvestments !== false) {
                    pages.push({ key: 'investments', label: 'Investments' });
                  }
                  if (setup?.showSavings) {
                    pages.push({ key: 'savings', label: 'Savings' });
                  }
                  if (setup?.showRevenue !== false) {
                    pages.push({ key: 'revenue', label: 'Revenue' });
                  }
                  if (setup?.showDebts) {
                    pages.push({ key: 'debts', label: 'Debts' });
                  }
                  return pages.map((p, i) => {
                    const override = overrides[p.key];
                    const effective = override ?? currency;
                    const symbolFor = (CURRENCIES.find((c) => c.code === effective)?.symbol ?? effective).trim();
                    return (
                      <TouchableOpacity
                        key={p.key}
                        style={[s.pageRow, i > 0 && { borderTopWidth: 1, borderTopColor: '#222' }]}
                        onPress={() => setPerPage({ visible: true, view: 'picker', page: p.key })}
                      >
                        <Text style={s.pageRowLabel}>{p.label}</Text>
                        <View style={s.pageRowRight}>
                          <Text style={[s.pageRowValue, override ? s.pageRowOverride : null]}>
                            {symbolFor} {effective}
                          </Text>
                          <Text style={s.pageRowHint}>{override ? 'override' : 'global'}</Text>
                          <Ionicons name="chevron-forward" size={14} color="#333" />
                        </View>
                      </TouchableOpacity>
                    );
                  });
                })()}
                <TouchableOpacity
                  style={[s.closeBtn, { marginTop: 16 }]}
                  onPress={() => setPerPage({ visible: false, view: 'list', page: null })}
                >
                  <Text style={s.closeBtnText}>Done</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <View style={s.subTopBar}>
                  <TouchableOpacity
                    style={s.subBack}
                    onPress={() => setPerPage({ visible: true, view: 'list', page: null })}
                  >
                    <Ionicons name="chevron-back" size={18} color="#888" />
                    <Text style={s.subBackText}>Back</Text>
                  </TouchableOpacity>
                </View>
                <Text style={s.sheetTitle}>
                  {perPage.page
                    ? perPage.page.charAt(0).toUpperCase() + perPage.page.slice(1)
                    : ''}
                </Text>

                <TouchableOpacity
                  style={[s.currencyRow, perPage.page && !overrides[perPage.page] ? s.currencyRowActive : null]}
                  onPress={() => perPage.page && changeOverride(perPage.page, null)}
                >
                  <Ionicons name="globe-outline" size={20} color="#888" style={{ width: 28, textAlign: 'center' }} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.currencyCode}>Use global</Text>
                    <Text style={s.currencyName}>Currently {currency}</Text>
                  </View>
                  {perPage.page && !overrides[perPage.page] && (
                    <Ionicons name="checkmark-circle" size={20} color="#00C896" style={glowGreen} />
                  )}
                </TouchableOpacity>

                <View style={s.divider} />

                {CURRENCIES.map((c) => {
                  const isSelected = perPage.page && overrides[perPage.page] === c.code;
                  return (
                    <TouchableOpacity
                      key={c.code}
                      style={[s.currencyRow, isSelected && s.currencyRowActive]}
                      onPress={() => perPage.page && changeOverride(perPage.page, c.code)}
                    >
                      <Text style={s.currencySymbol}>{c.symbol}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={s.currencyCode}>{c.code}</Text>
                        <Text style={s.currencyName}>{c.name}</Text>
                      </View>
                      {isSelected && <Ionicons name="checkmark-circle" size={20} color="#00C896" style={glowGreen} />}
                    </TouchableOpacity>
                  );
                })}
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Tab order — Dashboard pinned first (then Recurrings if on),
          Settings last */}
      <Modal visible={orderModal} transparent animationType="slide">
        <View style={s.overlay}>
          <View style={s.sheet}>
            <Text style={s.sheetTitle}>Tab order</Text>
            <Text style={s.sheetSub}>
              Dashboard always comes first (with Recurrings next when it's
              on); Settings is always last. Reorder the rest below.
            </Text>
            {normalizeTabOrder(setup?.tabOrder).map((name, i, arr) => (
              <View
                key={name}
                style={[s.pageRow, i > 0 && { borderTopWidth: 1, borderTopColor: '#222' }]}
              >
                <Text style={s.pageRowLabel}>{TAB_TITLES[name] ?? name}</Text>
                <View style={s.orderBtns}>
                  <TouchableOpacity
                    style={s.orderBtn}
                    disabled={i === 0}
                    onPress={() => moveTab(i, -1)}
                  >
                    <Ionicons
                      name="chevron-up"
                      size={20}
                      color={i === 0 ? '#2A2A2A' : '#888'}
                    />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={s.orderBtn}
                    disabled={i === arr.length - 1}
                    onPress={() => moveTab(i, 1)}
                  >
                    <Ionicons
                      name="chevron-down"
                      size={20}
                      color={i === arr.length - 1 ? '#2A2A2A' : '#888'}
                    />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
            <TouchableOpacity
              style={[s.closeBtn, { marginTop: 16 }]}
              onPress={() => setOrderModal(false)}
            >
              <Text style={s.closeBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D0D0D' },
  header: { paddingHorizontal: 20, paddingVertical: 14 },
  headerTitle: { fontSize: 15, fontWeight: '700', color: '#FFF', letterSpacing: 3 },
  scroll: { paddingHorizontal: 16 },

  profileCard: {
    backgroundColor: '#151515',
    borderRadius: 20,
    padding: 28,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#222',
    alignItems: 'center',
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#0D1F1A',
    borderWidth: 2,
    borderColor: '#00C896',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  profileName: { fontSize: 17, fontWeight: '700', color: '#FFF', marginBottom: 4, letterSpacing: -0.3 },
  profileSub: { fontSize: 12, color: '#444', marginBottom: 16, fontWeight: '500' },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#3A1818',
    backgroundColor: '#1F0D0D',
  },
  signOutText: { fontSize: 12, color: '#FF6B6B', fontWeight: '600' },

  sectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#444',
    letterSpacing: 1.5,
    marginBottom: 8,
    marginLeft: 4,
  },

  card: { ...surface, borderRadius: 14, marginBottom: 24, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  addRow: { borderTopWidth: 1, borderTopColor: '#1C1C1C' },
  rowIcon: { width: 24, alignItems: 'center' },
  rowLabel: { flex: 1, fontSize: 14, color: '#CCC', fontWeight: '500' },
  rowRight: { flexDirection: 'row', alignItems: 'center' },
  rowValue: { fontSize: 13, color: '#555', fontWeight: '500' },
  currentTag: { fontSize: 11, color: '#3A6A5A', fontWeight: '500' },

  // Subtle "Customize per page" row inside the currency card
  subtleRow: {
    borderTopWidth: 1,
    borderTopColor: '#1C1C1C',
    paddingVertical: 11,
  },
  subtleLabel: { flex: 1, fontSize: 12, color: '#555', fontWeight: '500' },
  subtleHint: { fontSize: 10, color: '#333', marginTop: 2, fontWeight: '500' },
  enabledTag: {
    fontSize: 9,
    color: '#00C896',
    fontWeight: '700',
    letterSpacing: 0.8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1F3A30',
    backgroundColor: '#0D1F1A',
    textShadowColor: 'rgba(0, 200, 150, 0.4)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
  disabledTag: {
    fontSize: 9,
    color: '#444',
    fontWeight: '700',
    letterSpacing: 0.8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#222',
  },

  // Optional tab toggle row (Revenue / Debts / Net Worth)
  tabRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  tabRowTitle: { fontSize: 14, fontWeight: '600', color: '#EEE' },
  tabRowTitleDim: { color: '#666' },
  tabRowDesc: { fontSize: 11, color: '#444', marginTop: 2, lineHeight: 14, fontWeight: '500' },

  // Prominent CTA when revenue tracking is disabled
  ctaCard: {
    backgroundColor: '#0F1A17',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1F3A30',
    padding: 22,
    marginBottom: 24,
    alignItems: 'flex-start',
  },
  ctaIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#0D1F1A',
    borderWidth: 1,
    borderColor: '#1F3A30',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  ctaTitle: { fontSize: 18, fontWeight: '700', color: '#FFF', marginBottom: 6, letterSpacing: -0.3 },
  ctaSub: { fontSize: 13, color: '#666', lineHeight: 18, marginBottom: 18, fontWeight: '500' },
  ctaBtn: {
    backgroundColor: '#00C896',
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 10,
    alignSelf: 'stretch',
    alignItems: 'center',
    shadowColor: '#00C896',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
  },
  ctaBtnText: { fontSize: 14, fontWeight: '700', color: '#000' },
  overrideBadge: {
    fontSize: 10,
    color: '#00C896',
    fontWeight: '600',
    backgroundColor: '#0D1F1A',
    borderWidth: 1,
    borderColor: '#1A3A2F',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    letterSpacing: 0.3,
    textShadowColor: 'rgba(0, 200, 150, 0.4)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },

  // Per-page picker rows
  pageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  pageRowLabel: { flex: 1, fontSize: 15, color: '#EEE', fontWeight: '500' },
  orderBtns: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  orderBtn: {
    width: 40,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  pageRowRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pageRowValue: { fontSize: 14, color: '#888', fontWeight: '500' },
  pageRowOverride: {
    color: '#00C896',
    textShadowColor: 'rgba(0, 200, 150, 0.4)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
  pageRowHint: { fontSize: 10, color: '#444', letterSpacing: 0.5, fontWeight: '500' },
  divider: { height: 1, backgroundColor: '#222', marginVertical: 8 },

  // Back nav inside the per-page sheet
  subTopBar: { flexDirection: 'row', marginBottom: 10 },
  subBack: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4 },
  subBackText: { fontSize: 13, color: '#888', fontWeight: '500' },

  // Sheets
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#1A1A1A',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 44,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: '#2C2C2C',
  },
  sheetTitle: { fontSize: 20, fontWeight: '700', color: '#FFF', marginBottom: 10, letterSpacing: -0.3 },
  sheetSub: { fontSize: 13, color: '#555', marginBottom: 18, lineHeight: 18, fontWeight: '500' },
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
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  toggleText: { fontSize: 14, color: '#CCC', fontWeight: '500' },

  sheetActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  btnCancel: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#222',
    alignItems: 'center',
  },
  btnCancelText: { fontSize: 15, color: '#666', fontWeight: '500' },
  btnSave: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#00C896',
    alignItems: 'center',
    shadowColor: '#00C896',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
  },
  btnSaveText: { fontSize: 15, color: '#000', fontWeight: '700' },

  // Currency picker
  currencyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 13,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 2,
  },
  currencyRowActive: { backgroundColor: '#222' },
  currencySymbol: { fontSize: 18, color: '#FFF', width: 28, textAlign: 'center', fontWeight: '600' },
  currencyCode: { fontSize: 14, fontWeight: '600', color: '#FFF' },
  currencyName: { fontSize: 12, color: '#555', marginTop: 1, fontWeight: '500' },
  closeBtn: {
    marginTop: 10,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#222',
    alignItems: 'center',
  },
  closeBtnText: { fontSize: 15, color: '#666', fontWeight: '500' },
});
