import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
import { useDragReorder } from '../../lib/useDragReorder';
import DraggableRow from '../../components/DraggableRow';
import SortableScroll from '../../components/SortableScroll';
import { NestableDraggableFlatList, RenderItemParams } from 'react-native-draggable-flatlist';

function fmt(value: number, symbol: string): string {
  return `${symbol}${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function parseAmt(s: string): number {
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

export default function Debts() {
  const insets = useSafeAreaInsets();
  const [debts, setDebts] = useState<Debt[]>(peekDebts);
  const [currency, setCurrency] = useState(() => peekCurrencyForPage('debts'));

  const [modal, setModal] = useState<{ visible: boolean; editing: Debt | null }>({
    visible: false,
    editing: null,
  });
  const [formName, setFormName] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formPaid, setFormPaid] = useState('');
  const [formNotes, setFormNotes] = useState('');

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

  const symbol = CURRENCIES.find((c) => c.code === currency)?.symbol ?? currency + ' ';
  // What you still owe drives the hero; the original total is informational.
  const stillOwed = debts.reduce(
    (s, d) => s + Math.max(0, parseAmt(d.amount) - parseAmt(d.paidAmount)),
    0,
  );
  const paidOff = debts.reduce(
    (s, d) => s + Math.min(parseAmt(d.amount), parseAmt(d.paidAmount)),
    0,
  );

  const openAdd = () => {
    setFormName('');
    setFormAmount('');
    setFormPaid('');
    setFormNotes('');
    feedback.tap();
    setModal({ visible: true, editing: null });
  };

  const openEdit = (debt: Debt) => {
    setFormName(debt.name);
    setFormAmount(debt.amount);
    setFormPaid(debt.paidAmount === '0' ? '' : debt.paidAmount);
    setFormNotes(debt.notes ?? '');
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
        }
      : {
          id: newId(),
          name: formName.trim(),
          amount: formAmount,
          paidAmount: paid,
          notes: formNotes.trim() || null,
          position: debts.length,
        };
    setDebts(editing ? debts.map((d) => (d.id === editing.id ? debt : d)) : [...debts, debt]);
    setModal({ visible: false, editing: null });
    feedback.success();
    await saveDebt(debt);
  };

  const reorderDebts = useCallback(async (next: Debt[]) => {
    const repositioned = next.map((d, i) => ({ ...d, position: i }));
    feedback.dragEnd();
    setDebts((prev) => {
      for (const d of repositioned) {
        const orig = prev.find((p) => p.id === d.id);
        if (orig && orig.position !== d.position) saveDebt(d);
      }
      return repositioned;
    });
  }, []);

  const debtDrag = useDragReorder(debts, reorderDebts);

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
                {fmt(paid, symbol)}{' '}
                <Text style={s.progressMuted}>of {fmt(amt, symbol)}</Text>
              </Text>
            </>
          )}
        </View>
        <View style={s.rowRight}>
          {cleared ? (
            <Text style={[s.clearedTag, glowGreen]}>CLEARED</Text>
          ) : (
            <>
              <Text style={s.rowValue}>{fmt(remaining, symbol)}</Text>
              {amt > 0 && <Text style={s.rowPct}>{Math.round(pct * 100)}%</Text>}
            </>
          )}
        </View>
      </>
    );
  };

  // No visible edit affordance: tap the row to edit, long-press to drag.
  // Mirrors the Dashboard's Cash Accounts pattern — pencil icon removed.
  const renderDebtItem = useCallback(
    ({ item: debt, drag, isActive }: RenderItemParams<Debt>) => (
      <View style={[s.row, isActive && s.rowDragging]}>
        <TouchableOpacity
          style={s.rowBody}
          onPress={() => openEdit(debt)}
          onLongPress={debts.length > 1 ? drag : undefined}
          delayLongPress={150}
          activeOpacity={0.6}
        >
          {rowContent(debt)}
        </TouchableOpacity>
      </View>
    ),
    [debts.length, symbol],
  );

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
    <View style={[s.container, { paddingBottom: insets.bottom }]}>
      <SortableScroll contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {/* Hero — still owed, with paid-off progress */}
        <View style={s.heroCard}>
          <Text style={s.heroLabel}>STILL OWED</Text>
          <Text style={s.heroAmount}>{fmt(stillOwed, symbol)}</Text>
          {debts.length > 0 && (
            <>
              <View style={s.heroDivider} />
              <View style={s.heroRow}>
                <Text style={s.heroSubLabel}>
                  Across {debts.length} {debts.length === 1 ? 'debt' : 'debts'}
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

          {debts.length === 0 ? (
            <TouchableOpacity style={s.empty} onPress={openAdd}>
              <Ionicons name="document-text-outline" size={26} color="#333" />
              <Text style={s.emptyText}>Add your first debt</Text>
            </TouchableOpacity>
          ) : (
            <>
              {Platform.OS === 'web' ? (
                debts.map((debt) => {
                  const d = debtDrag(debt.id);
                  return (
                    <DraggableRow
                      key={debt.id}
                      handlers={{ ...d, draggable: d.draggable && debts.length > 1 }}
                      style={[s.row, d.isDragging && s.rowDragging, d.isHovered && s.rowDropTarget]}
                    >
                      <TouchableOpacity
                        style={s.rowBody}
                        onPress={() => openEdit(debt)}
                        activeOpacity={0.6}
                      >
                        {rowContent(debt)}
                      </TouchableOpacity>
                    </DraggableRow>
                  );
                })
              ) : (
                <NestableDraggableFlatList
                  data={debts}
                  keyExtractor={(d) => d.id}
                  renderItem={renderDebtItem}
                  onDragEnd={({ data }) => reorderDebts(data)}
                  activationDistance={5}
                />
              )}
              <TouchableOpacity style={s.addRow} onPress={openAdd}>
                <Ionicons name="add-circle-outline" size={16} color="#FFA94D" style={glowAmber} />
                <Text style={s.addRowText}>Add Debt</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        <View style={{ height: 40 }} />
      </SortableScroll>

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
              <Text style={s.inputLabel}>Amount ({currency})</Text>
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
  scroll: { paddingHorizontal: 16 },

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
