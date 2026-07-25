import React, { useState, useCallback } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { AppText as Text } from '../../components/AppText';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getCurrencyForPage, peekCurrencyForPage, refreshCurrencyForPage } from '../../lib/currency';
import { surface } from '../../lib/surface';
import { CURRENCIES } from '../../lib/currencies';
import {
  InvestmentData,
  getInvestments,
  peekInvestments,
  refreshInvestments,
  saveInvestments,
} from '../../lib/investments';
import { feedback } from '../../lib/feedback';
import { fv, monthsSinceStart, parseAmount } from '../../lib/finance';
import {
  getWealthVisibility,
  peekWealthVisibility,
  saveWealthVisibility,
  type WealthVisibility,
} from '../../lib/wealth';
import Savings from './savings';

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function fmt(value: number, symbol: string): string {
  return `${symbol}${value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function fmtFull(value: number, symbol: string): string {
  return `${symbol}${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function Investments() {
  const [data, setData] = useState<InvestmentData>(peekInvestments);
  const [currency, setCurrency] = useState(() => peekCurrencyForPage('investments'));
  const [yearlyExpanded, setYearlyExpanded] = useState(true);
  const [visibility, setVisibility] = useState<WealthVisibility>(peekWealthVisibility);
  const [visibilityModal, setVisibilityModal] = useState(false);

  // Tap-to-edit modal for the whole portfolio (total + start date + rate)
  const [editVisible, setEditVisible] = useState(false);
  const [formTotal, setFormTotal] = useState('');
  const [formMonth, setFormMonth] = useState('');
  const [formYear, setFormYear] = useState('');
  const [formReturn, setFormReturn] = useState('');
  const [formShowProjections, setFormShowProjections] = useState(false);
  const [formContributeMonthly, setFormContributeMonthly] = useState(true);
  const [formCurrency, setFormCurrency] = useState(() => peekCurrencyForPage('investments'));

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      getInvestments().then((d) => {
        if (!cancelled) setData(d);
      });
      refreshInvestments().then((d) => {
        if (!cancelled) setData(d);
      });
      getCurrencyForPage('investments').then((c) => {
        if (!cancelled) setCurrency(c);
      });
      refreshCurrencyForPage('investments').then((c) => {
        if (!cancelled) setCurrency(c);
      });
      getWealthVisibility().then((value) => {
        if (!cancelled) setVisibility(value);
      });
      return () => {
        cancelled = true;
      };
    }, []),
  );

  const itemCurrency = data.currency ?? currency;
  const symbol = CURRENCIES.find((c) => c.code === itemCurrency)?.symbol ?? itemCurrency + ' ';
  const pv = parseAmount(data.totalInvested) || 0;
  const sy = parseInt(data.startYear) || new Date().getFullYear();
  const sm = parseInt(data.startMonth) || 1;
  const months = monthsSinceStart(sy, sm);
  // No assumed future contributions in lump-sum mode — compound pv only.
  const pmt = data.contributeMonthly && pv > 0 ? pv / months : 0;
  const rate = parseAmount(data.annualReturn) || 0;

  const val1y = fv(pv, pmt, rate, 12);
  const val5y = fv(pv, pmt, rate, 60);
  const val10y = fv(pv, pmt, rate, 120);

  const yearlyRows = Array.from({ length: 10 }, (_, i) => {
    const startBal = fv(pv, pmt, rate, i * 12);
    const endBal = fv(pv, pmt, rate, (i + 1) * 12);
    const interest = endBal - startBal - pmt * 12;
    return { year: i + 1, startBal, endBal, interest };
  });

  const startLabel = `${MONTH_LABELS[sm - 1]} ${sy}`;

  const openEdit = () => {
    setFormTotal(data.totalInvested);
    setFormMonth(data.startMonth);
    setFormYear(data.startYear);
    setFormReturn(data.annualReturn);
    setFormShowProjections(data.showProjections);
    setFormContributeMonthly(data.contributeMonthly);
    setFormCurrency(data.currency ?? currency);
    feedback.tap();
    setEditVisible(true);
  };

  const saveEdit = async () => {
    const next: InvestmentData = {
      totalInvested: formTotal,
      startMonth: formMonth || '1',
      startYear: formYear || String(new Date().getFullYear()),
      annualReturn: formReturn || '7',
      showProjections: formShowProjections,
      contributeMonthly: formContributeMonthly,
      currency: formCurrency,
    };
    setData(next);
    feedback.success();
    await saveInvestments(next);
    setEditVisible(false);
  };

  const toggleSection = async (section: keyof WealthVisibility) => {
    const next = { ...visibility, [section]: !visibility[section] };
    setVisibility(next);
    await saveWealthVisibility(next);
  };

  return (
    <View style={s.container} collapsable={false}>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <View style={s.wealthControlRow}>
          <Text style={s.wealthControlLabel}>WEALTH</Text>
          <TouchableOpacity style={s.customizeButton} onPress={() => setVisibilityModal(true)}>
            <Ionicons name="options-outline" size={15} color="#00C896" />
            <Text style={s.customizeButtonText}>Customize</Text>
          </TouchableOpacity>
        </View>

        {visibility.showInvestments && <>
        {/* Hero — big green total, tap to edit */}
        <TouchableOpacity style={s.heroCard} onPress={openEdit} activeOpacity={0.85}>
          <Text style={s.heroLabel}>TOTAL INVESTED</Text>
          <Text style={s.heroAmount}>{fmt(pv, symbol)}</Text>
          {pv > 0 ? (
            data.showProjections ? (
              <>
                <View style={s.heroDivider} />
                {data.contributeMonthly ? (
                  <>
                    <View style={s.heroRow}>
                      <Text style={s.heroSubLabel}>Avg monthly</Text>
                      <Text style={s.heroSubValue}>{fmtFull(pmt, symbol)}</Text>
                    </View>
                    <View style={[s.heroRow, { marginTop: 6 }]}>
                      <Text style={s.heroSubLabel}>
                        Since {startLabel} · {data.annualReturn || '7'}%
                      </Text>
                      <Text style={s.heroSubMeta}>tap to edit</Text>
                    </View>
                  </>
                ) : (
                  <View style={s.heroRow}>
                    <Text style={s.heroSubLabel}>
                      Lump sum · {data.annualReturn || '7'}% / yr
                    </Text>
                    <Text style={s.heroSubMeta}>tap to edit</Text>
                  </View>
                )}
              </>
            ) : (
              <Text style={s.heroSubMetaCenter}>tap to edit</Text>
            )
          ) : (
            <Text style={s.heroEmpty}>Tap to set up your portfolio</Text>
          )}
        </TouchableOpacity>

        {/* 1yr / 5yr / 10yr projections */}
        {pv > 0 && data.showProjections && (
          <View style={s.projRow}>
            {[
              { label: '1 YEAR', value: val1y },
              { label: '5 YEARS', value: val5y },
              { label: '10 YEARS', value: val10y },
            ].map(({ label, value }) => (
              <View key={label} style={s.projCard}>
                <Text style={s.projLabel}>{label}</Text>
                <Text style={s.projValue}>{fmt(value, symbol)}</Text>
                <Text style={s.projGain}>+{fmt(value - pv, symbol)}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Yearly breakdown */}
        {pv > 0 && data.showProjections && (
          <View style={s.card}>
            <TouchableOpacity
              style={s.collapseHeader}
              onPress={() => setYearlyExpanded(!yearlyExpanded)}
              activeOpacity={0.7}
            >
              <Text style={s.cardTitle}>Yearly Breakdown</Text>
              <Ionicons
                name={yearlyExpanded ? 'chevron-up' : 'chevron-down'}
                size={18}
                color="#555"
              />
            </TouchableOpacity>

            {yearlyExpanded && (
              <>
                <View style={[s.tableRow, s.tableHeaderRow]}>
                  <Text style={[s.tableCell, s.tableHeaderText, s.cellYear]}>YR</Text>
                  <Text style={[s.tableCell, s.tableHeaderText]}>START</Text>
                  <Text style={[s.tableCell, s.tableHeaderText]}>INTEREST</Text>
                  <Text style={[s.tableCell, s.tableHeaderText]}>END</Text>
                </View>
                {yearlyRows.map((row) => (
                  <View key={row.year} style={s.tableRow}>
                    <Text style={[s.tableCell, s.cellYear, s.yearNum]}>{row.year}</Text>
                    <Text style={[s.tableCell, s.dimText]}>{fmt(row.startBal, symbol)}</Text>
                    <Text style={[s.tableCell, s.greenText]}>+{fmt(Math.max(0, row.interest), symbol)}</Text>
                    <Text style={[s.tableCell, s.boldText]}>{fmt(row.endBal, symbol)}</Text>
                  </View>
                ))}
              </>
            )}
          </View>
        )}
        </>}

        {visibility.showSavings && <>
          <Savings embedded />
        </>}

        {!visibility.showInvestments && !visibility.showSavings && (
          <View style={s.emptyWealth}>
            <Text style={s.emptyWealthText}>No Wealth sections are shown.</Text>
            <TouchableOpacity onPress={() => setVisibilityModal(true)}>
              <Text style={s.emptyWealthAction}>Customize Wealth</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Edit modal — total + start date + return rate */}
      <Modal visible={editVisible} transparent animationType="slide">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <View style={s.overlay}>
            <View style={s.sheet}>
              <Text style={s.sheetTitle}>Update portfolio</Text>

              <ScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                <Text style={s.label}>TOTAL CURRENTLY INVESTED</Text>
                <TextInput
                  style={s.input}
                  value={formTotal}
                  onChangeText={setFormTotal}
                  placeholder="0"
                  placeholderTextColor="#3A3A3A"
                  keyboardType="decimal-pad"
                  autoFocus
                />
                <Text style={s.label}>CURRENCY</Text>
                <View style={s.currencyGrid}>
                  {CURRENCIES.map((item) => (
                    <TouchableOpacity key={item.code} style={[s.currencyPill, formCurrency === item.code && s.currencyPillActive]} onPress={() => setFormCurrency(item.code)}>
                      <Text style={[s.currencyPillText, formCurrency === item.code && s.currencyPillTextActive]}>{item.symbol} {item.code}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <TouchableOpacity
                  style={s.toggleRow}
                  onPress={() => {
                    feedback.select();
                    setFormShowProjections(!formShowProjections);
                  }}
                  activeOpacity={0.7}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={s.toggleTitle}>Show growth projections</Text>
                    <Text style={s.toggleHint}>
                      {formShowProjections
                        ? 'Avg monthly, 1y/5y/10y, and yearly breakdown'
                        : 'Just track the total. Turn on for compound math.'}
                    </Text>
                  </View>
                  <View style={[s.switch, formShowProjections && s.switchOn]}>
                    <View style={[s.switchKnob, formShowProjections && s.switchKnobOn]} />
                  </View>
                </TouchableOpacity>

                {formShowProjections && (
                  <>
                    <TouchableOpacity
                      style={s.toggleRow}
                      onPress={() => {
                        feedback.select();
                        setFormContributeMonthly(!formContributeMonthly);
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={s.toggleTitle}>I add to this monthly</Text>
                        <Text style={s.toggleHint}>
                          {formContributeMonthly
                            ? 'Projects your current pace forward, based on when you started'
                            : 'Lump sum — projects the current amount with no new deposits'}
                        </Text>
                      </View>
                      <View style={[s.switch, formContributeMonthly && s.switchOn]}>
                        <View style={[s.switchKnob, formContributeMonthly && s.switchKnobOn]} />
                      </View>
                    </TouchableOpacity>

                    {formContributeMonthly && (
                      <>
                        <Text style={s.label}>STARTED INVESTING</Text>
                        <View style={s.monthGrid}>
                          {MONTH_LABELS.map((m, i) => {
                            const active = formMonth === String(i + 1);
                            return (
                              <TouchableOpacity
                                key={m}
                                style={[s.monthBtn, active && s.monthBtnActive]}
                                onPress={() => setFormMonth(String(i + 1))}
                              >
                                <Text style={[s.monthBtnText, active && s.monthBtnTextActive]}>
                                  {m}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                        <TextInput
                          style={[s.input, { marginTop: 10 }]}
                          value={formYear}
                          onChangeText={setFormYear}
                          placeholder="2025"
                          placeholderTextColor="#3A3A3A"
                          keyboardType="number-pad"
                          maxLength={4}
                        />
                      </>
                    )}

                    <Text style={s.label}>EXPECTED ANNUAL RETURN (%)</Text>
                    <TextInput
                      style={s.input}
                      value={formReturn}
                      onChangeText={setFormReturn}
                      placeholder="7"
                      placeholderTextColor="#3A3A3A"
                      keyboardType="decimal-pad"
                    />
                    <Text style={s.hint}>7% is recommended for most stock market investments</Text>
                  </>
                )}
              </ScrollView>

              <View style={s.sheetActions}>
                <TouchableOpacity style={s.btnCancel} onPress={() => setEditVisible(false)}>
                  <Text style={s.btnCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.btnSave} onPress={saveEdit}>
                  <Text style={s.btnSaveText}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={visibilityModal} transparent animationType="slide">
        <View style={s.overlay}>
          <View style={s.sheet}>
            <Text style={s.sheetTitle}>Customize Wealth</Text>
            <Text style={s.sheetHint}>Choose which sections appear on this tab.</Text>
            <TouchableOpacity style={s.visibilityRow} onPress={() => toggleSection('showInvestments')}>
              <View style={{ flex: 1 }}>
                <Text style={s.toggleTitle}>Investments</Text>
                <Text style={s.toggleHint}>Portfolio total and projections</Text>
              </View>
              <View style={[s.switch, visibility.showInvestments && s.switchOn]}>
                <View style={[s.switchKnob, visibility.showInvestments && s.switchKnobOn]} />
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={s.visibilityRow} onPress={() => toggleSection('showSavings')}>
              <View style={{ flex: 1 }}>
                <Text style={s.toggleTitle}>Savings</Text>
                <Text style={s.toggleHint}>Savings total and projections</Text>
              </View>
              <View style={[s.switch, visibility.showSavings && s.switchOn]}>
                <View style={[s.switchKnob, visibility.showSavings && s.switchKnobOn]} />
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={s.closeBtn} onPress={() => setVisibilityModal(false)}>
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
  scroll: { paddingHorizontal: 16, paddingTop: 120 },
  wealthControlRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, paddingHorizontal: 4 },
  wealthControlLabel: { fontSize: 11, fontWeight: '700', color: '#666', letterSpacing: 1.5 },
  customizeButton: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 6, paddingHorizontal: 9, borderRadius: 12, backgroundColor: '#0D1F1A', borderWidth: 1, borderColor: '#1F3A30' },
  customizeButtonText: { fontSize: 12, color: '#00C896', fontWeight: '600' },
  sectionDivider: { marginTop: 16, marginBottom: 12, paddingHorizontal: 4 },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: '#666', letterSpacing: 1.5 },
  emptyWealth: { ...surface, borderRadius: 16, padding: 24, alignItems: 'center', gap: 10 },
  emptyWealthText: { color: '#777', fontSize: 14, fontWeight: '500' },
  emptyWealthAction: { color: '#00C896', fontSize: 14, fontWeight: '600' },

  // Hero (mirrors Dashboard pattern: big green amount, sub-info, divider)
  heroCard: { ...surface, borderRadius: 20, padding: 24, marginBottom: 16 },
  heroLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#555',
    letterSpacing: 1.5,
    marginBottom: 10,
  },
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
  heroDivider: { height: 1, backgroundColor: '#1E1E1E', marginVertical: 18 },
  heroRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heroSubLabel: { fontSize: 13, color: '#555', fontWeight: '500' },
  heroSubValue: {
    fontSize: 17,
    fontWeight: '700',
    color: '#00C896',
    fontVariant: ['tabular-nums'],
    textShadowColor: 'rgba(0, 200, 150, 0.4)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
  heroSubMeta: { fontSize: 11, color: '#444', fontWeight: '500' },
  heroSubMetaCenter: { fontSize: 11, color: '#444', fontWeight: '500', marginTop: 16, textAlign: 'center' },
  heroEmpty: { fontSize: 13, color: '#444', marginTop: 12, fontWeight: '500' },

  // Projection cards
  projRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  projCard: {
    flex: 1,
    backgroundColor: '#151515',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#222',
    alignItems: 'center',
  },
  projLabel: { fontSize: 9, fontWeight: '700', color: '#555', letterSpacing: 1, marginBottom: 8 },
  projValue: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFF',
    marginBottom: 4,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  projGain: {
    fontSize: 11,
    color: '#00C896',
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
    textShadowColor: 'rgba(0, 200, 150, 0.4)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },

  // Yearly breakdown
  card: { ...surface, borderRadius: 16, marginBottom: 16, overflow: 'hidden' },
  cardTitle: { fontSize: 13, fontWeight: '600', color: '#BBB', letterSpacing: 0.5 },
  collapseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 18,
  },
  tableHeaderRow: {
    borderTopWidth: 1,
    borderTopColor: '#1C1C1C',
    backgroundColor: '#111',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderTopWidth: 1,
    borderTopColor: '#1C1C1C',
  },
  tableCell: { flex: 1, fontSize: 12, color: '#888', textAlign: 'right', fontWeight: '500', fontVariant: ['tabular-nums'] },
  tableHeaderText: { fontSize: 9, fontWeight: '700', color: '#444', letterSpacing: 0.8 },
  cellYear: { flex: 0.4, textAlign: 'left' },
  yearNum: { fontSize: 13, fontWeight: '600', color: '#666', fontVariant: ['tabular-nums'] },
  dimText: { color: '#666' },
  greenText: {
    color: '#00C896',
    fontWeight: '500',
    textShadowColor: 'rgba(0, 200, 150, 0.4)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
  boldText: { color: '#EEE', fontWeight: '600' },

  // Modal
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#1A1A1A',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 36,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: '#2C2C2C',
    maxHeight: '85%',
  },
  sheetTitle: { fontSize: 20, fontWeight: '700', color: '#FFF', marginBottom: 20, letterSpacing: -0.3 },
  sheetHint: { fontSize: 13, color: '#777', lineHeight: 19, marginTop: -10, marginBottom: 12 },
  closeBtn: { marginTop: 16, paddingVertical: 14, borderRadius: 12, backgroundColor: '#00C896', alignItems: 'center' },
  closeBtnText: { fontSize: 15, color: '#07120F', fontWeight: '700' },

  label: {
    fontSize: 10,
    fontWeight: '600',
    color: '#555',
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#222',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 16,
    color: '#FFF',
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    fontWeight: '500',
  },
  currencyGrid: { flexDirection: 'row', gap: 4, marginBottom: 18 },
  currencyPill: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', paddingVertical: 9, paddingHorizontal: 3, borderRadius: 10, backgroundColor: '#222', borderWidth: 1, borderColor: '#2A2A2A' },
  currencyPillActive: { backgroundColor: '#00C896', borderColor: '#00C896' },
  currencyPillText: { color: '#999', fontSize: 10, fontWeight: '600', textAlign: 'center' },
  currencyPillTextActive: { color: '#07120F' },
  hint: { fontSize: 11, color: '#444', marginTop: -10, marginBottom: 18, fontWeight: '500' },

  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    marginBottom: 14,
    borderTopWidth: 1,
    borderTopColor: '#222',
  },
  visibilityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#262626',
  },
  toggleTitle: { fontSize: 14, color: '#EEE', fontWeight: '600' },
  toggleHint: { fontSize: 11, color: '#555', marginTop: 4, lineHeight: 14, fontWeight: '500' },
  switch: {
    width: 38,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#2A2A2A',
    padding: 2,
    justifyContent: 'center',
  },
  switchOn: { backgroundColor: '#00C896' },
  switchKnob: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#FFF',
    alignSelf: 'flex-start',
  },
  switchKnobOn: { alignSelf: 'flex-end' },

  monthGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
  monthBtn: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#222',
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  monthBtnActive: { backgroundColor: '#00C896', borderColor: '#00C896' },
  monthBtnText: { fontSize: 12, color: '#666', fontWeight: '500' },
  monthBtnTextActive: { color: '#000', fontWeight: '700' },

  sheetActions: { flexDirection: 'row', gap: 10, marginTop: 12 },
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
});
