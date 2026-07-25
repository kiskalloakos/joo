import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  ScrollView,
  Pressable,
  TouchableOpacity,
  Modal,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { AppText as Text } from '../../components/AppText';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { getCurrencyForPage, peekCurrencyForPage, refreshCurrencyForPage } from '../../lib/currency';
import { surface } from '../../lib/surface';
import { CURRENCIES } from '../../lib/currencies';
import { Debt, getDebts, peekDebts, refreshDebts, saveDebt, deleteDebt } from '../../lib/debts';
import { newId } from '../../lib/dashboard';
import { showToast } from '../../lib/toast';
import { glowAmber, glowGreen } from '../../lib/glows';
import { feedback } from '../../lib/feedback';
import { parseAmount } from '../../lib/finance';
import { convert, peekRates, subscribeRates, type Rates } from '../../lib/exchangeRates';

function fmt(value: number, symbol: string): string {
  return `${symbol}${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function parseAmt(s: string): number {
  return parseAmount(s);
}

export default function Debts() {
  const [debts, setDebts] = useState<Debt[]>(peekDebts);
  const [currency, setCurrency] = useState(() => peekCurrencyForPage('debts'));
  const [rates, setRates] = useState<Rates>(peekRates);

  const [modal, setModal] = useState<{ visible: boolean; editing: Debt | null }>({
    visible: false,
    editing: null,
  });
  const [formName, setFormName] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formPaid, setFormPaid] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formCurrency, setFormCurrency] = useState(() => peekCurrencyForPage('debts'));
  const [clearedExpanded, setClearedExpanded] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      getDebts().then((d) => {
        if (!cancelled) setDebts(d);
      });
      refreshDebts().then((d) => {
        if (!cancelled) setDebts(d);
      });
      getCurrencyForPage('debts').then((c) => {
        if (!cancelled) setCurrency(c);
      });
      refreshCurrencyForPage('debts').then((c) => {
        if (!cancelled) setCurrency(c);
      });
      return () => {
        cancelled = true;
      };
    }, []),
  );

  useEffect(() => subscribeRates(setRates), []);

  const symbol = CURRENCIES.find((c) => c.code === currency)?.symbol ?? currency + ' ';
  // What you still owe drives the hero; the original total is informational.
  const stillOwed = debts.reduce(
    (s, d) => s + convert(Math.max(0, parseAmt(d.amount) - parseAmt(d.paidAmount)), d.currency ?? currency, currency, rates.rates),
    0,
  );
  const paidOff = debts.reduce(
    (s, d) => s + convert(Math.min(parseAmt(d.amount), parseAmt(d.paidAmount)), d.currency ?? currency, currency, rates.rates),
    0,
  );

  const openAdd = () => {
    setFormName('');
    setFormAmount('');
    setFormPaid('');
    setFormNotes('');
    setFormCurrency(peekCurrencyForPage('debts'));
    feedback.tap();
    setModal({ visible: true, editing: null });
  };

  const openEdit = (debt: Debt) => {
    setFormName(debt.name);
    setFormAmount(debt.amount);
    setFormPaid(debt.paidAmount === '0' ? '' : debt.paidAmount);
    setFormNotes(debt.notes ?? '');
    setFormCurrency(debt.currency ?? currency);
    feedback.tap();
    setModal({ visible: true, editing: debt });
  };

  const saveForm = async () => {
    if (!formName.trim()) return;
    const editing = modal.editing;
    const paid = String(parseAmt(formPaid));
    const debt: Debt = editing
      ? {
          ...editing,
          name: formName.trim(),
          amount: formAmount,
          paidAmount: paid,
          notes: formNotes.trim() || null,
          currency: formCurrency,
        }
      : {
          id: newId(),
          name: formName.trim(),
          amount: formAmount,
          paidAmount: paid,
          notes: formNotes.trim() || null,
          currency: formCurrency,
          position: debts.length,
        };
    setDebts(editing ? debts.map((d) => (d.id === editing.id ? debt : d)) : [...debts, debt]);
    setModal({ visible: false, editing: null });
    feedback.success();
    await saveDebt(debt);
  };

  const outstandingDebts = debts.filter((d) => parseAmt(d.amount) <= 0 || parseAmt(d.paidAmount) < parseAmt(d.amount));
  const clearedDebts = debts.filter((d) => parseAmt(d.amount) > 0 && parseAmt(d.paidAmount) >= parseAmt(d.amount));

  // Shared inner content for a debt row (used by both the native draggable
  // list and the web map). The amber→green bar spans the full track and is
  // revealed by the pct-wide clip: scaling the gradient's end point by 1/pct
  // shows colour slice [0, pct] of the full sweep without measuring width.
  const rowContent = (debt: Debt) => {
    const amt = parseAmt(debt.amount);
    const paid = parseAmt(debt.paidAmount);
    const pct = amt > 0 ? Math.min(1, Math.max(0, paid / amt)) : 0;
    const cleared = amt > 0 && paid >= amt;
    const remaining = Math.max(0, amt - paid);
    return (
      <>
        <View style={{ flex: 1 }}>
          <Text style={s.rowLabel}>{debt.name}</Text>
          {debt.notes ? <Text style={s.rowMeta}>{debt.notes}</Text> : null}
          {amt > 0 && (
            <>
              <View style={s.barTrack}>
                <View style={[s.barClip, { width: `${pct * 100}%` }]}>
                  <LinearGradient
                    colors={['#FFA94D', '#00C896']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: pct > 0 ? 1 / pct : 1, y: 0 }}
                    style={{ flex: 1 }}
                  />
                </View>
              </View>
              <Text style={s.progressText}>
                {fmt(paid, CURRENCIES.find((c) => c.code === (debt.currency ?? currency))?.symbol ?? symbol)}{' '}
                <Text style={s.progressMuted}>of {fmt(amt, CURRENCIES.find((c) => c.code === (debt.currency ?? currency))?.symbol ?? symbol)}</Text>
              </Text>
            </>
          )}
        </View>
        <View style={s.rowRight}>
          {cleared ? (
            <Text style={[s.clearedTag, glowGreen]}>CLEARED</Text>
          ) : (
            <>
              <Text style={s.rowValue}>{fmt(remaining, CURRENCIES.find((c) => c.code === (debt.currency ?? currency))?.symbol ?? symbol)}</Text>
              {amt > 0 && <Text style={s.rowPct}>{Math.round(pct * 100)}%</Text>}
            </>
          )}
        </View>
      </>
    );
  };

  const removeFromModal = async () => {
    if (!modal.editing) return;
    const debt = modal.editing;
    setModal({ visible: false, editing: null });
    setDebts((prev) => prev.filter((d) => d.id !== debt.id));
    feedback.destroy();
    await deleteDebt(debt.id);
    showToast(`Deleted ${debt.name}`, {
      label: 'Undo',
      onPress: async () => {
        setDebts((prev) => [...prev, debt]);
        await saveDebt(debt);
      },
    });
  };

  return (
    <View style={s.container} collapsable={false}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {/* Hero — still owed, with paid-off progress */}
        <View style={s.heroCard}>
          <Text style={s.heroLabel}>STILL OWED</Text>
          <Text style={s.heroAmount}>{fmt(stillOwed, symbol)}</Text>
          {outstandingDebts.length > 0 && (
            <>
              <View style={s.heroDivider} />
              <View style={s.heroRow}>
                <Text style={s.heroSubLabel}>
                  Across {outstandingDebts.length} {outstandingDebts.length === 1 ? 'debt' : 'debts'}
                </Text>
                {paidOff > 0 && (
                  <Text style={[s.heroPaid, glowGreen]}>{fmt(paidOff, symbol)} paid off</Text>
                )}
              </View>
            </>
          )}
        </View>

        {/* Debts list */}
        <View style={s.card}>
          <View style={s.cardHeader}>
            <Text style={s.cardTitle}>Outstanding</Text>
          </View>

          {outstandingDebts.length === 0 ? (
            <TouchableOpacity style={s.empty} onPress={openAdd}>
              <Ionicons name="document-text-outline" size={26} color="#333" />
              <Text style={s.emptyText}>Add your first debt</Text>
            </TouchableOpacity>
          ) : (
            <>
              {outstandingDebts.map((debt) => (
                <TouchableOpacity key={debt.id} style={s.rowBody} onPress={() => openEdit(debt)} activeOpacity={0.6}>
                  {rowContent(debt)}
                </TouchableOpacity>
              ))}
              <TouchableOpacity style={s.addRow} onPress={openAdd}>
                <Ionicons name="add-circle-outline" size={16} color="#FFA94D" style={glowAmber} />
                <Text style={s.addRowText}>Add Debt</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {clearedDebts.length > 0 && (
          <>
            <Pressable
              style={s.clearedHeader}
              onPress={() => {
                feedback.select();
                setClearedExpanded((value) => !value);
              }}
            >
              <Text style={s.clearedHeaderText}>Cleared debts</Text>
              <View style={s.clearedCount}><Text style={s.clearedCountText}>{clearedDebts.length}</Text></View>
              <Ionicons name={clearedExpanded ? 'chevron-up' : 'chevron-down'} size={16} color="#555" />
            </Pressable>
            {clearedExpanded && (
              <View style={s.card}>
                {clearedDebts.map((debt, index) => (
                  <TouchableOpacity key={debt.id} style={[s.row, index === 0 && { borderTopWidth: 0 }]} onPress={() => openEdit(debt)}>
                    {rowContent(debt)}
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Add / edit modal */}
      <Modal visible={modal.visible} transparent animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={s.overlay}>
            <View style={s.sheet}>
              <ScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={s.sheetScroll}
              >
              <Text style={s.sheetTitle}>{modal.editing ? 'Edit debt' : 'Add debt'}</Text>
              <Text style={s.inputLabel}>Who do you owe?</Text>
              <TextInput
                style={s.input}
                value={formName}
                onChangeText={setFormName}
                placeholder="e.g. Mom, Visa card, Mortgage"
                placeholderTextColor="#444"
                autoFocus
              />
              <Text style={s.inputLabel}>Currency</Text>
              <View style={s.currencyGrid}>{CURRENCIES.map((c) => <TouchableOpacity key={c.code} style={[s.currencyPill, formCurrency === c.code && s.currencyPillActive]} onPress={() => setFormCurrency(c.code)}><Text style={[s.currencyPillText, formCurrency === c.code && s.currencyPillTextActive]}>{c.symbol} {c.code}</Text></TouchableOpacity>)}</View>
              <Text style={s.inputLabel}>Amount ({formCurrency})</Text>
              <TextInput
                style={s.input}
                value={formAmount}
                onChangeText={setFormAmount}
                placeholder="0.00"
                placeholderTextColor="#444"
                keyboardType="decimal-pad"
              />
              <Text style={s.inputLabel}>Paid so far (optional)</Text>
              <TextInput
                style={s.input}
                value={formPaid}
                onChangeText={setFormPaid}
                placeholder="0.00"
                placeholderTextColor="#444"
                keyboardType="decimal-pad"
              />
              <Text style={s.inputLabel}>Notes (optional)</Text>
              <TextInput
                style={s.input}
                value={formNotes}
                onChangeText={setFormNotes}
                placeholder="e.g. due Dec 2026, 6% interest"
                placeholderTextColor="#444"
              />

              <View style={s.sheetActions}>
                <TouchableOpacity
                  style={s.btnCancel}
                  onPress={() => setModal({ visible: false, editing: null })}
                >
                  <Text style={s.btnCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.btnSave} onPress={saveForm}>
                  <Text style={s.btnSaveText}>Save</Text>
                </TouchableOpacity>
              </View>
              {modal.editing && (
                <TouchableOpacity style={s.deleteLink} onPress={removeFromModal}>
                  <Ionicons name="trash-outline" size={14} color="#FF6B6B" />
                  <Text style={s.deleteLinkText}>Delete debt</Text>
                </TouchableOpacity>
              )}
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0D0D0D' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  headerTitle: { fontSize: 15, fontWeight: '700', color: '#FFF', letterSpacing: 3 },
  scroll: { paddingHorizontal: 16, paddingTop: 112 },

  heroCard: { ...surface, borderRadius: 20, padding: 24, marginBottom: 16 },
  heroLabel: { fontSize: 10, fontWeight: '600', color: '#555', letterSpacing: 1.5, marginBottom: 10 },
  heroAmount: {
    fontSize: 40,
    fontWeight: '800',
    color: '#FFA94D',
    letterSpacing: -1.2,
    fontVariant: ['tabular-nums'],
    textShadowColor: 'rgba(255, 169, 77, 0.25)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 14,
  },
  heroDivider: { height: 1, backgroundColor: '#1E1E1E', marginVertical: 18 },
  heroRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heroSubLabel: { fontSize: 13, color: '#555', fontWeight: '500' },
  heroPaid: { fontSize: 13, color: '#00C896', fontWeight: '600' },

  card: { ...surface, borderRadius: 16, marginBottom: 16, overflow: 'hidden' },
  cardHeader: {
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardTitle: { fontSize: 13, fontWeight: '600', color: '#BBB', letterSpacing: 0.5 },
  clearedHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 14, paddingHorizontal: 6, marginTop: 4 },
  clearedHeaderText: { fontSize: 12, fontWeight: '600', color: '#666', letterSpacing: 0.5, flex: 1 },
  clearedCount: { minWidth: 20, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 9, backgroundColor: '#1C1C1C', alignItems: 'center' },
  clearedCountText: { fontSize: 11, color: '#888', fontWeight: '700', fontVariant: ['tabular-nums'] },
  currencyGrid: { flexDirection: 'row', flexWrap: 'nowrap', gap: 4, marginBottom: 16 },
  currencyPill: { flex: 1, minWidth: 0, paddingHorizontal: 4, paddingVertical: 8, borderRadius: 10, backgroundColor: '#222', borderWidth: 1, borderColor: '#333', alignItems: 'center', justifyContent: 'center' },
  currencyPillActive: { backgroundColor: '#00C896', borderColor: '#00C896' },
  currencyPillText: { color: '#999', fontSize: 11, fontWeight: '600', textAlign: 'center' },
  currencyPillTextActive: { color: '#07120F' },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 8,
    paddingRight: 18,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#1C1C1C',
  },
  rowBody: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  rowDragging: { opacity: 0.35 },
  rowDropTarget: { borderTopWidth: 2, borderTopColor: '#00C896' },
  rowLabel: { fontSize: 15, color: '#EEE', fontWeight: '500' },
  rowMeta: { fontSize: 11, color: '#555', marginTop: 2, fontWeight: '500' },
  barTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#1E1E1E',
    marginTop: 8,
    overflow: 'hidden',
  },
  barClip: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressText: {
    fontSize: 11,
    color: '#888',
    marginTop: 5,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  progressMuted: { color: '#555', fontWeight: '500' },
  rowRight: { alignItems: 'flex-end', marginLeft: 10, justifyContent: 'center' },
  rowPct: {
    fontSize: 11,
    color: '#666',
    fontWeight: '600',
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  clearedTag: {
    fontSize: 11,
    color: '#00C896',
    fontWeight: '800',
    letterSpacing: 1,
  },
  rowValue: {
    fontSize: 14,
    color: '#FFA94D',
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
    textShadowColor: 'rgba(255, 169, 77, 0.4)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },

  empty: {
    alignItems: 'center',
    paddingVertical: 30,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: '#1C1C1C',
  },
  emptyText: { fontSize: 14, color: '#777', fontWeight: '600' },

  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#1C1C1C',
  },
  addRowText: {
    fontSize: 14,
    color: '#FFA94D',
    fontWeight: '500',
    textShadowColor: 'rgba(255, 169, 77, 0.4)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },

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
    // Cap height so the sheet can't slide off the top when the keyboard
    // shrinks the available area; overflow scrolls instead (see sheetScroll).
    maxHeight: '90%',
  },
  sheetScroll: { paddingBottom: 4 },
  sheetTitle: { fontSize: 20, fontWeight: '700', color: '#FFF', marginBottom: 16, letterSpacing: -0.3 },
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
    marginBottom: 18,
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
