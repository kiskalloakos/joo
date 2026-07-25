import React, { useState, useCallback } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { AppText as Text } from '../../components/AppText';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getCurrencyForPage, peekCurrencyForPage, refreshCurrencyForPage } from '../../lib/currency';
import { surface } from '../../lib/surface';
import { CURRENCIES } from '../../lib/currencies';
import {
  RevenueState,
  RevenueEntry,
  getRevenue,
  peekRevenue,
  refreshRevenue,
  saveRevenue,
  sortEntries,
  allTimeTotal,
  previousEntry,
  currentEntry,
  activeMonthCount,
  monthTotals,
  type RevenueIncome,
} from '../../lib/revenue';
import { newId } from '../../lib/dashboard';
import { showToast } from '../../lib/toast';
import { glowGreen } from '../../lib/glows';
import { feedback } from '../../lib/feedback';
import { parseAmount } from '../../lib/finance';
import { registerRevenueHeaderAction } from '../../lib/revenueHeaderActions';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const YEAR_PICKER_RANGE = 30; // years back from current calendar year

function fmt(value: number, symbol: string): string {
  return `${symbol}${value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export default function Revenue() {
  const [state, setState] = useState<RevenueState | null>(peekRevenue);
  const [currency, setCurrency] = useState(() => peekCurrencyForPage('revenue'));
  const [editVisible, setEditVisible] = useState(false);
  const [monthInputs, setMonthInputs] = useState<{ id: string; name: string; amount: string }[][]>(
    Array.from({ length: 12 }, () => []),
  );

  // Add/edit a year
  const [entryModal, setEntryModal] = useState<{ visible: boolean; editing: RevenueEntry | null }>({
    visible: false,
    editing: null,
  });
  const [formLabel, setFormLabel] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [quickAddVisible, setQuickAddVisible] = useState(false);
  const [quickSource, setQuickSource] = useState('');
  const [quickAmount, setQuickAmount] = useState('');
  const [quickCurrency, setQuickCurrency] = useState(() => peekCurrencyForPage('revenue'));

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      getRevenue().then((v) => {
        if (!cancelled) setState(v);
      });
      refreshRevenue().then((v) => {
        if (!cancelled) setState(v);
      });
      getCurrencyForPage('revenue').then((c) => {
        if (!cancelled) setCurrency(c);
      });
      refreshCurrencyForPage('revenue').then((c) => {
        if (!cancelled) setCurrency(c);
      });
      return () => {
        cancelled = true;
      };
    }, []),
  );

  if (!state) {
    return <View style={s.container} collapsable={false} />;
  }

  const symbol = CURRENCIES.find((c) => c.code === currency)?.symbol ?? currency + ' ';
  const current = currentEntry(state);
  const currentLabel = current?.label ?? String(new Date().getFullYear());
  const currentAmount = current?.amount ?? 0;
  const currentMonths = monthTotals(current?.months);
  const prev = previousEntry(state);
  const total = allTimeTotal(state.entries);

  let growthPct: number | null = null;
  if (prev && prev.amount > 0) {
    growthPct = ((currentAmount - prev.amount) / prev.amount) * 100;
  }

  // Monthly average — prefer count of months with actual data, fall back to /12.
  const activeCount = activeMonthCount(currentMonths);
  let monthlyAvg = 0;
  let avgLabel = '';
  if (activeCount > 0) {
    monthlyAvg = currentAmount / activeCount;
    avgLabel = `across ${activeCount} active month${activeCount === 1 ? '' : 's'}`;
  } else if (currentAmount > 0) {
    monthlyAvg = currentAmount / 12;
    avgLabel = 'assuming full year';
  }

  // Largest month (if monthly data exists)
  let bestMonth: { name: string; amount: number } | null = null;
  if (currentMonths) {
    const maxIdx = currentMonths.reduce((mi, val, i, arr) => (val > arr[mi] ? i : mi), 0);
    if (currentMonths[maxIdx] > 0) {
      bestMonth = { name: MONTHS[maxIdx], amount: currentMonths[maxIdx] };
    }
  }

  const openEdit = useCallback(() => {
    const seed = Array.from({ length: 12 }, (_, index) =>
      (current?.months?.[index] ?? []).map((income) => ({
        id: income.id,
        name: income.name,
        amount: income.amount > 0 ? String(income.amount) : '',
      })),
    );
    setMonthInputs(seed);
    feedback.tap();
    setEditVisible(true);
  }, [current]);

  const openQuickAdd = useCallback(() => {
    setQuickSource('');
    setQuickAmount('');
    setQuickCurrency(currency);
    setQuickAddVisible(true);
  }, [currency]);

  useFocusEffect(useCallback(() => registerRevenueHeaderAction(openQuickAdd), [openQuickAdd]));

  const saveQuickRevenue = async () => {
    if (!current || !quickSource.trim() || !(parseAmount(quickAmount) > 0)) return;
    const monthIndex = new Date().getMonth();
    const months = Array.from({ length: 12 }, (_, index) =>
      index === monthIndex
        ? [...(current.months?.[index] ?? []), { id: newId(), name: quickSource.trim(), amount: parseAmount(quickAmount), currency: quickCurrency }]
        : current.months?.[index] ?? [],
    );
    const amount = monthTotals(months).reduce((sum, value) => sum + value, 0);
    const updated = { entries: state.entries.map((entry) => entry.id === current.id ? { ...entry, amount, months } : entry) };
    setState(updated);
    setQuickAddVisible(false);
    await saveRevenue(updated);
  };

  const updateIncome = (monthIndex: number, incomeId: string, key: 'name' | 'amount', value: string) => {
    setMonthInputs((previous) =>
      previous.map((month, index) =>
        index === monthIndex
          ? month.map((income) => income.id === incomeId ? { ...income, [key]: value } : income)
          : month,
      ),
    );
  };

  const addIncome = (monthIndex: number) => {
    setMonthInputs((previous) =>
      previous.map((month, index) =>
        index === monthIndex ? [...month, { id: newId(), name: '', amount: '' }] : month,
      ),
    );
  };

  const removeIncome = (monthIndex: number, incomeId: string) => {
    setMonthInputs((previous) =>
      previous.map((month, index) => index === monthIndex ? month.filter((income) => income.id !== incomeId) : month),
    );
  };

  const liveTotal = monthInputs.reduce(
    (sum, month) => sum + month.reduce((monthSum, income) => monthSum + (parseAmount(income.amount) || 0), 0),
    0,
  );

  const saveEdit = async () => {
    if (!current) return;
    const months = monthInputs.map((month) =>
      month
        .map((income): RevenueIncome => ({
          id: income.id,
          name: income.name.trim() || 'Income',
          amount: parseAmount(income.amount) || 0,
        }))
        .filter((income) => income.amount > 0),
    );
    const amount = monthTotals(months).reduce((sum, value) => sum + value, 0);
    const updated: RevenueState = {
      entries: state.entries.map((e) =>
        e.id === current.id ? { ...e, amount, months } : e,
      ),
    };
    setState(updated);
    feedback.success();
    await saveRevenue(updated);
    setEditVisible(false);
  };

  // ── Year CRUD ────────────────────────────────────────────────────────────
  const calYear = new Date().getFullYear();

  // Picker shows current calendar year (and one ahead for early planning) down N years.
  // When editing, the entry's own year stays available; otherwise filter taken years.
  const takenYears = new Set(state.entries.map((e) => e.label));
  const editingLabel = entryModal.editing?.label;
  const availableYears: string[] = [];
  for (let y = calYear + 1; y >= calYear - YEAR_PICKER_RANGE; y--) {
    const label = String(y);
    if (!takenYears.has(label) || label === editingLabel) availableYears.push(label);
  }

  const openAddEntry = () => {
    const taken = new Set(state.entries.map((e) => e.label));
    // Default selection: most recent un-taken year (usually calYear).
    let defaultYear = String(calYear);
    for (let y = calYear; y >= calYear - YEAR_PICKER_RANGE; y--) {
      if (!taken.has(String(y))) {
        defaultYear = String(y);
        break;
      }
    }
    setFormLabel(defaultYear);
    setFormAmount('');
    feedback.tap();
    setEntryModal({ visible: true, editing: null });
  };

  const openEditEntry = (entry: RevenueEntry) => {
    setFormLabel(entry.label);
    setFormAmount(String(entry.amount));
    feedback.tap();
    setEntryModal({ visible: true, editing: entry });
  };

  const saveEntry = async () => {
    if (!formLabel.trim()) return;
    const label = formLabel.trim();
    const amount = parseAmount(formAmount) || 0;
    const wasEditing = entryModal.editing;

    let entries: RevenueEntry[];
    if (wasEditing) {
      entries = state.entries.map((e) => {
        if (e.id !== wasEditing.id) return e;
        // Preserve months only if amount is unchanged (year-rename); else lump-sum override.
        if (e.amount === amount && e.months) return { ...e, label };
        return { ...e, label, amount, months: undefined };
      });
    } else {
      if (state.entries.some((e) => e.label === label)) {
        feedback.error();
        Alert.alert('Year already exists', `An entry for "${label}" already exists. Tap it to edit.`);
        return;
      }
      entries = [...state.entries, { id: newId(), label, amount }];
    }

    const updated: RevenueState = { entries };
    setState(updated);
    feedback.success();
    await saveRevenue(updated);
    setEntryModal({ visible: false, editing: null });
  };

  const deleteEntry = async (entry: RevenueEntry) => {
    if (state.entries.length === 1) {
      feedback.error();
      Alert.alert('Cannot delete', 'You need at least one revenue entry.');
      return;
    }
    setEntryModal({ visible: false, editing: null });
    const before = state;
    const entries = state.entries.filter((e) => e.id !== entry.id);
    const updated: RevenueState = { entries };
    setState(updated);
    feedback.destroy();
    await saveRevenue(updated);
    showToast(`Deleted ${entry.label}`, {
      label: 'Undo',
      onPress: async () => {
        setState(before);
        await saveRevenue(before);
      },
    });
  };

  const sortedEntries = sortEntries(state.entries);

  // New-year reminder: current (newest) entry is behind the calendar year.
  const labelYear = parseInt(currentLabel, 10);
  const showNewYearBanner =
    !isNaN(labelYear) &&
    labelYear < calYear &&
    !state.entries.some((e) => e.label === String(calYear)) &&
    !bannerDismissed;

  const addNewYearEntry = async () => {
    const label = String(calYear);
    const entry: RevenueEntry = { id: newId(), label, amount: 0 };
    const updated: RevenueState = { entries: [...state.entries, entry] };
    setState(updated);
    await saveRevenue(updated);
  };

  return (
    <View style={s.container} collapsable={false}>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {/* New-year reminder banner */}
        {showNewYearBanner && (
          <View style={s.banner}>
            <Ionicons name="alarm-outline" size={18} color="#00C896" style={glowGreen} />
            <View style={{ flex: 1 }}>
              <Text style={s.bannerTitle}>It's {calYear}</Text>
              <Text style={s.bannerSub}>
                Don't forget to reset — add a new year to track this year's revenue.
              </Text>
            </View>
            <TouchableOpacity style={s.bannerBtn} onPress={addNewYearEntry}>
              <Text style={s.bannerBtnText}>Add {calYear}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.bannerClose} onPress={() => setBannerDismissed(true)}>
              <Ionicons name="close" size={14} color="#555" />
            </TouchableOpacity>
          </View>
        )}

        {/* Main current-year card */}
        <TouchableOpacity style={s.heroCard} onPress={openEdit} activeOpacity={0.85}>
          <Text style={s.heroYear}>{currentLabel}</Text>
          <Text style={s.heroAmount}>{fmt(currentAmount, symbol)}</Text>

          {growthPct !== null && (
            <View style={s.growthRow}>
              <Ionicons
                name={growthPct >= 0 ? 'trending-up' : 'trending-down'}
                size={14}
                color={growthPct >= 0 ? '#00C896' : '#888'}
                style={growthPct >= 0 ? glowGreen : undefined}
              />
              <Text
                style={[
                  s.growthText,
                  { color: growthPct >= 0 ? '#00C896' : '#888' },
                  growthPct >= 0 && glowGreen,
                ]}
              >
                {growthPct >= 0 ? '+' : ''}
                {growthPct.toFixed(1)}% vs {prev!.label}
              </Text>
            </View>
          )}

          <View style={s.heroDivider} />

          <View style={s.heroFooter}>
            <Text style={s.heroFooterLabel}>All-time total</Text>
            <Text style={s.heroFooterValue}>{fmt(total, symbol)}</Text>
          </View>

          <View style={s.editHint}>
            <Ionicons name="pencil-outline" size={11} color="#444" />
            <Text style={s.editHintText}>Tap to update monthly</Text>
          </View>
        </TouchableOpacity>

        {/* Monthly average + best month */}
        {currentAmount > 0 && (
          <View style={s.statsRow}>
            <View style={s.statCard}>
              <Text style={s.statLabel}>MONTHLY AVG</Text>
              <Text style={s.statValue}>{fmt(monthlyAvg, symbol)}</Text>
              {avgLabel ? <Text style={s.statSub}>{avgLabel}</Text> : null}
            </View>
            {bestMonth && (
              <View style={s.statCard}>
                <Text style={s.statLabel}>BEST MONTH</Text>
                <Text style={s.statValue}>{fmt(bestMonth.amount, symbol)}</Text>
                <Text style={s.statSub}>{bestMonth.name}</Text>
              </View>
            )}
          </View>
        )}

        {/* Monthly breakdown peek */}
        {currentMonths.some((m) => m > 0) && (
          <View style={s.breakdownCard}>
            <Text style={s.breakdownTitle}>This year, by month</Text>
            <View style={s.breakdownGrid}>
              {MONTHS.map((m, i) => {
                const val = currentMonths[i];
                const isEmpty = !val || val === 0;
                return (
                  <View key={m} style={s.breakdownItem}>
                    <Text style={s.breakdownMonth}>{m}</Text>
                    <Text style={[s.breakdownAmount, isEmpty && s.breakdownEmpty]}>
                      {isEmpty ? '—' : fmt(val, symbol)}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Revenue History */}
        <View style={s.historyCard}>
          <View style={s.historyHeader}>
            <Text style={s.historyTitle}>Revenue History</Text>
            <TouchableOpacity style={s.historyAddBtn} onPress={openAddEntry}>
              <Ionicons name="add" size={16} color="#00C896" style={glowGreen} />
            </TouchableOpacity>
          </View>
          {sortedEntries.map((entry, i) => (
            <TouchableOpacity
              key={entry.id}
              style={[s.historyRow, i > 0 && { borderTopWidth: 1, borderTopColor: '#1C1C1C' }]}
              onPress={() => openEditEntry(entry)}
            >
              <Text style={s.historyLabel}>{entry.label}</Text>
              <Text style={s.historyAmount}>{fmt(entry.amount, symbol)}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Monthly editor modal */}
      <Modal visible={editVisible} transparent animationType="slide">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <View style={s.overlay}>
            <View style={s.sheet}>
              <View style={s.sheetHeader}>
                <Text style={s.sheetTitle}>{currentLabel} by month</Text>
                <View style={s.liveTotal}>
                  <Text style={s.liveTotalLabel}>TOTAL</Text>
                  <Text style={s.liveTotalValue}>{fmt(liveTotal, symbol)}</Text>
                </View>
              </View>

              <ScrollView
                style={s.monthList}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                {MONTHS.map((month, monthIndex) => (
                  <View key={month} style={s.monthGroup}>
                    <View style={s.monthGroupHeader}>
                      <Text style={s.monthLabel}>{month}</Text>
                      <TouchableOpacity style={s.addIncomeBtn} onPress={() => addIncome(monthIndex)}>
                        <Ionicons name="add" size={15} color="#00C896" />
                        <Text style={s.addIncomeText}>Income</Text>
                      </TouchableOpacity>
                    </View>
                    {monthInputs[monthIndex].map((income) => (
                      <View key={income.id} style={s.incomeRow}>
                        <TextInput
                          style={s.incomeNameInput}
                          value={income.name}
                          onChangeText={(value) => updateIncome(monthIndex, income.id, 'name', value)}
                          placeholder="Source"
                          placeholderTextColor="#444"
                        />
                        <TextInput
                          style={s.incomeAmountInput}
                          value={income.amount}
                          onChangeText={(value) => updateIncome(monthIndex, income.id, 'amount', value)}
                          placeholder="0"
                          placeholderTextColor="#333"
                          keyboardType="decimal-pad"
                        />
                        <TouchableOpacity onPress={() => removeIncome(monthIndex, income.id)} hitSlop={8}>
                          <Ionicons name="remove-circle-outline" size={18} color="#666" />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                ))}
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

      {/* Add/edit a year */}
      <Modal visible={entryModal.visible} transparent animationType="slide">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <View style={s.overlay}>
            <View style={s.sheet}>
              <Text style={s.sheetTitle}>
                {entryModal.editing ? 'Edit Revenue Year' : 'Add Revenue Year'}
              </Text>

              <Text style={s.inputLabel}>Year</Text>
              <ScrollView
                style={s.yearList}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {availableYears.map((y) => {
                  const selected = y === formLabel;
                  return (
                    <TouchableOpacity
                      key={y}
                      style={[s.yearRow, selected && s.yearRowActive]}
                      onPress={() => {
                        if (!selected) feedback.select();
                        setFormLabel(y);
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={[s.yearRowText, selected && s.yearRowTextActive]}>{y}</Text>
                      {selected && <Ionicons name="checkmark" size={16} color="#00C896" style={glowGreen} />}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <Text style={s.inputLabel}>Total revenue ({currency})</Text>
              <TextInput
                style={s.input}
                value={formAmount}
                onChangeText={setFormAmount}
                placeholder="0"
                placeholderTextColor="#444"
                keyboardType="decimal-pad"
              />

              <View style={s.sheetActions}>
                <TouchableOpacity
                  style={s.btnCancel}
                  onPress={() => setEntryModal({ visible: false, editing: null })}
                >
                  <Text style={s.btnCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.btnSave} onPress={saveEntry}>
                  <Text style={s.btnSaveText}>Save</Text>
                </TouchableOpacity>
              </View>
              {entryModal.editing && state.entries.length > 1 && (
                <TouchableOpacity
                  style={s.deleteLink}
                  onPress={() => deleteEntry(entryModal.editing!)}
                >
                  <Ionicons name="trash-outline" size={14} color="#FF6B6B" />
                  <Text style={s.deleteLinkText}>Delete year</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={quickAddVisible} transparent animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={s.overlay}><View style={s.sheet}>
            <Text style={s.sheetTitle}>Add Revenue</Text>
            <Text style={s.inputLabel}>Where did it come from?</Text>
            <TextInput style={s.input} value={quickSource} onChangeText={setQuickSource} placeholder="e.g. Salary, freelance client" placeholderTextColor="#444" autoFocus />
            <Text style={s.inputLabel}>Currency</Text>
            <View style={s.currencyGrid}>{CURRENCIES.map((item) => <TouchableOpacity key={item.code} style={[s.currencyPill, quickCurrency === item.code && s.currencyPillActive]} onPress={() => setQuickCurrency(item.code)}><Text style={[s.currencyPillText, quickCurrency === item.code && s.currencyPillTextActive]}>{item.symbol} {item.code}</Text></TouchableOpacity>)}</View>
            <Text style={s.inputLabel}>Amount ({quickCurrency})</Text>
            <TextInput style={s.input} value={quickAmount} onChangeText={setQuickAmount} placeholder="0.00" placeholderTextColor="#444" keyboardType="decimal-pad" />
            <View style={s.sheetActions}><TouchableOpacity style={s.btnCancel} onPress={() => setQuickAddVisible(false)}><Text style={s.btnCancelText}>Cancel</Text></TouchableOpacity><TouchableOpacity style={s.btnSave} onPress={saveQuickRevenue}><Text style={s.btnSaveText}>Add</Text></TouchableOpacity></View>
          </View></View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D0D0D' },
  header: { paddingHorizontal: 20, paddingVertical: 14 },
  headerTitle: { fontSize: 15, fontWeight: '700', color: '#FFF', letterSpacing: 3 },
  scroll: { paddingHorizontal: 16, paddingTop: 112 },

  heroCard: { ...surface, borderRadius: 20, padding: 24, marginBottom: 12 },
  heroYear: { fontSize: 14, color: '#666', fontWeight: '600', letterSpacing: 1 },

  heroAmount: {
    fontSize: 46,
    fontWeight: '800',
    color: '#00C896',
    letterSpacing: -1.4,
    marginTop: 12,
    fontVariant: ['tabular-nums'],
    textShadowColor: 'rgba(0, 200, 150, 0.25)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 14,
  },

  growthRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  growthText: { fontSize: 13, fontWeight: '500', fontVariant: ['tabular-nums'] },

  heroDivider: { height: 1, backgroundColor: '#1E1E1E', marginVertical: 18 },
  heroFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heroFooterLabel: { fontSize: 13, color: '#555', fontWeight: '500' },
  heroFooterValue: { fontSize: 15, fontWeight: '700', color: '#AAA', fontVariant: ['tabular-nums'] },

  editHint: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 16, justifyContent: 'center' },
  editHintText: { fontSize: 11, color: '#444', fontWeight: '500' },

  // Stats row (monthly avg, best month)
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  statCard: {
    flex: 1,
    backgroundColor: '#151515',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#222',
  },
  statLabel: { fontSize: 9, fontWeight: '700', color: '#555', letterSpacing: 1.2, marginBottom: 8 },
  statValue: { fontSize: 18, fontWeight: '800', color: '#FFF', fontVariant: ['tabular-nums'] },
  statSub: { fontSize: 11, color: '#444', marginTop: 3, fontWeight: '500' },

  // Monthly breakdown grid
  breakdownCard: {
    backgroundColor: '#151515',
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: '#222',
    marginBottom: 16,
  },
  breakdownTitle: { fontSize: 13, fontWeight: '600', color: '#BBB', letterSpacing: 0.5, marginBottom: 14 },
  breakdownGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  breakdownItem: { width: '25%', paddingVertical: 8 },
  breakdownMonth: { fontSize: 10, fontWeight: '600', color: '#444', letterSpacing: 1, marginBottom: 3 },
  breakdownAmount: { fontSize: 13, fontWeight: '500', color: '#CCC', fontVariant: ['tabular-nums'] },
  breakdownEmpty: { color: '#2A2A2A', fontWeight: '500' },

  footnote: { fontSize: 12, color: '#444', textAlign: 'center', marginTop: 8, lineHeight: 18, fontWeight: '500' },

  // New-year reminder banner
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#0F1A17',
    borderColor: '#1F3A30',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 14,
  },
  bannerTitle: { fontSize: 13, fontWeight: '700', color: '#FFF' },
  bannerSub: { fontSize: 11, color: '#555', marginTop: 2, lineHeight: 14, fontWeight: '500' },
  bannerBtn: {
    backgroundColor: '#00C896',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    shadowColor: '#00C896',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 3,
  },
  bannerBtnText: { fontSize: 12, fontWeight: '700', color: '#000' },
  bannerClose: { padding: 4 },

  // Revenue history card
  historyCard: {
    backgroundColor: '#151515',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#222',
    marginBottom: 16,
    overflow: 'hidden',
  },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  historyTitle: { fontSize: 13, fontWeight: '600', color: '#BBB', letterSpacing: 0.5 },
  historyAddBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#0D0D0D',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#2C2C2C',
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 13,
    gap: 10,
  },
  historyLabel: { flex: 1, fontSize: 14, color: '#CCC', fontWeight: '500' },
  historyAmount: { fontSize: 14, color: '#888', fontWeight: '500', fontVariant: ['tabular-nums'] },

  // Entry modal extras
  inputLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#666',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  currencyGrid: { flexDirection: 'row', flexWrap: 'nowrap', gap: 4, marginBottom: 16 },
  currencyPill: { flex: 1, minWidth: 0, paddingHorizontal: 4, paddingVertical: 8, borderRadius: 10, backgroundColor: '#222', borderWidth: 1, borderColor: '#333', alignItems: 'center', justifyContent: 'center' },
  currencyPillActive: { backgroundColor: '#00C896', borderColor: '#00C896' },
  currencyPillText: { color: '#999', fontSize: 11, fontWeight: '600', textAlign: 'center' },
  currencyPillTextActive: { color: '#07120F' },
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

  // Year picker
  yearList: {
    maxHeight: 220,
    backgroundColor: '#181818',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2C2C2C',
    marginBottom: 20,
  },
  yearRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  yearRowActive: {
    backgroundColor: '#0D1F1A',
  },
  yearRowText: {
    fontSize: 16,
    color: '#AAA',
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  yearRowTextActive: {
    color: '#00C896',
    fontWeight: '700',
    textShadowColor: 'rgba(0, 200, 150, 0.4)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },

  // Modal
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#1A1A1A',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 36,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: '#2C2C2C',
    maxHeight: '85%',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginBottom: 16,
  },
  sheetTitle: { fontSize: 20, fontWeight: '700', color: '#FFF', letterSpacing: -0.3, marginBottom: 16 },
  liveTotal: { alignItems: 'flex-end' },
  liveTotalLabel: { fontSize: 9, fontWeight: '700', color: '#555', letterSpacing: 1 },
  liveTotalValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#00C896',
    marginTop: 2,
    fontVariant: ['tabular-nums'],
    textShadowColor: 'rgba(0, 200, 150, 0.4)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },

  monthList: { marginBottom: 12 },
  monthGroup: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#222' },
  monthGroupHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  monthLabel: { fontSize: 13, fontWeight: '600', color: '#AAA' },
  addIncomeBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingVertical: 3, paddingHorizontal: 5 },
  addIncomeText: { color: '#00C896', fontSize: 12, fontWeight: '600' },
  incomeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 7 },
  incomeNameInput: {
    flex: 1.2,
    backgroundColor: '#222',
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 10,
    color: '#FFF',
    fontSize: 14,
  },
  incomeAmountInput: {
    flex: 0.8,
    backgroundColor: '#222',
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 10,
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'right',
  },

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
